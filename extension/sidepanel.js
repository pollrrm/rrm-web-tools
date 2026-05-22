// Side panel for the RRM WP Helper extension. Multi-niche: switch between
// RRM@home (Home Improvement) and SCMM (Home Care) via the dropdown at the top.
// Filters parsed cards to the selected niche and only fills the active tab when
// it matches the niche's expected host + path.

const NICHES = {
  'rrm-at-home': {
    label: 'RRM@home (Home Improvement)',
    chip: 'RRM@home',
    industry: 'home improvement',
    host: 'rrmathome.com',
    hostRe: /(^|\.)rrmathome\.com$/i,
    pathRe: /\/wp-admin\/post(-new)?\.php/,
    categories: ['Videos']
  },
  'scmm': {
    label: 'SCMM (Home Care)',
    chip: 'SCMM',
    industry: 'home care',
    host: 'seniorcaremarketingmax.com',
    hostRe: /(^|\.)seniorcaremarketingmax\.com$/i,
    pathRe: /\/wp-admin\/post(-new)?\.php/,
    categories: ['Videos']
  },
  'rrm': {
    label: 'RRM (Funeral Homes)',
    chip: 'RRM',
    industry: 'funeral homes',
    host: 'ringringmarketing.com',
    hostRe: /(^|\.)ringringmarketing\.com$/i,
    pathRe: /\/wp-admin\/post(-new)?\.php/,
    categories: ['Funeral', 'Videos']
  }
};

let parsedSections = []; // sections from the last successful Extract — re-rendered on niche change
let selectedNicheKey = 'rrm-at-home';
let canFill = false;

// ---- Niche dropdown ----
const nicheSelect = document.getElementById('nicheSelect');
for (const [key, niche] of Object.entries(NICHES)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = niche.label;
  nicheSelect.appendChild(opt);
}
nicheSelect.value = selectedNicheKey;
nicheSelect.addEventListener('change', () => {
  selectedNicheKey = nicheSelect.value;
  refreshScope();
  refreshTabStatus();
  renderCards();
});

function getNiche() { return NICHES[selectedNicheKey]; }

function refreshScope() {
  document.getElementById('modeScope').textContent = getNiche().chip;
}
refreshScope();

// ---- Active tab status ----
async function refreshTabStatus() {
  const statusEl = document.getElementById('tabStatus');
  const niche = getNiche();
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    statusEl.textContent = 'Could not read active tab.';
    statusEl.className = 'status-line warn';
    canFill = false;
    return refreshFillButtons();
  }

  // Auto-switch the niche dropdown if the active tab matches a different niche.
  if (tab && tab.url) {
    try {
      const url = new URL(tab.url);
      const match = Object.entries(NICHES).find(([, n]) =>
        n.hostRe.test(url.hostname) && n.pathRe.test(url.pathname)
      );
      if (match && match[0] !== selectedNicheKey) {
        selectedNicheKey = match[0];
        nicheSelect.value = selectedNicheKey;
        refreshScope();
        renderCards();
      }
    } catch {}
  }

  if (!tab || !tab.url) {
    statusEl.textContent = 'No active tab detected.';
    statusEl.className = 'status-line warn';
    canFill = false;
  } else {
    let url;
    try { url = new URL(tab.url); } catch { url = null; }
    if (url && niche.hostRe.test(url.hostname) && niche.pathRe.test(url.pathname)) {
      statusEl.textContent = `Ready: ${url.hostname}${url.pathname}`;
      statusEl.className = 'status-line ok';
      canFill = true;
    } else {
      statusEl.textContent = `Open a New Post page on ${niche.host} to enable Fill.`;
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
  const niche = getNiche();
  document.querySelectorAll('.fill-btn').forEach((btn) => {
    if (btn.classList.contains('busy')) return; // don't override during fill
    btn.disabled = !canFill;
    btn.title = canFill ? '' : `Open a New Post page on ${niche.host} first`;
  });
}

// ---- Parsing helpers (mirrors yt-thumbnail-downloader.html) ----
function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function safeFilename(title) {
  return title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
}

function toMetaDescription(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/([.!?])([A-Za-z0-9])/g, '$1 $2')
    .trim();
}

