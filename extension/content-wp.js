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

  // 3. Yoast SEO meta description
  if (p.metaDesc) {
    const yoast = document.getElementById('yoast_wpseo_metadesc');
    if (yoast) setNativeValue(yoast, p.metaDesc);
  }

  // 4. ACF YouTube ID — wrapper element has data-name="youtube_id"
  if (p.ytId) {
    const wrapper = document.querySelector('[data-name="youtube_id"]');
    if (wrapper) {
      const input = wrapper.querySelector('input[type="text"], input[type="number"], input:not([type]), textarea');
      if (input) setNativeValue(input, p.ytId);
    }
  }

  // 5. Videos category checkbox
  const checklist = document.getElementById('categorychecklist');
  if (checklist) {
    const labels = checklist.querySelectorAll('label');
    for (const lbl of labels) {
      if (lbl.textContent.trim().toLowerCase() === 'videos') {
        const cb = lbl.querySelector('input[type="checkbox"]');
        if (cb && !cb.checked) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          cb.dispatchEvent(new Event('click', { bubbles: true }));
        }
        break;
      }
    }
  }

  // 6. Author (only if the Author meta box is enabled in Screen Options)
  if (p.author) {
    const authorSelect = document.getElementById('post_author_override');
    if (authorSelect) {
      for (const opt of authorSelect.options) {
        if (opt.text.trim().toLowerCase() === p.author.toLowerCase()) {
          authorSelect.value = opt.value;
          authorSelect.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
    }
  }

  // Clear so we don't re-fill on reload.
  chrome.storage.local.remove('rrm_pending');

  showToast(`Prefilled from RRM Tools — review, set featured image, then Publish.`);
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
    max-width: 360px; line-height: 1.4;
  `;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.4s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 400);
  }, 5000);
}
