// RRM Training Helper — side panel
// Paste the workshop task email → parse → click Fill on the active WP tab.

// ============================================================================
// NICHES — name → category path, primary, popmake ID for the button popup
// ============================================================================
// ============================================================================
// Page template — the WPBakery shortcode content for the companion training
// PAGE (separate from the post). Only {TITLE} and {YT_ID} change per training;
// everything else (margins, custom CSS IDs, fonts, iframe attrs) is fixed.
// ============================================================================
const PAGE_TEMPLATE = `[vc_row css=".vc_custom_1668794182194{margin-top: -50px !important;margin-bottom: -50px !important;padding-top: 100px !important;padding-bottom: 100px !important;}" el_id="bodyPaddingRemove"][vc_column css=".vc_custom_1668794187349{padding-top: 0px !important;}"][vc_custom_heading text="{TITLE}" font_container="tag:h1|text_align:center|color:%23004e92" google_fonts="font_family:Exo%3A100%2C100italic%2C200%2C200italic%2C300%2C300italic%2Cregular%2Citalic%2C500%2C500italic%2C600%2C600italic%2C700%2C700italic%2C800%2C800italic%2C900%2C900italic|font_style:900%20bold%20regular%3A900%3Anormal" css=".vc_custom_1778876303985{padding-bottom: 30px !important;}" el_id="titleResize"][vc_column_text css=".vc_custom_1778876249472{margin-bottom: 0px !important;}" el_class="cstm-iframe-height"]<iframe title="YouTube video player" src="https://www.youtube.com/embed/{YT_ID}?rel=0" width="100%" height="500" frameborder="0" allowfullscreen="allowfullscreen"></iframe>[/vc_column_text][/vc_column][/vc_row]`;

// Extracts the 11-char YouTube video ID from any youtu.be / youtube.com URL.
function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/
  ];
  for (const p of patterns) {
    const m = String(url).match(p);
    if (m) return m[1];
  }
  return null;
}

// Escapes a string so it can sit inside a WPBakery shortcode `text="..."`
// attribute. The shortcode parser is double-quoted, so only " needs escaping.
function escapeShortcodeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}

function buildPageContent(title, ytLink) {
  const ytId = extractYouTubeId(ytLink) || '';
  return PAGE_TEMPLATE
    .replace('{TITLE}', escapeShortcodeAttr(title || ''))
    .replace('{YT_ID}', ytId);
}

const NICHES = {
  'rrm-cemetery': {
    label: 'RRM Cemetery', chip: 'Cemetery',
    target: 'rrm',
    host: 'ringringmarketing.com',
    hostRe: /(^|\.)ringringmarketing\.com$/i,
    pathRe: /\/wp-admin\/post(-new)?\.php/,
    categories: ['Cemetery', 'Trainings'],
    primaryCategory: 'Cemetery',
    popmakeId: '5818',
    // Names that may appear as the section header in the email
    aliases: ['cemetery', 'rrm cemetery', 'cemeteries']
  },
  'rrm-funeral': {
    label: 'RRM Funeral', chip: 'Funeral',
    target: 'rrm',
    host: 'ringringmarketing.com',
    hostRe: /(^|\.)ringringmarketing\.com$/i,
    pathRe: /\/wp-admin\/post(-new)?\.php/,
    categories: ['Funeral', 'Trainings'],
    primaryCategory: 'Funeral',
    popmakeId: '2330',
    aliases: ['funeral', 'rrm funeral', 'funeral homes']
  },
  'rrmathome': {
    label: 'RRM@home', chip: 'RRM@home',
    target: 'rrmathome',
    host: 'rrmathome.com',
    hostRe: /(^|\.)rrmathome\.com$/i,
    pathRe: /\/wp-admin\/post(-new)?\.php/,
    categories: ['Trainings'],
    primaryCategory: null,
    popmakeId: '2330',
    aliases: ['rrm@home', 'rrmathome', 'rrm at home', 'home improvement']
  },
  'scmm': {
    label: 'SCMM', chip: 'SCMM',
    target: 'scmm',
    host: 'seniorcaremarketingmax.com',
    hostRe: /(^|\.)seniorcaremarketingmax\.com$/i,
    pathRe: /\/wp-admin\/post(-new)?\.php/,
    categories: ['Trainings'],
    primaryCategory: null,
    popmakeId: '2330',
    aliases: ['scmm', 'senior care', 'home care', 'home health']
  },
  'hospice': {
    label: 'Hospice Haven', chip: 'Hospice',
    target: 'hospice',
    host: 'hospicehavenmarketing.com',
    hostRe: /(^|\.)hospicehavenmarketing\.com$/i,
    pathRe: /\/wp-admin\/post(-new)?\.php/,
    categories: ['Trainings'],
    primaryCategory: null,
    popmakeId: '2330',
    aliases: ['hospice', 'hospice haven']
  }
};

