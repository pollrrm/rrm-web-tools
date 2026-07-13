// RRM Marketing Guide Helper — side panel.
// Paste the email → pick site/topic → Fill Post (content + categories + ACF PDF
// URL) and Fill Page (thank-you WPBakery template + slug).

// ============================================================================
// SITES → topics → category paths + primary. Category logic per the team spec:
//   RRM:        {Funeral|Cemetery} > Marketing Guides   (parent is Primary)
//   RRM@home:   {Topic} > Marketing Guides  +  general Marketing Guides (Primary)
//   SCMM:       {Topic} > Marketing Guides  +  general Marketing Guides (Primary)
//   Hospice:    Marketing Guides (top-level only)
// Each topic carries `paths` (array of category paths to tick) + `primary`.
// ============================================================================
const SITES = [
  {
    id: 'rrm', name: 'RRM (ringringmarketing.com)',
    host: 'ringringmarketing.com', hostRe: /(^|\.)ringringmarketing\.com$/i,
    topics: [
      { id: 'funeral',  name: 'Funeral',  paths: [['Funeral',  'Marketing Guides']], primary: 'Funeral'  },
      { id: 'cemetery', name: 'Cemetery', paths: [['Cemetery', 'Marketing Guides']], primary: 'Cemetery' }
    ]
  },
  {
    id: 'rrmathome', name: 'RRM@home',
    host: 'rrmathome.com', hostRe: /(^|\.)rrmathome\.com$/i,
    topics: [
      // Topic'd guides: check {Topic} (Primary) + the Marketing Guides nested
      // under it. No separate top-level Marketing Guides.
      { id: 'flooring',        name: 'Flooring',         paths: [['Flooring', 'Marketing Guides']],        primary: 'Flooring' },
      { id: 'hvac',            name: 'HVAC',             paths: [['HVAC', 'Marketing Guides']],            primary: 'HVAC' },
      { id: 'windowdoor',      name: 'Window Door',      paths: [['Window Door', 'Marketing Guides']],     primary: 'Window Door' },
      { id: 'windowcovering',  name: 'Window Covering',  paths: [['Window Covering', 'Marketing Guides']], primary: 'Window Covering' },
      { id: 'general',         name: 'General (Marketing Guides only)', paths: [['Marketing Guides']],     primary: 'Marketing Guides' }
    ]
  },
  {
    id: 'scmm', name: 'SCMM',
    host: 'seniorcaremarketingmax.com', hostRe: /(^|\.)seniorcaremarketingmax\.com$/i,
    topics: [
      { id: 'assistedliving', name: 'Assisted Living', paths: [['Assisted Living', 'Marketing Guides']], primary: 'Assisted Living' },
      { id: 'homecare',       name: 'Home Care',       paths: [['Home Care', 'Marketing Guides']],       primary: 'Home Care' },
      { id: 'general',        name: 'General (Marketing Guides only)', paths: [['Marketing Guides']],     primary: 'Marketing Guides' }
    ]
  },
  {
    id: 'hospice', name: 'Hospice Haven',
    host: 'hospicehavenmarketing.com', hostRe: /(^|\.)hospicehavenmarketing\.com$/i,
    topics: [
      { id: 'general', name: 'Marketing Guides', paths: [['Marketing Guides']], primary: null }
    ]
  }
];

// Fixed post popup button — same for every niche.
const POST_BUTTON = '<div class="cstm-btn-wrap"><a class="popmake-2273 cstm-btn-popup">Download Guide Now</a></div>';

