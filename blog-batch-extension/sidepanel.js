// RRM Blog Batch Helper — side panel.
//
// Flow:  drop a monthly ZIP (4 .docx + 4 images)  →  unzip + pair + parse all
//        →  write a resumable QUEUE to chrome.storage.local  →  walk through the
//        posts one at a time, filling each into the active WP New Post tab via
//        chrome.tabs.sendMessage({type:'RRM_BATCH_FILL_POST', payload}).
//
// This extension is fully self-contained: the parser and SITES config below are
// COPIED from the RRM Blog Helper extension (not shared), so nothing in that
// extension is touched. A single .docx is also accepted as a one-post batch.

// ============================================================================
// SITES — copied verbatim from the RRM Blog Helper extension.
// ============================================================================
const SITES = [
  {
    id: 'rrmathome', name: 'RRM@home', host: 'rrmathome.com', hostRe: /(^|\.)rrmathome\.com$/i,
    aliases: ['rrmathome','rrm@home','rrm at home','rrmhome'],
    topics: [
      { id: 'flooring', name: 'Flooring',          categoryPath: ['Blogs'], primaryCategory: null },
      { id: 'hvac',     name: 'HVAC',              categoryPath: ['Blogs'], primaryCategory: null },
      { id: 'windows',  name: 'Windows and Doors', categoryPath: ['Blogs'], primaryCategory: null }
    ]
  },
  {
    id: 'rrm', name: 'RRM (ringringmarketing.com)', host: 'ringringmarketing.com', hostRe: /(^|\.)ringringmarketing\.com$/i,
    aliases: ['rrm','ringringmarketing','ring ring marketing'],
    topics: [
      { id: 'funeral',  name: 'Funeral',  categoryPath: ['Funeral',  'Blogs'], primaryCategory: 'Funeral'  },
      { id: 'cemetery', name: 'Cemetery', categoryPath: ['Cemetery', 'Blogs'], primaryCategory: 'Cemetery' }
    ]
  },
  {
    id: 'scmm', name: 'SCMM', host: 'seniorcaremarketingmax.com', hostRe: /(^|\.)seniorcaremarketingmax\.com$/i,
    aliases: ['scmm','seniorcaremarketingmax','senior care marketing max'],
    topics: [
      { id: 'homehealth', name: 'Home Health', categoryPath: ['Blogs'], primaryCategory: null },
      { id: 'homecare',   name: 'Home Care',   categoryPath: ['Blogs'], primaryCategory: null }
    ]
  },
  {
    id: 'hospice', name: 'Hospice Haven', host: 'hospicehavenmarketing.com', hostRe: /(^|\.)hospicehavenmarketing\.com$/i,
    aliases: ['hospice','hospice haven','hospicehaven','hospicehavenmarketing'],
    topics: [
      { id: 'hospice', name: 'Hospice', categoryPath: ['Blogs'], primaryCategory: null }
    ]
  }
];

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Niche keywords used only for the TOPIC_MISMATCH warning — if an image
// filename names a DIFFERENT niche than the selected topic, the source asset
// is probably wrong (real bug: a Home Health post shipped with a Funeral image).
const NICHE_KEYWORDS = {
  flooring:   ['floor','flooring'],
  hvac:       ['hvac','heating','cooling','furnace','air condition','aircondition'],
  windows:    ['window','doors','door'],
  funeral:    ['funeral','mortuary','crematory','cremation'],
  cemetery:   ['cemetery','cemeteries','burial','grave'],
  homehealth: ['home health','homehealth','health aide'],
  homecare:   ['home care','homecare','caregiver','senior care','seniorcare'],
  hospice:    ['hospice','palliative']
};

// ============================================================================
// State
// ============================================================================
const QUEUE_KEY = 'rrm_batch_v1';
let queue = null;                 // the in-memory mirror of the stored queue
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
});
topicSelect.addEventListener('change', () => {
  selectedTopic = selectedSite.topics.find(t => t.id === topicSelect.value) || null;
});