// ============================================================================
// State + DOM refs
// ============================================================================
let parsedTrainings = []; // [{nicheKey, title, shortDesc, body[], cta, dateStr, ytLink, ...}]
let canFillFor = {};      // nicheKey → bool (matches current active tab?)

const scopeEl    = document.getElementById('scope');
const tabStatus  = document.getElementById('tabStatus');
const bulk       = document.getElementById('bulk');
const extractBtn = document.getElementById('extractBtn');
const errMsg     = document.getElementById('errMsg');
const results    = document.getElementById('results');

// ============================================================================
// Active tab status — surfaces which site the active tab is on
// ============================================================================
async function refreshTabStatus() {
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    tabStatus.textContent = 'Could not read active tab.';
    tabStatus.className = 'status-line warn';
    canFillFor = {};
    return refreshFillButtons();
  }

  let matched = null;
  if (tab && tab.url) {
    try {
      const url = new URL(tab.url);
      for (const [key, n] of Object.entries(NICHES)) {
        if (n.hostRe.test(url.hostname) && n.pathRe.test(url.pathname)) {
          matched = { key, niche: n, url };
          break;
        }
      }
    } catch {}
  }

  // canFillFor maps niche keys → bool. A card's Fill button is enabled only
  // when its niche's target site matches the active tab's site (Funeral and
  // Cemetery cards both unlock when on ringringmarketing.com).
  canFillFor = {};
  if (matched) {
    const matchedTarget = matched.niche.target;
    for (const [key, n] of Object.entries(NICHES)) {
      canFillFor[key] = n.target === matchedTarget;
    }
    tabStatus.textContent = `Ready: ${matched.url.hostname}${matched.url.pathname}`;
    tabStatus.className = 'status-line ok';
    scopeEl.textContent = matched.niche.chip;
  } else {
    tabStatus.textContent = 'Open a New Post page on a supported RRM site to enable Fill.';
    tabStatus.className = 'status-line warn';
    scopeEl.textContent = '—';
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
    const nicheKey = btn.dataset.niche;
    const enabled = !!canFillFor[nicheKey];
    btn.disabled = !enabled;
    const niche = NICHES[nicheKey];
    btn.title = enabled ? '' : `Open a New Post page on ${niche.host} first`;
  });
}

// ============================================================================
// Email parser
// ============================================================================
const KNOWN_LABELS = /^(title|short description|cta button|date of ws if needed|date of ws|date|yt link|youtube link)\s*:/i;

// Removes <strong>/</strong> (and legacy <b>) tags from a line so label and
// header matching works whether or not the email bolded that text.
function stripStrong(s) {
  return String(s).replace(/<\/?(strong|b)\b[^>]*>/gi, '');
}

// Detects which niche this section header line refers to. Strips bold tags
// first — the email often bolds the niche name (e.g. "<strong>Home Care</strong>").
function nicheFromHeader(line) {
  const t = stripStrong(line).trim().toLowerCase();
  for (const [key, n] of Object.entries(NICHES)) {
    if (n.aliases.some(a => t === a || t === a.toLowerCase())) return key;
  }
  return null;
}