// Parses a "Date of Posting" string from the email into a structured object.
// Accepts "M/D", "MM/DD", "M/D/YY", "MM/DD/YYYY", "M-D", "M.D", etc.
// Always sets time to 5:00 AM per the SOP. Defaults to current year if omitted.
// Returns null if the string can't be parsed.
function parsePublishDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day   = parseInt(m[2], 10);
  let year    = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day, hour: 5, minute: 0 };
}

function stripHashtags(text) {
  return text
    .split(/\r?\n/)
    .map(l => l.replace(/(^|\s)#[A-Za-z0-9_]+/g, '$1').replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    // Treat each sentence as its own paragraph: insert a blank line after a
    // sentence-ending punctuation when the next line is a non-blank line.
    // Idempotent — won't double-space content that already has blank lines.
    .replace(/([.!?])\n(?!\n)/g, '$1\n\n')
    .trim();
}

function detectIndustry(allLines, anchorIdx, destinationUrl) {
  for (let i = anchorIdx - 1; i >= 0; i--) {
    const ln = allLines[i].trim();
    if (!ln) continue;
    if (/^(content link|date of posting|video title|video link|content)\s*:/i.test(ln)) continue;
    const industryM = ln.match(/^industry\s*:\s*(.+)$/i);
    if (industryM) return industryM[1].trim();
    const cleaned = ln.replace(/[:\-–—]+\s*$/, '').replace(/^[#*\s]+/, '').trim();
    if (cleaned.length > 0 && cleaned.length < 60) return cleaned;
  }
  if (destinationUrl) {
    const slugMap = [
      [/funeral/i, 'Funeral Homes'],
      [/rrmathome|home-improvement|hvac|window|flooring/i, 'Home Improvement'],
      [/seniorcare|senior-care|home-care/i, 'Home Care'],
      [/hospice/i, 'Hospice']
    ];
    for (const [re, name] of slugMap) if (re.test(destinationUrl)) return name;
  }
  return 'Ungrouped';
}

function splitIntoSections(text) {
  const lines = text.split(/\r?\n/);
  const anchors = [];
  lines.forEach((ln, i) => {
    if (/destination\s*link\s*:/i.test(ln)) anchors.push(i);
  });
  if (!anchors.length) return [{ text, industry: 'Ungrouped', destinationUrl: null }];

  // Labels that legitimately end content collection. If the line right above
  // the next anchor matches one of these, it's actual content/metadata and
  // we leave the section boundary alone. Otherwise it's the next section's
  // industry header (either "Industry: X" or plain "X" on its own line) and
  // we trim it off so it doesn't bleed into this section's content.
  const contentLabelRe = /^(content link|date of posting|video title|video link|content)\s*:/i;

  const sections = [];
  for (let a = 0; a < anchors.length; a++) {
    const start = anchors[a];
    let end = a + 1 < anchors.length ? anchors[a + 1] : lines.length;

    if (a + 1 < anchors.length) {
      // Walk backward from the next anchor, skipping blank lines.
      let i = anchors[a + 1] - 1;
      while (i > start && !lines[i].trim()) i--;
      // If we landed on a non-content-label line, it's the next section's
      // industry header — exclude it (and the blanks above it) from this section.
      if (i > start && !contentLabelRe.test(lines[i].trim())) {
        end = i;
      }
    }

    const sectionText = lines.slice(start, end).join('\n');
    const destLine = lines[anchors[a]];
    const destMatch = destLine.match(/destination\s*link\s*:\s*(\S+)/i);
    const destinationUrl = destMatch ? destMatch[1].trim() : null;
    const industry = detectIndustry(lines, anchors[a], destinationUrl);
    sections.push({ text: sectionText, industry, destinationUrl });
  }
  return sections;
}

function extractTriplets(sectionText) {
  const lines = sectionText.split(/\r?\n/);
  const items = [];
  let currentDate = null;
  let pendingTitle = null;
  let pendingLink = null;
  let collectingContent = false;
  let contentLines = [];
  const labelRe = /^(industry|destination link|content link|date of posting|video title|video link|content)\s*:/i;

  function commit() {
    if (pendingTitle && pendingLink) {
      items.push({
        date: currentDate,
        title: pendingTitle,
        link: pendingLink,
        content: stripHashtags(contentLines.join('\n'))
      });
    }
    pendingTitle = null;
    pendingLink = null;
    contentLines = [];
    collectingContent = false;
  }

  for (const raw of lines) {
    const trimmed = raw.trim();
    const dateM = trimmed.match(/^date of posting\s*:\s*(.+)$/i);
    if (dateM) { commit(); currentDate = dateM[1].trim(); continue; }
    const titleM = trimmed.match(/^video title\s*:\s*(.+)$/i);
    if (titleM) { commit(); pendingTitle = titleM[1].trim(); continue; }
    const linkM = trimmed.match(/^video link\s*:\s*(\S+)/i);
    if (linkM) { pendingLink = linkM[1].trim(); collectingContent = false; continue; }
    const contentM = trimmed.match(/^content\s*:\s*(.*)$/i);
    if (contentM) {
      collectingContent = true;
      if (contentM[1]) contentLines.push(contentM[1]);
      continue;
    }
    if (labelRe.test(trimmed)) { collectingContent = false; continue; }
    if (collectingContent) contentLines.push(raw);
  }
  commit();
  return items;
}

// ---- UI rendering ----
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function copyRow(label, value) {
  return `
    <div class="copy-row">
      <span class="label">${label}:</span>
      <span class="value" title="${escapeHtml(value)}">${escapeHtml(value)}</span>
      <button data-copy="${escapeHtml(value)}">Copy</button>
    </div>
  `;
}

function attachCopyHandlers(root) {
  root.querySelectorAll('button[data-copy]').forEach(btn => {
    btn.onclick = async () => {
      const text = btn.getAttribute('data-copy');
      try { await navigator.clipboard.writeText(text); }
      catch {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      }
      const original = btn.textContent;
      btn.textContent = 'Copied';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1200);
    };
  });
}

async function downloadEntry(entry) {
  try {
    const res = await fetch(entry.thumbUrl);
    if (!res.ok) throw new Error('fetch failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = entry.filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch {
    window.open(entry.thumbUrl, '_blank');
  }
}

async function fillCurrentTab(entry, btn) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  const niche = getNiche();
  const payload = {
    title: entry.title,
    content: entry.content || '',
    metaDesc: entry.content ? toMetaDescription(entry.content) : '',
    ytId: entry.id,
    author: 'Welton Hong',
    thumbUrl: entry.thumbUrl,
    filename: entry.filename,
    categories: niche.categories || ['Videos'],
    publishDate: parsePublishDate(entry.date)
  };
  const originalText = btn.textContent;
  btn.classList.add('busy');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Filling…';
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'RRM_FILL_POST', payload });
    if (res && res.ok) {
      btn.textContent = 'Filled ✓';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('busy');
        refreshFillButtons();
      }, 2200);
    } else {
      btn.textContent = 'Failed — see WP tab';
      console.warn('[RRM Helper] Fill response:', res);
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
    alert('Could not reach the WordPress page. Make sure the active tab is the New Post page on the selected niche, then try again.');
  }
}

