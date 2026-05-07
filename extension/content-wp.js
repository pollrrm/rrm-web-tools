// Runs on the WordPress Classic Editor new-post / edit-post pages.
// Two entry points fill the same set of fields:
//   1. chrome.storage.local "rrm_pending" — used by the YT tool's "Send to ..." buttons
//   2. chrome.runtime message "RRM_FILL_POST"  — used by the extension's side panel
// Fields filled:
//   - Title
//   - Yoast SEO Meta Description (Draft.js)
//   - Categories (single top-level OR a path like ["Funeral","Videos"])
//   - ACF "youtube_id" field (rendered after the category click)
//   - Author dropdown (display name match)
//
// Content/TinyMCE is NOT auto-filled — too slow to mount reliably. Users copy-paste
// the Content block from the YT tool / side panel manually.

// ---- Entry point 1: storage-based (existing flow) ----
(async function () {
  const { rrm_pending } = await chrome.storage.local.get('rrm_pending');
  if (!rrm_pending || !rrm_pending.payload) return;
  if (Date.now() - rrm_pending.ts > 60000) {
    chrome.storage.local.remove('rrm_pending');
    return;
  }
  chrome.storage.local.remove('rrm_pending');
  await fillPost(rrm_pending.payload);
})();

// ---- Entry point 2: message-based (side panel flow) ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'RRM_FILL_POST' || !msg.payload) return;
  fillPost(msg.payload).then((status) => {
    sendResponse({ ok: true, status });
  }).catch((err) => {
    console.error('[RRM Helper] fillPost failed:', err);
    sendResponse({ ok: false, error: String(err) });
  });
  return true; // keep the message channel open for async response
});

// ---- Core fill logic — drives a step-by-step progress panel for visibility ----
// Order optimized so fast fields finish first (instant feedback) and the slow,
// async-mounted editors (Yoast Draft.js + TinyMCE) run last. Only ordering
// constraint: Videos category MUST be set before ACF YouTube ID, since ACF's
// location rules only render the field once Videos is checked.
async function fillPost(p) {
  // Default category path is just ["Videos"] for back-compat with niches that
  // use a single top-level Videos category.
  const categories = (Array.isArray(p.categories) && p.categories.length)
    ? p.categories
    : ['Videos'];
  const categoryStepLabel = categories.length > 1
    ? `Categories: ${categories.join(' → ')}`
    : `${categories[0]} category`;

  const ui = createProgressUI('RRM Helper — Filling post…');
  ui.addStep('title', 'Title');
  ui.addStep('category', categoryStepLabel);
  if (p.ytId)     ui.addStep('acf',    'YouTube ID (ACF)');
  if (p.author)   ui.addStep('author', 'Author');
  if (p.metaDesc) ui.addStep('meta',   'Meta description (Yoast)');

  try {
    ui.update('title', 'running', 'waiting for editor');
    await waitFor(() => document.getElementById('title'), { timeout: 15000 });
  } catch {
    ui.update('title', 'failed', 'not on a post page');
    ui.finish(false);
    return { error: 'not-on-post-page' };
  }

  // 1. Title (instant)
  const titleEl = document.getElementById('title');
  if (titleEl && p.title) {
    setNativeValue(titleEl, p.title);
    titleEl.focus(); titleEl.blur();
    ui.update('title', 'done');
  } else {
    ui.update('title', 'skipped');
  }

  // 2. Categories — supports a single top-level name OR a parent→child path.
  ui.update('category', 'running');
  const catResult = fillCategoryPath(categories);
  if (catResult.failed.length === 0) {
    ui.update('category', 'done',
      categories.length > 1 ? `${categories.join(' → ')} ✓` : null);
  } else {
    ui.update('category', 'failed',
      `failed at "${catResult.failed[0]}"${catResult.checked.length ? ` (got: ${catResult.checked.join(' → ')})` : ''}`);
  }

  // 3. ACF YouTube ID (waits for ACF to render after category click)
  let acfFilled = false;
  if (p.ytId) {
    ui.update('acf', 'running', 'waiting for ACF field');
    acfFilled = await fillAcfYoutubeId(p.ytId);
    ui.update('acf', acfFilled ? 'done' : 'failed',
      acfFilled ? null : 'ACF field did not appear');
  }

  // 4. Author (waits for dropdown if enabled in Screen Options)
  let authorResult = { ok: false, reason: 'skipped' };
  if (p.author) {
    ui.update('author', 'running', 'waiting for dropdown');
    authorResult = await setAuthor(p.author);
    if (authorResult.ok) {
      ui.update('author', 'done', authorResult.partial ? 'partial match' : null);
    } else if (authorResult.reason === 'no-dropdown') {
      ui.update('author', 'failed', 'enable Author in Screen Options');
    } else {
      ui.update('author', 'failed', `"${p.author}" not in list — see console`);
    }
  }

  // 5. Yoast SEO meta description (Draft.js, mounts async)
  let yoastFilled = false;
  if (p.metaDesc) {
    ui.update('meta', 'running', 'waiting for Yoast');
    yoastFilled = await fillYoastMetaDesc(p.metaDesc);
    ui.update('meta', yoastFilled ? 'done' : 'failed',
      yoastFilled ? null : 'field not found');
  }

  // Note: Content (TinyMCE) is intentionally NOT filled here — the iframe
  // boot is too slow. The user copy-pastes the Content block manually.

  const allOk = ui.allDone();
  ui.finish(allOk);

  return { yoastFilled, categoryResult: catResult, acfFilled, authorResult };
}