// Fallback niche detection — used when the email doesn't have a standalone
// "Cemetery" / "Funeral" / etc. line. Scans the entire text for any niche
// alias appearing as a whole word (e.g. "our SCMM Website - Training" matches
// the "scmm" alias). Returns the niche whose alias appears earliest — usually
// the one mentioned in the preamble ("adding the last Workshop on our SCMM…").
function detectNicheFromText(text) {
  const lower = text.toLowerCase();
  let best = null;
  for (const [key, n] of Object.entries(NICHES)) {
    for (const alias of n.aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'i');
      const match = re.exec(lower);
      if (match) {
        if (best === null || match.index < best.index) {
          best = { key, index: match.index, alias };
        }
      }
    }
  }
  return best ? best.key : null;
}

// True if the input looks like HTML (e.g. pasted from Outlook → WP Visual →
// Code view, which produces <div data-ogsc>, <b>, <li>, etc. mess).
function looksLikeHtml(text) {
  return /<(div|p|b|strong|li|ul|ol|br|span)\b[^>]*>/i.test(text);
}

// Normalizes messy HTML (Outlook / WP-Visual paste) into clean plain text that
// the labelled-email parser can handle. We preserve structure by:
//   - converting <li>X</li> to "• X\n" so bullets remain detectable
//   - converting <br>, </div>, </p>, </h*> to newlines so paragraphs separate
//   - stripping all other tags and noisy attributes (data-ogsc, role, style…)
//   - decoding common HTML entities
//   - collapsing whitespace runs and excess blank lines
//
// Labels like "Title:" and "CTA Button:" survive intact (they're text, even
// if wrapped in <b>…</b> in the source) and the body's bold lead-in becomes
// plain text — the parser still uses the "Short Description:" label to find it.
function normalizeHtmlToText(html) {
  let text = html;

  // <li>...</li> → "• ...\n" (preserves the bullet for the block parser)
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) => {
    const stripped = inner.replace(/<[^>]+>/g, '').trim();
    return `• ${stripped}\n`;
  });
  // <ul>, </ul>, <ol>, </ol> → newline
  text = text.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');
  // <br> → newline
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // Closing block tags → DOUBLE newline. Block tags in Outlook/WP HTML map to
  // visual paragraphs, and wpautop needs blank lines between paragraphs to
  // emit <p> tags. Without double newlines the body collapses into one paragraph.
  text = text.replace(/<\/(div|p|h[1-6])\s*>/gi, '\n\n');
  // Preserve bold semantics. <b>/<strong> survive so we can detect the bold
  // lead-in (Short Description) even when the email has no explicit label.
  text = text.replace(/<\s*b\b[^>]*>/gi, '<strong>');
  text = text.replace(/<\s*\/\s*b\s*>/gi, '</strong>');
  // Strip every other tag, leaving <strong>/</strong> intact.
  text = text.replace(/<(?!\/?strong\b)[^>]*>/gi, '');
  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…');
  // Normalize whitespace
  text = text.replace(/\r\n?/g, '\n');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/^[ \t]+|[ \t]+$/gm, '');
  text = text.replace(/\n{3,}/g, '\n\n');

  // Strip <strong> tags from KNOWN label lines so the parser can find them
  // ("<strong>Title: Stop the Scroll</strong>" needs to become "Title: Stop
  // the Scroll" for /^title:/i to match).
  text = text.split('\n').map(line => {
    const stripped = line.replace(/<\/?strong[^>]*>/gi, '');
    if (/^(title|short description|cta button|date of ws if needed|date of ws|date|yt link|youtube link)\s*:/i.test(stripped.trim())) {
      return stripped;
    }
    return line;
  }).join('\n');

  return text.trim();
}