function renderItem(entry) {
  const grid = document.getElementById('results');
  const div = document.createElement('div');
  div.className = 'card';
  const contentBlock = entry.content ? `
    <div class="content-block">
      <div class="head">
        <span>Content</span>
        <button data-copy="${escapeHtml(entry.content)}">Copy</button>
      </div>
      <pre>${escapeHtml(entry.content)}</pre>
    </div>
  ` : '';
  const metaDesc = entry.content ? toMetaDescription(entry.content) : '';
  const metaBlock = metaDesc ? `
    <div class="content-block">
      <div class="head">
        <span>SEO Meta Description</span>
        <button data-copy="${escapeHtml(metaDesc)}">Copy</button>
      </div>
      <pre>${escapeHtml(metaDesc)}</pre>
    </div>
  ` : '';
  div.innerHTML = `
    <img src="${entry.thumbUrl}" alt="thumbnail">
    <div class="title">${escapeHtml(entry.title)}</div>
    <div class="meta">ID: ${escapeHtml(entry.id)}${entry.date ? ' · Posting: ' + escapeHtml(entry.date) : ''}</div>
    ${copyRow('Title', entry.title)}
    ${contentBlock}
    ${metaBlock}
    ${copyRow('YT ID', entry.id)}
    <div class="filename">${escapeHtml(entry.filename)}</div>
    <button class="fill-btn" ${canFill ? '' : `disabled title="Open a New Post page on ${getNiche().host} first"`}>Fill This Post</button>
    <button class="download-btn">Download Thumbnail</button>
  `;
  const fillBtn = div.querySelector('.fill-btn');
  fillBtn.onclick = () => fillCurrentTab(entry, fillBtn);
  div.querySelector('.download-btn').onclick = () => downloadEntry(entry);
  attachCopyHandlers(div);
  grid.appendChild(div);
}

