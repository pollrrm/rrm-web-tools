// RRM Blog Helper — Runs on the WordPress Classic Editor new-post / edit-post pages.
// Two entry points fill the same set of fields:
//   1. chrome.storage.local "rrm_blog_pending" — DOCX Batch tool's per-card Fill buttons
//   2. chrome.runtime message "RRM_BLOG_FILL_POST" — the extension's side panel
//
// NOTE: This is the BLOG variant. The message types and storage keys are
// blog-specific so the BLOG and VIDEO extensions never step on each other's
// messages, even though both inject content scripts on the same WP pages.
//
// Fields filled, in this order:
//   1. Title
//   2. Publish Date (Classic Editor mm/jj/aa/hh/mn inputs + Edit/OK toggle)
//   3. Author dropdown (display name match)
//   4. Yoast SEO Title (Draft.js)
//   5. Yoast SEO Meta Description (Draft.js)
//   6. Categories — instant click, no ACF wait (blog posts have no ACF gate)
//   7. Yoast Primary Category (Make Primary link)
//   8. Content (textarea + TinyMCE) — LAST, then a background reinforcement
//      loop re-applies it for ~9s to defeat WP autosave / TinyMCE re-saves

// ---- Entry point 1: storage-based (DOCX Batch tool Fill buttons) ----
// Runs on a freshly-loaded tab. Two things can go wrong here:
//   1. Yoast/TinyMCE haven't mounted yet → handled by `waitForPage: true`.
//   2. Yoast crashed on initial render (some WPBakery/Yoast combos do this
//      on Hospice and similar sites) → we detect "Something went wrong.
//      Please reload the page" and auto-reload ONCE. Yoast typically recovers
//      on the second load. We re-stash the payload with a reload counter so
//      the next iteration picks it up and doesn't infinite-loop.
(async function () {
  const { rrm_blog_pending } = await chrome.storage.local.get('rrm_blog_pending');
  if (!rrm_blog_pending || !rrm_blog_pending.payload) return;
  if (Date.now() - rrm_blog_pending.ts > 60000) {
    chrome.storage.local.remove('rrm_blog_pending');
    return;
  }

  const reloadCount = rrm_blog_pending.reloadCount || 0;

  // Give Yoast up to 15 seconds to mount before deciding it's broken. Yoast
  // on Hospice has been seen taking 8+ seconds when WPBakery loads its own
  // assets first.
  const yoastSignal = await waitForYoastReadyOrError(15000);

  if (yoastSignal === 'error' && reloadCount < 1) {
    console.log('[RRM Blog Helper] Yoast crashed on initial load — auto-reloading once.');
    // Re-stash the payload with an incremented reload counter so the next
    // page load picks it up and tries again. Don't infinite-loop: only one
    // auto-reload attempt per fill request.
    await chrome.storage.local.set({
      rrm_blog_pending: {
        ...rrm_blog_pending,
        ts: Date.now(),
        reloadCount: reloadCount + 1
      }
    });
    location.reload();
    return;
  }

  // OK to proceed — either Yoast is ready, or we've already reloaded once
  // and we'll do the best we can with whatever state Yoast is in.
  chrome.storage.local.remove('rrm_blog_pending');
  await fillPost(rrm_blog_pending.payload, { waitForPage: true });
})();

// Polls up to `timeoutMs` waiting for a Yoast Draft.js editor to mount.
// Brief crashes that resolve before timeout don't trigger reload — we only
// declare 'error' if the editor STILL hasn't mounted AND the error banner
// is showing at the end of the wait window. Cuts down on false-positive
// reloads while still catching the actual stuck-crash case on Hospice.
async function waitForYoastReadyOrError(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (document.querySelector('div.public-DraftEditor-content[contenteditable="true"]')) {
      return 'ready';
    }
    await new Promise(r => setTimeout(r, 200));
  }
  // Wait expired. Final check — is Yoast actually broken, or just slow?
  if (document.querySelector('div.public-DraftEditor-content[contenteditable="true"]')) {
    return 'ready';
  }
  if (isYoastErrorState()) {
    return 'error';
  }
  return 'timeout';
}

function isYoastErrorState() {
  // Yoast prints this in its metabox / sidebar when its React render fails.
  return /Something went wrong\.?\s*Please reload the page/i.test(document.body.innerText || '');
}

