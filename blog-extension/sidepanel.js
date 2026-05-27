// Blog Helper side panel — single .docx upload → parse → fill the active WP
// New Post page via chrome.tabs.sendMessage({type:'RRM_BLOG_FILL_POST', payload}).
//
// Wires up the elements declared in sidepanel.html:
//   #siteSelect  #topicSelect   site/topic dropdowns
//   #siteScope                  chip beside the title showing current site
//   #tabStatus                  green/warn status of the active WP tab
//   #drop  #file                dropzone + hidden file input for .docx upload
//   #errMsg                     in-panel error message
//   #results                    parsed-post card container

// ============================================================================
// SITES — niche → topics → category path & target (matches blog-extension's
// content-tool.js TARGET_URLS keys). Topics also carry the optional
// `primaryCategory` field that Yoast SEO uses on RRM Funeral/Cemetery.
// ============================================================================
const SITES = [
  {
    id: 'rrmathome', name: 'RRM@home', target: 'rrmathome',
    host: 'rrmathome.com', hostRe: /(^|\.)rrmathome\.com$/i,
    aliases: ['rrmathome','rrm@home','rrm at home','rrmhome'],
    topics: [
      // All RRM@home blog posts use just the top-level "Blogs" category.
      { id: 'flooring', name: 'Flooring',          categoryPath: ['Blogs'], primaryCategory: null },
      { id: 'hvac',     name: 'HVAC',              categoryPath: ['Blogs'], primaryCategory: null },
      { id: 'windows',  name: 'Windows and Doors', categoryPath: ['Blogs'], primaryCategory: null }
    ]
  },
  {
    id: 'rrm', name: 'RRM (ringringmarketing.com)', target: 'rrm',
    host: 'ringringmarketing.com', hostRe: /(^|\.)ringringmarketing\.com$/i,
    aliases: ['rrm','ringringmarketing','ring ring marketing'],
    topics: [
      { id: 'funeral',  name: 'Funeral',  categoryPath: ['Funeral',  'Blogs'], primaryCategory: 'Funeral'  },
      { id: 'cemetery', name: 'Cemetery', categoryPath: ['Cemetery', 'Blogs'], primaryCategory: 'Cemetery' }
    ]
  },
  {
    id: 'scmm', name: 'SCMM', target: 'scmm',
    host: 'seniorcaremarketingmax.com', hostRe: /(^|\.)seniorcaremarketingmax\.com$/i,
    aliases: ['scmm','seniorcaremarketingmax','senior care marketing max'],
    topics: [
      { id: 'homehealth', name: 'Home Health', categoryPath: ['Blogs'], primaryCategory: null },
      { id: 'homecare',   name: 'Home Care',   categoryPath: ['Blogs'], primaryCategory: null }
    ]
  },
  {
    id: 'hospice', name: 'Hospice Haven', target: 'hospice',
    host: 'hospicehavenmarketing.com', hostRe: /(^|\.)hospicehavenmarketing\.com$/i,
    aliases: ['hospice','hospice haven','hospicehaven','hospicehavenmarketing'],
    topics: [
      { id: 'hospice', name: 'Hospice', categoryPath: ['Blogs'], primaryCategory: null }
    ]
  }
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ============================================================================
// State
// ============================================================================
let parsedPost = null;       // { docxName, parsed: {title, date, seoTitle, metaDescription, bodyHtml, dateMM, dateDD} }
let selectedSite = SITES[0];
let selectedTopic = SITES[0].topics[0];
let canFill = false;

// ============================================================================
// DOM refs
// ============================================================================
const siteSelect  = document.getElementById('siteSelect');
const topicSelect = document.getElementById('topicSelect');
const siteScope   = document.getElementById('siteScope');
const tabStatus   = document.getElementById('tabStatus');
const drop        = document.getElementById('drop');
const fileInput   = document.getElementById('file');
const errMsg      = document.getElementById('errMsg');
const results     = document.getElementById('results');

// ============================================================================
// Site / topic dropdowns
// ============================================================================
for (const s of SITES) {
  const opt = document.createElement('option');
  opt.value = s.id;
  opt.textContent = s.name;
  siteSelect.appendChild(opt);
}
siteSelect.value = selectedSite.id;
populateTopics();

function populateTopics() {
  topicSelect.innerHTML = '';
  for (const t of selectedSite.topics) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    topicSelect.appendChild(opt);
  }
  selectedTopic = selectedSite.topics[0] || null;
  topicSelect.value = selectedTopic ? selectedTopic.id : '';
  siteScope.textContent = selectedSite.name;
}

