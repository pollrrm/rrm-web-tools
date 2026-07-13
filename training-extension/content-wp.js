// RRM Training Helper — Runs on the WordPress Classic Editor new-post / edit-post
// pages. Listens for RRM_TRAINING_FILL_POST messages from the side panel and
// prefills the editor with training/workshop post fields.
//
// Distinct message type so this never collides with the RRM WP Helper (video)
// or RRM Blog Helper extensions even though all three may inject content
// scripts on the same WP pages.
//
// Fields filled (in this order):
//   1. Title
//   2. Publish Date (5:00 AM, mm/jj/aa/hh/mn inputs + Edit/OK toggle)
//   3. Author dropdown
//   4. Categories (single name OR a parent→child path)
//   5. Yoast Primary Category (Make Primary link)
//   6. Content (toggle to Text mode → write textarea → toggle back to Visual)
//
// Yoast SEO Title / Meta Description are NOT filled — training posts use
// Yoast's variable defaults (Page Separator Site title) per spec.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.payload) return;
  if (msg.type === 'RRM_TRAINING_FILL_POST') {
    fillPost(msg.payload).then((status) => {
      sendResponse({ ok: true, status });
    }).catch((err) => {
      console.error('[RRM Training Helper] fillPost failed:', err);
      sendResponse({ ok: false, error: String(err) });
    });
    return true;
  }
  if (msg.type === 'RRM_TRAINING_FILL_PAGE') {
    fillPage(msg.payload).then((status) => {
      sendResponse({ ok: true, status });
    }).catch((err) => {
      console.error('[RRM Training Helper] fillPage failed:', err);
      sendResponse({ ok: false, error: String(err) });
    });
    return true;
  }
});

// Pages are simpler than posts — no Yoast / categories step.
// Content is the WPBakery shortcode template the side panel built.
async function fillPage(p) {
  const ui = createProgressUI('RRM Training Helper — Filling page…');
  ui.addStep('title', 'Title');
  if (p.publishDate) ui.addStep('date',    `Publish: ${formatPublishLabel(p.publishDate)}`);
  if (p.author)      ui.addStep('author',  'Author');
  if (p.content)     ui.addStep('content', 'Content (WPBakery)');

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
    const authorResult = await setAuthor(p.author);
    if (authorResult.ok) {
      ui.update('author', 'done', authorResult.partial ? 'partial match' : null);
    } else if (authorResult.reason === 'no-dropdown') {
      ui.update('author', 'failed', 'enable Author in Screen Options');
    } else {
      ui.update('author', 'failed', `"${p.author}" not in list — see console`);
    }
  }

  // 4. Content — same toggle Text→Visual approach as posts
  if (p.content) {
    ui.update('content', 'running');
    const html = p.content;
    const ta = document.getElementById('content');
    if (ta) {
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
      ui.update('content', 'done', wasVisual ? 'toggled Text → Visual to load' : null);
    } else {
      ui.update('content', 'failed', '#content textarea not found');
    }
  }

  const allOk = ui.allDone();
  ui.finish(allOk);
  return {};
}