// Waits until the WP post page has its critical editors mounted, so the
// field polls inside fillPost (Yoast Draft.js, TinyMCE) don't race ahead.
// Caps at ~10 seconds — if either editor hasn't mounted by then, fillPost
// will still proceed and the per-field polls inside it will keep trying.
async function waitForPageSettled() {
  await waitFor(() => document.getElementById('title'), { timeout: 15000 }).catch(() => null);
  const yoastReady = () => !!document.querySelector('div.public-DraftEditor-content[contenteditable="true"]');
  const tinymceReady = () => !!(window.tinymce && window.tinymce.get && window.tinymce.get('content'));
  await waitFor(() => yoastReady() || tinymceReady(), { timeout: 10000 }).catch(() => null);
  await new Promise(r => setTimeout(r, 500));
}

// ---- Entry point 2: message-based (side panel flow) ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'RRM_BLOG_FILL_POST' || !msg.payload) return;
  fillPost(msg.payload).then((status) => {
    sendResponse({ ok: true, status });
  }).catch((err) => {
    console.error('[RRM Blog Helper] fillPost failed:', err);
    sendResponse({ ok: false, error: String(err) });
  });
  return true; // keep the message channel open for async response
});

// ---- Core fill logic — drives a step-by-step progress panel for visibility ----
// Order optimized so fast / instant fields finish first (immediate visual
// feedback), then progressively slower async fields. The most-blocking pair —
// Categories + ACF YouTube ID — runs LAST so by the time we get there, ACF's
// JS has had the longest possible time to fully initialize.
// Constraint: Categories must precede ACF YouTube ID, since ACF's location
// rules only render the youtube_id field once "Videos" is checked.
// Content/TinyMCE is filled by writing the underlying textarea synchronously
// (instant) and syncing the visual editor in the background (non-blocking).
async function fillPost(p, opts = {}) {
  // Default category path is just ["Blogs"] for back-compat with topics that
  // use a single top-level Blogs category.
  const categories = (Array.isArray(p.categories) && p.categories.length)
    ? p.categories
    : ['Blogs'];
  const categoryStepLabel = categories.length > 1
    ? `Categories: ${categories.join(' → ')}`
    : `${categories[0]} category`;

  const ui = createProgressUI('RRM Blog Helper — Filling post…');
  // Optional first step: wait for the editor + Yoast + TinyMCE to mount.
  // Used by the storage-based (new-tab) entry point. The side-panel entry
  // doesn't need it because the user only clicks Fill once the page looks
  // settled, but the new-tab flow runs at document_idle while editors are
  // still booting.
  if (opts.waitForPage) ui.addStep('loading', 'Waiting for editor');
  ui.addStep('title', 'Title');
  if (p.publishDate)     ui.addStep('date',     `Publish: ${formatPublishLabel(p.publishDate)}`);
  if (p.author)          ui.addStep('author',   'Author');
  if (p.seoTitle)        ui.addStep('seoTitle', 'SEO title (Yoast)');
  if (p.metaDesc)        ui.addStep('meta',     'Meta description (Yoast)');
  ui.addStep('category', categoryStepLabel);
  if (p.primaryCategory) ui.addStep('primary',  `Primary category: ${p.primaryCategory}`);
  if (p.content)         ui.addStep('content',  'Content');
  // No ACF YouTube ID step — blog posts don't have that field gate.

  // 0. Wait for page to settle (only when entry point requested it).
  if (opts.waitForPage) {
    ui.update('loading', 'running', 'page is still loading');
    await waitForPageSettled();
    ui.update('loading', 'done');
  }

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

  // 1b. Publish Date (instant — Classic Editor's date controls are always present)
  if (p.publishDate) {
    ui.update('date', 'running');
    const dateOk = await fillPublishDate(p.publishDate);
    ui.update('date', dateOk ? 'done' : 'failed',
      dateOk ? null : 'date controls not found');
  }

  // 2. Author (waits for dropdown if enabled in Screen Options)
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

  // 3a. Yoast SEO Title (Draft.js, same pattern as meta description)
  let seoTitleFilled = false;
  if (p.seoTitle) {
    ui.update('seoTitle', 'running', 'waiting for Yoast');
    seoTitleFilled = await fillYoastSeoTitle(p.seoTitle);
    ui.update('seoTitle', seoTitleFilled ? 'done' : 'failed',
      seoTitleFilled ? null : 'field not found');
  }

  // 3b. Yoast SEO meta description (Draft.js, mounts async)
  let yoastFilled = false;
  if (p.metaDesc) {
    ui.update('meta', 'running', 'waiting for Yoast');
    yoastFilled = await fillYoastMetaDesc(p.metaDesc);
    ui.update('meta', yoastFilled ? 'done' : 'failed',
      yoastFilled ? null : 'field not found');
  }

  // 4. Categories — instant click, no ACF wait. Blog posts don't have any
  // ACF location rule gated on the Blogs category, so we skip the ACF
  // readiness wait and the re-toggle retry that the video flow needs.
  ui.update('category', 'running');
  const catResult = fillCategoryPath(categories);
  if (catResult.failed.length === 0) {
    ui.update('category', 'done',
      categories.length > 1 ? `${categories.join(' → ')} ✓` : null);
  } else {
    ui.update('category', 'failed',
      `failed at "${catResult.failed[0]}"${catResult.checked.length ? ` (got: ${catResult.checked.join(' → ')})` : ''}`);
  }

  // 4b. Yoast Primary Category — click "Make Primary" for the named category.
  // The Make Primary link is injected by Yoast next to checked categories;
  // it appears after the category click, sometimes with a small delay.
  if (p.primaryCategory) {
    ui.update('primary', 'running', 'waiting for Yoast link');
    const primaryOk = await setPrimaryCategory(p.primaryCategory);
    ui.update('primary', primaryOk ? 'done' : 'failed',
      primaryOk ? null : 'Make Primary link not found');
  }

  // 5. Content — LAST step. Write the underlying #content textarea NOW. If
  // TinyMCE is already mounted (common when content-wp.js runs late on a
  // fast page), also setContent synchronously so its iframe state matches
  // our textarea write — otherwise a later TinyMCE.save() could overwrite
  // the textarea with TinyMCE's empty state and wipe our content.
  // We save the html in `contentHtmlForReinforcement` and the reinforcement
  // loop fires immediately after fillPost returns.
  let contentHtmlForReinforcement = null;
  if (p.content) {
    ui.update('content', 'running');
    const html = toHtml(p.content);
    contentHtmlForReinforcement = html;
    const ta = document.getElementById('content');
    if (ta) {
      setNativeValue(ta, html);
      // Sync TinyMCE NOW if already mounted (one-shot, no loop).
      if (window.tinymce && window.tinymce.get && window.tinymce.get('content')) {
        try {
          const ed = window.tinymce.get('content');
          ed.setContent(html);
          ed.save();
        } catch {/* mid-mount race — background sync covers us */}
      }
      // Background fallback for TinyMCE mounting later.
      syncTinyMCEInBackground(html); // fire-and-forget
      ui.update('content', 'done', 'visual editor syncs in background');
    } else {
      ui.update('content', 'failed', '#content textarea not found');
    }
  }

  const allOk = ui.allDone();
  ui.finish(allOk);

  // Reinforce content in the background to defeat WP autosave + TinyMCE
  // re-saves that wipe our textarea write. Runs immediately after fillPost
  // returns, with content as the last field set — minimizes the autosave
  // window before reinforcement kicks in.
  if (contentHtmlForReinforcement) {
    reinforceContentInBackground(contentHtmlForReinforcement);
  }

  return { yoastFilled, categoryResult: catResult, authorResult };
}