siteSelect.addEventListener('change', () => {
  selectedSite = SITES.find(s => s.id === siteSelect.value) || SITES[0];
  populateTopics();
  refreshTabStatus();
  renderCard();
});
topicSelect.addEventListener('change', () => {
  selectedTopic = selectedSite.topics.find(t => t.id === topicSelect.value) || null;
  renderCard();
});

// ============================================================================
// Active tab status — auto-switches site if you flip to a different WP tab
// ============================================================================
async function refreshTabStatus() {
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    tabStatus.textContent = 'Could not read active tab.';
    tabStatus.className = 'status-line warn';
    canFill = false;
    return refreshFillButtons();
  }

  // Auto-switch site to match the active tab's domain if it's one of ours.
  if (tab && tab.url) {
    try {
      const url = new URL(tab.url);
      const match = SITES.find(s => s.hostRe.test(url.hostname));
      if (match && match.id !== selectedSite.id) {
        selectedSite = match;
        siteSelect.value = match.id;
        populateTopics();
        renderCard();
      }
    } catch {}
  }

  if (!tab || !tab.url) {
    tabStatus.textContent = 'No active tab.';
    tabStatus.className = 'status-line warn';
    canFill = false;
  } else {
    let url;
    try { url = new URL(tab.url); } catch { url = null; }
    const pathOk = url && /\/wp-admin\/post(-new)?\.php/.test(url.pathname);
    const hostOk = url && selectedSite.hostRe.test(url.hostname);
    if (hostOk && pathOk) {
      tabStatus.textContent = `Ready: ${url.hostname}${url.pathname}`;
      tabStatus.className = 'status-line ok';
      canFill = true;
    } else {
      tabStatus.textContent = `Open a New Post page on ${selectedSite.host} to enable Fill.`;
      tabStatus.className = 'status-line warn';
      canFill = false;
    }
  }
  refreshFillButtons();
}
chrome.tabs.onActivated.addListener(refreshTabStatus);
chrome.tabs.onUpdated.addListener((id, info) => {
  if (info.status === 'complete' || info.url) refreshTabStatus();
});
refreshTabStatus();

function refreshFillButtons() {
  results.querySelectorAll('.fill-btn').forEach(btn => {
    if (btn.classList.contains('busy')) return;
    btn.disabled = !canFill;
    btn.title = canFill ? '' : `Open a New Post page on ${selectedSite.host} first`;
  });
}

// ============================================================================
// .docx parser (ported from docx-batch-to-wordpress.html)
// ============================================================================
function plainText(html) {
  return html.replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}
