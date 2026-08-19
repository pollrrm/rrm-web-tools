// RRM Promo Helper — side panel
// Paste the promo email → parse → fill the real WPBakery row → copy or auto-fill.

// ============================================================================
// Templates — the SITE'S actual WPBakery source, with only the per-promo
// fields tokenized. Everything else (fonts, vc_custom spacing IDs, button
// class rrmButtonStyle1, the hidden "Next Workshop" eyebrow) is reused verbatim
// so the output renders identically to what the team builds by hand.
//
// Scheduling is data-driven: the row carries its window in el_class
// ("rrmPromoSched rrmS<YYYYMMDD> rrmE<YYYYMMDD>"), and the one-time SCHEDULER
// snippet below shows/hides any such row. No per-promo script, no base64.
// ============================================================================
const GF = 'font_family:Exo%3A100%2C100italic%2C200%2C200italic%2C300%2C300italic%2Cregular%2Citalic%2C500%2C500italic%2C600%2C600italic%2C700%2C700italic%2C800%2C800italic%2C900%2C900italic|font_style:900%20bold%20italic%3A900%3Aitalic';

// Solo template — parametrized per slot. Only the row_title and 3 vc_custom
// spacing IDs differ between "Solo Promo" and "Solo Promo 2"; the rest is
// identical to the live rows. disable_element is intentionally ABSENT so the
// row renders and the scheduler (el_class date window) controls visibility.
const SOLO_TEMPLATE =
`[vc_row bg_type="bg_color" bg_override="full" css=".{{ROW_CSS}}{margin-top: 100px !important;}" row_title="{{ROW_TITLE}}" el_class="rrmPromoSched rrmS{{START8}} rrmE{{END8}}"][vc_column css=".vc_custom_1668630062471{padding-top: 0px !important;}"][vc_custom_heading text="Next Workshop" font_container="tag:h1|font_size:42|text_align:center|color:%23404a5d|line_height:50px" google_fonts="{{GF}}" css_animation="none" css=".vc_custom_1719348586871{margin-bottom: 55px !important;}" el_class="webinarText d-none"][vc_custom_heading text="{{TITLE}}" font_container="tag:h2|font_size:38|text_align:center|color:%23004e92|line_height:44px" google_fonts="{{GF}}" css_animation="none" css=".{{H2_CSS}}{margin-top: -40px !important;margin-bottom: 35px !important;}" el_class="webinarText"][vc_text_separator title="{{DATELINE}}" color="sky" border_width="2" css=""][vc_column_text css=".{{TEXT_CSS}}{margin-bottom: 35px !important;}"]<h4 style="text-align: center;">{{DESC}}</h4>[/vc_column_text][vc_single_image image="{{IMAGE_ID}}" img_size="full" alignment="center" onclick="custom_link" img_link_target="_blank" css="" link="{{IMG_LINK}}"][vc_btn title="{{CTA}}" style="custom" custom_text="#ffffff" size="lg" align="center" i_icon_fontawesome="fa fa-solid fa-arrow-right-to-bracket" css_animation="none" css="" add_icon="true" el_class="rrmButtonStyle1" link="{{BTN_LINK}}"][/vc_column][/vc_row]`;

// Dual template — the real "Dual Promo" row: hidden eyebrow + headline + body,
// then a vc_row_inner with two 1/2 columns (image + button each). No date line.
const DUAL_TEMPLATE =
`[vc_row bg_type="bg_color" bg_override="full" css=".vc_custom_1786456180518{margin-top: 100px !important;}" row_title="Dual Promo" el_class="rrmPromoSched rrmS{{START8}} rrmE{{END8}}"][vc_column css=".vc_custom_1668630062471{padding-top: 0px !important;}"][vc_custom_heading text="Next Workshop" font_container="tag:h1|font_size:42|text_align:center|color:%23404a5d|line_height:50px" google_fonts="{{GF}}" css_animation="none" css=".vc_custom_1719348586871{margin-bottom: 55px !important;}" el_class="webinarText d-none"][vc_custom_heading text="{{HEADLINE}}" font_container="tag:h2|font_size:38|text_align:center|color:%23004e92|line_height:44px" google_fonts="{{GF}}" css_animation="none" css=".vc_custom_1785252796452{margin-top: -40px !important;margin-bottom: 35px !important;}" el_class="webinarText"][vc_column_text css=".vc_custom_1785252802601{margin-bottom: 35px !important;}"]<h4 style="text-align: center;">{{BODY}}</h4>[/vc_column_text][vc_row_inner][vc_column_inner width="1/2"][vc_single_image image="{{IMG1}}" img_size="full" alignment="center" onclick="custom_link" img_link_target="_blank" css="" link="{{IMG1_LINK}}"][vc_btn title="{{CTA1}}" style="custom" custom_text="#ffffff" size="lg" align="center" i_icon_fontawesome="fa fa-solid fa-arrow-right-to-bracket" css_animation="none" css="" add_icon="true" el_class="rrmButtonStyle1" link="{{BTN1_LINK}}"][/vc_column_inner][vc_column_inner width="1/2"][vc_single_image image="{{IMG2}}" img_size="full" alignment="center" onclick="custom_link" img_link_target="_blank" css="" link="{{IMG2_LINK}}"][vc_btn title="{{CTA2}}" style="custom" custom_text="#ffffff" size="lg" align="center" i_icon_fontawesome="fa fa-solid fa-arrow-right-to-bracket" css_animation="none" css="" add_icon="true" el_class="rrmButtonStyle1" link="{{BTN2_LINK}}"][/vc_column_inner][/vc_row_inner][/vc_column][/vc_row]`;