function clearResults() {
  document.getElementById('results').innerHTML = '';
}

function buildEntry(triplet) {
  const id = extractYouTubeId(triplet.link);
  if (!id) return null;
  return {
    id,
    title: triplet.title,
    date: triplet.date,
    content: triplet.content,
    thumbUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    filename: `${safeFilename(triplet.title)}-thumb.jpg`
  };
}

function renderCards() {
  clearResults();
  const errEl = document.getElementById('bulkErr');
  errEl.textContent = '';
  if (!parsedSections.length) return;

  const niche = getNiche();
  const targetIndustry = niche.industry;
  let total = 0;
  let totalAcrossAll = 0;
  for (const sec of parsedSections) {
    const triplets = sec.triplets || [];
    totalAcrossAll += triplets.length;
    if (sec.industry.trim().toLowerCase() !== targetIndustry) continue;
    for (const t of triplets) {
      const entry = buildEntry(t);
      if (!entry) continue;
      renderItem(entry);
      total++;
    }
  }

  if (!total) {
    if (totalAcrossAll > 0) {
      errEl.textContent = `Found ${totalAcrossAll} videos in the email but none under "${niche.label.split('(')[1]?.replace(')', '') || niche.industry}". Switch niche or paste a different email.`;
    } else {
      errEl.textContent = 'No "Video Title:" / "Video Link:" pairs found.';
    }
  }
}

// ---- Extract action ----
document.getElementById('extractBtn').addEventListener('click', () => {
  const errEl = document.getElementById('bulkErr');
  errEl.textContent = '';
  const text = document.getElementById('bulk').value;
  if (!text.trim()) {
    errEl.textContent = 'Paste the email body first.';
    return;
  }
  const sections = splitIntoSections(text);
  parsedSections = sections.map(s => ({ ...s, triplets: extractTriplets(s.text) }));
  renderCards();
});


/* ============================================================================
 * BLOG POSTS MODE
 * Separate workflow from Video Posts:
 *   - Input: ZIP of .docx files (paired images supported but uploaded manually)
 *   - Parser: ported from docx-batch-to-wordpress.html
 *   - Output: cards with Title/Date/SEO Title/Meta/Content/Category
 *   - Fill: same RRM_FILL_POST message into content-wp.js
 * ============================================================================
 */