function parseEmail(text) {
  // Auto-clean HTML pasted from rich-text email sources (Outlook, WP Visual
  // editor, etc.). The labelled parser below operates on plain text.
  if (looksLikeHtml(text)) {
    text = normalizeHtmlToText(text);
  }

  const lines = text.split(/\r?\n/);
  // Find all niche-header line indices (exact "Cemetery" / "Funeral" / …).
  const headers = [];
  for (let i = 0; i < lines.length; i++) {
    const niche = nicheFromHeader(lines[i]);
    if (niche) headers.push({ index: i, nicheKey: niche });
  }

  // Multi-section case: at least one standalone niche header found — split
  // the email into sections at each header.
  if (headers.length > 0) {
    const sections = [];
    for (let h = 0; h < headers.length; h++) {
      const start = headers[h].index + 1;
      const end   = h + 1 < headers.length ? headers[h + 1].index : lines.length;
      const sectionLines = lines.slice(start, end);
      const training = parseSection(sectionLines);
      if (training) {
        training.nicheKey = headers[h].nicheKey;
        sections.push(training);
      }
    }
    return sections;
  }

  // Fallback: no standalone niche header. Try to detect the niche from the
  // preamble text (e.g. "…on our SCMM Website - Training") and treat the
  // whole email as one section.
  const inferredNiche = detectNicheFromText(text);
  if (!inferredNiche) return [];
  const training = parseSection(lines);
  if (!training) return [];
  training.nicheKey = inferredNiche;
  return [training];
}

function parseSection(lines) {
  let title = '';
  let cta = '';
  let dateStr = '';
  let ytLink = '';

  // Label matching strips <strong>/<b> first — the email frequently bolds the
  // labels themselves ("<strong>Short Description:</strong>"), which would
  // otherwise defeat the /^label:/ regexes.
  const clean = (l) => stripStrong(l).trim();
  const labelIndex = (re) => lines.findIndex(l => re.test(clean(l)));
  const titleIdx   = labelIndex(/^title\s*:/i);
  const shortIdx   = labelIndex(/^short description\s*:/i);
  const ctaIdx     = labelIndex(/^cta button\s*:/i);
  const dateIdx    = labelIndex(/^date of ws( if needed)?\s*:|^date\s*:/i);
  const ytIdx      = labelIndex(/^yt link\s*:|^youtube link\s*:/i);

  if (titleIdx >= 0) {
    const m = clean(lines[titleIdx]).match(/^title\s*:\s*(.+)$/i);
    title = m ? m[1].trim() : '';
  }
  if (ctaIdx >= 0) {
    const m = clean(lines[ctaIdx]).match(/^cta button\s*:\s*(.+)$/i);
    cta = m ? m[1].trim() : '';
  }
  if (dateIdx >= 0) {
    const m = clean(lines[dateIdx]).match(/^date(?: of ws(?: if needed)?)?\s*:\s*(.+)$/i);
    dateStr = m ? m[1].trim() : '';
  }
  if (ytIdx >= 0) {
    const m = clean(lines[ytIdx]).match(/^(?:yt|youtube) link\s*:\s*(.+)$/i);
    ytLink = m ? m[1].trim() : '';
  }
  if (!title) return null;

  // Short Description: first non-blank line after the "Short Description:" label.
  // If no label is present (some email formats just use a bold first paragraph
  // by convention), fall back to detecting the first <strong>...</strong> line
  // in the body as the Short Description.
  let shortDesc = '';
  let bodyStart;
  if (shortIdx >= 0) {
    bodyStart = shortIdx + 1;
    const inline = clean(lines[shortIdx]).match(/^short description\s*:\s*(.+)$/i);
    if (inline && inline[1].trim()) {
      shortDesc = inline[1].trim();
    } else {
      for (let i = shortIdx + 1; i < lines.length; i++) {
        if (lines[i].trim()) { shortDesc = lines[i].trim(); bodyStart = i + 1; break; }
      }
    }
  } else {
    // No label — body starts after Title; look for a leading bold paragraph.
    bodyStart = titleIdx >= 0 ? titleIdx + 1 : 0;
    for (let i = bodyStart; i < lines.length; i++) {
      const ln = lines[i].trim();
      if (!ln) continue;
      const m = ln.match(/^<strong>([\s\S]+?)<\/strong>\s*$/i);
      if (m) {
        shortDesc = m[1].trim();
        bodyStart = i + 1;
      }
      break; // only inspect the first non-blank body line
    }
  }
  // Strip any remaining <strong> tags from the extracted value — renderContent
  // wraps it itself, so we want clean text here.
  shortDesc = shortDesc.replace(/<\/?strong[^>]*>/gi, '').trim();

  // Body spans from after Short Description content up to whichever of
  // CTA Button / Date / YT Link comes first.
  const stopIdx = [ctaIdx, dateIdx, ytIdx].filter(i => i >= 0).sort((a, b) => a - b)[0];
  const bodyEnd = stopIdx >= 0 ? stopIdx : lines.length;
  const bodyLines = (bodyStart >= 0 && bodyStart < bodyEnd) ? lines.slice(bodyStart, bodyEnd) : [];

  // Parse body into blocks (paragraph / ul)
  const blocks = parseBodyBlocks(bodyLines);

  return { title, shortDesc, blocks, cta, dateStr, ytLink };
}