// The three promo slots on the homepage (matched by row_title on the page).
// css IDs are each slot's real spacing IDs so the output regenerates identically.
const SLOTS = {
  solo1: { rowTitle: 'Solo Promo',   kind: 'single', rowCss: 'vc_custom_1786028486628', h2Css: 'vc_custom_1785252257211', textCss: 'vc_custom_1785252275681' },
  solo2: { rowTitle: 'Solo Promo 2', kind: 'single', rowCss: 'vc_custom_1786456185459', h2Css: 'vc_custom_1786456190355', textCss: 'vc_custom_1786456200620' },
  dual:  { rowTitle: 'Dual Promo',   kind: 'dual' }
};

// One-time, generic. Paste once into a Raw HTML element on the homepage.
const SCHEDULER_SNIPPET =
`<style>.rrmPromoSched:not(.rrmPromoOn){display:none !important;}</style>
<script>
(function(){
  function etNow(){
    var p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',hourCycle:'h23',
      year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date());
    var o={}; for(var i=0;i<p.length;i++){ o[p[i].type]=p[i].value; }
    return o.year+o.month+o.day+o.hour+o.minute+o.second;
  }
  function padS(s){ return (s+'00000000000000').slice(0,14); }
  function padE(s){ if(s.length>=14)return s.slice(0,14); if(s.length===12)return s+'59'; if(s.length===10)return s+'5959'; return s+'235959'; }
  function apply(){
    var now=etNow(), els=document.querySelectorAll('.rrmPromoSched');
    for(var i=0;i<els.length;i++){
      var c=els[i].className;
      var s=(c.match(/rrmS(\\d{8,14})/)||[])[1];
      var e=(c.match(/rrmE(\\d{8,14})/)||[])[1];
      var show=(!s||now>=padS(s))&&(!e||now<=padE(e));
      els[i].classList.toggle('rrmPromoOn', show);
    }
  }
  apply(); setInterval(apply,1000);
})();
<\/script>`;

// The two sites the homepage promo runs on. rowTitle is what content-wp.js
// searches for when auto-filling.
const SITES = [
  { key: 'rrm',  chip: 'RRM',  hostRe: /(^|\.)ringringmarketing\.com$/i,        pathRe: /\/wp-admin\/post\.php/ },
  { key: 'scmm', chip: 'SCMM', hostRe: /(^|\.)seniorcaremarketingmax\.com$/i,   pathRe: /\/wp-admin\/post\.php/ }
];

const MONTHS = {
  january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,
  jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12
};

let slot = 'solo1';
let canFill = false;

// ---- DOM ----
const $ = (id) => document.getElementById(id);
const scopeEl = $('scope'), tabStatus = $('tabStatus'), errMsg = $('errMsg'), fillMsg = $('fillMsg');

