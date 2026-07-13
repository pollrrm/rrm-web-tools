// RRM Marketing Guide Helper — runs on the WordPress Classic Editor new-post /
// new-page / edit screens. Listens for two message types from the side panel:
//   RRM_GUIDE_FILL_POST  — fills the Marketing Guide POST (content + categories +
//                          ACF PDF-URL meta box)
//   RRM_GUIDE_FILL_PAGE  — fills the companion thank-you PAGE (WPBakery template
//                          + slug = post slug + "-thank-you")
//
// Distinct message types so this never collides with the Video / Blog / Training
// helpers even though all inject content scripts on the same WP pages.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.payload) return;
  if (msg.type === 'RRM_GUIDE_FILL_POST') {
    fillPost(msg.payload).then((s) => sendResponse({ ok: true, status: s }))
      .catch((err) => { console.error('[RRM Guide Helper] fillPost failed:', err); sendResponse({ ok: false, error: String(err) }); });
    return true;
  }
  if (msg.type === 'RRM_GUIDE_FILL_PAGE') {
    fillPage(msg.payload).then((s) => sendResponse({ ok: true, status: s }))
      .catch((err) => { console.error('[RRM Guide Helper] fillPage failed:', err); sendResponse({ ok: false, error: String(err) }); });
    return true;
  }
});

// ---- POST fill ----
async function fillPost(p) {
  // p.categoryPaths is an array of paths, each path an array of category names.
  const paths = Array.isArray(p.categoryPaths) && p.categoryPaths.length
    ? p.categoryPaths
    : [['Marketing Guides']];
  const catLabel = paths.map(pa => pa.join(' → ')).join('  +  ');

  const ui = createProgressUI('RRM Guide Helper — Filling post…');
  ui.addStep('title', 'Title');
  if (p.publishDate)     ui.addStep('date',    `Publish: ${formatPublishLabel(p.publishDate)}`);
  if (p.author)          ui.addStep('author',  'Author');
  ui.addStep('category', `Categories: ${catLabel}`);
  if (p.primaryCategory) ui.addStep('primary', `Primary: ${p.primaryCategory}`);
  if (p.pdfUrl)          ui.addStep('acf',     'PDF URL (ACF meta box)');
  if (p.content)         ui.addStep('content', 'Content');

  try {
    ui.update('title', 'running', 'waiting for editor');
    await waitFor(() => document.getElementById('title'), { timeout: 15000 });
  } catch {
    ui.update('title', 'failed', 'not on a post page');
    ui.finish(false);
    return { error: 'not-on-post-page' };
  }

  // 1. Title
  const titleEl = document.getElementById('title');
  if (titleEl && p.title) {
    setNativeValue(titleEl, p.title);
    titleEl.focus(); titleEl.blur();
    ui.update('title', 'done');
  } else {
    ui.update('title', 'skipped');
  }

  // 2. Publish Date
  if (p.publishDate) {
    ui.update('date', 'running');
    const ok = await fillPublishDate(p.publishDate);
    ui.update('date', ok ? 'done' : 'failed', ok ? null : 'date controls not found');
  }

  // 3. Author
  if (p.author) {
    ui.update('author', 'running', 'waiting for dropdown');
    const a = await setAuthor(p.author);
    if (a.ok) ui.update('author', 'done', a.partial ? 'partial match' : null);
    else if (a.reason === 'no-dropdown') ui.update('author', 'failed', 'enable Author in Screen Options');
    else ui.update('author', 'failed', `"${p.author}" not in list — see console`);
  }

  // 4. Categories — check every path. Marketing Guides must be checked before
  // the ACF meta box will render, so this runs before the ACF step.
  ui.update('category', 'running');
  const allChecked = [];
  const allFailed = [];
  for (const path of paths) {
    const r = fillCategoryPath(path);
    allChecked.push(...r.checked);
    allFailed.push(...r.failed);
  }
  if (allFailed.length === 0) {
    ui.update('category', 'done');
  } else {
    ui.update('category', 'failed', `couldn't find: ${allFailed.join(', ')}`);
  }

  // 5. Primary category (prefer a top-level match when the name is ambiguous)
  if (p.primaryCategory) {
    ui.update('primary', 'running', 'waiting for Yoast link');
    const ok = await setPrimaryCategory(p.primaryCategory);
    ui.update('primary', ok ? 'done' : 'failed', ok ? null : 'Make Primary link not found');
  }

  // 6. ACF PDF URL meta box — appears after Marketing Guides is checked.
  if (p.pdfUrl) {
    ui.update('acf', 'running', 'waiting for ACF field');
    const ok = await fillAcfPdfUrl(p.pdfUrl);
    ui.update('acf', ok ? 'done' : 'failed', ok ? null : 'PDF field did not appear');
  }

  // 7. Content — toggle Text→Visual so TinyMCE loads it cleanly.
  if (p.content) {
    ui.update('content', 'running');
    await fillContent(p.content);
    ui.update('content', 'done');
  }

  const allOk = ui.allDone();
  ui.finish(allOk);
  return { checked: allChecked, failed: allFailed };
}

