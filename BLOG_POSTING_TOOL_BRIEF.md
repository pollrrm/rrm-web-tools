# Blog Posting Tool — Implementation Brief

> **For a fresh Claude Code session.** This document is self-contained — you do not need any prior conversation context. Read it top to bottom, then start implementing.

---

## 1. Goal

Add a **Blog Posts** mode to the existing `RRM WP Helper` Chrome extension. It should let the user upload a monthly ZIP of `.docx` blog posts, parse each one, and prefill the WordPress Classic Editor on a New Post page — same one-click experience the existing **Video Posts** mode already provides.

When done, the side panel will have two modes:
- **Video Posts** (existing) — paste task email, fill WP post for video blogs.
- **Blog Posts** (new) — upload ZIP, fill WP post for regular blog articles.

Both modes share the same `content-wp.js` fill logic. You'll extend it with one new field (SEO Title) and add a new side-panel mode.

---

## 2. Repository layout

```
rrm-web-tools/                                    (root of this repo)
├── docx-batch-to-wordpress.html                  ← REFERENCE: existing standalone tool
│                                                   that already parses the ZIP + .docx
│                                                   files into the exact fields we need.
│                                                   Port its parsing logic.
├── yt-thumbnail-downloader.html                  Existing browser tool for video posts.
├── extension/                                    THE EXTENSION (target of your changes)
│   ├── manifest.json                             MV3 manifest
│   ├── background.js                             Opens side panel on icon click
│   ├── content-tool.js                           Runs on github.io tool pages
│   ├── content-wp.js                             ← MAIN FILL LOGIC. Extend this.
│   ├── sidepanel.html                            ← Side panel UI. Add Blog mode here.
│   ├── sidepanel.js                              ← Side panel parser+sender. Add Blog mode here.
│   └── README.md
└── BLOG_POSTING_TOOL_BRIEF.md                    ← this file
```

The extension is loaded as **unpacked** from `extension/` via `chrome://extensions` → Developer mode → Load unpacked.

---

## 3. What the user uploads

A **monthly ZIP** containing one `.docx` per blog post (plus paired image files). Two ZIP layouts are supported by the existing parser — your code should support both:

- **Nested:** each post in its own folder (e.g. `5.4/post.docx`, `5.4/featured.jpg`, `5.11/...`).
- **Flat:** all `.docx` and `.jpg` files in one folder, paired by date prefix in the filename (`5.4 ....docx` ↔ `... 05.04.jpg`).

The user picks a **site** + **topic** (or auto-detects from the ZIP filename / inner folder name).

---

## 4. The `.docx` format the team uses

```
5.4                                                  ← M.D date hint
Increasing Google Maps Visibility for Flooring       ← bold = WordPress title
[intro paragraphs]
1. First Section Heading                             ← bold + numbered = <h2>
[section paragraphs + bullet lists]
2. Second Section Heading
...
Conclusion                                           ← <h2>
[concluding paragraphs]
Word Count: 1,911                                    ← marks end of body
SEO Title Tag: Your SEO title here                   ← extract this
Meta Description: Your meta description here         ← extract this
Target Keywords
- keyword 1
- keyword 2
H Tags Used                                          ← source of truth for which body
- H1: The Title                                        paragraphs become <h2>
- H2: First Section Heading
- H2: Conclusion
```

The existing `docx-batch-to-wordpress.html` already parses all of this correctly. **Port its parser into the extension's side panel** — do not rewrite from scratch.

---

## 5. Fields to fill on the WP Classic Editor

| Field | Source from .docx | WP target | Notes |
|---|---|---|---|
| **Title** | First bold paragraph after date hint | `#title` input | Already handled by `content-wp.js` |
| **Date** | "M.D" line at top | Publish meta box | Already handled. Time = team default (set per-tool, e.g. 8:00 AM for blogs vs 5:00 AM for videos) |
| **Content** | HTML body between title and `Word Count:` line, with H2 promotion | `#content` textarea + TinyMCE | Already handled (textarea write + background TinyMCE sync) |
| **SEO Title** | `SEO Title Tag: …` line | Yoast SEO Title field | **NEW — you'll add this to `content-wp.js`** |
| **SEO Meta Description** | `Meta Description: …` line | Yoast Meta Description (Draft.js) | Already handled — uses `execCommand('insertText')` trick |
| **Author** | Hard-code `Welton Hong` (or surface as a setting) | `#post_author_override` dropdown | Already handled |
| **Category** | Per niche (see below) | `#categorychecklist` | Already handled — supports parent → child path |