// ============================================================================
// Encoders — reproduce exactly how the site stores each value
// ============================================================================
function escAttr(s){ return String(s == null ? '' : s).replace(/"/g,'&quot;').replace(/\[/g,'&#91;').replace(/\]/g,'&#93;'); }
function escHtml(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
// vc_single_image link=""  → raw URL, ampersands as HTML entities
function imgLink(url){ return String(url || '').trim().replace(/&/g,'&amp;'); }
// vc_btn link=""  → "url:<percent-encoded>|target:_blank"
function btnLink(url){ const u = String(url || '').trim(); return u ? 'url:' + encodeURIComponent(u) + '|target:_blank' : ''; }
// Parse "MM/DD/YYYY hh:mm:ss" (Pacific) → YYYYMMDDHHMMSS. Date-only → YYYYMMDD
// (the scheduler pads it to a whole day). Accepts 24-hour or an optional am/pm;
// seconds optional. Returns '' if it can't be parsed.
function dtDigits(v){
  v = String(v || '').trim();
  if (!v) return '';
  var m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/);
  if (!m) return '';
  var mo = +m[1], d = +m[2], y = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  var p2 = function(n){ return String(n).padStart(2, '0'); };
  if (m[4] === undefined) return '' + y + p2(mo) + p2(d);
  var hh = +m[4], mi = +m[5], ss = m[6] !== undefined ? +m[6] : 0, ap = m[7];
  if (ap) { ap = ap.toLowerCase(); if (ap === 'pm' && hh < 12) hh += 12; if (ap === 'am' && hh === 12) hh = 0; }
  if (hh > 23 || mi > 59 || ss > 59) return '';
  return '' + y + p2(mo) + p2(d) + p2(hh) + p2(mi) + p2(ss);
}
// "2026-08-19" → "08/19/2026"
function isoToMDY(iso){ var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[2] + '/' + m[3] + '/' + m[1] : ''; }

// ============================================================================
// Active tab detection
// ============================================================================
async function refreshTabStatus(){
  let tab;
  try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); }
  catch { tabStatus.textContent = 'Could not read active tab.'; tabStatus.className = 'status-line warn'; return setCanFill(false, null); }

  let matched = null;
  if (tab && tab.url) {
    try {
      const url = new URL(tab.url);
      for (const s of SITES) { if (s.hostRe.test(url.hostname) && s.pathRe.test(url.pathname)) { matched = { s, url }; break; } }
    } catch {}
  }
  if (matched) {
    tabStatus.textContent = `Ready: ${matched.url.hostname} (page editor)`;
    tabStatus.className = 'status-line ok';
    scopeEl.textContent = matched.s.chip;
    setCanFill(true, matched.s.chip);
  } else {
    tabStatus.textContent = 'Open the homepage in the page editor (wp-admin, Classic Mode) on RRM or SCMM to enable Fill.';
    tabStatus.className = 'status-line warn';
    scopeEl.textContent = '—';
    setCanFill(false, null);
  }
}
function setCanFill(v){ canFill = v; $('fillBtn').disabled = !v; }
if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener(refreshTabStatus);
  chrome.tabs.onUpdated.addListener((id, info) => { if (info.status === 'complete' || info.url) refreshTabStatus(); });
}

// ============================================================================
// Email parsing (labelled). Fields are editable afterward, so the parse only
// needs to get close — the inputs are the source of truth.
// ============================================================================
// (label detection is keyword-based — see classifyLabel below)

function looksLikeHtml(t){ return /<(div|p|b|strong|li|ul|ol|br|span)\b[^>]*>/i.test(t); }
function htmlToText(html){
  let t = html
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_,i)=>i.replace(/<[^>]+>/g,'').trim()+'\n')
    .replace(/<\/?(ul|ol)[^>]*>/gi,'\n')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<\/(div|p|h[1-6])\s*>/gi,'\n')
    .replace(/<[^>]+>/g,'')
    .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;|&rsquo;|&lsquo;/g,"'").replace(/&rdquo;|&ldquo;/g,'"')
    .replace(/&mdash;/g,'—').replace(/&ndash;/g,'–').replace(/&hellip;/g,'…');
  return t.replace(/\r\n?/g,'\n').replace(/[ \t]+/g,' ').replace(/^[ \t]+|[ \t]+$/gm,'').replace(/\n{3,}/g,'\n\n').trim();
}

// Map a label (the text before the first ":") to a field type, or null.
// Keyword-based + prefix-tolerant, so "Solo CEM Headline:", "Dual Headline:",
// and "Title:" all map to the title; "CEM Link:", "FH Link:", "Link:" → link.
// Order matters: more specific keywords are checked first.
function classifyLabel(label){
  const l = String(label).toLowerCase().trim();
  if (!l || l.length > 60) return null;
  // "Add Link on the Image and CTA Button: …" is an instruction, not a value.
  if (/^\s*(?:\*|-|•|·)?\s*add\b/.test(l)) return null;
  if (l.includes('posting schedule') || l.includes('schedule')) return 'schedule';
  if (l.includes('headline') || l.includes('title')) return 'title';
  if (l.includes('description') || l.includes('body') || l.includes('copy')) return 'desc';
  if (l.includes('date') || l.includes('time') || l.includes('details') || l.includes('when')) return 'dateline';
  if (l.includes('link') || l.includes('url')) return 'link';
  if (l.includes('cta') || l.includes('button')) return 'cta';
  return null;
}