// Delayed content reinforcement. Fired AFTER the main fill flow completes.
// Re-applies the textarea value + TinyMCE setContent every ~1.5s for 9s total.
// Each iteration only writes if the value drifted (cheap when no drift).
async function reinforceContentInBackground(html) {
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 1500));
    try {
      const ta = document.getElementById('content');
      if (ta && ta.value !== html) setNativeValue(ta, html);
      if (window.tinymce && window.tinymce.get) {
        const ed = window.tinymce.get('content');
        if (ed && ed.getContent && ed.getContent() !== html) {
          ed.setContent(html);
          ed.save();
        }
      }
    } catch {/* ignore */}
  }
}

// Toggle a checkbox using the most thorough event sequence we can synthesize.
// Real user clicks fire mousedown → mouseup → click on the label, then the
// browser performs the default action (toggle + change on the input). ACF
// (and other plugins) may bind to any of those events; programmatic
// cb.click() fires only the click+change pair on the input. We dispatch the
// full mouse sequence on the label first, then verify the state actually
// changed and fall back through progressively more direct methods if it
// didn't.
function tickCheckboxForAcf(cb) {
  if (!cb) return false;
  if (cb.checked) {
    // Already in the desired state — just fire change so ACF re-evaluates
    if (window.jQuery) { try { window.jQuery(cb).trigger('change'); } catch {} }
    return true;
  }

  // Shift focus from wherever it currently is (e.g. Yoast Draft.js editor).
  try {
    if (document.activeElement && document.activeElement.blur && document.activeElement !== cb) {
      document.activeElement.blur();
    }
  } catch {}
  try { cb.focus({ preventScroll: true }); } catch {}

  const label = cb.closest('label');
  const target = label || cb;
  const opts = { bubbles: true, cancelable: true, view: window };

  // Full mouse event sequence on the label (or checkbox if no label)
  try { target.dispatchEvent(new MouseEvent('mousedown', opts)); } catch {}
  try { target.dispatchEvent(new MouseEvent('mouseup',   opts)); } catch {}

  // Native click — if target is the label, browser may toggle the checkbox
  try { target.click(); } catch {}

  // Verify state changed; if not, click the input directly.
  if (!cb.checked) {
    try { cb.click(); } catch {}
  }

  // Final fallback: set the property and dispatch change manually.
  if (!cb.checked) {
    cb.checked = true;
    try { cb.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
  }

  // jQuery change as a belt for jQuery-bound listeners
  if (window.jQuery) {
    try { window.jQuery(cb).trigger('change'); } catch {}
  }

  return cb.checked;
}

// Nudge ACF to re-evaluate its location rules. Different ACF versions expose
// different APIs; try every one we know about, plus WP's own categories-updated
// event which ACF and other plugins sometimes listen for.
function nudgeAcf() {
  if (window.acf) {
    try { window.acf.doAction && window.acf.doAction('change'); } catch {}
    try { window.acf.doAction && window.acf.doAction('refresh'); } catch {}
    try { window.acf.do_action && window.acf.do_action('change'); } catch {}
    try { window.acf.do_action && window.acf.do_action('refresh'); } catch {}
  }
  if (window.jQuery) {
    try { window.jQuery(document).trigger('acf/refresh'); } catch {}
    try { window.jQuery(document).trigger('acf:change'); } catch {}
    try { window.jQuery(document).trigger('wp-categories-updated'); } catch {}
  }
}

// Walks a category path like ["Funeral","Videos"] and ticks each checkbox.
// Subcategory matching is restricted to the previous level's <ul class="children">
// so we never confuse, e.g., "Cemetery > Videos" with the desired "Funeral > Videos".
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
        if (!cb.checked) tickCheckboxForAcf(cb);
        checked.push(path[0]);
        checkboxes.push(cb);
        parentLi = lbl.parentElement;
      }
      break;
    }
  }
  if (!parentLi) {
    failed.push(path[0]);
    return { checked, failed, checkboxes };
  }

  for (let i = 1; i < path.length; i++) {
    const childUl = parentLi.querySelector(':scope > ul.children');
    if (!childUl) { failed.push(path[i]); break; }
    const childLabels = childUl.querySelectorAll(':scope > li > label');
    const want = path[i].trim().toLowerCase();
    let found = false;
    for (const lbl of childLabels) {
      if (lbl.textContent.trim().toLowerCase() === want) {
        const cb = lbl.querySelector('input[type="checkbox"]');
        if (cb) {
          if (!cb.checked) tickCheckboxForAcf(cb);
          checked.push(path[i]);
          checkboxes.push(cb);
          parentLi = lbl.parentElement;
          found = true;
        }
        break;
      }
    }
    if (!found) { failed.push(path[i]); break; }
  }

  // Explicit ACF refresh in case the change events alone didn't trigger it.
  nudgeAcf();
  return { checked, failed, checkboxes };
}

