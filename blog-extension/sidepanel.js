// RRM Blog Helper — side panel.
// Single .docx upload → parse → Fill This Post on the active WP tab.
// Sends RRM_BLOG_FILL_POST (blog-specific) so this never collides with the
// RRM WP Helper (video) extension.

const SITES = [
  {
    id: 'rrmathome', name: 'RRM@home',
    host: 'rrmathome.com', hostRe: /(^|\.)rrmathome\.com$/i,
    aliases: ['rrmathome','rrm@home','rrm at home','rrmhome'],
    topics: [
      { id: 'flooring', name: 'Flooring',          categoryPath: ['Flooring', 'Blogs'], primary: null },
      { id: 'hvac',     name: 'HVAC',              categoryPath: ['HVAC',     'Blogs'], primary: null },
      { id: 'windows',  name: 'Windows and Doors', categoryPath: ['Blogs'],              primary: null }
    ]
  },
  {
    id: 'rrm', name: 'RRM (ringringmarketing.com)',
    host: 'ringringmarketing.com', hostRe: /(^|\.)ringringmarketing\.com$/i,
    aliases: ['rrm','ringringmarketing','ring ring marketing'],
    topics: [
      { id: 'funeral',  name: 'Funeral',  categoryPath: ['Funeral',  'Blogs'], primary: 'Funeral'  },
      { id: 'cemetery', name: 'Cemetery', categoryPath: ['Cemetery', 'Blogs'], primary: 'Cemetery' }
    ]
  },
  {
    id: 'scmm', name: 'SCMM',
    host: 'seniorcaremarketingmax.com', hostRe: /(^|\.)seniorcaremarketingmax\.com$/i,
    aliases: ['scmm','seniorcaremarketingmax','senior care marketing max'],
    topics: [
      { id: 'homehealth', name: 'Home Health', categoryPath: ['Blogs'], primary: null },
      { id: 'homecare',   name: 'Home Care',   categoryPath: ['Blogs'], primary: null }
    ]
  },
  {
    id: 'hospice', name: 'Hospice Haven',
    host: 'hospicehavenmarketing.com', hostRe: /(^|\.)hospicehavenmarketing\.com$/i,
    aliases: ['hospice','hospice haven','hospicehaven','hospicehavenmarketing'],
    topics: [
      { id: 'hospice', name: 'Hospice', categoryPath: ['Blogs'], primary: null }
    ]
  }
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let selectedSite = SITES[0];
let selectedTopic = SITES[0].topics[0];
let parsedPost = null;
let canFill = false;

// ---- Site / topic selectors ----
const siteSelect  = document.getElementById('siteSelect');
const topicSelect = document.getElementById('topicSelect');
const siteScopeEl = document.getElementById('siteScope');

for (const s of SITES) {
  const opt = document.createElement('option');
  opt.value = s.id;
  opt.textContent = s.name;
  siteSelect.appendChild(opt);
}
siteSelect.value = selectedSite.id;

function populateTopics() {
  topicSelect.innerHTML = '';
  if (!selectedSite) return;
  for (const t of selectedSite.topics) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    topicSelect.appendChild(opt);
  }
  selectedTopic = selectedSite.topics[0] || null;
  topicSelect.value = selectedTopic ? selectedTopic.id : '';
}
populateTopics();

siteSelect.addEventListener('change', () => {
  selectedSite = SITES.find(s => s.id === siteSelect.value) || null;
  populateTopics();
  siteScopeEl.textContent = selectedSite ? selectedSite.name : '—';
  refreshTabStatus();
  renderCard();
});
topicSelect.addEventListener('change', () => {
  selectedTopic = selectedSite
    ? (selectedSite.topics.find(t => t.id === topicSelect.value) || null)
    : null;
  renderCard();
});

siteScopeEl.textContent = selectedSite.name;

// ---- Active tab status ----
async function refreshTabStatus() {
  const statusEl = document.getElementById('tabStatus');
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    statusEl.textContent = 'Could not read active tab.';
    statusEl.className = 'status-line warn';
    canFill = false;
    refreshFillButtons();
    return;
  }

  // Auto-switch site if active tab matches a different site's host
  if (tab && tab.url) {
    try {
      const url = new URL(tab.url);
      const match = SITES.find(s => s.hostRe.test(url.hostname));
      if (match && (!selectedSite || match.id !== selectedSite.id)) {
        selectedSite = match;
        siteSelect.value = match.id;
        populateTopics();
        siteScopeEl.textContent = match.name;
        renderCard();
      }
    } catch {}
  }

  if (!selectedSite) {
    statusEl.textContent = 'Pick a site to continue.';
    statusEl.className = 'status-line warn';
    canFill = false;
  } else if (!tab || !tab.url) {
    statusEl.textContent = 'No active tab.';
    statusEl.className = 'status-line warn';
    canFill = false;
  } else {
    let url;
    try { url = new URL(tab.url); } catch { url = null; }
    const pathOk = url && /\/wp-admin\/post(-new)?\.php/.test(url.pathname);
    const hostOk = url && selectedSite.hostRe.test(url.hostname);
    if (hostOk && pathOk) {
      statusEl.textContent = `Ready: ${url.hostname}${url.pathname}`;
      statusEl.className = 'status-line ok';
      canFill = true;
    } else {
      statusEl.textContent = `Open a New Post page on ${selectedSite.host} to enable Fill.`;
      statusEl.className = 'status-line warn';
      canFill = false;
    }
  }
  refreshFillButtons();
}

chrome.tabs.onActivated.addListener(refreshTabStatus);
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'complete' || info.url) refreshTabStatus();
});
refreshTabStatus();