### Niche → category mapping (already in `docx-batch-to-wordpress.html`'s `SITES` array)

| Site | Topic | Category path |
|---|---|---|
| RRM@home | Flooring / HVAC / Windows and Doors | `["Blogs"]` |
| RRM | Funeral | `["Funeral", "Blogs"]` |
| RRM | Cemetery | `["Cemetery", "Blogs"]` |
| SCMM | Home Health / Home Care | `["Blogs"]` |
| Hospice | Hospice | `["Blogs"]` |

---

## 6. Architecture — extend the existing extension

**Do NOT create a separate extension.** The fill logic in `extension/content-wp.js` already handles 6 of 7 fields. Re-using it means:

- One extension to install for the team
- One source of truth for WP-fill edge cases (Yoast Draft.js, TinyMCE timing, ACF retries, category nesting, etc.)
- Side panel becomes a multi-mode tool

### The change shape

1. **`extension/content-wp.js`** — add SEO Title fill. The existing payload structure becomes:

   ```js
   {
     title, content, metaDesc,
     seoTitle,        // NEW
     ytId,            // optional, only for video posts
     author,
     publishDate: { year, month, day, hour, minute },
     categories: ['Blogs']     // or ['Funeral', 'Blogs'], etc.
   }
   ```

2. **`extension/sidepanel.html`** — add a tab/toggle at the top: **Video Posts** / **Blog Posts**. Add a file-upload UI under Blog Posts.

3. **`extension/sidepanel.js`** — add ZIP parsing (port from `docx-batch-to-wordpress.html`) and card rendering for blog posts. The "Fill This Post" button dispatches the same `RRM_FILL_POST` message as the video flow.

4. **`extension/manifest.json`** — add `web_accessible_resources` if you need to bundle `mammoth.min.js` and `jszip.min.js` locally (or load from CDN — pick one, see §9).

---

## 7. Key patterns ALREADY SOLVED in `content-wp.js` — use these, do not reinvent

Read `extension/content-wp.js` end-to-end. Specifically reuse:

### 7a. `setNativeValue(el, value)`
Sets an input/textarea value through the native setter and fires `input` / `change` / `keyup` so React-based UIs and jQuery handlers both see the update.

### 7b. Yoast Meta Description (Draft.js) — `fillYoastMetaDesc`
Yoast 18+ renders the meta description as a Draft.js contenteditable, not a textarea. Direct `.value =` writes are ignored. The working approach (already in `content-wp.js`):

```js
editorEl.focus();
const range = document.createRange();
range.selectNodeContents(editorEl);
const sel = window.getSelection();
sel.removeAllRanges();
sel.addRange(range);
document.execCommand('insertText', false, value);
```

Selectors that work (try in order):
```js
'#yoast-google-preview-description-metabox'
'[id^="yoast-google-preview-description"]'
'div.public-DraftEditor-content[aria-labelledby^="replacement-variable-editor-field"]'
```

### 7c. SEO Title (NEW — you'll add this)
Yoast's SEO Title field on rrmathome/SCMM/etc. is **also a Draft.js editor** in modern Yoast. Same pattern as meta description, different selectors. Inspect a real WP page to find them. Expected selectors (verify with DevTools):

```js
'#yoast-google-preview-title-metabox'
'[id^="yoast-google-preview-title"]'
```

Write a `fillYoastSeoTitle(value)` that mirrors `fillYoastMetaDesc(value)`. The same `setDraftEditorText(editorEl, value)` helper can be reused — it's already defined in `content-wp.js`.

### 7d. TinyMCE content — textarea-first
TinyMCE iframe boot is slow (2–4s). Don't block on it. Instead:

```js
// Synchronous, instant — this is the source of truth for Publish
const ta = document.getElementById('content');
setNativeValue(ta, html);
// Background sync — non-awaited — updates the Visual editor when TinyMCE mounts
syncTinyMCEInBackground(html);  // already defined in content-wp.js
```

### 7e. Publish Date — Classic Editor
Inputs: `#mm` `#jj` `#aa` `#hh` `#mn`. Toggle visible with `a.edit-timestamp` → commit with `a.save-timestamp`. Already implemented in `fillPublishDate`. Just pass `{ year, month, day, hour, minute }`.

For blog posts the team uses **8:00 AM** (verify with stakeholder; videos use 5:00 AM).

### 7f. Category path — parent → child
`fillCategoryPath(['Funeral', 'Blogs'])` already walks the WP `#categorychecklist` looking for top-level "Funeral", then descends into its `<ul class="children">` for "Blogs". Reuses `tickCheckboxForAcf` which does a thorough event sequence (mousedown → mouseup → label click → fallback to input click → forced `.checked = true`). The retoggle retry handles ACF timing races. **Don't re-implement** — just pass the right `categories` array in the payload.

### 7g. Author dropdown
`setAuthor('Welton Hong')` waits up to 10s for `#post_author_override`, matches by display name (exact first, then contains). The team needs the Author meta box enabled in **Screen Options** for this to work; the script surfaces a clear failure message otherwise. Already implemented.

### 7h. Progress panel UI
The existing `createProgressUI` shows a per-step panel top-right. Reuse it. Just add a `seoTitle` step alongside `meta`.

---

## 8. Patterns to port FROM `docx-batch-to-wordpress.html`

Read that file end-to-end. The functions you need to port into `sidepanel.js`:

| Function | Purpose | Roughly at line |
|---|---|---|
| `SITES` constant | Site → topic → category mapping | ~554 |
| `parseFromHtml(html, filename)` | Extracts date, title, body, h2 list, SEO title, meta description from a `.docx`-derived HTML string | ~634 |
| ZIP unpacking | Uses JSZip to walk the archive | search for `JSZip` |
| `mammoth.convertToHtml(...)` calls | `.docx` → HTML | search for `mammoth` |
| Pairing `.docx` ↔ image | Matches a featured image to each post by filename date prefix | search for `.jpg` / `pair` |
| Auto-detect site/topic from ZIP filename | look at how `SITES.aliases` is used | search for `aliases` |

You don't need the quality-check / grammar-check pieces. Just the parse + pair + extract path.

---

## 9. External libraries

`docx-batch-to-wordpress.html` loads from CDN:
- `https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js`
- `https://unpkg.com/jszip@3.10.1/dist/jszip.min.js`

In a Chrome extension, CSP rules for **page-context scripts** are stricter. You have two choices:

**Option A (simpler):** Download those two files into `extension/vendor/` and reference them locally in `sidepanel.html`:
```html
<script src="vendor/mammoth.browser.min.js"></script>
<script src="vendor/jszip.min.js"></script>
```

**Option B:** Add `web_accessible_resources` for them. More work, no real benefit.

Go with Option A.

---

## 10. Build plan (suggested order)

1. **Read `extension/content-wp.js` end to end** so you understand the existing patterns. Don't skip this.
2. **Read `docx-batch-to-wordpress.html`** end to end. Note the `SITES` array, `parseFromHtml`, and the ZIP-walking code.
3. **Add SEO Title fill to `content-wp.js`:**
   - Write `fillYoastSeoTitle(value)` modeled on `fillYoastMetaDesc`.
   - Add a `seoTitle` step to `fillPost`'s progress panel.
   - Fire it after meta description (or wherever order makes sense).
4. **Download `mammoth.browser.min.js` and `jszip.min.js`** into `extension/vendor/`.
5. **Add a mode toggle to `sidepanel.html`** ("Video Posts" / "Blog Posts" tabs at the top).
6. **Add the Blog Posts UI:**
   - Dropzone / file picker for ZIP upload
   - Site + topic selector (use `SITES` from the docx-batch tool)
   - Post cards rendered after parsing
   - Each card has the same "Fill This Post" button pattern