// Splits body lines into a list of blocks: { type: 'p' | 'ul', items: [...] }
function parseBodyBlocks(lines) {
  const blocks = [];
  let current = null;

  const isBullet = (s) => /^[•·●*\-]\s+/.test(s) || /^\d+\.\s+/.test(s);
  const stripBullet = (s) => s.replace(/^[•·●*\-]\s+/, '').replace(/^\d+\.\s+/, '').trim();
  // Drop any leftover <strong> tags from body text. We only preserved them
  // upstream to detect the Short Description; in the rest of the body we
  // want clean plain text (matches the team's manual format).
  const cleanText = (s) => s.replace(/<\/?strong[^>]*>/gi, '').trim();

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (current) { blocks.push(current); current = null; }
      continue;
    }
    if (isBullet(trimmed)) {
      const item = cleanText(stripBullet(trimmed));
      if (current && current.type === 'ul') {
        current.items.push(item);
      } else {
        if (current) blocks.push(current);
        current = { type: 'ul', items: [item] };
      }
    } else {
      const text = cleanText(trimmed);
      if (!text) continue; // would be empty after stripping
      if (current && current.type === 'p') {
        current.items.push(text);
      } else {
        if (current) blocks.push(current);
        current = { type: 'p', items: [text] };
      }
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

// Renders parsed blocks into the WP HTML body. Matches the structure from the
// reference WP post:
//   <strong>{short desc}</strong>
//   {paragraphs}
//   <ul>
//     <li>{bullet}</li>
//   </ul>
//   {paragraphs}
//   <div class="cstm-btn-wrap"><a class="popmake-{ID} cstm-btn-popup">{cta}</a></div>
// Renders the parsed blocks into the final WP HTML. Blocks are normally
// separated by a blank line. Two exceptions match the team's manual format:
//   - A paragraph ending in ":" directly above a <ul> → single newline only
//     (the intro line should sit flush against the bullet list).
//   - A paragraph directly below </ul> → single newline only (the closing
//     paragraph stays flush under the bullets).
// Anything else gets a blank line.
function renderContent(shortDesc, blocks, ctaText, popmakeId) {
  const lead = shortDesc ? `<strong>${escapeHtmlForTag(shortDesc)}</strong>` : '';
  let out = lead;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const prev = i > 0 ? blocks[i - 1] : null;
    // The "lead" itself counts as the previous block for spacing purposes.
    const hasAnythingBefore = out.length > 0;

    let separator = '\n\n';
    if (hasAnythingBefore) {
      if (b.type === 'ul' && prev && prev.type === 'p' &&
          prev.items.length && /:\s*$/.test(prev.items[prev.items.length - 1])) {
        // intro paragraph ending in ":" → no blank line before <ul>
        separator = '\n';
      } else if (b.type === 'p' && prev && prev.type === 'ul') {
        // closing paragraph directly after </ul> → no blank line
        separator = '\n';
      }
    }

    let rendered;
    if (b.type === 'p') {
      rendered = b.items.join('\n');
    } else if (b.type === 'ul') {
      const lis = b.items.map(it => `\t<li>${escapeHtmlForTag(it)}</li>`).join('\n');
      rendered = `<ul>\n${lis}\n</ul>`;
    } else {
      continue;
    }
    out = hasAnythingBefore ? out + separator + rendered : rendered;
  }

  // Button always gets a blank line before it. Standard div + class structure;
  // only the popmake-{ID} number and the link text vary per niche / post.
  if (ctaText) {
    out += (out ? '\n\n' : '') +
      `<div class="cstm-btn-wrap"><a class="popmake-${popmakeId} cstm-btn-popup">${escapeHtmlForTag(ctaText)}</a></div>`;
  }
  return out;
}