const SITES = [
  {
    id: 'rrmathome', name: 'RRM@home',
    host: 'rrmathome.com', hostRe: /(^|\.)rrmathome\.com$/i,
    aliases: ['rrmathome','rrm@home','rrm at home','rrmhome'],
    topics: [
      { id: 'flooring', name: 'Flooring',          categoryPath: ['Blogs'] },
      { id: 'hvac',     name: 'HVAC',              categoryPath: ['Blogs'] },
      { id: 'windows',  name: 'Windows and Doors', categoryPath: ['Blogs'] }
    ]
  },
  {
    id: 'rrm', name: 'RRM (ringringmarketing.com)',
    host: 'ringringmarketing.com', hostRe: /(^|\.)ringringmarketing\.com$/i,
    aliases: ['rrm','ringringmarketing','ring ring marketing'],
    topics: [
      { id: 'funeral',  name: 'Funeral',  categoryPath: ['Funeral',  'Blogs'] },
      { id: 'cemetery', name: 'Cemetery', categoryPath: ['Cemetery', 'Blogs'] }
    ]
  },
  {
    id: 'scmm', name: 'SCMM',
    host: 'seniorcaremarketingmax.com', hostRe: /(^|\.)seniorcaremarketingmax\.com$/i,
    aliases: ['scmm','seniorcaremarketingmax','senior care marketing max'],
    topics: [
      { id: 'homehealth', name: 'Home Health', categoryPath: ['Blogs'] },
      { id: 'homecare',   name: 'Home Care',   categoryPath: ['Blogs'] }
    ]
  },
  {
    id: 'hospice', name: 'Hospice',
    host: 'hospicemarketingleaders.com', hostRe: /(^|\.)hospicemarketingleaders\.com$|hospice/i,
    aliases: ['hospice'],
    topics: [
      { id: 'hospice', name: 'Hospice', categoryPath: ['Blogs'] }
    ]
  }
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let blogParsedPosts = []; // [{ docxName, parsed: {title, date, seoTitle, metaDescription, bodyHtml, dateMM, dateDD}, ... }]
let blogSelectedSite = null;
let blogSelectedTopic = null;
let blogCanFill = false;

// ---- Mode tab wiring ----
const modeVideoBtn = document.getElementById('modeVideoBtn');
const modeBlogBtn  = document.getElementById('modeBlogBtn');
const videoPane    = document.getElementById('videoMode');
const blogPane     = document.getElementById('blogMode');
const modeScopeEl  = document.getElementById('modeScope');
const modeSubtitleEl = document.getElementById('modeSubtitle');

function setMode(mode) {
  if (mode === 'blog') {
    modeBlogBtn.classList.add('active');
    modeVideoBtn.classList.remove('active');
    blogPane.classList.add('active');
    videoPane.classList.remove('active');
    modeScopeEl.textContent = blogSelectedSite ? blogSelectedSite.name : 'Blog';
    modeSubtitleEl.textContent = 'Upload monthly ZIP → click Fill on the active New Post page.';
    refreshBlogTabStatus();
  } else {
    modeVideoBtn.classList.add('active');
    modeBlogBtn.classList.remove('active');
    videoPane.classList.add('active');
    blogPane.classList.remove('active');
    modeScopeEl.textContent = getNiche().chip;
    modeSubtitleEl.textContent = 'Paste the email, pick the niche, then click Fill This Post on the active New Post page.';
    refreshTabStatus();
  }
}
modeVideoBtn.addEventListener('click', () => setMode('video'));
modeBlogBtn.addEventListener('click', () => setMode('blog'));

// ---- Site / topic selectors ----
const blogSiteSelect  = document.getElementById('blogSiteSelect');
const blogTopicSelect = document.getElementById('blogTopicSelect');

for (const s of SITES) {
  const opt = document.createElement('option');
  opt.value = s.id;
  opt.textContent = s.name;
  blogSiteSelect.appendChild(opt);
}
function populateBlogTopics() {
  blogTopicSelect.innerHTML = '';
  if (!blogSelectedSite) return;
  for (const t of blogSelectedSite.topics) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    blogTopicSelect.appendChild(opt);
  }
  blogSelectedTopic = blogSelectedSite.topics[0] || null;
  blogTopicSelect.value = blogSelectedTopic ? blogSelectedTopic.id : '';
}
blogSiteSelect.addEventListener('change', () => {
  blogSelectedSite = SITES.find(s => s.id === blogSiteSelect.value) || null;
  populateBlogTopics();
  modeScopeEl.textContent = blogSelectedSite ? blogSelectedSite.name : 'Blog';
  refreshBlogTabStatus();
  renderBlogCards();
});
blogTopicSelect.addEventListener('change', () => {
  blogSelectedTopic = blogSelectedSite
    ? (blogSelectedSite.topics.find(t => t.id === blogTopicSelect.value) || null)
    : null;
  renderBlogCards();
});

// Initialize default site
blogSelectedSite = SITES[0];
blogSiteSelect.value = blogSelectedSite.id;
populateBlogTopics();