7. **Port the ZIP parser** from `docx-batch-to-wordpress.html` into `sidepanel.js`. Drop the quality-check pieces.
8. **Wire the Fill button** to dispatch a `RRM_FILL_POST` message with the new payload including `seoTitle` and the right `categories` for the selected site+topic.
9. **Test on RRM@home, SCMM, RRM (Funeral), Hospice.** Verify each field populates. Confirm Funeral nested category works (`["Funeral", "Blogs"]`).
10. **Manifest version bump** to 0.5.0 and update the `README.md` in `extension/`.

---

## 11. Pitfalls to skip (we've already burned hours on these)

- **TinyMCE waiting blocks everything.** Don't `await` TinyMCE mount. Write the textarea, fire-and-forget the sync. Pattern in `syncTinyMCEInBackground`.
- **Yoast meta description isn't a textarea anymore.** `.value =` does nothing. Use `execCommand('insertText')` on the Draft.js contenteditable.
- **ACF location rules can lag.** Not relevant for blog posts (no ACF YouTube field). If your blog posts also have an ACF field tied to category, see how `fillAcfYoutubeId` + the retoggle retry handles it.
- **Programmatic `cb.click()` may not fire all events that ACF or some plugins need.** `tickCheckboxForAcf` already handles this — full mouse sequence + jQuery trigger fallback. Don't simplify it.
- **Category names are case-sensitive in the WP DOM but our matcher is case-insensitive** (`.toLowerCase()`). Keep it that way.
- **Cross-tab payload race.** When a YT-tool button opens a new tab, payloads stashed in `chrome.storage.local` self-destruct after 60s. For the side panel (which sends via `chrome.runtime.sendMessage` to the active tab), there's no expiry — the message either reaches `content-wp.js` immediately or fails synchronously.
- **Manifest reload.** Any change to `manifest.json` requires hitting the refresh icon in `chrome://extensions` AND reloading any open WP tabs.

---

## 12. Quick reference — current payload contract

The message `content-wp.js` listens for:

```js
chrome.runtime.sendMessage(tabId, {
  type: 'RRM_FILL_POST',
  payload: {
    title:       'Increasing Google Maps Visibility for Flooring Companies',
    content:     'Para one.\n\nPara two.',                  // plain text with \n\n between paragraphs
    metaDesc:    '120-160 char SEO meta description.',
    seoTitle:    'SEO title 50-60 chars',                   // NEW — add to content-wp.js
    author:      'Welton Hong',
    publishDate: { year: 2026, month: 5, day: 4, hour: 8, minute: 0 },  // 8 AM for blogs
    categories:  ['Funeral', 'Blogs']                       // or just ['Blogs']
  }
});
```

The response: `{ ok: true, status: {...} }` or `{ ok: false, error: '...' }`.

---

## 13. Done definition

- [ ] `extension/content-wp.js` fills SEO Title via Draft.js.
- [ ] Side panel has a Video / Blog mode toggle.
- [ ] Blog mode accepts ZIP upload, parses every `.docx`, renders one card per post.
- [ ] Each card's "Fill This Post" button populates Title, Date, Content, SEO Title, Meta Description, Author, Category on the active WP tab.
- [ ] All four niche sites tested (RRM@home, SCMM, RRM Funeral with nested category, Hospice).
- [ ] Manifest version bumped, `extension/README.md` updated, brief note in repo `README.md` about the new mode.

---

## 14. Things to ask the human if unclear

- The exact time-of-day for blog publish dates (this brief assumes 8:00 AM — confirm).
- Whether to auto-detect the niche from the ZIP filename, or require the user to pick from a dropdown each time. (`docx-batch-to-wordpress.html` does both — defaults to auto-detect with a manual override dropdown.)
- Whether blog posts have a featured image step (the ZIPs include paired images). Right now this brief assumes the user uploads the image manually post-fill, same as the video tool. If they want auto-upload, that's a follow-up phase using the WP REST media endpoint (out of scope for this iteration).
- Author meta box: same default of "Welton Hong"? Or a different author for blog posts?

---

End of brief. Good luck.