function escapeHtmlForTag(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ============================================================================
// Date parsing — "June 29, 2026" → { year, month, day, hour: 5, minute: 0 }
// ============================================================================
const MONTH_NAMES = {
  january:1, february:2, march:3, april:4, may:5, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12,
  jan:1, feb:2, mar:3, apr:4, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12
};

function parsePublishDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  // "Month DD, YYYY" — e.g. "June 29, 2026"
  let m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const month = MONTH_NAMES[m[1].toLowerCase()];
    const day   = parseInt(m[2], 10);
    const year  = parseInt(m[3], 10);
    if (month && day) return { year, month, day, hour: 5, minute: 0 };
  }
  // "MM/DD/YYYY" or "MM/DD"
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const month = parseInt(m[1], 10);
    const day   = parseInt(m[2], 10);
    let year    = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12) return { year, month, day, hour: 5, minute: 0 };
  }
  return null;
}

// ============================================================================
// Card rendering
// ============================================================================
function copyButton(value) {
  return `<button class="copy-btn" data-copy="${escapeHtml(value)}">Copy</button>`;
}

function fieldRow(label, value, copyValue) {
  return `
    <div class="field">
      <div class="head">
        <span class="label">${escapeHtml(label)}</span>
        ${copyValue !== undefined ? copyButton(copyValue) : ''}
      </div>
      <div class="value">${value}</div>
    </div>
  `;
}

function contentPreview(label, html) {
  return `
    <div class="content-block">
      <div class="head">
        <span>${escapeHtml(label)}</span>
        ${copyButton(html)}
      </div>
      <pre>${escapeHtml(html)}</pre>
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

function renderCards() {
  results.innerHTML = '';
  if (!parsedTrainings.length) {
    results.innerHTML = '<div class="empty">Paste an email above and click Extract.</div>';
    return;
  }
  for (const t of parsedTrainings) {
    const niche = NICHES[t.nicheKey];
    const pubDate = parsePublishDate(t.dateStr);
    const html = renderContent(t.shortDesc, t.blocks, t.cta, niche.popmakeId);
    const catLabel = niche.categories.join(' → ') +
      (niche.primaryCategory ? ` (Primary: ${niche.primaryCategory})` : '');

    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <div class="title">${escapeHtml(t.title)} <span class="niche-chip">${escapeHtml(niche.chip)}</span></div>
      <div class="meta">${escapeHtml(t.dateStr || '—')}${pubDate ? ' · 5:00 AM' : ''}</div>

      ${fieldRow('Title',            escapeHtml(t.title),          t.title)}
      ${fieldRow('Short Description',escapeHtml(t.shortDesc || '—'),t.shortDesc || '')}
      ${fieldRow('CTA Button',       escapeHtml(t.cta || '—'),     t.cta || '')}
      ${fieldRow('Date',             escapeHtml(t.dateStr || '—'), t.dateStr || '')}
      ${fieldRow('YT Link',          escapeHtml(t.ytLink || '—'),  t.ytLink || '')}
      ${fieldRow('Category',         escapeHtml(catLabel))}
      ${fieldRow('Popmake',          escapeHtml(`popmake-${niche.popmakeId}`))}

      ${html ? contentPreview('Post Content (HTML)', html) : ''}
      ${contentPreview('Page Content (WPBakery shortcode)', buildPageContent(t.title, t.ytLink))}

      <button class="fill-btn fill-post-btn" data-niche="${t.nicheKey}" data-mode="post" ${canFillFor[t.nicheKey] ? '' : `disabled title="Open a New Post on ${niche.host} first"`}>Fill This Post</button>
      <button class="fill-btn fill-page-btn" data-niche="${t.nicheKey}" data-mode="page" ${canFillFor[t.nicheKey] ? '' : `disabled title="Open a New Page on ${niche.host} first"`}>Fill This Page</button>
    `;
    div.querySelectorAll('.fill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => fillActiveTab(t, e.target));
    });
    attachCopyHandlers(div);
    results.appendChild(div);
  }
}