// ---- Active tab status (blog mode) ----
async function refreshBlogTabStatus() {
  const statusEl = document.getElementById('blogTabStatus');
  if (!blogPane.classList.contains('active')) return;
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    statusEl.textContent = 'Could not read active tab.';
    statusEl.className = 'status-line warn';
    blogCanFill = false;
    refreshBlogFillButtons();
    return;
  }

  // Auto-switch site if active tab matches a different site's host
  if (tab && tab.url) {
    try {
      const url = new URL(tab.url);
      const match = SITES.find(s => s.hostRe.test(url.hostname));
      if (match && (!blogSelectedSite || match.id !== blogSelectedSite.id)) {
        blogSelectedSite = match;
        blogSiteSelect.value = match.id;
        populateBlogTopics();
        modeScopeEl.textContent = match.name;
        renderBlogCards();
      }
    } catch {}
  }

  if (!blogSelectedSite) {
    statusEl.textContent = 'Pick a site to continue.';
    statusEl.className = 'status-line warn';
    blogCanFill = false;
  } else if (!tab || !tab.url) {
    statusEl.textContent = 'No active tab.';
    statusEl.className = 'status-line warn';
    blogCanFill = false;
  } else {
    let url;
    try { url = new URL(tab.url); } catch { url = null; }
    const pathOk = url && /\/wp-admin\/post(-new)?\.php/.test(url.pathname);
    const hostOk = url && blogSelectedSite.hostRe.test(url.hostname);
    if (hostOk && pathOk) {
      statusEl.textContent = `Ready: ${url.hostname}${url.pathname}`;
      statusEl.className = 'status-line ok';
      blogCanFill = true;
    } else {
      statusEl.textContent = `Open a New Post page on ${blogSelectedSite.host} to enable Fill.`;
      statusEl.className = 'status-line warn';
      blogCanFill = false;
    }
  }
  refreshBlogFillButtons();
}

chrome.tabs.onActivated.addListener(refreshBlogTabStatus);
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'complete' || info.url) refreshBlogTabStatus();
});

function refreshBlogFillButtons() {
  document.querySelectorAll('#blogResults .fill-btn').forEach((btn) => {
    if (btn.classList.contains('busy')) return;
    btn.disabled = !blogCanFill;
    btn.title = blogCanFill ? '' : (blogSelectedSite ? `Open a New Post page on ${blogSelectedSite.host} first` : 'Pick a site first');
  });
}

/* ----------------------------------------------------------------------------
 * DOCX parsing (ported from docx-batch-to-wordpress.html — quality-check
 * pieces dropped; we only need the field extraction).
 * --------------------------------------------------------------------------*/