// Collect every "Label: value" line, classified by field type.
function extractFields(text){
  const lines = text.split(/\n/);
  const labeled = [];
  for (let i = 0; i < lines.length; i++) {
    const ci = lines[i].indexOf(':');
    if (ci < 0) continue;
    const type = classifyLabel(lines[i].slice(0, ci));
    if (!type) continue;
    labeled.push({ type, value: lines[i].slice(ci + 1).trim(), idx: i });
  }
  return { lines, labeled };
}

const firstOf = (f, type) => f.labeled.find(e => e.type === type) || null;
const valuesOf = (f, type) => f.labeled.filter(e => e.type === type).map(e => e.value).filter(Boolean);
const urlOf = (v) => { const m = String(v || '').match(/https?:\/\/\S+/); return m ? m[0] : ''; };

// A label's value plus any following non-label lines (multi-line body/desc).
function blockValue(f, entry){
  if (!entry) return '';
  const parts = [];
  if (entry.value) parts.push(entry.value);
  let nextIdx = f.lines.length;
  for (const e of f.labeled) if (e.idx > entry.idx && e.idx < nextIdx) nextIdx = e.idx;
  for (let i = entry.idx + 1; i < nextIdx; i++) { const t = f.lines[i].trim(); if (t) parts.push(t); }
  return parts.join(' ').trim();
}

