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
  document.getElementById('nicheScope').textContent = getNiche().chip;
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

function stripHashtags(text) {
  return text
    .split(/\r?\n/)
    .map(l => l.replace(/(^|\s)#[A-Za-z0-9_]+/g, '$1').replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
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
  const sections = [];
  for (let a = 0; a < anchors.length; a++) {
    const start = anchors[a];
    const end = a + 1 < anchors.length ? anchors[a + 1] : lines.length;
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
    categories: niche.categories || ['Videos']
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