function refreshFillButtons() {
  document.querySelectorAll('.fill-btn').forEach((btn) => {
    if (btn.classList.contains('busy')) return;
    btn.disabled = !canFill;
    btn.title = canFill ? '' : (selectedSite ? `Open a New Post page on ${selectedSite.host} first` : 'Pick a site first');
  });
}

// ---- DOCX parser (ported from docx-batch-to-wordpress.html) ----
function plainText(htmlFragment) {
  return htmlFragment
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}
function normalize(s) {
  return s
    .replace(/[‘’′`]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim().toLowerCase();
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
  let dateText = '';
  let titleText = '';
  let bodyStart = 0;

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
  let seoTitle = '';
  let metaDescription = '';
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

  // Date parsing
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

  return {
    date: formattedDate,
    dateMM, dateDD,
    title: titleText,
    seoTitle,
    metaDescription,
    bodyHtml
  };
}

// ---- .docx intake ----
async function handleDocxFile(file) {
  const errEl = document.getElementById('errMsg');
  const resultsEl = document.getElementById('results');
  errEl.textContent = '';

  if (!/\.docx$/i.test(file.name)) {
    errEl.textContent = 'Please pick a .docx file (Word document).';
    return;
  }

  resultsEl.innerHTML = '<div class="empty">Parsing .docx…</div>';

  // Auto-detect site/topic from filename
  const lcName = file.name.toLowerCase();
  for (const s of SITES) {
    if (s.aliases.some(a => lcName.includes(a))) {
      if (selectedSite?.id !== s.id) {
        selectedSite = s;
        siteSelect.value = s.id;
        populateTopics();
        siteScopeEl.textContent = s.name;
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
    const p = parseDocxHtml(conv.value, file.name);
    parsedPost = { docxName: file.name, parsed: p };
    renderCard();
  } catch (e) {
    console.warn('[RRM Blog Helper] Failed to parse', file.name, e);
    errEl.textContent = 'Failed to parse .docx: ' + e.message;
    resultsEl.innerHTML = '';
  }
}

// ---- Card render ----
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function renderCard() {
  const resultsEl = document.getElementById('results');
  resultsEl.innerHTML = '';
  if (!parsedPost) {
    resultsEl.innerHTML = '<div class="empty">Drop a .docx to see the post here.</div>';
    return;
  }
  const p = parsedPost.parsed;
  const catPath = selectedTopic ? selectedTopic.categoryPath : ['Blogs'];
  const primary = selectedTopic && selectedTopic.primary;
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="title">${escapeHtml(p.title || parsedPost.docxName)}</div>
    <div class="meta">${escapeHtml(p.date || '—')} · ${escapeHtml(parsedPost.docxName)}</div>
    <div class="field"><div class="label">SEO Title</div><div class="value">${escapeHtml(p.seoTitle || '—')}</div></div>
    <div class="field"><div class="label">Meta Description</div><div class="value">${escapeHtml(p.metaDescription || '—')}</div></div>
    <div class="field"><div class="label">Category</div><div class="value">${escapeHtml(catPath.join(' → '))}${primary ? ` (Primary: ${escapeHtml(primary)})` : ''}</div></div>
    <button class="fill-btn" ${canFill ? '' : `disabled title="Open a New Post page on ${selectedSite ? selectedSite.host : 'the target site'} first"`}>Fill This Post</button>
  `;
  div.querySelector('.fill-btn').addEventListener('click', (e) => fillThisPost(e.target));
  resultsEl.appendChild(div);
}

async function fillThisPost(btn) {
  if (!parsedPost) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  const p = parsedPost.parsed;
  const catPath = selectedTopic ? selectedTopic.categoryPath : ['Blogs'];
  const primary = selectedTopic && selectedTopic.primary;
  const year = new Date().getFullYear();

  const payload = {
    title: p.title || '',
    content: p.bodyHtml || '',
    metaDesc: p.metaDescription || '',
    seoTitle: p.seoTitle || '',
    author: 'Welton Hong',
    filename: parsedPost.docxName,
    categories: catPath,
    primaryCategory: primary || null,
    publishDate: (p.dateMM && p.dateDD)
      ? { year, month: p.dateMM, day: p.dateDD, hour: 5, minute: 0 }
      : null
  };

  const originalText = btn.textContent;
  btn.classList.add('busy');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Filling…';
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'RRM_BLOG_FILL_POST', payload });
    if (res && res.ok) {
      btn.textContent = 'Filled ✓';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('busy');
        refreshFillButtons();
      }, 2200);
    } else {
      btn.textContent = 'Failed — see WP tab';
      console.warn('[RRM Blog Helper] Fill response:', res);
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('busy');
        refreshFillButtons();
      }, 3500);
    }
  } catch (e) {
    btn.classList.remove('busy');
    btn.textContent = originalText;
    refreshFillButtons();
    alert('Could not reach the WordPress page. Make sure the active tab is the New Post page on the selected site.');
  }
}

// ---- File input + drag-drop ----
const dropEl  = document.getElementById('drop');
const fileEl  = document.getElementById('file');

dropEl.addEventListener('click', (e) => {
  if (e.target.tagName !== 'INPUT') fileEl.click();
});
fileEl.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) handleDocxFile(file);
});
['dragenter','dragover'].forEach(ev =>
  dropEl.addEventListener(ev, (e) => { e.preventDefault(); dropEl.classList.add('drag'); })
);
['dragleave','drop'].forEach(ev =>
  dropEl.addEventListener(ev, (e) => { e.preventDefault(); dropEl.classList.remove('drag'); })
);
dropEl.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    fileEl.value = '';
    handleDocxFile(file);
  }
});

renderCard();
