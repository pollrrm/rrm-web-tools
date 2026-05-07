// Runs on the WordPress Classic Editor new-post / edit-post pages.
// Reads the pending payload from chrome.storage.local and prefills:
//   - Title
//   - Content (TinyMCE, with paragraph-wrapped HTML)
//   - Yoast SEO Meta Description
//   - ACF "youtube_id" field
//   - "Videos" category checkbox
//   - Author dropdown (display name match)

(async function () {
  const { rrm_pending } = await chrome.storage.local.get('rrm_pending');
  if (!rrm_pending || !rrm_pending.payload) return;

  // Only consume payloads stashed within the last 60 seconds.
  if (Date.now() - rrm_pending.ts > 60000) {
    chrome.storage.local.remove('rrm_pending');
    return;
  }

  const p = rrm_pending.payload;

  try {
    // Wait for the editor's title input to appear before doing anything.
    await waitFor(() => document.getElementById('title'), { timeout: 15000 });
  } catch {
    return; // Probably not on a post edit screen
  }

  // 1. Title
  const titleEl = document.getElementById('title');
  if (titleEl && p.title) {
    setNativeValue(titleEl, p.title);
    // Some themes only swap the prompt label after focus.
    titleEl.focus();
    titleEl.blur();
  }

  // 2. Content into TinyMCE
  if (p.content) {
    await fillTinyMCE(toHtml(p.content));
  }

  // 3. Yoast SEO meta description — Yoast loads its meta box async, so wait + try multiple selectors.
  let yoastFilled = false;
  if (p.metaDesc) yoastFilled = await fillYoastMetaDesc(p.metaDesc);

  // 4. Videos category FIRST — ACF location rules only show the youtube_id field
  // when the "Videos" category is selected. Setting it later means the field
  // wasn't in the DOM yet when we tried to fill it.
  // Use native click() so all of WP's + ACF's event listeners fire.
  let categoryFilled = false;
  const topLabels = document.querySelectorAll('#categorychecklist > li > label');
  for (const lbl of topLabels) {
    if (lbl.textContent.trim().toLowerCase() === 'videos') {
      const cb = lbl.querySelector('input[type="checkbox"]');
      if (cb) {
        if (!cb.checked) cb.click();
        categoryFilled = true;
      }
      break;
    }
  }

  // 5. ACF YouTube ID — now wait for the field to render after the category change.
  let acfFilled = false;
  if (p.ytId) acfFilled = await fillAcfYoutubeId(p.ytId);

  // 6. Author — wait for the Author meta box (must be enabled in Screen Options).
  let authorResult = { ok: false, reason: 'skipped' };
  if (p.author) authorResult = await setAuthor(p.author);

  // Clear so we don't re-fill on reload.
  chrome.storage.local.remove('rrm_pending');

  // Build a status summary so the user can see what worked.
  const authorMsg = !p.author
    ? null
    : authorResult.ok
      ? (authorResult.partial ? `Author ✓ (partial match)` : `Author ✓`)
      : authorResult.reason === 'no-dropdown'
        ? `Author ✗ (enable Author in Screen Options)`
        : `Author ✗ ("${p.author}" not in list — see console)`;

  const status = [
    `Title ✓`,
    p.content ? `Content ✓` : null,
    p.metaDesc ? (yoastFilled ? `Meta description ✓` : `Meta description ✗ (Yoast field not found)`) : null,
    categoryFilled ? `Videos category ✓` : `Videos category ✗ (no top-level "Videos" found)`,
    p.ytId ? (acfFilled ? `YouTube ID ✓` : `YouTube ID ✗ (ACF field did not appear)`) : null,
    authorMsg
  ].filter(Boolean).join('  •  ');

  showToast(`Prefilled — ${status}`);
})();

// ---- helpers ----

function waitFor(predicate, { timeout = 10000, interval = 100 } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const r = predicate();
      if (r) return resolve(r);
      if (Date.now() - start > timeout) return reject(new Error('waitFor timeout'));
      setTimeout(tick, interval);
    };
    tick();
  });
}

// Sets value on a React/jQuery-friendly input by going through the native setter
// and dispatching the events frameworks listen for.
function setNativeValue(el, value) {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, 'value') &&
                 Object.getOwnPropertyDescriptor(proto, 'value').set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('keyup', { bubbles: true }));
}

// Convert plain multi-paragraph text to HTML paragraphs. Preserves any HTML
// already present.
function toHtml(text) {
  if (/<\w+/.test(text)) return text;
  return text
    .split(/\n{2,}/)
    .map(para => `<p>${para.trim().replace(/\n/g, '<br>')}</p>`)
    .filter(p => p !== '<p></p>')
    .join('\n');
}

