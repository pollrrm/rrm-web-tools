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

// ---- Rich paste → lightweight Markdown ----------------------------------
// Outlook/Word/SharePoint put real HTML on the clipboard as "text/html". A
// plain <textarea> throws it away, so bullets, bold, italic and links were
// lost before the parser ever saw them. We intercept the paste, walk the HTML,
// and emit a minimal Markdown subset:
//     **bold**  _italic_  * bullet  1. ordered  [text](url)
// The label parser below still works because labels stay at line start and
// demark() strips the markers wherever a raw value is needed.

// Inline marker characters we generate. Escaped on plain text so literal
// asterisks/underscores in the email don't turn into accidental formatting.
function escapeMarkers(s) {
  return s.replace(/([*_`\[\]])/g, '\\$1');
}

// Removes the Markdown markers we generate, recovering the plain text.
// [label](url) collapses to the label; bare autolinks keep the URL.
function demark(s) {
  if (!s) return '';
  return String(s)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')   // images → alt text
    .replace(/\[([^\]]+)\]\(([^)]*)\)/g, '$1')  // links  → label
    .replace(/\*\*([^*]+)\*\*/g, '$1')          // bold
    .replace(/(^|[^\\])_([^_]+)_/g, '$1$2')     // italic
    .replace(/`([^`]+)`/g, '$1')                // code
    .replace(/\\([*_`\[\]])/g, '$1')            // unescape
    .replace(/^\s*[*-]\s+/gm, '')               // leading bullet markers
    .replace(/^\s*\d+\.\s+/gm, '');             // leading ordered markers
}

// Wraps an inline run in Markdown markers, hoisting any leading/trailing
// whitespace outside the markers. Empty runs collapse to nothing (Word emits
// plenty of empty <b>/<span> wrappers).
function wrapInline(raw, marker) {
  const inner = raw.trim();
  if (!inner) return /\s/.test(raw) ? ' ' : '';
  const lead  = /^\s/.test(raw) ? ' ' : '';
  const trail = /\s$/.test(raw) ? ' ' : '';
  return `${lead}${marker}${inner}${marker}${trail}`;
}

const BLOCK_TAGS = new Set([
  'P','DIV','SECTION','ARTICLE','HEADER','FOOTER','MAIN','ASIDE','BLOCKQUOTE',
  'H1','H2','H3','H4','H5','H6','TR','TABLE','TBODY','THEAD','UL','OL','PRE','FIGURE'
]);

// Converts a DOM subtree to our Markdown subset.
function htmlNodeToMarkdown(node, ctx = { listStack: [] }) {
  let out = '';

  for (const child of node.childNodes) {
    // --- text ---
    if (child.nodeType === Node.TEXT_NODE) {
      // Collapse whitespace the way HTML rendering does; keep single spaces.
      const t = child.textContent.replace(/\s+/g, ' ');
      if (t.trim() === '' && out.endsWith(' ')) continue;
      out += escapeMarkers(t);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const tag = child.tagName;

    // Skip anything invisible or non-content.
    if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'HEAD' || tag === 'META' || tag === 'LINK') continue;
    const styleAttr = (child.getAttribute && child.getAttribute('style')) || '';
    if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(styleAttr)) continue;

    switch (tag) {
      case 'BR':
        out += '\n';
        break;

      // Inline emphasis. Markers must hug the text ("**Label:** x", never
      // "** Label: **x"), but the surrounding spacing has to survive — Outlook
      // writes "<b>Destination Link: </b>" and dropping that trailing space
      // would glue the label to its value.
      case 'STRONG': case 'B':
        out += wrapInline(htmlNodeToMarkdown(child, ctx), '**');
        break;
      case 'EM': case 'I':
        out += wrapInline(htmlNodeToMarkdown(child, ctx), '_');
        break;
      case 'CODE': case 'TT':
        out += wrapInline(htmlNodeToMarkdown(child, ctx), '`');
        break;

      case 'A': {
        const label = htmlNodeToMarkdown(child, ctx).trim();
        let href = (child.getAttribute('href') || '').trim();
        // Outlook safelinks and mailto pass through unchanged.
        if (!label) break;
        if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) {
          out += label;
        } else if (demark(label) === href) {
          out += href; // bare autolink — keep it plain so the URL parser sees it
        } else {
          out += `[${label}](${href})`;
        }
        break;
      }

      case 'IMG': {
        // Emails are full of spacer/tracking images — drop them entirely.
        break;
      }

      case 'UL': case 'OL': {
        ctx.listStack.push({ ordered: tag === 'OL', n: 0 });
        const inner = htmlNodeToMarkdown(child, ctx);
        ctx.listStack.pop();
        out += '\n' + inner.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '') + '\n';
        break;
      }

      case 'LI': {
        const frame = ctx.listStack[ctx.listStack.length - 1] || { ordered: false, n: 0 };
        frame.n += 1;
        const depth = Math.max(0, ctx.listStack.length - 1);
        const indent = '  '.repeat(depth);
        const marker = frame.ordered ? `${frame.n}.` : '*';
        // Nested lists inside this <li> come back with their own newlines;
        // keep the first line on the marker line and indent the rest.
        const inner = htmlNodeToMarkdown(child, ctx).trim();
        if (inner) {
          const [first, ...rest] = inner.split('\n');
          out += `\n${indent}${marker} ${first}`;
          for (const r of rest) out += `\n${indent}  ${r}`;
        }
        break;
      }

      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': {
        const inner = htmlNodeToMarkdown(child, ctx).trim();
        if (inner) out += `\n\n**${inner}**\n\n`; // headings → bold paragraph
        break;
      }

      default: {
        const inner = htmlNodeToMarkdown(child, ctx);
        if (BLOCK_TAGS.has(tag)) {
          const trimmed = inner.replace(/[ \t]+$/g, '');
          if (trimmed.trim()) out += '\n\n' + trimmed + '\n\n';
        } else {
          out += inner; // SPAN, FONT, etc. — inline passthrough
        }
      }
    }
  }

  return out;
}

// Entry point: clipboard HTML string → Markdown text for the paste box.
function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Word/Outlook conditional-comment cruft
  doc.querySelectorAll('style, script, o\\:p').forEach(el => el.remove());
  let md = htmlNodeToMarkdown(doc.body || doc.documentElement);
  return md
    .replace(/ /g, ' ')       // nbsp → space
    .replace(/[ \t]+\n/g, '\n')    // trailing spaces
    .replace(/\n{3,}/g, '\n\n')    // collapse blank runs
    .split('\n').map(l => l.replace(/\s+$/, '')).join('\n')
    .trim();
}

// ---- Markdown → WordPress HTML ------------------------------------------
// Produces the HTML written into the WP #content box: real <ul>/<ol> lists,
// <strong>/<em>, and <a href>. Everything else becomes a <p>.
function mdInlineToHtml(s) {
  // Escape HTML first so email text can't inject markup, then apply markers.
  let t = String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Protect escaped markers (\* \_) before interpreting the real ones.
  t = t.replace(/\\([*_`\[\]])/g, (m, c) => ` ${c.charCodeAt(0)} `);
  t = t
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
      (m, label, href) => `<a href="${href.replace(/"/g, '&quot;')}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>');
  // Auto-link bare URLs that aren't already inside an href.
  t = t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    (m, pre, url) => `${pre}<a href="${url.replace(/"/g, '&quot;')}">${url}</a>`);
  return t.replace(/ (\d+) /g, (m, code) => String.fromCharCode(+code));
}

function markdownToHtml(md) {
  const lines = String(md || '').split(/\r?\n/);
  const out = [];
  let para = [];
  let list = null; // { tag: 'ul'|'ol', items: [] }

  const flushPara = () => {
    if (!para.length) return;
    const text = para.join(' ').trim();
    if (text) out.push(`<p>${mdInlineToHtml(text)}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const items = list.items.map(li => `<li>${mdInlineToHtml(li)}</li>`).join('\n');
    out.push(`<${list.tag}>\n${items}\n</${list.tag}>`);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) { flushPara(); flushList(); continue; }

    const ul = line.match(/^[*-]\s+(.*)$/);
    const ol = line.match(/^\d+[.)]\s+(.*)$/);

    if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((ul ? ul[1] : ol[1]).trim());
      continue;
    }

    flushList();
    // Each non-list line is its own paragraph (matches the existing SOP where
    // every sentence/line in the email becomes a paragraph).
    para.push(line);
    flushPara();
  }
  flushPara();
  flushList();
  return out.join('\n');
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
  // Park URLs while we normalize spacing, otherwise the sentence-spacing rule
  // below breaks them apart ("https://www. example. com").
  const urls = [];
  const parked = demark(text) // drop **/_/`/[text](url) markers first
    .replace(/https?:\/\/\S+/g, (m) => ` ${urls.push(m) - 1} `);

  return parked
    .replace(/\s+/g, ' ')
    // Space after sentence-ending punctuation. Requires a letter next so
    // decimals stay intact ("$2.2 Million", not "$2. 2 Million").
    .replace(/([.!?])(?=[A-Za-z])/g, '$1 ')
    .trim()
    .replace(/ (\d+) /g, (m, i) => urls[+i]);
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
  const isListItem = (l) => /^\s*([*-]|\d+[.)])\s+/.test(l);

  const lines = text
    .split(/\r?\n/)
    .map(l => l.replace(/(^|\s)#[A-Za-z0-9_]+/g, '$1').replace(/\s+$/, ''));

  // Treat each sentence as its own paragraph: insert a blank line after
  // sentence-ending punctuation. List items are exempt — blank lines between
  // them would split one <ul> into several single-item lists.
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out.push(line);
    const next = lines[i + 1];
    if (next === undefined || next.trim() === '') continue;
    if (isListItem(line) || isListItem(next)) continue; // keep lists contiguous
    if (/[.!?]$/.test(line.trim())) out.push('');
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function detectIndustry(allLines, anchorIdx, destinationUrl) {
  for (let i = anchorIdx - 1; i >= 0; i--) {
    // Headers arrive bold from a rich paste (**Funeral Homes**) — strip markers.
    const ln = demark(allLines[i]).trim();
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
    if (/destination\s*link\s*:/i.test(demark(ln))) anchors.push(i);
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
      if (i > start && !contentLabelRe.test(demark(lines[i]).trim())) {
        end = i;
      }
    }

    const sectionText = lines.slice(start, end).join('\n');
    // The URL may arrive bare or as a [label](url) link from a rich paste.
    const destLine = lines[anchors[a]];
    const destMd = destLine.match(/destination\s*link\s*:\s*\[[^\]]*\]\(([^)]+)\)/i);
    const destMatch = destMd || demark(destLine).match(/destination\s*link\s*:\s*(\S+)/i);
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
    // Match labels against the demarked line so bold labels from a rich paste
    // (**Video Title:**) still register, but keep `raw` for content so its
    // formatting markers survive.
    const trimmed = raw.trim();
    const probe = demark(raw).trim();

    const dateM = probe.match(/^date of posting\s*:\s*(.+)$/i);
    if (dateM) { commit(); currentDate = dateM[1].trim(); continue; }
    const titleM = probe.match(/^video title\s*:\s*(.+)$/i);
    if (titleM) { commit(); pendingTitle = titleM[1].trim(); continue; }

    // The URL may be bare or wrapped as [label](url) after a rich paste.
    const linkMd = trimmed.match(/^\**\s*video link\s*:?\**\s*:?\s*\[[^\]]*\]\(([^)]+)\)/i);
    const linkM = linkMd || probe.match(/^video link\s*:\s*(\S+)/i);
    if (linkM) {
      // A markdown link's visible label can differ from its href; prefer
      // whichever side actually contains a usable YouTube ID.
      const href = linkM[1].trim();
      pendingLink = extractYouTubeId(href) ? href : (probe.match(/(https?:\/\/\S+)/i)?.[1] || href);
      collectingContent = false;
      continue;
    }

    const contentM = probe.match(/^content\s*:\s*(.*)$/i);
    if (contentM) {
      collectingContent = true;
      // Re-derive any trailing text from the raw line so formatting is kept.
      const rawTail = trimmed.replace(/^\**\s*content\s*:?\**\s*:?\s*/i, '');
      if (rawTail) contentLines.push(rawTail);
      continue;
    }

    if (labelRe.test(probe)) { collectingContent = false; continue; }
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
    // Send rendered HTML so WP gets real <ul>/<strong>/<em>/<a> markup.
    // content-wp.js passes through anything that already contains tags.
    title: demark(entry.title),
    content: entry.content ? markdownToHtml(entry.content) : '',
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
  // Preview the content the way WordPress will render it, so formatting can be
  // eyeballed before filling. The raw HTML is available via the Copy button.
  const contentHtml = entry.content ? markdownToHtml(entry.content) : '';
  const contentBlock = entry.content ? `
    <div class="content-block">
      <div class="head">
        <span>Content <span class="fmt-note">(formatted preview)</span></span>
        <button data-copy="${escapeHtml(contentHtml)}">Copy HTML</button>
      </div>
      <div class="rendered">${contentHtml}</div>
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
  const title = demark(triplet.title); // titles are plain text everywhere
  return {
    id,
    title,
    date: triplet.date,
    content: triplet.content,
    thumbUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    filename: `${safeFilename(title)}-thumb.jpg`
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

// ---- Rich paste capture ----
// Outlook puts real HTML on the clipboard. Convert it to our Markdown subset
// so bullets / bold / italic / links survive into the WordPress post.
const bulkEl = document.getElementById('bulk');
bulkEl.addEventListener('paste', (e) => {
  const html = e.clipboardData && e.clipboardData.getData('text/html');
  if (!html) return; // plain-text paste — let the browser handle it normally

  let md;
  try {
    md = htmlToMarkdown(html);
  } catch (err) {
    console.warn('[RRM Helper] Rich paste conversion failed, using plain text.', err);
    return;
  }
  if (!md.trim()) return;

  e.preventDefault();
  // Replace the current selection so repeated pastes behave like a textarea.
  const start = bulkEl.selectionStart ?? bulkEl.value.length;
  const end   = bulkEl.selectionEnd   ?? bulkEl.value.length;
  bulkEl.value = bulkEl.value.slice(0, start) + md + bulkEl.value.slice(end);
  const caret = start + md.length;
  bulkEl.setSelectionRange(caret, caret);

  const errEl = document.getElementById('bulkErr');
  errEl.textContent = '';
  const fmtEl = document.getElementById('pasteInfo');
  if (fmtEl) {
    fmtEl.textContent = 'Formatting captured (bullets, bold, italic, links preserved).';
    fmtEl.style.display = 'block';
  }
});

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