async function fillPost(p) {
  const categories = (Array.isArray(p.categories) && p.categories.length)
    ? p.categories
    : ['Trainings'];
  const categoryStepLabel = categories.length > 1
    ? `Categories: ${categories.join(' → ')}`
    : `${categories[0]} category`;

  const ui = createProgressUI('RRM Training Helper — Filling post…');
  ui.addStep('title', 'Title');
  if (p.publishDate)     ui.addStep('date',    `Publish: ${formatPublishLabel(p.publishDate)}`);
  if (p.author)          ui.addStep('author',  'Author');
  ui.addStep('category', categoryStepLabel);
  if (p.primaryCategory) ui.addStep('primary', `Primary category: ${p.primaryCategory}`);
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

  // 4. Categories — instant click, no ACF wait (training posts have no ACF gate)
  ui.update('category', 'running');
  const catResult = fillCategoryPath(categories);
  if (catResult.failed.length === 0) {
    ui.update('category', 'done',
      categories.length > 1 ? `${categories.join(' → ')} ✓` : null);
  } else {
    ui.update('category', 'failed',
      `failed at "${catResult.failed[0]}"${catResult.checked.length ? ` (got: ${catResult.checked.join(' → ')})` : ''}`);
  }

  // 5. Yoast Primary Category
  if (p.primaryCategory) {
    ui.update('primary', 'running', 'waiting for Yoast link');
    const primaryOk = await setPrimaryCategory(p.primaryCategory);
    ui.update('primary', primaryOk ? 'done' : 'failed',
      primaryOk ? null : 'Make Primary link not found');
  }

  // 6. Content — toggle Text mode → write textarea → toggle back to Visual.
  // Mode-switch approach is the most reliable; lets TinyMCE read the textarea
  // naturally on the way back to Visual, instead of fighting its state.
  if (p.content) {
    ui.update('content', 'running');
    const html = p.content; // payload sends ready-made HTML
    const ta = document.getElementById('content');
    if (ta) {
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
      ui.update('content', 'done', wasVisual ? 'toggled Text → Visual to load' : null);
    } else {
      ui.update('content', 'failed', '#content textarea not found');
    }
  }

  const allOk = ui.allDone();
  ui.finish(allOk);
  return { categoryResult: catResult, authorResult };
}

// ---- Helpers (mirrored from blog-extension) ----

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
  if (!monthSel || !dayInp || !yearInp || !hourInp || !minInp) {
    console.warn('[RRM Training Helper] Publish date controls not found.');
    return false;
  }
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
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true };
        }
      }
      for (const opt of select.options) {
        if (opt.text.trim().toLowerCase().includes(target)) {
          select.value = opt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, partial: true };
        }
      }
      const opts = Array.from(select.options).map(o => o.text.trim());
      console.warn('[RRM Training Helper] Author "%s" not in dropdown. Available:', name, opts);
      return { ok: false, reason: 'no-match', options: opts };
    }
    await new Promise(r => setTimeout(r, 200));
  }
  console.warn('[RRM Training Helper] Author dropdown not found.');
  return { ok: false, reason: 'no-dropdown' };
}