// Thank-you PAGE template.
//   {TITLE}          = post title, placed inside the <h3>
//   {GUIDE_URL_RAW}  = the guide URL as-is, for the image's clickable link=
//   {GUIDE_URL_ENC}  = encodeURIComponent(url), for the vc_btn link=
// The book-cover image id (14056) and its css id are left as-is — the team
// swaps the actual book image manually after filling. content_placement="middle"
// sets the inner row's Content Position to Middle. The </p> … <p> wrapping
// around the <h3> matches how WPBakery stores the text block.
const PAGE_TEMPLATE = `[vc_row el_id="bodyPaddingTop" css=".vc_custom_1668798838512{margin-top: -50px !important;padding-top: 100px !important;}"][vc_column css=".vc_custom_1668798718225{padding-top: 0px !important;}"][vc_custom_heading text="HERE'S YOUR REQUESTED GUIDE" font_container="tag:h1|text_align:center|color:%23004e92" google_fonts="font_family:Exo%3A100%2C100italic%2C200%2C200italic%2C300%2C300italic%2Cregular%2Citalic%2C500%2C500italic%2C600%2C600italic%2C700%2C700italic%2C800%2C800italic%2C900%2C900italic|font_style:900%20bold%20regular%3A900%3Anormal" css=".vc_custom_1644601659694{margin-bottom: 35px !important;}"][vc_row_inner content_placement="middle" el_class="cstm-flex-middle-align" el_id="rrmBullseyeMethodFlex"][vc_column_inner width="1/2"][vc_single_image image="14056" img_size="large" alignment="center" onclick="custom_link" img_link_target="_blank" css=".vc_custom_1783357865272{margin-bottom: 0px !important;}" el_class="bookshadow" link="{GUIDE_URL_RAW}"][/vc_column_inner][vc_column_inner width="1/2" css=".vc_custom_1668798801948{padding-top: 30px !important;}"][vc_column_text]</p>

<h3 style="color: #004e92;"><em><strong>{TITLE}</strong></em></h3>

<p>[/vc_column_text][vc_btn title="Download Now" link="url:{GUIDE_URL_ENC}|target:_blank" el_class="cstm-btn-gradient"][/vc_column_inner][/vc_row_inner][/vc_column][/vc_row]`;

const MONTH_NAMES = {
  january:1, february:2, march:3, april:4, may:5, june:6, july:7, august:8,
  september:9, october:10, november:11, december:12,
  jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12
};

// ============================================================================
// State + DOM
// ============================================================================
let parsed = null;      // { title, subheading, blocks, pdfUrl, cta, dateStr }
let selectedSite = SITES[0];
let selectedTopic = SITES[0].topics[0];
let canFill = false;

const scopeEl    = document.getElementById('scope');
const siteSelect = document.getElementById('siteSelect');
const topicSelect= document.getElementById('topicSelect');
const tabStatus  = document.getElementById('tabStatus');
const bulk       = document.getElementById('bulk');
const extractBtn = document.getElementById('extractBtn');
const errMsg     = document.getElementById('errMsg');
const results    = document.getElementById('results');

// ---- Dropdowns ----
for (const s of SITES) {
  const opt = document.createElement('option');
  opt.value = s.id; opt.textContent = s.name;
  siteSelect.appendChild(opt);
}
siteSelect.value = selectedSite.id;
populateTopics();

function populateTopics() {
  topicSelect.innerHTML = '';
  for (const t of selectedSite.topics) {
    const opt = document.createElement('option');
    opt.value = t.id; opt.textContent = t.name;
    topicSelect.appendChild(opt);
  }
  selectedTopic = selectedSite.topics[0] || null;
  topicSelect.value = selectedTopic ? selectedTopic.id : '';
  scopeEl.textContent = selectedSite.name.replace(/\s*\(.*\)$/, '');
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

// ---- Active tab status ----
async function refreshTabStatus() {
  let tab;
  try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); }
  catch { tabStatus.textContent = 'Could not read active tab.'; tabStatus.className = 'status-line warn'; canFill = false; return refreshFillButtons(); }

  // Auto-switch site to match the active tab.
  if (tab && tab.url) {
    try {
      const url = new URL(tab.url);
      const match = SITES.find(s => s.hostRe.test(url.hostname));
      if (match && match.id !== selectedSite.id) {
        selectedSite = match; siteSelect.value = match.id; populateTopics(); renderCard();
      }
    } catch {}
  }

  if (!tab || !tab.url) {
    tabStatus.textContent = 'No active tab.'; tabStatus.className = 'status-line warn'; canFill = false;
  } else {
    let url; try { url = new URL(tab.url); } catch { url = null; }
    const pathOk = url && /\/wp-admin\/post(-new)?\.php/.test(url.pathname);
    const hostOk = url && selectedSite.hostRe.test(url.hostname);
    if (hostOk && pathOk) {
      tabStatus.textContent = `Ready: ${url.hostname}${url.pathname}`;
      tabStatus.className = 'status-line ok'; canFill = true;
    } else {
      tabStatus.textContent = `Open a New Post / New Page on ${selectedSite.host} to enable Fill.`;
      tabStatus.className = 'status-line warn'; canFill = false;
    }
  }
  refreshFillButtons();
}
chrome.tabs.onActivated.addListener(refreshTabStatus);
chrome.tabs.onUpdated.addListener((id, info) => { if (info.status === 'complete' || info.url) refreshTabStatus(); });
refreshTabStatus();