// ============================================================================
// Active-tab status — enables Fill only on a New Post page of the selected site
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

  // Auto-switch site to match the active tab's domain if it's one of ours and
  // we don't already have a batch locked to a specific site.
  if (tab && tab.url && !queue) {
    try {
      const url = new URL(tab.url);
      const match = SITES.find(s => s.hostRe.test(url.hostname));
      if (match && match.id !== selectedSite.id) {
        selectedSite = match;
        siteSelect.value = match.id;
        populateTopics();
      }
    } catch {}
  }

  const wantSite = queue ? SITES.find(s => s.id === queue.siteId) || selectedSite : selectedSite;
  if (!tab || !tab.url) {
    tabStatus.textContent = 'No active tab.';
    tabStatus.className = 'status-line warn';
    canFill = false;
  } else {
    let url; try { url = new URL(tab.url); } catch { url = null; }
    const pathOk = url && /\/wp-admin\/post(-new)?\.php/.test(url.pathname);
    const hostOk = url && wantSite.hostRe.test(url.hostname);
    if (hostOk && pathOk) {
      tabStatus.textContent = `Ready: ${url.hostname}${url.pathname}`;
      tabStatus.className = 'status-line ok';
      canFill = true;
    } else {
      tabStatus.textContent = `Open a New Post page on ${wantSite.host} to enable Fill.`;
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

function refreshFillButtons() {
  results.querySelectorAll('.fill-btn').forEach(btn => {
    if (btn.classList.contains('busy')) return;
    btn.disabled = !canFill;
    btn.title = canFill ? '' : `Open a New Post page on ${(queue ? SITES.find(s=>s.id===queue.siteId)?.host : selectedSite.host)} first`;
  });
}

// ============================================================================
// .docx parser — copied verbatim from the RRM Blog Helper extension.
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
    const seoMatch = text.match(/^SEO\s+Title(?:\s+Tag)?:\s*(.+)$/i);
    if (seoMatch) seoTitle = seoMatch[1].trim();
    const metaMatch = text.match(/^Meta\s+Description:\s*(.+)$/i);
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
// ZIP unpack + docx/image pairing (ported from docx-batch-to-wordpress.html)
// ============================================================================
function basename(path) { const i = path.lastIndexOf('/'); return i >= 0 ? path.slice(i + 1) : path; }
function dirname(path)  { const i = path.lastIndexOf('/'); return i >= 0 ? path.slice(0, i) : ''; }
function extOf(path)    { const m = basename(path).match(/\.([a-z0-9]+)$/i); return m ? m[1].toLowerCase() : ''; }
function dateKeyFromName(name) {
  const m = basename(name).match(/(\d{1,2})\.(\d{1,2})/);
  return m ? `${parseInt(m[1], 10)}.${parseInt(m[2], 10)}` : null;
}

async function readZip(file) {
  const zip = await JSZip.loadAsync(file);
  const entries = [];
  zip.forEach((relPath, zipObj) => {
    if (zipObj.dir) return;
    if (relPath.startsWith('__MACOSX/') || /\/\._/.test(relPath) || /(^|\/)~\$/.test(relPath)) return;
    entries.push({ path: relPath, obj: zipObj });
  });
  return entries;
}

function pairFiles(entries) {
  const docx = entries.filter(e => extOf(e.path) === 'docx' && !basename(e.path).startsWith('~$'));
  const images = entries.filter(e => ['jpg','jpeg','png','gif','webp'].includes(extOf(e.path)));
  const pairs = [];
  const usedImg = new Set();

  // 1) same folder
  for (const d of docx) {
    const folder = dirname(d.path);
    const candidates = images.filter(i => !usedImg.has(i.path) && dirname(i.path) === folder);
    if (candidates.length === 1) {
      pairs.push({ docx: d, image: candidates[0] });
      usedImg.add(candidates[0].path);
    } else if (candidates.length > 1) {
      let best = candidates[0];
      for (const c of candidates) if ((c.obj._data?.uncompressedSize || 0) > (best.obj._data?.uncompressedSize || 0)) best = c;
      pairs.push({ docx: d, image: best });
      usedImg.add(best.path);
    } else {
      pairs.push({ docx: d, image: null });
    }
  }
  // 2) fall back to date-token match for any unpaired docx
  for (const pair of pairs) {
    if (pair.image) continue;
    const key = dateKeyFromName(pair.docx.path);
    if (!key) continue;
    const candidate = images.find(i => !usedImg.has(i.path) && dateKeyFromName(i.path) === key);
    if (candidate) { pair.image = candidate; usedImg.add(candidate.path); }
  }
  return pairs;
}

async function imageToDataUrl(zipObj, name) {
  const b64 = await zipObj.async('base64');
  const ext = extOf(name);
  const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${b64}`;
}

// ============================================================================
// Warnings — cheap, deterministic checks carried into the queue for review.
// ============================================================================
function buildWarnings(parsed, imageName, topic) {
  const w = [];
  if (!parsed.dateMM || !parsed.dateDD) w.push({ code: 'NO_DATE', sev: 'warn', msg: 'No M.D date found — publish date will be blank.' });
  if (!parsed.title)             w.push({ code: 'NO_TITLE', sev: 'error', msg: 'No title detected in the document.' });
  if (!parsed.seoTitle)          w.push({ code: 'NO_SEO_TITLE', sev: 'warn', msg: 'No "SEO Title:" line found.' });
  if (!parsed.metaDescription)   w.push({ code: 'NO_META', sev: 'warn', msg: 'No "Meta Description:" line found.' });
  const h2Count = (parsed.bodyHtml.match(/<h2\b/gi) || []).length;
  if (h2Count === 0)             w.push({ code: 'NO_H2', sev: 'warn', msg: 'No H2 headings in the body — section structure may be missing.' });
  if (!imageName)                w.push({ code: 'NO_IMAGE', sev: 'warn', msg: 'No image paired with this post.' });

  // TOPIC_MISMATCH — the image filename names a niche other than the selected topic.
  if (imageName && topic) {
    const lc = ' ' + imageName.toLowerCase().replace(/[_\-.]+/g, ' ') + ' ';
    const ownKeys = NICHE_KEYWORDS[topic.id] || [];
    const ownMatch = ownKeys.some(k => lc.includes(k));
    let foreign = null;
    for (const [tid, keys] of Object.entries(NICHE_KEYWORDS)) {
      if (tid === topic.id) continue;
      // Skip sibling topics that share the post's own family (home care/health).
      if (keys.some(k => lc.includes(k))) { foreign = tid; break; }
    }
    if (!ownMatch && foreign) {
      w.push({ code: 'TOPIC_MISMATCH', sev: 'warn',
        msg: `Image filename looks like "${foreign}", not "${topic.name}". The pairing may be right but the source image is likely wrong.` });
    }
  }
  return w;
}

// ============================================================================
// Queue storage helpers
// ============================================================================
async function readQueueFromStorage() {
  try {
    const obj = await chrome.storage.local.get(QUEUE_KEY);
    const q = obj[QUEUE_KEY];
    if (!q || q.schemaVersion !== 1) return null;
    return q;
  } catch { return null; }
}
async function saveQueue() {
  if (!queue) return true;
  try {
    await chrome.storage.local.set({ [QUEUE_KEY]: queue });
    return true;
  } catch (e) {
    errMsg.textContent = 'Could not save the batch (storage full?). ' + (e.message || e);
    return false;
  }
}
async function clearQueue() {
  queue = null;
  try { await chrome.storage.local.remove(QUEUE_KEY); } catch {}
  errMsg.textContent = '';
  refreshTabStatus();
  render();
}

function nextPendingIndex(from) {
  if (!queue) return null;
  for (let i = from + 1; i < queue.posts.length; i++) if (queue.posts[i].status === 'pending') return i;
  for (let i = 0; i < queue.posts.length; i++) if (queue.posts[i].status === 'pending') return i;
  return null;
}

// ============================================================================
// File intake — routes ZIP vs single .docx
// ============================================================================
async function handleFile(file) {
  errMsg.textContent = '';
  const ext = extOf(file.name);
  if (ext === 'zip') return handleZip(file);
  if (ext === 'docx') return handleDocx(file);
  errMsg.textContent = 'Please drop a .zip (monthly batch) or a single .docx.';
}

function detectSiteTopicFromName(name) {
  const lc = name.toLowerCase();
  const site = SITES.find(s => s.aliases.some(a => lc.includes(a)));
  if (site) {
    selectedSite = site;
    siteSelect.value = site.id;
    populateTopics();
    const topic = site.topics.find(t => lc.includes(t.name.toLowerCase()));
    if (topic) { selectedTopic = topic; topicSelect.value = topic.id; }
  }
}

async function buildQueueFromPairs(pairs, sourceName) {
  const topic = selectedTopic;
  const posts = [];
  for (const pair of pairs) {
    const buf = await pair.docx.obj.async('arraybuffer');
    const conv = await window.mammoth.convertToHtml({ arrayBuffer: buf });
    const docxName = basename(pair.docx.path);
    const parsed = parseDocxHtml(conv.value, docxName);
    let image = null;
    if (pair.image) {
      const imgName = basename(pair.image.path);
      image = { name: imgName, dataUrl: await imageToDataUrl(pair.image.obj, imgName) };
    }
    posts.push({
      idx: 0, // set after sort
      status: 'pending',
      docxName,
      title: parsed.title || '',
      seoTitle: parsed.seoTitle || '',
      metaDesc: parsed.metaDescription || '',
      dateMM: parsed.dateMM, dateDD: parsed.dateDD, dateLabel: parsed.date || '',
      contentHtml: parsed.bodyHtml || '',
      image,
      warnings: buildWarnings(parsed, image ? image.name : null, topic),
      wpPostId: null, wpUrl: null, error: null,
      _sortKey: (parsed.dateMM != null && parsed.dateDD != null) ? parsed.dateMM * 100 + parsed.dateDD : 9999
    });
  }
  posts.sort((a, b) => a._sortKey - b._sortKey);
  posts.forEach((p, i) => { p.idx = i; delete p._sortKey; });

  const now = Date.now();
  const first = posts.find(p => p.dateMM);
  const ym = first ? `${new Date().getFullYear()}-${String(first.dateMM).padStart(2, '0')}` : `${new Date().getFullYear()}`;
  queue = {
    schemaVersion: 1,
    batchId: `${selectedSite.id}_${topic ? topic.id : 'blogs'}_${ym}`,
    siteId: selectedSite.id, siteName: selectedSite.name,
    topicId: topic ? topic.id : null, topicName: topic ? topic.name : '',
    categoryPath: topic ? topic.categoryPath : ['Blogs'],
    primaryCategory: topic ? topic.primaryCategory : null,
    sourceZip: sourceName,
    createdAt: now,
    cursor: 0,
    posts
  };
  const ok = await saveQueue();
  if (ok) { refreshTabStatus(); render(); }
}

async function handleZip(file) {
  results.innerHTML = '<div class="empty"><span class="spinner"></span>Unzipping and parsing…</div>';
  try {
    const entries = await readZip(file);
    const pairs = pairFiles(entries);
    if (!pairs.length) { errMsg.textContent = 'No .docx files found in this ZIP.'; results.innerHTML = ''; return; }
    detectSiteTopicFromName(file.name + ' ' + entries.map(e => e.path).join(' '));
    await buildQueueFromPairs(pairs, file.name);
  } catch (e) {
    console.error('[RRM Blog Batch] ZIP parse failed:', e);
    errMsg.textContent = 'Could not read ZIP: ' + (e.message || e);
    results.innerHTML = '';
  }
}

async function handleDocx(file) {
  results.innerHTML = '<div class="empty"><span class="spinner"></span>Parsing .docx…</div>';
  try {
    detectSiteTopicFromName(file.name);
    const pair = { docx: { path: file.name, obj: { async: (t) => t === 'arraybuffer' ? file.arrayBuffer() : null } }, image: null };
    await buildQueueFromPairs([pair], file.name);
  } catch (e) {
    console.error('[RRM Blog Batch] .docx parse failed:', e);
    errMsg.textContent = 'Failed to parse .docx: ' + (e.message || e);
    results.innerHTML = '';
  }
}

// ============================================================================
// Rendering
// ============================================================================
function field(label, value, copyValue) {
  return `
    <div class="field">
      <div class="head">
        <span class="label">${escapeHtml(label)}</span>
        ${copyValue !== undefined ? `<button class="copy-btn" data-copy="${escapeHtml(copyValue)}">Copy</button>` : ''}
      </div>
      <div class="value">${value}</div>
    </div>`;
}
function contentBlock(label, value) {
  return `
    <div class="content-block">
      <div class="head"><span>${escapeHtml(label)}</span><button class="copy-btn" data-copy="${escapeHtml(value)}">Copy</button></div>
      <pre>${escapeHtml(value)}</pre>
    </div>`;
}
function attachCopyHandlers(root) {
  root.querySelectorAll('button[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = btn.getAttribute('data-copy');
      try { await navigator.clipboard.writeText(text); }
      catch {
        const ta = document.createElement('textarea'); ta.value = text;
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      }
      const original = btn.textContent;
      btn.textContent = 'Copied ✓'; btn.classList.add('copied');
      setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1200);
    });
  });
}

function render() {
  results.innerHTML = '';
  if (!queue || !queue.posts.length) {
    results.innerHTML = '<div class="empty">Drop the monthly ZIP to build a batch.</div>';
    return;
  }
  document.getElementById('subtitle').textContent =
    `${queue.siteName}${queue.topicName ? ' · ' + queue.topicName : ''} — ${queue.posts.length} posts from ${queue.sourceZip}`;

  const n = queue.posts.length;
  const cur = queue.posts[queue.cursor];
  const doneCount = queue.posts.filter(p => p.status === 'filled' || p.status === 'scheduled').length;

  // Head + clear
  const head = document.createElement('div');
  head.className = 'batch-head';
  head.innerHTML = `
    <span class="counter">Post ${queue.cursor + 1} of ${n} · ${doneCount} done</span>
    <button class="clear" id="clearBatch">Clear batch</button>`;
  results.appendChild(head);
  head.querySelector('#clearBatch').addEventListener('click', async () => {
    if (confirm('Clear this batch and return to the drop screen? Progress will be discarded.')) await clearQueue();
  });

  // Status rail
  const rail = document.createElement('div');
  rail.className = 'rail';
  queue.posts.forEach((p, i) => {
    const chip = document.createElement('div');
    chip.className = 'chip ' + (i === queue.cursor ? 'current ' : '') + p.status;
    const mark = p.status === 'filled' || p.status === 'scheduled' ? '✓' : p.status === 'skipped' ? '–' : p.status === 'error' ? '✗' : (i + 1);
    chip.textContent = mark;
    chip.title = `Post ${i + 1}: ${p.title || p.docxName} (${p.status})`;
    chip.addEventListener('click', () => { queue.cursor = i; saveQueue(); render(); });
    rail.appendChild(chip);
  });
  results.appendChild(rail);

  // Current post card
  const card = document.createElement('div');
  card.className = 'card';
  const catValue = `${(queue.categoryPath || ['Blogs']).join(' → ')}${queue.primaryCategory ? ' (Primary: ' + queue.primaryCategory + ')' : ''}`;
  const errs = cur.warnings.filter(w => w.sev === 'error');
  const warns = cur.warnings.filter(w => w.sev !== 'error');
  const warnSummary = cur.warnings.length
    ? `<details class="warnings"${errs.length ? ' open' : ''}>
         <summary>${errs.length ? `${errs.length} error${errs.length>1?'s':''} · ` : ''}${warns.length} warning${warns.length===1?'':'s'}</summary>
         ${cur.warnings.map(w => `<div class="w ${w.sev === 'error' ? 'err' : ''}"><span class="code">${escapeHtml(w.code)}</span><br>${escapeHtml(w.msg)}</div>`).join('')}
       </details>`
    : '';

  card.innerHTML = `
    <div class="title">${escapeHtml(cur.title || cur.docxName)}</div>
    <div class="meta">${escapeHtml(cur.dateLabel || '—')} · ${escapeHtml(cur.docxName)}</div>
    ${cur.image ? `<img class="thumb" src="${cur.image.dataUrl}" alt="">` : ''}
    ${warnSummary}
    ${field('Title',            escapeHtml(cur.title || '—'),   cur.title || '')}
    ${field('Date',             escapeHtml(cur.dateLabel || '—'), cur.dateLabel || '')}
    ${field('SEO Title',        escapeHtml(cur.seoTitle || '—'), cur.seoTitle || '')}
    ${field('Meta Description', escapeHtml(cur.metaDesc || '—'), cur.metaDesc || '')}
    ${field('Category',         escapeHtml(catValue))}
    ${cur.contentHtml ? contentBlock('Content (HTML)', cur.contentHtml) : ''}
    <div class="nav-row">
      <button class="ghost" id="prevBtn" ${queue.cursor === 0 ? 'disabled' : ''}>← Prev</button>
      <button class="ghost" id="skipBtn">Skip</button>
      <button class="ghost" id="nextBtn" ${queue.cursor >= n - 1 ? 'disabled' : ''}>Next →</button>
    </div>
    <div class="nav-row" style="margin-top:6px">
      <button class="fill-btn" id="fillBtn" ${canFill ? '' : 'disabled'}>Fill This Post</button>
    </div>`;
  results.appendChild(card);
  attachCopyHandlers(card);

  card.querySelector('#prevBtn').addEventListener('click', () => { if (queue.cursor > 0) { queue.cursor--; saveQueue(); render(); } });
  card.querySelector('#nextBtn').addEventListener('click', () => { if (queue.cursor < n - 1) { queue.cursor++; saveQueue(); render(); } });
  card.querySelector('#skipBtn').addEventListener('click', async () => {
    cur.status = 'skipped';
    const nxt = nextPendingIndex(queue.cursor);
    queue.cursor = nxt != null ? nxt : Math.min(queue.cursor + 1, n - 1);
    await saveQueue(); render();
  });
  card.querySelector('#fillBtn').addEventListener('click', (e) => fillCurrent(e.target));
  refreshFillButtons();
}

async function fillCurrent(btn) {
  if (!queue) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  const post = queue.posts[queue.cursor];
  const year = new Date().getFullYear();
  const payload = {
    title: post.title || '',
    content: post.contentHtml || '',
    metaDesc: post.metaDesc || '',
    seoTitle: post.seoTitle || '',
    author: 'Welton Hong',
    filename: post.docxName,
    categories: queue.categoryPath || ['Blogs'],
    primaryCategory: queue.primaryCategory || null,
    publishDate: (post.dateMM && post.dateDD)
      ? { year, month: post.dateMM, day: post.dateDD, hour: 4, minute: 0 }
      : null
  };

  const original = btn.textContent;
  btn.classList.add('busy'); btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Filling…';
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'RRM_BATCH_FILL_POST', payload });
    if (res && res.ok) {
      post.status = 'filled';
      post.error = null;
      const nxt = nextPendingIndex(queue.cursor);
      if (nxt != null) queue.cursor = nxt;
      await saveQueue();
      render();
    } else {
      post.status = 'error';
      post.error = res && res.error ? res.error : 'fill failed';
      await saveQueue();
      render();
    }
  } catch (e) {
    btn.classList.remove('busy'); btn.textContent = original;
    refreshFillButtons();
    alert('Could not reach the WordPress page. Make sure the active tab is a New Post page on ' + queue.siteName + '.');
  }
}

// ============================================================================
// File drop + click
// ============================================================================
drop.addEventListener('click', (e) => { if (e.target.tagName !== 'INPUT') fileInput.click(); });
fileInput.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) { fileInput.value = ''; maybeReplace(file); }
});
['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (file) maybeReplace(file);
});

// Guard against silently discarding an in-progress batch.
function maybeReplace(file) {
  const hasPending = queue && queue.posts.some(p => p.status === 'pending');
  if (hasPending && !confirm('A batch is already in progress. Replace it with this file? Current progress will be discarded.')) return;
  handleFile(file);
}

// ============================================================================
// Init — resume an existing batch if one is stored
// ============================================================================
(async function init() {
  queue = await readQueueFromStorage();
  if (queue) {
    const site = SITES.find(s => s.id === queue.siteId);
    if (site) { selectedSite = site; siteSelect.value = site.id; populateTopics(); }
    if (queue.topicId) { const t = selectedSite.topics.find(x => x.id === queue.topicId); if (t) { selectedTopic = t; topicSelect.value = t.id; } }
  }
  refreshTabStatus();
  render();
})();