function blogPlainText(htmlFragment) {
  return htmlFragment
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}
function blogNormalize(s) {
  return s
    .replace(/[‘’′`]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim().toLowerCase();
}
function blogEscapeHtmlForTag(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function blogSplitBlocks(html) {
  const out = [];
  const re = /<(p|ul|ol)\b[^>]*>[\s\S]*?<\/\1>/g;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[0]);
  return out;
}

function parseDocxHtml(html, filename) {
  const blocks = blogSplitBlocks(html);
  let dateText = '';
  let titleText = '';
  let bodyStart = 0;

  for (let i = 0; i < blocks.length; i++) {
    const text = blogPlainText(blocks[i]);
    if (/^\d{1,2}\.\d{1,2}$/.test(text)) {
      dateText = text;
      if (blocks[i + 1]) titleText = blogPlainText(blocks[i + 1]);
      bodyStart = i + 2;
      break;
    }
  }
  if (!titleText) {
    for (let i = 0; i < blocks.length; i++) {
      if (/^<p>\s*<strong>[\s\S]+?<\/strong>\s*<\/p>$/.test(blocks[i])) {
        titleText = blogPlainText(blocks[i]);
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
    const text = blogPlainText(blocks[i]);
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
          const liText = blogPlainText(li[1]);
          const h2 = liText.match(/^H2:\s*(.+)$/i);
          if (h2) h2Texts.push(h2[1].trim());
        }
      } else {
        for (let j = i + 1; j < blocks.length; j++) {
          const t = blogPlainText(blocks[j]);
          if (!/^H[1-6]:\s*/i.test(t)) break;
          const h2 = t.match(/^H2:\s*(.+)$/i);
          if (h2) h2Texts.push(h2[1].trim());
        }
      }
    }
  }

  const h2Lookup = new Map();
  for (const t of h2Texts) h2Lookup.set(blogNormalize(t), t);

  const useFallbacks = h2Lookup.size === 0;
  const SECTION_LABELS = /^(introduction|intro|conclusion|summary|overview|faq|frequently asked questions|tl;?dr|about|final thoughts|wrap[- ]?up|key takeaways|takeaways|references|sources|notes|appendix|getting started)$/i;

  const outBlocks = [];
  for (let i = bodyStart; i < bodyEnd; i++) {
    const block = blocks[i];
    const m = block.match(/^<p>\s*<strong>([\s\S]+?)<\/strong>\s*<\/p>$/);
    if (m) {
      const inner = blogPlainText(m[1]);
      const stripped = inner.replace(/^\d+[.):]?\s+/, '');
      const matchedH2 = h2Lookup.has(blogNormalize(inner)) || h2Lookup.has(blogNormalize(stripped));
      let promote = matchedH2;
      if (!promote && useFallbacks) {
        const numberedPattern = /^\d+\.\s+\S/.test(inner);
        const labelOnly = SECTION_LABELS.test(inner.replace(/[:.!?]+$/, '').trim());
        promote = numberedPattern || labelOnly;
      }
      if (promote) {
        if (outBlocks.length > 0) outBlocks.push('<p>&nbsp;</p>');
        outBlocks.push(`<h2>${blogEscapeHtmlForTag(inner)}</h2>`);
        continue;
      }
    }
    outBlocks.push(block.replace(/[\s ]+<\/li>/g, '</li>'));
  }
  // Strip Word smart-lookup junk anchors
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

/* ----------------------------------------------------------------------------
 * ZIP intake
 * --------------------------------------------------------------------------*/
async function handleZipFile(file) {
  const errEl = document.getElementById('blogErr');
  const resultsEl = document.getElementById('blogResults');
  errEl.textContent = '';
  resultsEl.innerHTML = '<div class="empty">Unpacking ZIP…</div>';

  let zip;
  try { zip = await JSZip.loadAsync(file); }
  catch (e) {
    errEl.textContent = 'Could not read ZIP: ' + e.message;
    resultsEl.innerHTML = '';
    return;
  }

  const entries = [];
  zip.forEach((relPath, zipObj) => {
    if (zipObj.dir) return;
    if (relPath.startsWith('__MACOSX/') || /\/\._/.test(relPath) || /(^|\/)~\$/.test(relPath)) return;
    entries.push({ path: relPath, obj: zipObj });
  });

  const docxEntries = entries.filter(e => /\.docx$/i.test(e.path) && !e.path.split('/').pop().startsWith('~$'));
  if (!docxEntries.length) {
    errEl.textContent = 'No .docx files found in the ZIP.';
    resultsEl.innerHTML = '';
    return;
  }

  // Try to auto-detect site from ZIP filename or inner folder names
  const lcName = file.name.toLowerCase();
  const folderNames = entries.map(e => e.path.split('/').slice(0, -1).join('/').toLowerCase()).join(' ');
  const haystack = lcName + ' ' + folderNames;
  for (const s of SITES) {
    if (s.aliases.some(a => haystack.includes(a))) {
      if (blogSelectedSite?.id !== s.id) {
        blogSelectedSite = s;
        blogSiteSelect.value = s.id;
        populateBlogTopics();
      }
      break;
    }
  }
  // And topic if any keyword matches
  if (blogSelectedSite) {
    for (const t of blogSelectedSite.topics) {
      if (haystack.includes(t.name.toLowerCase())) {
        blogSelectedTopic = t;
        blogTopicSelect.value = t.id;
        break;
      }
    }
  }

  resultsEl.innerHTML = '<div class="empty">Parsing ' + docxEntries.length + ' docx…</div>';
  const parsed = [];
  for (const d of docxEntries) {
    try {
      const buf = await d.obj.async('arraybuffer');
      const conv = await window.mammoth.convertToHtml({ arrayBuffer: buf });
      const docxName = d.path.split('/').pop();
      const p = parseDocxHtml(conv.value, docxName);
      parsed.push({ docxName, path: d.path, parsed: p });
    } catch (e) {
      console.warn('[RRM Helper] Failed to parse', d.path, e);
    }
  }
  // Sort by date when available
  parsed.sort((a, b) => {
    const am = a.parsed.dateMM || 99, ad = a.parsed.dateDD || 99;
    const bm = b.parsed.dateMM || 99, bd = b.parsed.dateDD || 99;
    return (am - bm) || (ad - bd);
  });
  blogParsedPosts = parsed;
  renderBlogCards();
}

/* ----------------------------------------------------------------------------
 * Card rendering + Fill This Post
 * --------------------------------------------------------------------------*/
function renderBlogCards() {
  const resultsEl = document.getElementById('blogResults');
  resultsEl.innerHTML = '';
  if (!blogParsedPosts.length) {
    resultsEl.innerHTML = '<div class="empty">Drop a ZIP to see posts here.</div>';
    return;
  }
  const catPath = blogSelectedTopic ? blogSelectedTopic.categoryPath : ['Blogs'];
  for (const post of blogParsedPosts) {
    const p = post.parsed;
    const div = document.createElement('div');
    div.className = 'card blog-card';
    div.innerHTML = `
      <div class="title">${escapeHtml(p.title || post.docxName)}</div>
      <div class="meta">${escapeHtml(p.date || '—')} · ${escapeHtml(post.docxName)}</div>
      <div class="field"><div class="label">SEO Title</div><div class="value">${escapeHtml(p.seoTitle || '—')}</div></div>
      <div class="field"><div class="label">Meta Description</div><div class="value">${escapeHtml(p.metaDescription || '—')}</div></div>
      <div class="field"><div class="label">Category</div><div class="value">${escapeHtml(catPath.join(' → '))}</div></div>
      <button class="fill-btn" ${blogCanFill ? '' : `disabled title="Open a New Post page on ${blogSelectedSite ? blogSelectedSite.host : 'the target site'} first"`}>Fill This Post</button>
    `;
    div.querySelector('.fill-btn').addEventListener('click', (e) => fillBlogPost(post, e.target));
    resultsEl.appendChild(div);
  }
}

function blogPlainParagraphs(html) {
  // For the textarea write, keep the HTML as-is — content-wp.js handles it.
  return html;
}

async function fillBlogPost(post, btn) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  const p = post.parsed;
  const catPath = blogSelectedTopic ? blogSelectedTopic.categoryPath : ['Blogs'];
  const year = new Date().getFullYear();

  const payload = {
    title: p.title || '',
    // bodyHtml is already HTML — pass it as content. toHtml() in content-wp.js
    // detects existing HTML and preserves it.
    content: p.bodyHtml || '',
    metaDesc: p.metaDescription || '',
    seoTitle: p.seoTitle || '',
    author: 'Welton Hong',
    thumbUrl: null,
    filename: post.docxName,
    categories: catPath,
    publishDate: (p.dateMM && p.dateDD)
      ? { year, month: p.dateMM, day: p.dateDD, hour: 8, minute: 0 }
      : null
  };

  const originalText = btn.textContent;
  btn.classList.add('busy');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Filling…';
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'RRM_FILL_POST', payload });
    if (res && res.ok) {
      btn.textContent = 'Filled ✓';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('busy');
        refreshBlogFillButtons();
      }, 2200);
    } else {
      btn.textContent = 'Failed — see WP tab';
      console.warn('[RRM Helper] Fill response:', res);
      setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.remove('busy');
        refreshBlogFillButtons();
      }, 3500);
    }
  } catch (e) {
    btn.classList.remove('busy');
    btn.textContent = originalText;
    refreshBlogFillButtons();
    alert('Could not reach the WordPress page. Make sure the active tab is the New Post page on the selected site.');
  }
}

// ---- File input + drag-drop ----
const blogDrop  = document.getElementById('blogDrop');
const blogFile  = document.getElementById('blogFile');

blogDrop.addEventListener('click', (e) => {
  if (e.target.tagName !== 'INPUT') blogFile.click();
});
blogFile.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) handleZipFile(file);
});
['dragenter','dragover'].forEach(ev =>
  blogDrop.addEventListener(ev, (e) => { e.preventDefault(); blogDrop.classList.add('drag'); })
);
['dragleave','drop'].forEach(ev =>
  blogDrop.addEventListener(ev, (e) => { e.preventDefault(); blogDrop.classList.remove('drag'); })
);
blogDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    blogFile.value = '';
    handleZipFile(file);
  }
});

// Init the mode UI (default to video; existing flow)
setMode('video');
