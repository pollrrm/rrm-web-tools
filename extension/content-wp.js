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

  // 4. ACF YouTube ID — wrapper element has data-name="youtube_id"
  let acfFilled = false;
  if (p.ytId) {
    const wrapper = document.querySelector('[data-name="youtube_id"]');
    if (wrapper) {
      const input = wrapper.querySelector('input[type="text"], input[type="number"], input:not([type]), textarea');
      if (input) {
        setNativeValue(input, p.ytId);
        acfFilled = true;
      }
    }
  }

  // 5. Videos category — find ONLY a top-level "Videos" checkbox (not a child like "Cemetery > Videos").
  // WP renders categories as nested <ul>: top-level <li>s are direct children of #categorychecklist;
  // subcategories live in <ul class="children"> inside their parent <li>. So we restrict the
  // selector to direct-child labels only.
  let categoryFilled = false;
  const topLabels = document.querySelectorAll('#categorychecklist > li > label');
  for (const lbl of topLabels) {
    if (lbl.textContent.trim().toLowerCase() === 'videos') {
      const cb = lbl.querySelector('input[type="checkbox"]');
      if (cb) {
        if (!cb.checked) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          cb.dispatchEvent(new Event('click', { bubbles: true }));
        }
        categoryFilled = true;
      }
      break;
    }
  }

  // 6. Author — wait for the Author meta box (must be enabled in Screen Options).
  let authorFilled = false;
  if (p.author) authorFilled = await setAuthor(p.author);

  // Clear so we don't re-fill on reload.
  chrome.storage.local.remove('rrm_pending');

  // Build a status summary so the user can see what worked.
  const status = [
    `Title ✓`,
    p.content ? `Content ✓` : null,
    p.metaDesc ? (yoastFilled ? `Meta description ✓` : `Meta description ✗ (Yoast field not found)`) : null,
    p.ytId ? (acfFilled ? `YouTube ID ✓` : `YouTube ID ✗ (ACF field not found)`) : null,
    categoryFilled ? `Videos category ✓` : `Videos category ✗ (no top-level "Videos" found)`,
    p.author ? (authorFilled ? `Author ✓` : `Author ✗ (enable Author in Screen Options)`) : null
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

// Fills Yoast SEO meta description. Modern Yoast may render the field via React,
// so we try several known selectors and wait for it to mount.
async function fillYoastMetaDesc(value) {
  const selectors = [
    '#yoast_wpseo_metadesc',                                       // Classic textarea / hidden input
    'textarea#yoast_wpseo_metadesc',
    'textarea[name="yoast_wpseo_metadesc"]',
    'textarea[name="yoast_wpseo[metadesc]"]',                      // older form name
    '[data-test-snippet-editor-input="meta-description"]',         // newer React UI
    '[data-test-id="snippet-editor-meta-description"]',
    'textarea[aria-label="Meta description" i]'
  ];
  for (let i = 0; i < 30; i++) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        setNativeValue(el, value);
        // Some Yoast UIs also store in a sibling hidden input — sync if present.
        const hidden = document.getElementById('yoast_wpseo_metadesc');
        if (hidden && hidden !== el) setNativeValue(hidden, value);
        return true;
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }
  console.warn('[RRM Helper] Yoast meta description field not found.');
  return false;
}

// Sets the Author dropdown if present (Author meta box must be enabled in Screen Options).
// Tries to match the option's display name case-insensitively.
async function setAuthor(name) {
  for (let i = 0; i < 25; i++) {
    const select = document.getElementById('post_author_override') ||
                   document.querySelector('select[name="post_author_override"]');
    if (select && select.options.length > 0) {
      const target = name.trim().toLowerCase();
      for (const opt of select.options) {
        if (opt.text.trim().toLowerCase() === target) {
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
      }
      console.warn('[RRM Helper] Author dropdown found but no option matched:', name,
        '— available options:', Array.from(select.options).map(o => o.text));
      return false;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  console.warn('[RRM Helper] Author dropdown not found. Enable Author in Screen Options.');
  return false;
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