function refreshFillButtons() {
  results.querySelectorAll('.fill-btn').forEach(btn => {
    if (btn.classList.contains('busy')) return;
    btn.disabled = !canFill;
    btn.title = canFill ? '' : `Open a New Post / Page on ${selectedSite.host} first`;
  });
}

// ============================================================================
// HTML paste cleanup (Outlook rich-text) — mirrors the Training helper.
// ============================================================================
function stripStrong(s) { return String(s).replace(/<\/?(strong|b)\b[^>]*>/gi, ''); }
function looksLikeHtml(t) { return /<(div|p|b|strong|li|ul|ol|br|span|a)\b[^>]*>/i.test(t); }

function normalizeHtmlToText(html) {
  let text = html;
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) => `• ${inner.replace(/<[^>]+>/g, '').trim()}\n`);
  text = text.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(div|p|h[1-6])\s*>/gi, '\n\n');
  text = text.replace(/<\s*b\b[^>]*>/gi, '<strong>').replace(/<\s*\/\s*b\s*>/gi, '</strong>');
  // Anchors: keep the VISIBLE text only, drop the href. The download link is
  // pasted with the URL as its visible text, so it survives. But when the
  // Title / Subheading / Body text is itself hyperlinked to the download URL
  // (as Outlook often does), we must NOT append the href — otherwise the URL
  // bleeds into every field. Fall back to href only when there's no text.
  text = text.replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const t = inner.replace(/<[^>]+>/g, '').trim();
    return t ? t : href;
  });
  text = text.replace(/<(?!\/?strong\b)[^>]*>/gi, '');
  text = text
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"').replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&hellip;/g, '…');
  text = text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/^[ \t]+|[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
  // Strip <strong> from known label lines so /^label:/ matches.
  text = text.split('\n').map(line => {
    const s = stripStrong(line);
    if (/^(link|title|subheading|sub heading|short description|body|cta button)\s*:/i.test(s.trim())) return s;
    return line;
  }).join('\n');
  return text.trim();
}

// ============================================================================
// Parser — one guide per email; niche comes from the dropdown.
// ============================================================================
function parseGuide(text) {
  if (looksLikeHtml(text)) text = normalizeHtmlToText(text);
  const lines = text.split(/\r?\n/);
  const clean = (l) => stripStrong(l).trim();
  const idxOf = (re) => lines.findIndex(l => re.test(clean(l)));

  const linkIdx  = idxOf(/^link\s*:/i);
  const titleIdx = idxOf(/^title\s*:/i);
  const subIdx   = idxOf(/^(subheading|sub heading|short description)\s*:/i);
  const bodyIdx  = idxOf(/^body\s*:/i);
  const ctaIdx   = idxOf(/^cta button\s*:/i);

  const getInline = (idx, re) => {
    if (idx < 0) return '';
    const m = clean(lines[idx]).match(re);
    return m && m[1] ? m[1].trim() : '';
  };

  let pdfUrl = getInline(linkIdx, /^link\s*:\s*(.+)$/i);
  // If the URL wasn't on the label line, grab the next non-blank line.
  if (linkIdx >= 0 && !pdfUrl) {
    for (let i = linkIdx + 1; i < lines.length; i++) { if (lines[i].trim()) { pdfUrl = clean(lines[i]); break; } }
  }
  // Extract just the URL token if there's extra text around it.
  const urlMatch = pdfUrl.match(/https?:\/\/\S+/);
  if (urlMatch) pdfUrl = urlMatch[0];

  const title = getInline(titleIdx, /^title\s*:\s*(.+)$/i);
  let subheading = getInline(subIdx, /^(?:subheading|sub heading|short description)\s*:\s*(.+)$/i);
  if (subIdx >= 0 && !subheading) {
    for (let i = subIdx + 1; i < lines.length; i++) { if (lines[i].trim()) { subheading = clean(lines[i]); break; } }
  }
  const cta = getInline(ctaIdx, /^cta button\s*:\s*(.+)$/i);

  if (!title) return null;

  // Body: from the Body label (inline part + following lines) up to CTA / end.
  let bodyLines = [];
  if (bodyIdx >= 0) {
    const inline = clean(lines[bodyIdx]).match(/^body\s*:\s*(.+)$/i);
    if (inline && inline[1].trim()) bodyLines.push(inline[1].trim());
    const stop = ctaIdx > bodyIdx ? ctaIdx : lines.length;
    for (let i = bodyIdx + 1; i < stop; i++) bodyLines.push(lines[i]);
  }
  const blocks = parseBodyBlocks(bodyLines);

  return { title, subheading, blocks, pdfUrl, cta, dateStr: '' };
}