// Marks one of the checked categories as Yoast SEO's "Primary Category".
// Yoast injects a "Make Primary" link next to every CHECKED category in the
// metabox. We find the li whose label matches the target category name and
// click its Make Primary link/button. Polls briefly because Yoast injects
// the link a moment after the category checkbox is ticked.
async function setPrimaryCategory(name) {
  if (!name) return false;
  const want = String(name).trim().toLowerCase();
  for (let attempt = 0; attempt < 25; attempt++) { // ~5 seconds
    const allLis = document.querySelectorAll('#categorychecklist li');
    for (const li of allLis) {
      const label = li.querySelector(':scope > label');
      if (!label) continue;
      if (label.textContent.trim().toLowerCase() !== want) continue;
      // Found the li. The Make Primary trigger sits as an immediate child of
      // the li (sibling to the label). Yoast uses a few different class names
      // across versions — try the known ones.
      const triggers = li.querySelectorAll(':scope > .wpseo-make-primary-term, :scope > a.wpseo-make-primary-term, :scope > button.wpseo-make-primary-term, :scope > .wpseo-primary-category-trigger, :scope > a.wpseo-primary-category-trigger');
      for (const t of triggers) {
        try { t.click(); } catch {}
        return true;
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }
  console.warn('[RRM Helper] Yoast Make Primary link not found for category:', name);
  return false;
}

// Re-toggle a list of category checkboxes (uncheck + re-check) with the
// thorough event sequence, then nudge ACF. Used when youtube_id didn't show
// after the first click.
async function retoggleCategories(checkboxes) {
  for (const cb of checkboxes) {
    tickCheckboxForAcf(cb); // uncheck
    await new Promise(r => setTimeout(r, 150));
    tickCheckboxForAcf(cb); // re-check
    await new Promise(r => setTimeout(r, 150));
  }
  nudgeAcf();
}

// Wait for ACF's JS to initialize. ACF exposes window.acf once its bundle
// loads; the .add_action / .data hooks confirm the framework is wired up.
async function waitForAcfReady(timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.acf && (window.acf.add_action || window.acf.data)) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

// Sets the WordPress Classic Editor publish date via the standard meta-box
// inputs. Expands the date editor (clicks "Edit"), writes the values, then
// commits via the "OK" link so the date sticks even if the user clicks away.
//
// d shape: { year, month, day, hour, minute }
async function fillPublishDate(d) {
  if (!d) return false;

  // Expand the date editor if collapsed. The Edit link is visible (offsetParent
  // not null) when the editor is closed; once clicked it hides itself.
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
    console.warn('[RRM Helper] Publish date controls not found.');
    return false;
  }

  // Month select uses zero-padded values "01"–"12".
  monthSel.value = String(d.month).padStart(2, '0');
  monthSel.dispatchEvent(new Event('change', { bubbles: true }));

  setNativeValue(dayInp,  String(d.day).padStart(2, '0'));
  setNativeValue(yearInp, String(d.year));
  setNativeValue(hourInp, String(d.hour).padStart(2, '0'));
  setNativeValue(minInp,  String(d.minute).padStart(2, '0'));

  // Click OK to commit. Without this, WP reverts to the original timestamp on Publish.
  const okBtn = document.querySelector('a.save-timestamp');
  if (okBtn) okBtn.click();
  return true;
}

// Pretty-print "May 6, 2026 at 5:00 AM" for the progress panel step label.
function formatPublishLabel(d) {
  if (!d) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const m = months[(d.month - 1) | 0] || '?';
  const h12 = ((d.hour + 11) % 12) + 1;
  const ampm = d.hour < 12 ? 'AM' : 'PM';
  const mm = String(d.minute).padStart(2, '0');
  return `${m} ${d.day}, ${d.year} ${h12}:${mm} ${ampm}`;
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

// Convert plain text to HTML paragraphs. Preserves any HTML already present.
// Every line break — single or double — becomes a paragraph boundary, so we
// emit <p>...</p>\n<p>...</p> rather than <p>...<br>...</p>. Used to write
// into the #content textarea so TinyMCE renders the right blocks on mount.
function toHtml(text) {
  if (/<\w+/.test(text)) return text;
  return text
    .split(/\n+/) // any run of newlines = paragraph boundary
    .map(para => para.trim())
    .filter(para => para.length > 0)
    .map(para => `<p>${para}</p>`)
    .join('\n');
}

// Best-effort TinyMCE sync, in the background. Other fill steps don't await
// this so they aren't blocked by the slow iframe boot.
//
// We deliberately do NOT run a reinforcement loop here — repeated setContent
// calls during ACF's location-rule evaluation can interfere with ACF's
// field-group rendering. The synchronous textarea write at the call site is
// the source of truth for Save; this background sync is only for the Visual
// editor preview, and one pass is enough on a fresh post.
async function syncTinyMCEInBackground(html) {
  for (let i = 0; i < 60; i++) { // up to ~12 seconds waiting for mount
    if (window.tinymce && window.tinymce.get && window.tinymce.get('content')) {
      try {
        const ed = window.tinymce.get('content');
        ed.setContent(html);
        ed.save();
      } catch {/* mid-mount race — ignore */}
      return;
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

// Fills Yoast SEO meta description.
// Modern Yoast (18+) uses a Draft.js contenteditable, NOT a textarea. Direct
// value writes are ignored because Draft.js controls state via React. Instead
// we focus the editor, select existing content, and use execCommand('insertText')
// which Draft.js intercepts and routes through its normal state updates.
// Falls back to legacy textarea selectors for older Yoast versions.
async function fillYoastMetaDesc(value) {
  const idSelectors = [
    '#yoast-google-preview-description-metabox',
    '[id^="yoast-google-preview-description"]'
  ];
  const legacySelectors = [
    '#yoast_wpseo_metadesc',
    'textarea#yoast_wpseo_metadesc',
    'textarea[name="yoast_wpseo_metadesc"]',
    'textarea[name="yoast_wpseo[metadesc]"]'
  ];
  for (let i = 0; i < 50; i++) { // ~10 seconds
    // 1. Specific Yoast IDs (most common path — RRM@home / RRM / SCMM all use these)
    for (const sel of idSelectors) {
      const el = document.querySelector(sel);
      if (el && el.isContentEditable) return setDraftEditorText(el, value);
    }
    // 2. Label-based finder (fallback for variant Yoast builds)
    const editor = findYoastDraftEditor('meta description');
    if (editor) return setDraftEditorText(editor, value);
    // 3. Legacy textarea (older Yoast)
    for (const sel of legacySelectors) {
      const el = document.querySelector(sel);
      if (el) {
        setNativeValue(el, value);
        return true;
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }
  // Diagnostic dump — show what was on the page so we can fix the selector.
  // Use console.error so it survives error-only console filters.
  const allDraftEditors = [...document.querySelectorAll('div.public-DraftEditor-content[contenteditable="true"]')]
    .map(e => ({
      id: e.id || '(no id)',
      ariaLabelledBy: e.getAttribute('aria-labelledby'),
      labelText: e.getAttribute('aria-labelledby')
        ? (document.getElementById(e.getAttribute('aria-labelledby'))?.textContent || '').trim()
        : '(no label)'
    }));
  const allLabels = [...document.querySelectorAll('[class*="replacevar__label"], [class*="yst-replacevar__label"]')]
    .map(l => ({ text: l.textContent.trim(), id: l.id }));
  console.error('[RRM Blog Helper] Yoast meta description editor not found.\n' +
    'Draft editors on page:', allDraftEditors, '\nReplacevar labels:', allLabels,
    '\nYoast error visible:', isYoastErrorState());
  return false;
}

// Robust Yoast Draft.js field finder. Yoast's metabox structure (any version
// since the Draft.js rewrite):
//   <div class="...yst-replacevar...">
//     <div class="...yst-replacevar__label" id="replacement-variable-editor-field-N">
//       SEO title       ← match this text
//     </div>
//     ...
//     <div class="public-DraftEditor-content"
//          contenteditable="true"
//          aria-labelledby="replacement-variable-editor-field-N">  ← matches by id
//     </div>
//   </div>
//
// Strategy:
//   1. Find every label-like element by text match (case insensitive).
//   2. For each match, look up the editor by aria-labelledby = label.id.
//   3. If that doesn't resolve, walk ancestors to find a nearby Draft.js editor.
function findYoastDraftEditor(labelText) {
  const want = labelText.trim().toLowerCase();

  // Helper — try exact-match first, then includes-match.
  const isMatch = (text) => {
    const t = text.trim().toLowerCase();
    return t === want || t.includes(want);
  };

  // 1. Any label-like elements anywhere on the page
  const labelCandidates = document.querySelectorAll(
    '[class*="replacevar__label"], [class*="yst-replacevar__label"], label'
  );
  for (const lbl of labelCandidates) {
    if (!isMatch(lbl.textContent)) continue;

    // 1a. Editor referenced by aria-labelledby = this label's id
    const lblId = lbl.id;
    if (lblId) {
      try {
        const editor = document.querySelector(
          `div.public-DraftEditor-content[aria-labelledby="${CSS.escape(lblId)}"]`
        );
        if (editor && editor.isContentEditable) return editor;
      } catch {}
    }

    // 1b. Editor inside the same ancestor wrapper
    let cur = lbl.parentElement;
    for (let depth = 0; depth < 6 && cur; depth++) {
      const editor = cur.querySelector(
        'div.public-DraftEditor-content[contenteditable="true"]'
      );
      if (editor) return editor;
      cur = cur.parentElement;
    }
  }

  // 2. Reverse lookup — walk every Draft.js editor on the page and pick the
  // one whose aria-labelledby resolves to a label matching our text.
  const editors = [...document.querySelectorAll(
    'div.public-DraftEditor-content[contenteditable="true"]'
  )];
  for (const editor of editors) {
    const labelledById = editor.getAttribute('aria-labelledby');
    if (!labelledById) continue;
    const labelEl = document.getElementById(labelledById);
    if (labelEl && isMatch(labelEl.textContent)) {
      return editor;
    }
  }

  // 3. Position-based fallback — Yoast's metabox typically renders editors
  // in a known order. SEO Title is usually the 1st draft editor on the page;
  // Meta Description is usually the 2nd. If we couldn't match by label, use
  // that convention so we at least try to fill SOMETHING rather than nothing.
  if (want === 'seo title' && editors.length >= 1) return editors[0];
  if (want === 'meta description' && editors.length >= 2) return editors[1];

  return null;
}

// Fills Yoast SEO Title. Mirrors fillYoastMetaDesc — Yoast 18+ renders the
// SEO Title field as a Draft.js contenteditable too, so the only reliable
// way to populate it is to focus + select-all + execCommand('insertText').
async function fillYoastSeoTitle(value) {
  const idSelectors = [
    '#yoast-google-preview-title-metabox',
    '[id^="yoast-google-preview-title"]'
  ];
  const legacySelectors = [
    '#yoast_wpseo_title',
    'input#yoast_wpseo_title',
    'input[name="yoast_wpseo_title"]'
  ];
  for (let i = 0; i < 50; i++) { // ~10 seconds
    // 1. Specific Yoast IDs
    for (const sel of idSelectors) {
      const el = document.querySelector(sel);
      if (el && el.isContentEditable) return setDraftEditorText(el, value);
    }
    // 2. Label-based finder (fallback)
    const editor = findYoastDraftEditor('seo title');
    if (editor) return setDraftEditorText(editor, value);
    // 3. Legacy input
    for (const sel of legacySelectors) {
      const el = document.querySelector(sel);
      if (el) {
        setNativeValue(el, value);
        return true;
      }
    }
    await new Promise(r => setTimeout(r, 200));
  }
  console.warn('[RRM Helper] Yoast SEO title editor not found.');
  return false;
}

// Sets text inside a Draft.js contenteditable via execCommand. This is the
// only reliable way to drive Draft.js's React state from outside.
//
// Known limitation: Yoast's SEO Title field comes pre-populated with three
// replacement-variable entities ("Page", "Separator", "Site title"). Our
// insertText call inserts BEFORE those chips rather than replacing them, so
// they remain in the field. We tried clearing them with execCommand('delete')
// — that breaks Draft.js's React reconciliation and causes cascading
// "removeChild" errors that also kill the Meta Description fill. So for now
// chips stay; user removes them with two backspaces manually.
function setDraftEditorText(editorEl, value) {
  try {
    editorEl.focus();
    const range = document.createRange();
    range.selectNodeContents(editorEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('insertText', false, value);
    if (!ok) {
      editorEl.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true, cancelable: true, inputType: 'insertText', data: value
      }));
      editorEl.dispatchEvent(new InputEvent('input', {
        bubbles: true, inputType: 'insertText', data: value
      }));
    }
    return true;
  } catch (e) {
    console.error('[RRM Blog Helper] Failed to set Draft.js editor:', e);
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