// ---- PAGE fill ----
async function fillPage(p) {
  const ui = createProgressUI('RRM Guide Helper — Filling page…');
  ui.addStep('title', 'Title');
  if (p.publishDate) ui.addStep('date',    `Publish: ${formatPublishLabel(p.publishDate)}`);
  if (p.author)      ui.addStep('author',  'Author');
  if (p.content)     ui.addStep('content', 'Content (WPBakery)');
  if (p.slug)        ui.addStep('slug',    `Slug: ${p.slug}`);

  try {
    ui.update('title', 'running', 'waiting for editor');
    await waitFor(() => document.getElementById('title'), { timeout: 15000 });
  } catch {
    ui.update('title', 'failed', 'not on a page editor');
    ui.finish(false);
    return { error: 'not-on-page' };
  }

  // 1. Title
  const titleEl = document.getElementById('title');
  if (titleEl && p.title) {
    setNativeValue(titleEl, p.title);
    titleEl.focus(); titleEl.blur();
    ui.update('title', 'done');
  } else {
    ui.update('title', 'skipped');
  }

  // 2. Publish Date
  if (p.publishDate) {
    ui.update('date', 'running');
    const ok = await fillPublishDate(p.publishDate);
    ui.update('date', ok ? 'done' : 'failed', ok ? null : 'date controls not found');
  }

  // 3. Author
  if (p.author) {
    ui.update('author', 'running', 'waiting for dropdown');
    const a = await setAuthor(p.author);
    if (a.ok) ui.update('author', 'done', a.partial ? 'partial match' : null);
    else if (a.reason === 'no-dropdown') ui.update('author', 'failed', 'enable Author in Screen Options');
    else ui.update('author', 'failed', `"${p.author}" not in list — see console`);
  }

  // 4. Content
  if (p.content) {
    ui.update('content', 'running');
    await fillContent(p.content);
    ui.update('content', 'done');
  }

  // 5. Slug — inject hidden post_name so WP applies it on the first save.
  if (p.slug) {
    ui.update('slug', 'running');
    const ok = await setPageSlug(p.slug);
    ui.update('slug', ok ? 'done' : 'failed',
      ok ? 'applied on save' : 'set slug manually (see console)');
  }

  const allOk = ui.allDone();
  ui.finish(allOk);
  return {};
}