function normalize(s) {
  return s.replace(/[‘’′`]/g, "'").replace(/[“”″]/g, '"').replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeHtmlForTag(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function splitBlocks(html) {
  const out = [];
  const re = /<(p|ul|ol)\b[^>]*>[\s\S]*?<\/\1>/g;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[0]);
  return out;
}

function parseDocxHtml(html, filename) {
  const blocks = splitBlocks(html);
  let dateText = '', titleText = '', bodyStart = 0;

  for (let i = 0; i < blocks.length; i++) {
    const text = plainText(blocks[i]);
    if (/^\d{1,2}\.\d{1,2}$/.test(text)) {
      dateText = text;
      if (blocks[i + 1]) titleText = plainText(blocks[i + 1]);
      bodyStart = i + 2;
      break;
    }
  }
  if (!titleText) {
    for (let i = 0; i < blocks.length; i++) {
      if (/^<p>\s*<strong>[\s\S]+?<\/strong>\s*<\/p>$/.test(blocks[i])) {
        titleText = plainText(blocks[i]);
        bodyStart = i + 1;
        break;
      }
    }
  }

  let bodyEnd = blocks.length;
  let seoTitle = '', metaDescription = '';
  const h2Texts = [];

  for (let i = bodyStart; i < blocks.length; i++) {
    const text = plainText(blocks[i]);
    if (/^Word Count\b/i.test(text) && bodyEnd === blocks.length) bodyEnd = i;
    const seoMatch = text.match(/^SEO Title Tag:\s*(.+)$/i);
    if (seoMatch) seoTitle = seoMatch[1].trim();
    const metaMatch = text.match(/^Meta Description:\s*(.+)$/i);
    if (metaMatch) metaDescription = metaMatch[1].trim();
    if (/^H Tags Used\b/i.test(text) && i + 1 < blocks.length) {
      const next = blocks[i + 1];
      if (/^<(ul|ol)\b/i.test(next)) {
        const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g;
        let li;
        while ((li = liRe.exec(next)) !== null) {
          const liText = plainText(li[1]);
          const h2 = liText.match(/^H2:\s*(.+)$/i);
          if (h2) h2Texts.push(h2[1].trim());
        }
      } else {
        for (let j = i + 1; j < blocks.length; j++) {
          const t = plainText(blocks[j]);
          if (!/^H[1-6]:\s*/i.test(t)) break;
          const h2 = t.match(/^H2:\s*(.+)$/i);
          if (h2) h2Texts.push(h2[1].trim());
        }
      }
    }
  }

  const h2Lookup = new Map();
  for (const t of h2Texts) h2Lookup.set(normalize(t), t);
  const useFallbacks = h2Lookup.size === 0;
  const SECTION_LABELS = /^(introduction|intro|conclusion|summary|overview|faq|frequently asked questions|tl;?dr|about|final thoughts|wrap[- ]?up|key takeaways|takeaways|references|sources|notes|appendix|getting started)$/i;

  const outBlocks = [];
  for (let i = bodyStart; i < bodyEnd; i++) {
    const block = blocks[i];
    const m = block.match(/^<p>\s*<strong>([\s\S]+?)<\/strong>\s*<\/p>$/);
    if (m) {
      const inner = plainText(m[1]);
      const stripped = inner.replace(/^\d+[.):]?\s+/, '');
      const matchedH2 = h2Lookup.has(normalize(inner)) || h2Lookup.has(normalize(stripped));
      let promote = matchedH2;
      if (!promote && useFallbacks) {
        const numberedPattern = /^\d+\.\s+\S/.test(inner);
        const labelOnly = SECTION_LABELS.test(inner.replace(/[:.!?]+$/, '').trim());
        promote = numberedPattern || labelOnly;
      }
      if (promote) {
        if (outBlocks.length > 0) outBlocks.push('<p>&nbsp;</p>');
        outBlocks.push(`<h2>${escapeHtmlForTag(inner)}</h2>`);
        continue;
      }
    }
    outBlocks.push(block.replace(/[\s ]+<\/li>/g, '</li>'));
  }
  const bodyHtml = outBlocks.join('\n').replace(/<a\b((?:(?!\bhref\s*=)[^>])*?)>([\s\S]*?)<\/a>/gi, '$2');

  let dateMM = null, dateDD = null;
  const dateFromName = filename.match(/^(\d{1,2})\.(\d{1,2})\b/);
  if (/^\d{1,2}\.\d{1,2}$/.test(dateText)) {
    const [mm, dd] = dateText.split('.').map(Number);
    if (mm >= 1 && mm <= 12) { dateMM = mm; dateDD = dd; }
  } else if (dateFromName) {
    const mm = parseInt(dateFromName[1], 10);
    const dd = parseInt(dateFromName[2], 10);
    if (mm >= 1 && mm <= 12) { dateMM = mm; dateDD = dd; }
  }
  const year = new Date().getFullYear();
  const formattedDate = (dateMM && dateDD) ? `${MONTHS[dateMM - 1]} ${dateDD}, ${year}` : (dateText || '');

  return { date: formattedDate, dateMM, dateDD, title: titleText, seoTitle, metaDescription, bodyHtml };
}

// ============================================================================
// .docx intake
// ============================================================================
async function handleDocxFile(file) {
  errMsg.textContent = '';
  if (!/\.docx$/i.test(file.name)) {
    errMsg.textContent = 'Please pick a .docx file (Word document).';
    return;
  }
  results.innerHTML = '<div class="empty">Parsing .docx…</div>';

  // Auto-detect site/topic from filename
  const lcName = file.name.toLowerCase();
  for (const s of SITES) {
    if (s.aliases.some(a => lcName.includes(a))) {
      if (selectedSite.id !== s.id) {
        selectedSite = s;
        siteSelect.value = s.id;
        populateTopics();
      }
      break;
    }
  }
  if (selectedSite) {
    for (const t of selectedSite.topics) {
      if (lcName.includes(t.name.toLowerCase())) {
        selectedTopic = t;
        topicSelect.value = t.id;
        break;
      }
    }
  }

  try {
    const buf = await file.arrayBuffer();
    const conv = await window.mammoth.convertToHtml({ arrayBuffer: buf });
    const parsed = parseDocxHtml(conv.value, file.name);
    parsedPost = { docxName: file.name, parsed };
    renderCard();
  } catch (e) {
    console.error('[RRM Blog Helper] Failed to parse .docx:', e);
    errMsg.textContent = 'Failed to parse .docx: ' + e.message;
    results.innerHTML = '';
  }
}

// ============================================================================
// Card rendering + Fill button
// ============================================================================
function field(label, value, copyValue) {
  // A copy-able field row. `value` is what we display (HTML-escaped on the
  // outside), `copyValue` is the raw string that lands on the clipboard.
  // If copyValue is omitted, no copy button is shown (e.g. Category preview).
  return `
    <div class="field">
      <div class="head">
        <span class="label">${escapeHtml(label)}</span>
        ${copyValue !== undefined ? `<button class="copy-btn" data-copy="${escapeHtml(copyValue)}">Copy</button>` : ''}
      </div>
      <div class="value">${value}</div>
    </div>
  `;
}

function contentBlock(label, value) {
  // For the HTML body — scrollable, monospaced, with a copy button.
  return `
    <div class="content-block">
      <div class="head">
        <span>${escapeHtml(label)}</span>
        <button class="copy-btn" data-copy="${escapeHtml(value)}">Copy</button>
      </div>
      <pre>${escapeHtml(value)}</pre>
    </div>
  `;
}

function attachCopyHandlers(root) {
  root.querySelectorAll('button[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = btn.getAttribute('data-copy');
      try { await navigator.clipboard.writeText(text); }
      catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      const original = btn.textContent;
      btn.textContent = 'Copied ✓';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1200);
    });
  });
}

function renderCard() {
  results.innerHTML = '';
  if (!parsedPost) {
    results.innerHTML = '<div class="empty">Drop a .docx to see the post here.</div>';
    return;
  }
  const p = parsedPost.parsed;
  const catPath = selectedTopic ? selectedTopic.categoryPath : ['Blogs'];
  const titleText = p.title || parsedPost.docxName;
  const catValue = `${catPath.join(' → ')}${selectedTopic && selectedTopic.primaryCategory ? ' (Primary: ' + selectedTopic.primaryCategory + ')' : ''}`;

  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="title">${escapeHtml(titleText)}</div>
    <div class="meta">${escapeHtml(p.date || '—')} · ${escapeHtml(parsedPost.docxName)}</div>

    ${field('Title',            escapeHtml(titleText),                          titleText)}
    ${field('Date',             escapeHtml(p.date || '—'),                      p.date || '')}
    ${field('SEO Title',        escapeHtml(p.seoTitle || '—'),                  p.seoTitle || '')}
    ${field('Meta Description', escapeHtml(p.metaDescription || '—'),           p.metaDescription || '')}
    ${field('Category',         escapeHtml(catValue))}

    ${p.bodyHtml ? contentBlock('Content (HTML)', p.bodyHtml) : ''}

    <button class="fill-btn" ${canFill ? '' : `disabled title="Open a New Post page on ${selectedSite.host} first"`}>Fill This Post</button>
  `;
  div.querySelector('.fill-btn').addEventListener('click', (e) => fillActiveTab(e.target));
  attachCopyHandlers(div);
  results.appendChild(div);
}

async function fillActiveTab(btn) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !parsedPost) return;
  const p = parsedPost.parsed;
  const catPath = selectedTopic ? selectedTopic.categoryPath : ['Blogs'];
  const year = new Date().getFullYear();
  const payload = {
    title: p.title || '',
    content: p.bodyHtml || '',
    metaDesc: p.metaDescription || '',
    seoTitle: p.seoTitle || '',
    author: 'Welton Hong',
    filename: parsedPost.docxName,
    categories: catPath,
    primaryCategory: selectedTopic ? selectedTopic.primaryCategory : null,
    publishDate: (p.dateMM && p.dateDD)
      ? { year, month: p.dateMM, day: p.dateDD, hour: 5, minute: 0 }
      : null
  };

  const original = btn.textContent;
  btn.classList.add('busy');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Filling…';
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'RRM_BLOG_FILL_POST', payload });
    if (res && res.ok) {
      btn.textContent = 'Filled ✓';
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('busy');
        refreshFillButtons();
      }, 2200);
    } else {
      btn.textContent = 'Failed — see WP tab';
      console.warn('[RRM Blog Helper] Fill response:', res);
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('busy');
        refreshFillButtons();
      }, 3500);
    }
  } catch (e) {
    btn.classList.remove('busy');
    btn.textContent = original;
    refreshFillButtons();
    alert('Could not reach the WordPress page. Make sure the active tab is the New Post page on the selected site.');
  }
}

// ============================================================================
// File drop + click
// ============================================================================
drop.addEventListener('click', (e) => {
  if (e.target.tagName !== 'INPUT') fileInput.click();
});
fileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) handleDocxFile(file);
});
['dragenter','dragover'].forEach(ev =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); })
);
['dragleave','drop'].forEach(ev =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); })
);
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    fileInput.value = '';
    handleDocxFile(file);
  }
});

renderCard(); // show initial empty state