// "August 11-19 (11:59PM)" / "July 30 - August 12, 2026" → { start, end } ISO.
function parseDateRange(value){
  let s = String(value || '').replace(/\([^)]*\)/g, '').trim();
  if (!s) return { start:'', end:'' };
  const yearM = s.match(/\b(20\d{2})\b/);
  const year = yearM ? parseInt(yearM[1], 10) : new Date().getFullYear();
  const parts = s.split(/\s*(?:-|–|—|\bto\b|\bthrough\b|\bthru\b)\s*/i);
  if (parts.length < 2) return { start:'', end:'' };
  const md = (str, fallbackMonth) => {
    str = str.replace(/,?\s*20\d{2}/, '').trim();
    let mm = str.match(/([A-Za-z]+)\.?\s+(\d{1,2})/);
    if (mm && MONTHS[mm[1].toLowerCase()]) return { month: MONTHS[mm[1].toLowerCase()], day: parseInt(mm[2],10) };
    let dd = str.match(/(\d{1,2})/);
    if (dd && fallbackMonth) return { month: fallbackMonth, day: parseInt(dd[1],10) };
    return null;
  };
  const L = md(parts[0], null);
  const R = md(parts[1], L ? L.month : null);
  if (!L || !R) return { start:'', end:'' };
  let endY = year; if (R.month < L.month) endY = year + 1;
  const iso = (y,mo,d) => `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  return { start: iso(year, L.month, L.day), end: iso(endY, R.month, R.day) };
}

function parseEmail(text){
  if (looksLikeHtml(text)) text = htmlToText(text);
  const f = extractFields(text);
  const links = valuesOf(f, 'link').map(urlOf).filter(Boolean);
  const ctas  = valuesOf(f, 'cta');
  const sched = parseDateRange((firstOf(f, 'schedule') || {}).value);

  // Template: explicit "Dual"/"Solo" wins; otherwise ≥2 links ⇒ dual.
  const dualWord = /\bdual\b/i.test(text);
  const soloWord = /\bsolo\b/i.test(text);
  const isDual = dualWord || (!soloWord && links.length >= 2);

  if (isDual) {
    return {
      template: 'dual',
      start: sched.start, end: sched.end,
      headline: (firstOf(f, 'title') || {}).value || '',
      body: blockValue(f, firstOf(f, 'desc')),
      cta1: ctas[0] || '', link1: links[0] || '',
      cta2: ctas[1] || '', link2: links[1] || ''
    };
  }
  return {
    template: 'single',
    start: sched.start, end: sched.end,
    title: (firstOf(f, 'title') || {}).value || '',
    dateline: (firstOf(f, 'dateline') || {}).value || '',
    desc: blockValue(f, firstOf(f, 'desc')),
    cta: ctas[0] || '',
    link: links[0] || ''
  };
}

// ============================================================================
// Build the row from the current (editable) field values
// ============================================================================
function buildRow(){
  const start = $('f_start').value, end = $('f_end').value;
  const conf = SLOTS[slot];
  if (conf.kind === 'single') {
    const link = $('s_link').value;
    return SOLO_TEMPLATE
      .replace(/\{\{GF\}\}/g, GF)
      .replace('{{ROW_CSS}}', conf.rowCss)
      .replace('{{ROW_TITLE}}', conf.rowTitle)
      .replace('{{H2_CSS}}', conf.h2Css)
      .replace('{{TEXT_CSS}}', conf.textCss)
      .replace('{{START8}}', dtDigits(start))
      .replace('{{END8}}', dtDigits(end))
      .replace('{{TITLE}}', escAttr($('s_title').value))
      .replace('{{DATELINE}}', escAttr($('s_dateline').value))
      .replace('{{DESC}}', escHtml($('s_desc').value))
      .replace('{{IMAGE_ID}}', String($('s_img').value || '').trim())
      .replace('{{IMG_LINK}}', imgLink(link))
      .replace('{{CTA}}', escAttr($('s_cta').value))
      .replace('{{BTN_LINK}}', btnLink(link));
  }
  const l1 = $('d1_link').value, l2 = $('d2_link').value;
  return DUAL_TEMPLATE
    .replace(/\{\{GF\}\}/g, GF)
    .replace('{{START8}}', dtDigits(start))
    .replace('{{END8}}', dtDigits(end))
    .replace('{{HEADLINE}}', escAttr($('d_headline').value))
    .replace('{{BODY}}', escHtml($('d_body').value))
    .replace('{{IMG1}}', String($('d1_img').value || '').trim())
    .replace('{{IMG1_LINK}}', imgLink(l1))
    .replace('{{CTA1}}', escAttr($('d1_cta').value))
    .replace('{{BTN1_LINK}}', btnLink(l1))
    .replace('{{IMG2}}', String($('d2_img').value || '').trim())
    .replace('{{IMG2_LINK}}', imgLink(l2))
    .replace('{{CTA2}}', escAttr($('d2_cta').value))
    .replace('{{BTN2_LINK}}', btnLink(l2));
}

function currentRowTitle(){ return SLOTS[slot].rowTitle; }

// Just the el_class scheduling string, for hand-editing a row's "Extra class name".
function scheduleClass(){
  const s = dtDigits($('f_start').value), e = dtDigits($('f_end').value);
  const parts = ['rrmPromoSched'];
  if (s) parts.push('rrmS' + s);
  if (e) parts.push('rrmE' + e);
  return parts.join(' ');
}

function refreshOutput(){
  $('rowOut').textContent = buildRow();
  const co = $('classOut'); if (co) co.textContent = scheduleClass();
  // Flag a date field that has text but doesn't parse (wrong format).
  ['f_start', 'f_end'].forEach(id => {
    const el = $(id); if (!el) return;
    const v = el.value.trim();
    el.style.borderColor = (!v || dtDigits(v)) ? '' : '#ff7676';
  });
}

// ============================================================================
// Wiring
// ============================================================================
function switchSlot(s){
  if (!SLOTS[s]) return;
  slot = s;
  document.querySelectorAll('.tmpl-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.slot === s));
  const isSingle = SLOTS[s].kind === 'single';
  $('singleFields').classList.toggle('hidden', !isSingle);
  $('dualFields').classList.toggle('hidden', isSingle);
  refreshOutput();
}

document.addEventListener('click', (e) => {
  const tab = e.target.closest && e.target.closest('.tmpl-tab');
  if (tab) switchSlot(tab.dataset.slot);
});
document.addEventListener('input', (e) => { if (e.target.matches('input, textarea')) refreshOutput(); });

$('parseBtn').addEventListener('click', () => {
  errMsg.textContent = '';
  const text = $('email').value;
  if (!text.trim()) { errMsg.textContent = 'Paste the promo email first.'; return; }
  const p = parseEmail(text);
  // Map parsed template → a slot. Dual → the Dual slot; single keeps the current
  // solo slot (so you can target Solo Promo 2) or defaults to Solo Promo.
  if (p.template === 'dual') switchSlot('dual');
  else if (SLOTS[slot].kind !== 'single') switchSlot('solo1');
  else switchSlot(slot);

  if (p.start) $('f_start').value = isoToMDY(p.start) + ' 00:00:00';
  if (p.end) $('f_end').value = isoToMDY(p.end) + ' 23:59:59';
  if (p.template === 'single') {
    $('s_title').value = p.title || '';
    $('s_dateline').value = p.dateline || '';
    $('s_desc').value = p.desc || '';
    $('s_cta').value = p.cta || '';
    $('s_link').value = p.link || '';
  } else {
    $('d_headline').value = p.headline || '';
    $('d_body').value = p.body || '';
    $('d1_cta').value = p.cta1 || ''; $('d1_link').value = p.link1 || '';
    $('d2_cta').value = p.cta2 || ''; $('d2_link').value = p.link2 || '';
  }
  refreshOutput();
  const isDual = SLOTS[slot].kind === 'dual';
  errMsg.textContent = (!$('f_start').value || !$('f_end').value)
    ? `Parsed — check the dates and add the image ID${isDual ? 's' : ''}.`
    : `Parsed — confirm the slot, add the image ID${isDual ? 's' : ''}, and you're set.`;
});