// Walks a category path like ["Funeral","Videos"] and ticks each checkbox in turn.
// For a single-element path, behaves like the old top-level Videos lookup.
// Subcategory matching is restricted to the previous level's <ul class="children">
// so we never confuse, e.g., "Cemetery > Videos" with the desired "Funeral > Videos".
function fillCategoryPath(path) {
  const checked = [];
  const failed = [];

  // Top-level: direct children of #categorychecklist
  const topLabels = document.querySelectorAll('#categorychecklist > li > label');
  let parentLi = null;
  const wantTop = (path[0] || '').trim().toLowerCase();
  for (const lbl of topLabels) {
    if (lbl.textContent.trim().toLowerCase() === wantTop) {
      const cb = lbl.querySelector('input[type="checkbox"]');
      if (cb) {
        if (!cb.checked) cb.click();
        checked.push(path[0]);
        parentLi = lbl.parentElement; // the <li>
      }
      break;
    }
  }
  if (!parentLi) {
    failed.push(path[0]);
    return { checked, failed };
  }

  // Subsequent levels — search inside the parent's children list only.
  for (let i = 1; i < path.length; i++) {
    const childUl = parentLi.querySelector(':scope > ul.children');
    if (!childUl) {
      failed.push(path[i]);
      break;
    }
    const childLabels = childUl.querySelectorAll(':scope > li > label');
    const want = path[i].trim().toLowerCase();
    let found = false;
    for (const lbl of childLabels) {
      if (lbl.textContent.trim().toLowerCase() === want) {
        const cb = lbl.querySelector('input[type="checkbox"]');
        if (cb) {
          if (!cb.checked) cb.click();
          checked.push(path[i]);
          parentLi = lbl.parentElement;
          found = true;
        }
        break;
      }
    }
    if (!found) {
      failed.push(path[i]);
      break;
    }
  }

  return { checked, failed };
}