function parseBodyBlocks(lines) {
  const blocks = [];
  let current = null;
  const isBullet = (s) => /^[•·●*\-]\s+/.test(s) || /^\d+\.\s+/.test(s);
  const stripBullet = (s) => s.replace(/^[•·●*\-]\s+/, '').replace(/^\d+\.\s+/, '').trim();
  const cleanText = (s) => s.replace(/<\/?strong[^>]*>/gi, '').trim();
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) { if (current) { blocks.push(current); current = null; } continue; }
    if (isBullet(trimmed)) {
      const item = cleanText(stripBullet(trimmed));
      if (current && current.type === 'ul') current.items.push(item);
      else { if (current) blocks.push(current); current = { type: 'ul', items: [item] }; }
    } else {
      const t = cleanText(trimmed);
      if (!t) continue;
      if (current && current.type === 'p') current.items.push(t);
      else { if (current) blocks.push(current); current = { type: 'p', items: [t] }; }
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

// ============================================================================
// Render post content — <strong>subheading</strong> + body + fixed button
// ============================================================================
function escapeHtmlForTag(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function renderPostContent(g) {
  const parts = [];
  if (g.subheading) parts.push(`<strong>${escapeHtmlForTag(g.subheading)}</strong>`);
  for (const b of g.blocks) {
    if (b.type === 'p') parts.push(b.items.join('\n'));
    else if (b.type === 'ul') parts.push(`<ul>\n${b.items.map(it => `\t<li>${escapeHtmlForTag(it)}</li>`).join('\n')}\n</ul>`);
  }
  parts.push(POST_BUTTON);
  return parts.join('\n\n');
}

// ============================================================================
// Page content — thank-you template with title + encoded guide URL
// ============================================================================
function buildPageContent(title, pdfUrl) {
  const raw = pdfUrl || '';
  const enc = pdfUrl ? encodeURIComponent(pdfUrl) : '';
  return PAGE_TEMPLATE
    .replace('{TITLE}', escapeHtmlForTag(title || ''))
    .replace('{GUIDE_URL_RAW}', raw)
    .replace('{GUIDE_URL_ENC}', enc);
}

// WP-style slug from the title (matches sanitize_title closely enough).
function sanitizeTitleToSlug(title) {
  return String(title).toLowerCase()
    .replace(/[’'"]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

// ============================================================================
// Card rendering
// ============================================================================
function copyBtn(v) { return `<button class="copy-btn" data-copy="${escapeHtml(v)}">Copy</button>`; }
function fieldRow(label, value, copyValue) {
  return `<div class="field"><div class="head"><span class="label">${escapeHtml(label)}</span>${copyValue !== undefined ? copyBtn(copyValue) : ''}</div><div class="value">${value}</div></div>`;
}
function contentPreview(label, html) {
  return `<div class="content-block"><div class="head"><span>${escapeHtml(label)}</span>${copyBtn(html)}</div><pre>${escapeHtml(html)}</pre></div>`;
}
function attachCopyHandlers(root) {
  root.querySelectorAll('button[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = btn.getAttribute('data-copy');
      try { await navigator.clipboard.writeText(text); }
      catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
      const o = btn.textContent; btn.textContent = 'Copied ✓'; btn.classList.add('copied');
      setTimeout(() => { btn.textContent = o; btn.classList.remove('copied'); }, 1200);
    });
  });
}

function renderCard() {
  results.innerHTML = '';
  if (!parsed) { results.innerHTML = '<div class="empty">Paste an email and click Extract.</div>'; return; }
  const postHtml = renderPostContent(parsed);
  const slug = sanitizeTitleToSlug(parsed.title) + '-thank-you';
  const pageHtml = buildPageContent(parsed.title, parsed.pdfUrl);
  const catLabel = (selectedTopic ? selectedTopic.paths.map(p => p.join(' → ')).join('  +  ') : 'Marketing Guides') +
    (selectedTopic && selectedTopic.primary ? `  ·  Primary: ${selectedTopic.primary}` : '');

  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="title">${escapeHtml(parsed.title)}</div>
    <div class="meta">${escapeHtml(selectedSite.name)} · ${escapeHtml(selectedTopic ? selectedTopic.name : '')}</div>

    ${fieldRow('Title', escapeHtml(parsed.title), parsed.title)}
    ${fieldRow('Subheading', escapeHtml(parsed.subheading || '—'), parsed.subheading || '')}
    ${fieldRow('PDF Link', escapeHtml(parsed.pdfUrl || '—'), parsed.pdfUrl || '')}
    ${fieldRow('Category', escapeHtml(catLabel))}
    ${fieldRow('Page slug', escapeHtml(slug), slug)}

    ${contentPreview('Post Content (HTML)', postHtml)}
    ${contentPreview('Page Content (WPBakery)', pageHtml)}

    <button class="fill-btn fill-post-btn" data-mode="post" ${canFill ? '' : `disabled title="Open a New Post on ${selectedSite.host} first"`}>Fill This Post</button>
    <button class="fill-btn fill-page-btn" data-mode="page" ${canFill ? '' : `disabled title="Open a New Page on ${selectedSite.host} first"`}>Fill This Page</button>
  `;
  div.querySelectorAll('.fill-btn').forEach(btn => btn.addEventListener('click', (e) => fillActiveTab(e.target)));
  attachCopyHandlers(div);
  results.appendChild(div);
}

// ============================================================================
// Fill dispatch
// ============================================================================
async function fillActiveTab(btn) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !parsed) return;
  const mode = btn.dataset.mode;
  const slug = sanitizeTitleToSlug(parsed.title) + '-thank-you';

  let type, payload;
  if (mode === 'page') {
    type = 'RRM_GUIDE_FILL_PAGE';
    payload = {
      title: parsed.title,
      content: buildPageContent(parsed.title, parsed.pdfUrl),
      author: 'Welton Hong',
      publishDate: null,      // pages don't need the scheduled date
      slug
    };
  } else {
    type = 'RRM_GUIDE_FILL_POST';
    payload = {
      title: parsed.title,
      content: renderPostContent(parsed),
      pdfUrl: parsed.pdfUrl,
      author: 'Welton Hong',
      categoryPaths: selectedTopic ? selectedTopic.paths : [['Marketing Guides']],
      primaryCategory: selectedTopic ? selectedTopic.primary : null,
      publishDate: null       // guides publish immediately unless you set a date
    };
  }

  const o = btn.textContent;
  btn.classList.add('busy'); btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Filling…';
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type, payload });
    if (res && res.ok) {
      btn.textContent = 'Filled ✓';
      setTimeout(() => { btn.textContent = o; btn.classList.remove('busy'); refreshFillButtons(); }, 2200);
    } else {
      btn.textContent = 'Failed — see WP tab';
      console.warn('[RRM Guide Helper] Fill response:', res);
      setTimeout(() => { btn.textContent = o; btn.classList.remove('busy'); refreshFillButtons(); }, 3500);
    }
  } catch (e) {
    btn.classList.remove('busy'); btn.textContent = o; refreshFillButtons();
    alert(`Could not reach the WordPress ${mode}. Make sure the active tab is the New ${mode === 'page' ? 'Page' : 'Post'} screen on ${selectedSite.host}.`);
  }
}

// ============================================================================
// Rich-text paste + Extract
// ============================================================================
bulk.addEventListener('paste', (e) => {
  const cd = e.clipboardData; if (!cd) return;
  const html = cd.getData('text/html');
  if (!html || !html.trim()) return;
  e.preventDefault();
  const normalized = normalizeHtmlToText(html);
  const start = bulk.selectionStart, end = bulk.selectionEnd;
  bulk.value = bulk.value.slice(0, start) + normalized + bulk.value.slice(end);
  const cur = start + normalized.length;
  bulk.selectionStart = bulk.selectionEnd = cur;
});

extractBtn.addEventListener('click', () => {
  errMsg.textContent = '';
  const text = bulk.value;
  if (!text.trim()) { errMsg.textContent = 'Paste the marketing guide email first.'; return; }
  const g = parseGuide(text);
  if (!g) { errMsg.textContent = 'Could not find a Title in the email. Make sure "Title:" is present.'; parsed = null; }
  else parsed = g;
  renderCard();
});

renderCard();