// ---- Content fill (toggle Text → write → Visual) ----
async function fillContent(html) {
  const ta = document.getElementById('content');
  if (!ta) return false;
  const wrap = document.getElementById('wp-content-wrap');
  const wasVisual = wrap && wrap.classList.contains('tmce-active');
  const canSwitch = !!(window.switchEditors && window.switchEditors.go);
  if (wasVisual && canSwitch) {
    try { window.switchEditors.go('content', 'html'); } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  setNativeValue(ta, html);
  if (wasVisual && canSwitch) {
    await new Promise(r => setTimeout(r, 150));
    try { window.switchEditors.go('content', 'tmce'); } catch {}
  } else if (window.tinymce && window.tinymce.get && window.tinymce.get('content')) {
    try { window.tinymce.get('content').load(); } catch {}
  }
  return true;
}

// ---- ACF PDF URL — waits for the field to render (after Marketing Guides is
// checked) and fills it. Matched by label text so we don't need the exact ACF
// field name. Falls back to any URL/text input inside a matching ACF field. ----
async function fillAcfPdfUrl(url) {
  const LABEL_HINTS = ['autoresponder download link', 'pdf file url', 'marketing guide pdf', 'download link', 'guide pdf', 'pdf url'];
  for (let i = 0; i < 40; i++) { // ~8 seconds
    const fields = document.querySelectorAll('.acf-field');
    for (const f of fields) {
      const labelEl = f.querySelector('.acf-label label, .acf-label');
      const instrEl = f.querySelector('.acf-label .description, .description');
      const labelTxt = ((labelEl ? labelEl.textContent : '') + ' ' + (instrEl ? instrEl.textContent : '')).toLowerCase();
      if (LABEL_HINTS.some(h => labelTxt.includes(h))) {
        const input = f.querySelector('input[type="url"], input[type="text"], input:not([type]), textarea');
        if (input) { setNativeValue(input, url); return true; }
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }
  // Diagnostic
  const acfLabels = [...document.querySelectorAll('.acf-field .acf-label')].map(l => l.textContent.trim().slice(0, 60));
  console.error('[RRM Guide Helper] PDF URL ACF field not found. ACF field labels present:', acfLabels);
  return false;
}

// ---- Page slug ----
function sanitizeTitleToSlug(title) {
  return String(title)
    .toLowerCase()
    .replace(/[’'"]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

async function setPageSlug(slug) {
  let didSomething = false;

  // 1. Inject a hidden `post_name` field into the editor form. WordPress reads
  // post_name from the submitted form and uses it as the slug on the FIRST
  // save — so no autosave/reload dance is needed. This is the reliable path
  // for a brand-new page where the visible permalink editor doesn't exist yet.
  const form = document.getElementById('post');
  if (form) {
    let input = form.querySelector('input[name="post_name"]');
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'post_name';
      form.appendChild(input);
    }
    input.value = slug;
    didSomething = true;
  } else {
    console.warn('[RRM Guide Helper] Editor form #post not found — cannot inject slug.');
  }

  // 2. If the visible permalink editor is already present (post was previously
  // saved), also set it through the UI so the displayed slug matches and it
  // persists on the next save.
  const editBtn = document.querySelector('#edit-slug-buttons .edit-slug, #edit-slug-buttons button.edit-slug, #edit-slug-buttons a.edit-slug');
  if (editBtn && editBtn.offsetParent !== null) {
    try {
      editBtn.click();
      await new Promise(r => setTimeout(r, 250));
      const input = document.getElementById('new-post-slug');
      if (input) {
        setNativeValue(input, slug);
        const okBtn = document.querySelector('#edit-slug-buttons .save, #edit-slug-buttons button.save, #edit-slug-buttons a.save');
        if (okBtn) okBtn.click();
      }
    } catch (e) {
      console.warn('[RRM Guide Helper] Could not update visible slug editor:', e);
    }
    didSomething = true;
  }

  return didSomething;
}

// ============================================================================
// Shared helpers (mirrored from the Training helper)
// ============================================================================
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

async function fillPublishDate(d) {
  if (!d) return false;
  const editLink = document.querySelector('a.edit-timestamp');
  if (editLink && editLink.offsetParent !== null) {
    editLink.click();
    await new Promise(r => setTimeout(r, 200));
  }
  const monthSel = document.getElementById('mm');
  const dayInp   = document.getElementById('jj');
  const yearInp  = document.getElementById('aa');
  const hourInp  = document.getElementById('hh');
  const minInp   = document.getElementById('mn');
  if (!monthSel || !dayInp || !yearInp || !hourInp || !minInp) return false;
  monthSel.value = String(d.month).padStart(2, '0');
  monthSel.dispatchEvent(new Event('change', { bubbles: true }));
  setNativeValue(dayInp,  String(d.day).padStart(2, '0'));
  setNativeValue(yearInp, String(d.year));
  setNativeValue(hourInp, String(d.hour).padStart(2, '0'));
  setNativeValue(minInp,  String(d.minute).padStart(2, '0'));
  const okBtn = document.querySelector('a.save-timestamp');
  if (okBtn) okBtn.click();
  return true;
}

function formatPublishLabel(d) {
  if (!d) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const m = months[(d.month - 1) | 0] || '?';
  const h12 = ((d.hour + 11) % 12) + 1;
  const ampm = d.hour < 12 ? 'AM' : 'PM';
  const mm = String(d.minute).padStart(2, '0');
  return `${m} ${d.day}, ${d.year} ${h12}:${mm} ${ampm}`;
}

async function setAuthor(name) {
  for (let i = 0; i < 50; i++) {
    const select = document.getElementById('post_author_override') ||
                   document.querySelector('select[name="post_author_override"]') ||
                   document.querySelector('#authordiv select');
    if (select && select.options.length > 0) {
      const target = name.trim().toLowerCase();
      for (const opt of select.options) {
        if (opt.text.trim().toLowerCase() === target) {
          select.value = opt.value; select.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true };
        }
      }
      for (const opt of select.options) {
        if (opt.text.trim().toLowerCase().includes(target)) {
          select.value = opt.value; select.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, partial: true };
        }
      }
      return { ok: false, reason: 'no-match' };
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return { ok: false, reason: 'no-dropdown' };
}

// Walk a single category path, ticking each level. Sub-category lookup is
// scoped to the parent's children list so we never confuse same-named nodes.
function fillCategoryPath(path) {
  const checked = [];
  const failed = [];
  const topLabels = document.querySelectorAll('#categorychecklist > li > label');
  let parentLi = null;
  const wantTop = (path[0] || '').trim().toLowerCase();
  for (const lbl of topLabels) {
    if (lbl.textContent.trim().toLowerCase() === wantTop) {
      const cb = lbl.querySelector('input[type="checkbox"]');
      if (cb) { if (!cb.checked) tickCheckbox(cb); checked.push(path[0]); parentLi = lbl.parentElement; }
      break;
    }
  }
  if (!parentLi) {
    console.warn(`[RRM Guide Helper] Top-level category "${path[0]}" not found. Available:`,
      [...topLabels].map(l => l.textContent.trim()));
    failed.push(path[0]);
    return { checked, failed };
  }
  for (let i = 1; i < path.length; i++) {
    let childUl = parentLi.querySelector(':scope > ul.children') || parentLi.querySelector(':scope > ul');
    if (!childUl) { failed.push(path[i]); break; }
    let childLabels = childUl.querySelectorAll(':scope > li > label');
    if (childLabels.length === 0) childLabels = childUl.querySelectorAll('li > label');
    const want = path[i].trim().toLowerCase();
    let found = false;
    for (const lbl of childLabels) {
      if (lbl.textContent.trim().toLowerCase() === want) {
        const cb = lbl.querySelector('input[type="checkbox"]');
        if (cb) { if (!cb.checked) tickCheckbox(cb); checked.push(path[i]); parentLi = lbl.parentElement; found = true; }
        break;
      }
    }
    if (!found) {
      console.warn(`[RRM Guide Helper] Sub-category "${path[i]}" not found under "${path[i-1]||path[0]}". Available:`,
        [...childLabels].map(l => l.textContent.trim()));
      failed.push(path[i]);
      break;
    }
  }
  return { checked, failed };
}

function tickCheckbox(cb) {
  if (!cb || cb.checked) return;
  try { cb.focus({ preventScroll: true }); } catch {}
  const label = cb.closest('label');
  const target = label || cb;
  const opts = { bubbles: true, cancelable: true, view: window };
  try { target.dispatchEvent(new MouseEvent('mousedown', opts)); } catch {}
  try { target.dispatchEvent(new MouseEvent('mouseup',   opts)); } catch {}
  try { target.click(); } catch {}
  if (!cb.checked) { try { cb.click(); } catch {} }
  if (!cb.checked) { cb.checked = true; try { cb.dispatchEvent(new Event('change', { bubbles: true })); } catch {} }
  if (window.jQuery) { try { window.jQuery(cb).trigger('change'); } catch {} }
}

// Marks a category as Yoast Primary. When multiple categories share the name
// (e.g. a nested "Marketing Guides" and a top-level one), prefer the top-level
// one — that's the "general Marketing Guides (Primary)" the team wants.
async function setPrimaryCategory(name) {
  if (!name) return false;
  const want = String(name).trim().toLowerCase();
  const TRIGGER_SEL = [
    '.wpseo-make-primary-term', 'a.wpseo-make-primary-term', 'button.wpseo-make-primary-term',
    '.wpseo-primary-category-trigger', 'a.wpseo-primary-category-trigger',
    '[data-wpseo-action="make-primary"]', '[class*="primary-term"]', '[class*="make-primary"]'
  ].join(', ');

  for (let attempt = 0; attempt < 30; attempt++) {
    // Prefer top-level <li> (direct child of #categorychecklist) matching the name.
    const topLis = [...document.querySelectorAll('#categorychecklist > li')];
    const nestedLis = [...document.querySelectorAll('#categorychecklist li')].filter(li => !topLis.includes(li));
    const ordered = [...topLis, ...nestedLis];
    for (const li of ordered) {
      const label = li.querySelector(':scope > label');
      if (!label) continue;
      if (label.textContent.trim().toLowerCase() !== want) continue;
      const triggers = li.querySelectorAll(TRIGGER_SEL);
      for (const t of triggers) { try { t.click(); } catch {} return true; }
      const cands = li.querySelectorAll(':scope > a, :scope > button, :scope > span > a, :scope > span > button');
      for (const c of cands) {
        if (/make\s*primary/i.test(c.textContent || '')) { try { c.click(); } catch {} return true; }
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }
  console.error(`[RRM Guide Helper] "Make Primary" link not found for "${name}".`);
  return false;
}

// ---- Progress panel ----
function injectProgressStyles() {
  if (document.getElementById('rrm-guide-progress-styles')) return;
  const style = document.createElement('style');
  style.id = 'rrm-guide-progress-styles';
  style.textContent = `
    .rrm-g-progress { position: fixed; top: 60px; right: 20px; background: #181b22; color: #e6e6e6;
      border: 1px solid #8b5cf6; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      z-index: 100000; font-family: -apple-system,"Segoe UI",system-ui,sans-serif; font-size: 13px;
      line-height: 1.4; min-width: 260px; max-width: 400px; animation: rrm-g-in .25s ease-out; }
    .rrm-g-progress.rrm-g-out { opacity: 0; transition: opacity .4s; }
    .rrm-g-progress[data-state="success"] { border-color: #2d7a3e; }
    .rrm-g-progress[data-state="failed"]  { border-color: #c08a3e; }
    .rrm-g-head { padding: 10px 14px; font-weight: 600; border-bottom: 1px solid #2a2f3a;
      display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .rrm-g-close { cursor: pointer; color: #8a93a3; background: transparent; border: 0; font-size: 16px; line-height: 1; padding: 2px 6px; }
    .rrm-g-close:hover { color: #e6e6e6; }
    .rrm-g-steps { list-style: none; margin: 0; padding: 8px 14px 12px; }
    .rrm-g-steps li { display: flex; align-items: baseline; gap: 8px; padding: 4px 0; color: #8a93a3; }
    .rrm-g-steps li[data-status="running"] { color: #e6e6e6; }
    .rrm-g-steps li[data-status="done"] { color: #6cd17b; }
    .rrm-g-steps li[data-status="failed"] { color: #ff7676; }
    .rrm-g-steps li[data-status="skipped"] { color: #6a7180; }
    .rrm-g-steps .rrm-g-icon { width: 16px; flex-shrink: 0; text-align: center; font-family: ui-monospace,Menlo,monospace; font-weight: 700; }
    .rrm-g-steps li[data-status="running"] .rrm-g-icon { display: inline-block; animation: rrm-g-spin 1.1s linear infinite; }
    .rrm-g-steps .rrm-g-detail { color: #8a93a3; font-size: 11px; font-style: italic; }
    @keyframes rrm-g-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes rrm-g-spin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);
}

function createProgressUI(title) {
  injectProgressStyles();
  const existing = document.getElementById('rrm-guide-progress-panel');
  if (existing) existing.remove();
  const root = document.createElement('div');
  root.id = 'rrm-guide-progress-panel';
  root.className = 'rrm-g-progress';
  root.innerHTML = `
    <div class="rrm-g-head"><span class="rrm-g-title">${title}</span><button class="rrm-g-close" title="Dismiss">×</button></div>
    <ul class="rrm-g-steps"></ul>`;
  document.body.appendChild(root);
  root.querySelector('.rrm-g-close').onclick = () => root.remove();
  const stepsEl = root.querySelector('.rrm-g-steps');
  const titleEl = root.querySelector('.rrm-g-title');
  const iconFor = { pending: '·', running: '◌', done: '✓', failed: '✗', skipped: '–' };
  const stepKeys = [];
  function addStep(key, label) {
    stepKeys.push(key);
    const li = document.createElement('li');
    li.dataset.key = key; li.dataset.status = 'pending';
    li.innerHTML = `<span class="rrm-g-icon">${iconFor.pending}</span><span class="rrm-g-label">${label}</span><span class="rrm-g-detail"></span>`;
    stepsEl.appendChild(li);
  }
  function update(key, status, detail) {
    const li = stepsEl.querySelector(`li[data-key="${key}"]`);
    if (!li) return;
    li.dataset.status = status;
    li.querySelector('.rrm-g-icon').textContent = iconFor[status] || iconFor.pending;
    if (detail !== undefined) li.querySelector('.rrm-g-detail').textContent = detail ? `— ${detail}` : '';
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
    titleEl.textContent = success ? 'RRM Guide Helper — Prefilled ✓' : 'RRM Guide Helper — Done with issues';
    setTimeout(() => {
      if (!document.body.contains(root)) return;
      root.classList.add('rrm-g-out');
      setTimeout(() => root.remove(), 400);
    }, success ? 5000 : 12000);
  }
  return { addStep, update, finish, allDone };
}