function fillCategoryPath(path) {
  const checked = [];
  const failed = [];
  const checkboxes = [];
  const topLabels = document.querySelectorAll('#categorychecklist > li > label');
  let parentLi = null;
  const wantTop = (path[0] || '').trim().toLowerCase();
  for (const lbl of topLabels) {
    if (lbl.textContent.trim().toLowerCase() === wantTop) {
      const cb = lbl.querySelector('input[type="checkbox"]');
      if (cb) {
        if (!cb.checked) tickCheckbox(cb);
        checked.push(path[0]);
        checkboxes.push(cb);
        parentLi = lbl.parentElement;
      }
      break;
    }
  }
  if (!parentLi) {
    const tops = [...topLabels].map(l => l.textContent.trim());
    console.warn(`[RRM Training Helper] Top-level category "${path[0]}" not found. Available top-level categories:`, tops);
    failed.push(path[0]);
    return { checked, failed, checkboxes };
  }
  for (let i = 1; i < path.length; i++) {
    // Try the standard `ul.children` first; fall back to ANY direct child ul.
    let childUl = parentLi.querySelector(':scope > ul.children');
    if (!childUl) childUl = parentLi.querySelector(':scope > ul');
    if (!childUl) {
      console.warn(`[RRM Training Helper] No child <ul> under "${path[i - 1] || path[0]}" — sub-category "${path[i]}" can't be reached.`);
      failed.push(path[i]);
      break;
    }
    // Direct-child labels first; if none, broaden to nested labels in this ul.
    let childLabels = childUl.querySelectorAll(':scope > li > label');
    if (childLabels.length === 0) childLabels = childUl.querySelectorAll('li > label');
    const want = path[i].trim().toLowerCase();
    let found = false;
    for (const lbl of childLabels) {
      if (lbl.textContent.trim().toLowerCase() === want) {
        const cb = lbl.querySelector('input[type="checkbox"]');
        if (cb) {
          if (!cb.checked) tickCheckbox(cb);
          checked.push(path[i]);
          checkboxes.push(cb);
          parentLi = lbl.parentElement;
          found = true;
        }
        break;
      }
    }
    if (!found) {
      const available = [...childLabels].map(l => l.textContent.trim());
      console.warn(`[RRM Training Helper] Sub-category "${path[i]}" not found under "${path[i - 1] || path[0]}". Available children:`, available);
      failed.push(path[i]);
      break;
    }
  }
  return { checked, failed, checkboxes };
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
  if (!cb.checked) {
    cb.checked = true;
    try { cb.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
  }
  if (window.jQuery) { try { window.jQuery(cb).trigger('change'); } catch {} }
}

async function setPrimaryCategory(name) {
  if (!name) return false;
  const want = String(name).trim().toLowerCase();
  // Selectors Yoast has used across versions for the "Make Primary" trigger.
  const TRIGGER_SEL = [
    '.wpseo-make-primary-term',
    'a.wpseo-make-primary-term',
    'button.wpseo-make-primary-term',
    '.wpseo-primary-category-trigger',
    'a.wpseo-primary-category-trigger',
    '[data-wpseo-action="make-primary"]',
    '[class*="primary-term"]',
    '[class*="make-primary"]'
  ].join(', ');

  for (let attempt = 0; attempt < 30; attempt++) { // ~6 seconds total
    const allLis = document.querySelectorAll('#categorychecklist li');
    for (const li of allLis) {
      const label = li.querySelector(':scope > label');
      if (!label) continue;
      if (label.textContent.trim().toLowerCase() !== want) continue;
      // 1. Class-based selectors first
      const triggers = li.querySelectorAll(TRIGGER_SEL);
      for (const t of triggers) {
        try { t.click(); } catch {}
        return true;
      }
      // 2. Text-based fallback — anchor/button with "Make Primary" text inside this li
      const candidates = li.querySelectorAll(':scope > a, :scope > button, :scope > span > a, :scope > span > button');
      for (const c of candidates) {
        if (/make\s*primary/i.test(c.textContent || '')) {
          try { c.click(); } catch {}
          return true;
        }
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }
  // Diagnostic — show what's actually next to the matching category
  const dump = [];
  const allLis = document.querySelectorAll('#categorychecklist li');
  for (const li of allLis) {
    const label = li.querySelector(':scope > label');
    if (!label) continue;
    if (label.textContent.trim().toLowerCase() !== want) continue;
    dump.push({
      liHtml: li.outerHTML.slice(0, 400),
      siblingsOfLabel: [...li.children].map(c => `${c.tagName}.${c.className || '(no class)'}`)
    });
  }
  console.error(`[RRM Training Helper] "Make Primary" link not found for category "${name}".`,
    'Yoast may have crashed on this page, or the link uses a class we don\'t recognize.',
    'Diagnostic:', dump);
  return false;
}

// ---- Progress panel (small floating UI on the WP page) ----

function injectProgressStyles() {
  if (document.getElementById('rrm-training-progress-styles')) return;
  const style = document.createElement('style');
  style.id = 'rrm-training-progress-styles';
  style.textContent = `
    .rrm-tr-progress {
      position: fixed; top: 60px; right: 20px;
      background: #181b22; color: #e6e6e6;
      border: 1px solid #eab308; border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      z-index: 100000;
      font-family: -apple-system, "Segoe UI", system-ui, sans-serif;
      font-size: 13px; line-height: 1.4;
      min-width: 260px; max-width: 380px;
      animation: rrm-tr-fade-in .25s ease-out;
    }
    .rrm-tr-progress.rrm-tr-fade-out { opacity: 0; transition: opacity .4s; }
    .rrm-tr-progress[data-state="success"] { border-color: #2d7a3e; }
    .rrm-tr-progress[data-state="failed"]  { border-color: #c08a3e; }
    .rrm-tr-progress-head {
      padding: 10px 14px; font-weight: 600;
      border-bottom: 1px solid #2a2f3a;
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    .rrm-tr-progress-close {
      cursor: pointer; color: #8a93a3; background: transparent;
      border: 0; font-size: 16px; line-height: 1; padding: 2px 6px;
    }
    .rrm-tr-progress-close:hover { color: #e6e6e6; }
    .rrm-tr-progress-steps { list-style: none; margin: 0; padding: 8px 14px 12px; }
    .rrm-tr-progress-steps li {
      display: flex; align-items: baseline; gap: 8px;
      padding: 4px 0; color: #8a93a3;
    }
    .rrm-tr-progress-steps li[data-status="running"] { color: #e6e6e6; }
    .rrm-tr-progress-steps li[data-status="done"]    { color: #6cd17b; }
    .rrm-tr-progress-steps li[data-status="failed"]  { color: #ff7676; }
    .rrm-tr-progress-steps li[data-status="skipped"] { color: #6a7180; }
    .rrm-tr-progress-steps .rrm-tr-icon {
      width: 16px; flex-shrink: 0; text-align: center;
      font-family: ui-monospace, Menlo, monospace; font-weight: 700;
    }
    .rrm-tr-progress-steps li[data-status="running"] .rrm-tr-icon {
      display: inline-block; animation: rrm-tr-spin 1.1s linear infinite;
    }
    .rrm-tr-progress-steps .rrm-tr-detail {
      color: #8a93a3; font-size: 11px; font-style: italic;
    }
    @keyframes rrm-tr-fade-in {
      from { opacity: 0; transform: translateY(-6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes rrm-tr-spin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);
}

function createProgressUI(title) {
  injectProgressStyles();
  const existing = document.getElementById('rrm-training-progress-panel');
  if (existing) existing.remove();

  const root = document.createElement('div');
  root.id = 'rrm-training-progress-panel';
  root.className = 'rrm-tr-progress';
  root.innerHTML = `
    <div class="rrm-tr-progress-head">
      <span class="rrm-tr-progress-title">${title}</span>
      <button class="rrm-tr-progress-close" title="Dismiss">×</button>
    </div>
    <ul class="rrm-tr-progress-steps"></ul>
  `;
  document.body.appendChild(root);
  root.querySelector('.rrm-tr-progress-close').onclick = () => root.remove();

  const stepsEl = root.querySelector('.rrm-tr-progress-steps');
  const titleEl = root.querySelector('.rrm-tr-progress-title');
  const iconFor = { pending: '·', running: '◌', done: '✓', failed: '✗', skipped: '–' };
  const stepKeys = [];

  function addStep(key, label) {
    stepKeys.push(key);
    const li = document.createElement('li');
    li.dataset.key = key;
    li.dataset.status = 'pending';
    li.innerHTML = `
      <span class="rrm-tr-icon">${iconFor.pending}</span>
      <span class="rrm-tr-label">${label}</span>
      <span class="rrm-tr-detail"></span>
    `;
    stepsEl.appendChild(li);
  }
  function update(key, status, detail) {
    const li = stepsEl.querySelector(`li[data-key="${key}"]`);
    if (!li) return;
    li.dataset.status = status;
    li.querySelector('.rrm-tr-icon').textContent = iconFor[status] || iconFor.pending;
    if (detail !== undefined) {
      li.querySelector('.rrm-tr-detail').textContent = detail ? `— ${detail}` : '';
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
    titleEl.textContent = success ? 'RRM Training Helper — Prefilled ✓' : 'RRM Training Helper — Done with issues';
    setTimeout(() => {
      if (!document.body.contains(root)) return;
      root.classList.add('rrm-tr-fade-out');
      setTimeout(() => root.remove(), 400);
    }, success ? 5000 : 12000);
  }
  return { addStep, update, finish, allDone };
}