async function fillActiveTab(training, btn) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  const niche = NICHES[training.nicheKey];
  const mode = btn.dataset.mode || 'post'; // 'post' or 'page'

  let messageType, payload;
  if (mode === 'page') {
    // PAGE: fixed WPBakery shortcode template, no categories.
    messageType = 'RRM_TRAINING_FILL_PAGE';
    payload = {
      title: training.title,
      content: buildPageContent(training.title, training.ytLink),
      author: 'Welton Hong',
      publishDate: parsePublishDate(training.dateStr)
    };
  } else {
    // POST: parsed body + popmake button, with categories + primary category.
    const html = renderContent(training.shortDesc, training.blocks, training.cta, niche.popmakeId);
    messageType = 'RRM_TRAINING_FILL_POST';
    payload = {
      title: training.title,
      content: html,
      author: 'Welton Hong',
      categories: niche.categories,
      primaryCategory: niche.primaryCategory,
      publishDate: parsePublishDate(training.dateStr)
    };
  }

  const original = btn.textContent;
  btn.classList.add('busy');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Filling…';
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: messageType, payload });
    if (res && res.ok) {
      btn.textContent = 'Filled ✓';
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('busy');
        refreshFillButtons();
      }, 2200);
    } else {
      btn.textContent = 'Failed — see WP tab';
      console.warn('[RRM Training Helper] Fill response:', res);
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
    alert(`Could not reach the WordPress ${mode}. Make sure the active tab is the New ${mode === 'page' ? 'Page' : 'Post'} screen on the matching site.`);
  }
}

// ============================================================================
// Rich-text paste handler — lets the user copy directly from Outlook (or any
// rich-text source) and paste into this textarea. The textarea normally only
// accepts plain text, which loses bullets/bold/paragraph structure. We
// intercept the paste, grab the `text/html` flavor from the clipboard, run it
// through normalizeHtmlToText (the same cleaner the parser uses), and insert
// the normalized text at the cursor. End result: pasting an Outlook email
// gives clean structured text with bullets preserved as `• X` lines and
// labels (`Title:`, `Short Description:`, `CTA Button:` etc.) intact.
// ============================================================================
bulk.addEventListener('paste', (e) => {
  const cd = e.clipboardData;
  if (!cd) return;
  const html = cd.getData('text/html');
  if (!html || !html.trim()) return; // no HTML in clipboard — let default plain paste run

  e.preventDefault();
  const normalized = normalizeHtmlToText(html);

  // Insert at the current cursor / selection in the textarea.
  const start = bulk.selectionStart;
  const end   = bulk.selectionEnd;
  const before = bulk.value.slice(0, start);
  const after  = bulk.value.slice(end);
  bulk.value = before + normalized + after;
  const cursor = start + normalized.length;
  bulk.selectionStart = bulk.selectionEnd = cursor;
  bulk.dispatchEvent(new Event('input', { bubbles: true }));
});

// ============================================================================
// Extract button
// ============================================================================
extractBtn.addEventListener('click', () => {
  errMsg.textContent = '';
  const text = bulk.value;
  if (!text.trim()) {
    errMsg.textContent = 'Paste the workshop task email first.';
    return;
  }
  const trainings = parseEmail(text);
  if (!trainings.length) {
    errMsg.textContent = 'Could not detect the niche (Cemetery, Funeral, RRM@home, SCMM, Hospice) or find a "Title:" label. Make sure the niche name appears in the email and the fields have "Title:", "Short Description:", "CTA Button:" labels.';
    parsedTrainings = [];
  } else {
    parsedTrainings = trainings;
  }
  renderCards();
});

renderCards();
