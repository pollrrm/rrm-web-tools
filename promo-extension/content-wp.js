// RRM Promo Helper — runs on the RRM / SCMM page editor (wp-admin/post.php).
// Listens for RRM_PROMO_FILL from the side panel and replaces ONLY the promo
// row (matched by row_title="…") inside the #content shortcode source, leaving
// the rest of the homepage untouched. Works in Classic Mode, where #content
// holds the raw WPBakery shortcodes.
//
// Distinct message type so it never collides with the Training / Blog / Video
// helpers that may also inject on these pages.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'RRM_PROMO_FILL' || !msg.payload) return;
  fillPromo(msg.payload)
    .then((status) => sendResponse(status))
    .catch((err) => { console.error('[RRM Promo Helper] fillPromo failed:', err); sendResponse({ ok: false, error: String(err) }); });
  return true; // async
});

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function setNativeValue(el, value){
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc && desc.set) desc.set.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// Locate the [vc_row … row_title="<title>" …] … matching [/vc_row] span.
// Counts only outer vc_row tags — [vc_row_inner]/[/vc_row_inner] are ignored by
// the token patterns, so nested inner rows (dual promo) are handled correctly.
function findPromoRowRange(content, rowTitle){
  const openTag = /\[vc_row\b[^\]]*\]/g; // \b excludes [vc_row_inner
  let m, startIdx = -1;
  const needle = 'row_title="' + rowTitle + '"';
  while ((m = openTag.exec(content))) {
    if (m[0].indexOf(needle) !== -1) { startIdx = m.index; break; }
  }
  if (startIdx < 0) return null;

  const tokenRe = /\[vc_row\b[^\]]*\]|\[\/vc_row\]/g;
  tokenRe.lastIndex = startIdx;
  let depth = 0, endIdx = -1, t;
  while ((t = tokenRe.exec(content))) {
    if (t[0].charAt(1) === '/') { depth--; if (depth === 0) { endIdx = tokenRe.lastIndex; break; } }
    else depth++;
  }
  if (endIdx < 0) return null;
  return { start: startIdx, end: endIdx };
}

async function fillPromo(p){
  const ta = document.getElementById('content');
  if (!ta) return { ok: false, error: 'no-content' };

  const wrap = document.getElementById('wp-content-wrap');
  const wasVisual = wrap && wrap.classList.contains('tmce-active');
  const canSwitch = !!(window.switchEditors && window.switchEditors.go);

  // Get the raw shortcode source into the textarea.
  if (wasVisual && canSwitch) { try { window.switchEditors.go('content', 'html'); } catch {} await sleep(250); }

  const current = ta.value || '';
  const range = findPromoRowRange(current, p.rowTitle);
  if (!range) {
    if (wasVisual && canSwitch) { try { window.switchEditors.go('content', 'tmce'); } catch {} }
    return { ok: false, error: 'row-not-found' };
  }

  const next = current.slice(0, range.start) + p.newRow + current.slice(range.end);
  setNativeValue(ta, next);

  // Load the change back into TinyMCE / return to Visual as it was.
  if (wasVisual && canSwitch) { await sleep(150); try { window.switchEditors.go('content', 'tmce'); } catch {} }
  else if (window.tinymce && window.tinymce.get && window.tinymce.get('content')) { try { window.tinymce.get('content').load(); } catch {} }

  toast(`Promo row replaced (${p.rowTitle}). Review, then click Update.`);
  return { ok: true, status: { replaced: p.rowTitle, bytes: p.newRow.length } };
}

// Small confirmation toast on the WP page.
function toast(text){
  const id = 'rrm-promo-toast';
  const old = document.getElementById(id); if (old) old.remove();
  const el = document.createElement('div');
  el.id = id;
  el.textContent = text;
  el.style.cssText = [
    'position:fixed','top:60px','right:20px','z-index:100000',
    'background:#181b22','color:#e6e6e6','border:1px solid #2d7a3e','border-radius:8px',
    'padding:10px 14px','font:600 13px -apple-system,"Segoe UI",system-ui,sans-serif',
    'box-shadow:0 8px 24px rgba(0,0,0,.4)','max-width:360px'
  ].join(';');
  document.body.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 5000);
}