// ---- Progress UI ----
function injectProgressStyles() {
  if (document.getElementById('rrm-progress-styles')) return;
  const style = document.createElement('style');
  style.id = 'rrm-progress-styles';
  style.textContent = `
    .rrm-progress {
      position: fixed; top: 60px; right: 20px;
      background: #181b22; color: #e6e6e6;
      border: 1px solid #5b8def; border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      z-index: 100000;
      font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
      font-size: 13px; line-height: 1.4;
      min-width: 260px; max-width: 380px;
      animation: rrm-fade-in .25s ease-out;
    }
    .rrm-progress.rrm-fade-out { opacity: 0; transition: opacity .4s; }
    .rrm-progress[data-state="success"] { border-color: #2d7a3e; }
    .rrm-progress[data-state="failed"] { border-color: #c08a3e; }
    .rrm-progress-head {
      padding: 10px 14px; font-weight: 600;
      border-bottom: 1px solid #2a2f3a;
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    .rrm-progress-close {
      cursor: pointer; color: #8a93a3; background: transparent;
      border: 0; font-size: 16px; line-height: 1; padding: 2px 6px;
    }
    .rrm-progress-close:hover { color: #e6e6e6; }
    .rrm-progress-steps { list-style: none; margin: 0; padding: 8px 14px 12px; }
    .rrm-progress-steps li {
      display: flex; align-items: baseline; gap: 8px;
      padding: 4px 0; color: #8a93a3;
    }
    .rrm-progress-steps li[data-status="running"] { color: #e6e6e6; }
    .rrm-progress-steps li[data-status="done"] { color: #6cd17b; }
    .rrm-progress-steps li[data-status="failed"] { color: #ff7676; }
    .rrm-progress-steps li[data-status="skipped"] { color: #6a7180; }
    .rrm-progress-steps .rrm-icon {
      width: 16px; flex-shrink: 0; text-align: center;
      font-family: ui-monospace, Menlo, monospace; font-weight: 700;
    }
    .rrm-progress-steps li[data-status="running"] .rrm-icon {
      display: inline-block; animation: rrm-spin 1.1s linear infinite;
    }
    .rrm-progress-steps .rrm-detail {
      color: #8a93a3; font-size: 11px; font-style: italic;
    }
    @keyframes rrm-fade-in {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes rrm-spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

function createProgressUI(title) {
  injectProgressStyles();
  const existing = document.getElementById('rrm-progress-panel');
  if (existing) existing.remove();

  const root = document.createElement('div');
  root.id = 'rrm-progress-panel';
  root.className = 'rrm-progress';
  root.innerHTML = `
    <div class="rrm-progress-head">
      <span class="rrm-progress-title">${title}</span>
      <button class="rrm-progress-close" title="Dismiss">×</button>
    </div>
    <ul class="rrm-progress-steps"></ul>
  `;
  document.body.appendChild(root);
  root.querySelector('.rrm-progress-close').onclick = () => root.remove();

  const stepsEl = root.querySelector('.rrm-progress-steps');
  const titleEl = root.querySelector('.rrm-progress-title');
  const iconFor = { pending: '·', running: '◌', done: '✓', failed: '✗', skipped: '–' };
  const stepKeys = [];

  function addStep(key, label) {
    stepKeys.push(key);
    const li = document.createElement('li');
    li.dataset.key = key;
    li.dataset.status = 'pending';
    li.innerHTML = `
      <span class="rrm-icon">${iconFor.pending}</span>
      <span class="rrm-label">${label}</span>
      <span class="rrm-detail"></span>
    `;
    stepsEl.appendChild(li);
  }

  function update(key, status, detail) {
    const li = stepsEl.querySelector(`li[data-key="${key}"]`);
    if (!li) return;
    li.dataset.status = status;
    li.querySelector('.rrm-icon').textContent = iconFor[status] || iconFor.pending;
    if (detail !== undefined) {
      li.querySelector('.rrm-detail').textContent = detail ? `— ${detail}` : '';
    }
  }

  function allDone() {
    return stepKeys.every(k => {
      const li = stepsEl.querySelector(`li[data-key="${k}"]`);
      const s = li && li.dataset.status;
      return s === 'done' || s === 'skipped';
    });
  }

  function finish(success = true) {
    root.dataset.state = success ? 'success' : 'failed';
    titleEl.textContent = success ? 'RRM Helper — Prefilled ✓' : 'RRM Helper — Done with issues';
    setTimeout(() => {
      if (!document.body.contains(root)) return;
      root.classList.add('rrm-fade-out');
      setTimeout(() => root.remove(), 400);
    }, success ? 5000 : 12000);
  }

  return { addStep, update, finish, allDone };
}

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

// (TinyMCE / Content fill removed — too slow to mount reliably. The Content
// block in the YT tool / side panel has a Copy button; users paste manually.)

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

// (showToast removed — superseded by the inline progress panel.)