// Fills the Classic Editor TinyMCE area. Tries the TinyMCE API first; falls
// back to the raw textarea if Visual mode hasn't initialized yet.
async function fillTinyMCE(html) {
  for (let i = 0; i < 75; i++) {
    if (window.tinymce && window.tinymce.get && window.tinymce.get('content')) {
      const ed = window.tinymce.get('content');
      ed.setContent(html);
      ed.save();
      return;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  const ta = document.getElementById('content');
  if (ta) setNativeValue(ta, html);
}

// Fills Yoast SEO meta description.
// Modern Yoast (18+) uses a Draft.js contenteditable, NOT a textarea. Direct
// value writes are ignored because Draft.js controls state via React. Instead
// we focus the editor, select existing content, and use execCommand('insertText')
// which Draft.js intercepts and routes through its normal state updates.
// Falls back to legacy textarea selectors for older Yoast versions.
async function fillYoastMetaDesc(value) {
  const draftSelectors = [
    '#yoast-google-preview-description-metabox',                                       // Yoast 18+ Classic Editor metabox
    '[id^="yoast-google-preview-description"]',                                        // any variant of the above id
    'div.public-DraftEditor-content[aria-labelledby^="replacement-variable-editor-field"]' // generic Draft.js fallback
  ];
  const legacySelectors = [
    '#yoast_wpseo_metadesc',
    'textarea#yoast_wpseo_metadesc',
    'textarea[name="yoast_wpseo_metadesc"]',
    'textarea[name="yoast_wpseo[metadesc]"]'
  ];

  for (let i = 0; i < 30; i++) {
    // Try Draft.js editor first
    for (const sel of draftSelectors) {
      const el = document.querySelector(sel);
      if (el && el.isContentEditable) {
        return setDraftEditorText(el, value);
      }
    }
    // Older Yoast / fallback
    for (const sel of legacySelectors) {
      const el = document.querySelector(sel);
      if (el) {
        setNativeValue(el, value);
        return true;
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }
  console.warn('[RRM Helper] Yoast meta description editor not found.');
  return false;
}

// Sets text inside a Draft.js contenteditable via execCommand, the only reliable
// way to drive Draft.js's React state from outside.
function setDraftEditorText(editorEl, value) {
  try {
    editorEl.focus();
    // Select all current content (placeholder or otherwise) so insertText replaces it.
    const range = document.createRange();
    range.selectNodeContents(editorEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('insertText', false, value);
    if (!ok) {
      // Last-ditch fallback: dispatch beforeinput manually
      editorEl.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true, cancelable: true, inputType: 'insertText', data: value
      }));
      editorEl.dispatchEvent(new InputEvent('input', {
        bubbles: true, inputType: 'insertText', data: value
      }));
    }
    return true;
  } catch (e) {
    console.error('[RRM Helper] Failed to set Yoast meta description:', e);
    return false;
  }
}

// Waits for the ACF "youtube_id" wrapper to appear (it's only added to the DOM
// after the Videos category is checked) and fills the input.
async function fillAcfYoutubeId(value) {
  for (let i = 0; i < 30; i++) { // up to 6 seconds
    const wrapper = document.querySelector('[data-name="youtube_id"]');
    if (wrapper) {
      const input = wrapper.querySelector(
        'input[type="text"], input[type="number"], input:not([type]), textarea'
      );
      if (input) {
        setNativeValue(input, value);
        return true;
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }
  console.warn('[RRM Helper] ACF [data-name="youtube_id"] field did not appear. Confirm the Videos category triggers the field group, and that the ACF field name is exactly "youtube_id".');
  return false;
}

// Sets the Author dropdown if present (Author meta box must be enabled in Screen Options).
// Tries exact match first, then a "contains" match. Returns a structured result so
// the toast can show the precise failure mode.
async function setAuthor(name) {
  for (let i = 0; i < 50; i++) { // up to 10 seconds — author dropdown can load late
    const select = document.getElementById('post_author_override') ||
                   document.querySelector('select[name="post_author_override"]') ||
                   document.querySelector('#authordiv select');
    if (select && select.options.length > 0) {
      const target = name.trim().toLowerCase();
      // Exact match first
      for (const opt of select.options) {
        if (opt.text.trim().toLowerCase() === target) {
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true };
        }
      }
      // Then "contains" match (handles cases like "Welton Hong, MBA")
      for (const opt of select.options) {
        if (opt.text.trim().toLowerCase().includes(target)) {
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, partial: true };
        }
      }
      const opts = Array.from(select.options).map(o => o.text.trim());
      console.warn('[RRM Helper] Author "%s" not in dropdown. Available options:', name, opts);
      return { ok: false, reason: 'no-match', options: opts };
    }
    await new Promise(r => setTimeout(r, 200));
  }
  console.warn('[RRM Helper] Author dropdown not found. Confirm Author is enabled in Screen Options.');
  return { ok: false, reason: 'no-dropdown' };
}

function showToast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `
    position: fixed; bottom: 24px; right: 24px;
    background: #2d7a3e; color: white;
    padding: 12px 18px; border-radius: 8px;
    box-shadow: 0 6px 20px rgba(0,0,0,0.3);
    z-index: 99999;
    font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
    font-size: 13px; font-weight: 500;
    max-width: 420px; line-height: 1.4;
  `;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.4s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 400);
  }, 9000);
}