// Copy helpers
function wireCopy(btnId, getText){
  $(btnId).addEventListener('click', async () => {
    const btn = $(btnId), text = getText();
    try { await navigator.clipboard.writeText(text); }
    catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    const orig = btn.textContent; btn.textContent = 'Copied ✓'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1200);
  });
}
wireCopy('copyRow', () => buildRow());
wireCopy('copyClass', () => scheduleClass());
wireCopy('copySched', () => SCHEDULER_SNIPPET);

// Fill the homepage
$('fillBtn').addEventListener('click', async () => {
  if (!canFill) return;
  fillMsg.textContent = '';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  const btn = $('fillBtn'), orig = btn.textContent;
  btn.classList.add('busy'); btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Filling…';
  try {
    const res = await chrome.tabs.sendMessage(tab.id, {
      type: 'RRM_PROMO_FILL',
      payload: { rowTitle: currentRowTitle(), newRow: buildRow() }
    });
    if (res && res.ok) {
      btn.textContent = 'Filled ✓ — review & Update';
    } else if (res && res.error === 'row-not-found') {
      btn.textContent = orig; fillMsg.textContent = `No "${currentRowTitle()}" row found in the editor. Paste manually, or check you're in Classic Mode.`;
    } else if (res && res.error === 'no-content') {
      btn.textContent = orig; fillMsg.textContent = 'Editor not found. Switch the page to Classic Mode (not Backend Editor) and retry.';
    } else {
      btn.textContent = orig; fillMsg.textContent = 'Fill failed — see the WP tab console.';
      console.warn('[RRM Promo Helper] Fill response:', res);
    }
  } catch (e) {
    btn.textContent = orig;
    fillMsg.textContent = 'Could not reach the page. Make sure the homepage editor tab is active.';
  } finally {
    setTimeout(() => { btn.classList.remove('busy'); btn.disabled = !canFill; if (btn.textContent.indexOf('Filled') !== 0) btn.textContent = orig; }, 2600);
  }
});

// ---- Pacific-time helpers (defaults + testing aid) ----
function laParts(date){
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date);
  const o = {}; p.forEach(x => { o[x.type] = x.value; }); return o;
}
function laDateMDY(date){ const o = laParts(date); return `${o.month}/${o.day}/${o.year}`; }
function laFieldValue(date){ const o = laParts(date); return `${o.month}/${o.day}/${o.year} ${o.hour}:${o.minute}:${o.second}`; }
function updateEtClock(){
  const el = $('etNowLabel'); if (!el) return;
  el.textContent = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles',
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date());
}
if ($('testWindowBtn')) $('testWindowBtn').addEventListener('click', () => {
  const now = Date.now();
  // Start 2 min in the past (active immediately, with margin for paste/cache
  // lag) through 1 hour ahead — enough time to paste, save, and view.
  $('f_start').value = laFieldValue(new Date(now - 2 * 60000));
  $('f_end').value = laFieldValue(new Date(now + 60 * 60000));
  refreshOutput();
});

// Init
$('schedOut').textContent = SCHEDULER_SNIPPET;
// Prefill a whole-day window for today (LA), MM/DD/YYYY — so you only need to
// change the dates for a normal promo, not re-enter the times.
(function(){
  const d = laDateMDY(new Date());
  if (!$('f_start').value) $('f_start').value = `${d} 00:00:00`;
  if (!$('f_end').value)   $('f_end').value   = `${d} 23:59:59`;
})();
updateEtClock(); setInterval(updateEtClock, 1000);
refreshTabStatus();
refreshOutput();
