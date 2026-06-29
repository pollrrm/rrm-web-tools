# RRM Web Support Tools

Browser-based utilities built by the Ring Ring Marketing Web Support team to speed up routine website tasks. Each tool is a **single self-contained HTML file** — no install, no build step, no server. Open the live URL (or the file directly) and use it.

**Live site:** `https://pollrrm.github.io/rrm-web-tools/`

---

## Tools at a glance

| Tool | Purpose | When to use |
|------|---------|-------------|
| [YT Thumbnail Downloader](#1-yt-thumbnail-downloader) | Bulk-extract YouTube thumbnails + post fields from the video posting task email | Weekly video blog posting (3-4 posts per niche site) |
| [DOCX Batch → WordPress](#2-docx-batch--wordpress) | Convert a site's monthly ZIP of `.docx` articles into WordPress-ready posts with paired featured images and quality checks | Monthly blog batches per site |
| [PDF Tools](#3-pdf-tools) | Two-tab tool: convert PDF pages to JPG, or edit a PDF's metadata (title, author, keywords, dates, etc.) | Pulling page-images out of brochures, or fixing a PDF's properties before posting |
| [DOCX Link Extractor](#4-docx-link-extractor) | List every hyperlink in a Word doc, then cross-check & auto-update the links in your WordPress source against it | Auditing a coach-supplied doc's links and bringing a live WP post's links up to date |

All processing is **client-side**. Files, pasted content, and downloads never leave your browser.

---

## 1. YT Thumbnail Downloader

**File:** [`yt-thumbnail-downloader.html`](./yt-thumbnail-downloader.html)
**SOP:** RRM Video Posting

### What it does

Paste the full task email and the tool will:

- Split posts by **industry** (Funeral Homes, Home Improvement, Home Care, Hospice, etc.) using the section headers in the email.
- Extract the **YouTube ID**, **posting date**, **video title**, and **post content** for each video.
- Auto-fetch the `hqdefault.jpg` thumbnail and rename it to `{Video Title}-thumb.jpg` per the SOP (Windows-illegal characters stripped).
- Provide **one-click Copy buttons** for every field: YT ID, Date, Title, and Content — ready to paste straight into the WordPress post editor.
- Group results visually by industry with a video count per group.

### Workflow

1. Open the tool. Bulk mode is the default.
2. Paste the entire video posting task email into the textarea.
3. Click **Extract All Thumbnails**.
4. Spot-check each card's thumbnail preview. If the YouTube auto-thumbnail isn't the custom-designed graphic from the team, follow the SOP — request the proper graphic from the requester and skip that one.
5. Click **Download Thumbnail** on each card (or **Download All** to grab them in one go).
6. Move to WordPress. For each post, copy the four fields in turn (YT ID, Date, Title, Content) and paste them into the matching post editor fields. Set time to 5:00am per the SOP.

### Edge cases handled

- Email content with hashtags is auto-stripped per the SOP.
- Industry detection falls back to URL slug matching (`funeral/`, `rrmathome`, `seniorcaremarketingmax`, `hospice`) if the section header is missing or unrecognized.
- "Single" mode is available for one-off thumbnails when there's no email to paste.

---

## 2. DOCX Batch → WordPress

**File:** [`docx-batch-to-wordpress.html`](./docx-batch-to-wordpress.html)
**SOP:** Monthly Blog Posting

### What it does

Drop a site's monthly ZIP and the tool will:

- Unzip the file in-browser (no server upload).
- Walk the contents and pair each `.docx` with its featured image. Two layouts are supported:
  - **Nested:** each post in its own folder (`5.4/`, `5.11/`, …).
  - **Flat:** all `.docx` and `.jpg` files in one folder, paired by date prefix in the filename (`5.4 ...docx` ↔ `... 05.04.jpg`).
- Auto-detect the target **site** and **topic** from the ZIP filename and inner paths. Override with the dropdowns at the top at any time.
- Sort posts by publish date (parsed from the docx and the filename).
- Render one expandable card per post with thumbnail, date, title, paired filenames, and a quality-check badge.

### Site and topic mapping

| Site | Topic | WordPress category |
|------|-------|--------------------|
| RRM@home | Flooring | Blogs |
| RRM@home | HVAC | Blogs |
| RRM@home | Windows and Doors | Blogs |
| RRM | Funeral | Funeral > Blogs |
| RRM | Cemetery | Cemetery > Blogs |
| SCMM | Home Health | Blogs |
| SCMM | Home Care | Blogs |
| Hospice | Hospice | Blogs |

The mapping lives at the top of the `<script>` block in `docx-batch-to-wordpress.html` (the `SITES` array). Update it there if sites or categories change.

### Per-post fields

Expand a card to get five copy-able fields, color-coded for quick visual identification:

| Field | Color | Where it goes in WordPress |
|-------|-------|----------------------------|
| Date | Blue | Post → Status & visibility → Publish |
| WordPress Title | Purple | Post title field (becomes the H1) |
| SEO Title Tag | Orange | Yoast SEO title |
| Meta Description | Cyan | Yoast meta description |
| HTML Content | Green | Block Editor → ⋮ menu → Code editor (or an HTML block) |

The HTML field is editable — tweak it before copying if needed.

### Quality Check

Each card has a **Run check** button. There's also a **Run Quality Check on All** button at the top that walks the queue with a small delay between posts to stay polite to the LanguageTool API.

Three categories of checks:

1. **Format & Accessibility** — missing image `alt`, broken heading hierarchy (e.g. H2 → H4), empty headings, empty links, deprecated tags, unbalanced HTML tags.
2. **Consistency** — list-item ending punctuation, label formatting (e.g. `Quick Tip:` bolded inconsistently across the post), heading number prefix style (e.g. one heading uses `10 ` instead of `10.`).
3. **Grammar & Spelling** — via the public LanguageTool API.

Issues with an **Apply Fix** button can be resolved with one click. The fix updates the HTML field in place; the live preview updates with it.

### Word document format

The tool assumes the structure used by our content team:

```
5.4                                                    ← date hint (M.D)

Increasing Google Maps Visibility for Flooring Companies   ← bold, becomes the WP Title

[intro paragraphs]

1. First Section Heading                                   ← bold + numbered
[section paragraphs and bulleted lists]

2. Second Section Heading
...

Conclusion                                                 ← bold, no number
[concluding paragraphs]

Word Count: 1,911                                          ← marks the end of the body

SEO Title Tag: Your SEO title here
Meta Description: Your meta description here

Target Keywords
- keyword 1
- keyword 2
...

H Tags Used                                                ← source of truth for H2s
- H1: The Title
- H2: First Section Heading
- H2: Second Section Heading
- ...
- H2: Conclusion
```

Notes:

- The first short line (`5.4`) is parsed as the publish date hint (May 4 of the current year).
- The first fully bold paragraph after that is the WordPress title.
- The body ends at the `Word Count` line — everything below is metadata used to build the output, not content.
- The **H Tags Used** list is the source of truth for which body paragraphs become `<h2>`. Both `<ul>` and plain `<p>` formats are supported.
- If the H Tags Used list is missing, the parser falls back to heuristics: numbered prefixes (`1. `, `2. `, …) and known section labels (`Conclusion`, `Introduction`, `Summary`, `FAQ`, etc.).

### What the parser cleans up automatically

- **Spacing before each `<h2>`** — an empty `<p>&nbsp;</p>` is inserted for visual breathing room between sections in WordPress.
- **Word "Editor" / Smart Lookup anchor tags** — empty `<a>` tags with no `href` (e.g. `<a id="_Int_xyz"></a>`, `<a id="_Hlk..."></a>`) are stripped. Real hyperlinks are preserved.
- **Numbered heading lookup** — when matching body headings against the H Tags Used list, the parser tolerates various number prefix styles (`1.`, `1)`, `1:`, or just `1 ` for typo cases).

### Known limitations

- **LanguageTool free API** is rate-limited at roughly 20 requests per minute. The batch tool spaces requests when running checks on all posts in a batch.
- **ZIPs over ~50 MB** may take a few seconds to unpack in-browser.
- **Inline Word images** aren't preserved by Mammoth (the `.docx` parser). Featured images come from the JPG/PNG files alongside the `.docx` in the ZIP — matches our content team's workflow.
- The site/topic mapping is hard-coded. To add a site, edit the `SITES` array near the top of the `<script>` block.

---

## 3. PDF Tools

**File:** [`pdf-to-jpg.html`](./pdf-to-jpg.html) (URL preserved for backward compatibility)
**SOP:** Ad-hoc — image extraction and metadata editing for PDFs

Upload a PDF once at the top, then use either of the two tabs below.

### Tab A — Convert to JPG

- Render any subset of pages to a canvas in-browser via [PDF.js](https://mozilla.github.io/pdf.js/).
- **Select pages** with a flexible range expression: `all`, `1,3,5`, `5-8`, or a mix (`1,3,5-8,12`). Quick pills for *All*, *Odd*, *Even*, and *First page only*.
- **Draw a crop rectangle** on a live preview of the first selected page. The crop is stored as a fraction of the page so the **same crop applies to every selected page** (useful when every page has the same layout — e.g. trimming margins off a multi-page brochure).
- **Resize** the output via a *Max Width (px)* cap (aspect ratio preserved).
- Tune **JPG quality** (10–100, default 85) and **render scale** (1×–4×, default 2× — higher means sharper source render before resize).
- Output one JPG per page, named `{pdf-name}-page-{NN}.jpg` with zero-padded numbering.
- Download images individually or grab everything as a single **ZIP**.

**Per-setting guidance**

| Setting | Default | When to change |
|---------|---------|----------------|
| JPG Quality | 85 | Bump to 95+ for print/zoomable use. Drop to 60–70 to shrink file size for fast-loading web galleries. |
| Render Scale | 2× | Raise to 3–4× if the PDF has fine type or detailed graphics you want crisp. Lower to 1× for quick previews. |
| Max Width | (none) | Set to `1920` (or whatever your CMS expects) to keep file sizes web-friendly without losing too much detail. |
| Crop | (none) | Set when every page has the same layout and you want to strip margins, headers, or footers uniformly. |

### Tab B — Edit Metadata

Powered by [pdf-lib](https://pdf-lib.js.org/). After upload, every editable field is pre-filled with the PDF's current value. Editable fields:

- **Title**, **Author**, **Subject**, **Keywords** (comma-separated)
- **Creator** (the app that authored the source content) and **Producer** (the app that wrote the PDF file)
- **Creation Date** and **Modification Date** (each with a *Now* button)

**Save & Download** writes a new PDF named `{pdf-name}-edited.pdf` — the original file on disk is never modified. **Reset to Original** reverts all fields to the values read at upload time.

### Notes

- All processing is **client-side** — the PDF never leaves the browser. PDF.js, JSZip, and pdf-lib are loaded from CDN.
- A white background is painted under transparent PDF pages on JPG export (no alpha).
- Cropping is per-document, not per-page. If pages have different layouts and you need different crops, run the tool once per page group.
- Empty metadata fields are written as empty strings — they won't carry over the original value. To leave a field unchanged, don't clear it before saving.

---

## 4. DOCX Link Extractor

**File:** [`docx-link-extractor.html`](./docx-link-extractor.html)
**SOP:** Ad-hoc — link auditing / migration

### What it does

Drop a Word `.docx` and the tool will:

- Unzip the file in-browser (no server upload) and parse the raw OOXML.
- Pull every hyperlink — the **linked text** and the **actual URL** behind it — from the body, **headers, footers, and footnotes/endnotes**.
- Tag each link **External**, **Email** (`mailto:`), or **Internal** (a bookmark/anchor within the doc).
- Show a running count of total links and unique URLs.
- Filter the list by linked text or URL, **copy as Markdown** (`[text](url)`), **copy the table** (TSV, pastes straight into Sheets/Excel), or **download a CSV**.

### Workflow

1. Open the tool. Click **Choose a .docx** or drag the file onto the drop zone.
2. The table fills in immediately. Use the filter box to find a specific link or domain.
3. Export however you need it — Markdown for a quick reference, CSV/TSV for a spreadsheet audit.

### How it reads links

- Catches the standard `w:hyperlink` encoding (the common case) and resolves each `r:id` against the part's `.rels` file for the real target URL.
- Also scans `HYPERLINK` field-code instructions as a fallback (older docs / mail-merge output); these show up labelled `(field-code link)` since the display text can't always be matched back to the URL.

### Per-row copy

Each table row has a **Copy** button beside the linked text and another beside the URL, so you can copy one field at a time — handy for locating a phrase on the target platform, then grabbing its URL.

### Compare & update links (against a WordPress post)

Below the table is a **Compare & update links** panel. The dropped document is treated as the *source of truth* for correct links. Paste your existing WordPress content (Code editor / WPBakery source — it must contain the actual `<a href="…">` tags) and click **Compare links**. The tool will:

- Match each WP link to a document link **by its visible words**, aligning repeated phrases (e.g. several "Read the article." links) in **document order**.
- Flag each WP link as **Up to date**, **Needs update** (URL differs from the doc), or **No match** (phrase not found in the doc — left untouched).
- Let you apply fixes **one at a time** (per-row *Update* / *Undo*) or **all at once** (*Update all* / *Undo all*).
- Rewrite only the `href` values in your pasted source — shortcodes, formatting, and everything else are preserved byte-for-byte — and output the updated content for you to copy back into WordPress.
- List any links that are in the document but weren't found in the pasted content, so you can check them manually.

Workflow: extract the doc's links → paste the current WP source → **Compare** → review the flagged rows → **Update all** (or pick individually) → **Copy updated content** → paste back into the WP editor and save.

### Notes / limitations

- `.docx` only — a legacy `.doc` must be re-saved as `.docx` in Word first (the tool tells you if you drop the wrong type).
- Internal anchors render as `#bookmark` and aren't clickable (they point inside the document, not the web).
- Field-code links report the URL reliably but their linked-text column is best-effort.
- **Matching is by linked text.** If the WP anchor text was reworded so it no longer matches the doc, that link shows as *No match* and is left for you to handle — by design, nothing is changed unless the words line up.
- URL comparison is exact, so `…/page` and `…/page/` (trailing slash) count as different and will be flagged for update.

---

## How to use (team)

1. Visit the **Live site** URL above.
2. Click the tool you need.
3. Each tool has its inputs and a short usage blurb at the top of the page.

Everything runs **client-side in your browser**. Files, pasted content, and generated downloads never reach any server.

**Browser support:** recent Chrome, Edge, Firefox, or Safari.
**Internet required only for:** LanguageTool grammar checks (DOCX tool) and YouTube thumbnail fetches (YT tool). All parsing, ZIP unpacking, and downloads are local.

---

## Adding a new tool

The repo is designed to grow as we automate more SOPs.

1. Build a single self-contained `.html` file. Use inline CSS/JS or load libraries from CDNs via `<script src="...">`. **No build step.**
2. Place the file at the repo root (or in a subfolder if it has multiple assets like images).
3. Add an entry under [Tools at a glance](#tools-at-a-glance) and a full section in this README — describe what it does, when to use it, and any edge cases.
4. Link the new tool from `index.html` so it appears on the landing page.
5. Commit and push to `main`. GitHub Pages redeploys automatically (typically within 30 seconds).

### Conventions

- **File naming:** kebab-case, descriptive (`yt-thumbnail-downloader.html`, not `tool1.html`).
- **Client-side only:** no API keys, no backend services. If a workflow needs server-side logic (sending email, hitting a private API, scheduled execution), build it in **n8n** instead and link to that workflow from here.
- **Consistent themeable look** so the team gets a familiar UX. Every tool ships a sun/moon toggle (top-right) that swaps between dark and light. State persists in `localStorage` under `rrm-tools-theme` and falls back to the OS `prefers-color-scheme` on first visit.
  - Use CSS custom properties (variables) for every color, not hardcoded hex values. The standard token set per tool:
    - `--bg`, `--panel`, `--panel-2` (or `--panel2`) — surfaces
    - `--border`, `--border-strong` — outlines
    - `--text`, `--text-muted`, `--text-dim` (or `--muted`) — type
    - `--accent`, `--accent-hover` — primary action
    - `--ok`, `--warn`, `--error` — status
  - Inline the `<script>` that reads `localStorage`/`prefers-color-scheme` in `<head>` so the theme applies before paint (no flash of wrong theme). Inline the toggle-injection script at the end of `<body>`. Copy the snippets verbatim from any existing tool.
  - Dark palette: bg `#0f1115` · panel `#181b22` · border `#262a33` · text `#e6e6e6` · accent `#5b8def`.
  - Light palette: bg `#f5f7fa` · panel `#ffffff` · border `#e1e4ea` · text `#1a1d24` · accent `#2563eb`.
- **Document the SOP it supports.** A new tool with no clear SOP attached usually means we're solving the wrong problem.

---

## Local development

Open any `.html` file directly in a browser. Refresh to see changes — no build step.

If a tool uses `fetch` against external resources blocked by CORS, run a quick local static server:

```bash
# from the repo root
npx serve .
```

External dependencies used today (loaded from CDN, no install):

- **mammoth** — `.docx` → HTML conversion (DOCX tool)
- **JSZip** — in-browser ZIP unpacking and ZIP creation (DOCX tool, PDF → JPG tool)
- **LanguageTool public API** — grammar checking (DOCX tool)
- **PDF.js** — in-browser PDF rendering (PDF Tools — JPG mode)
- **pdf-lib** — in-browser PDF read/write for metadata edits (PDF Tools — Metadata mode)

If you need an offline build for any tool, all dependencies above can be inlined into the HTML file.

---

## Repository structure

```
rrm-web-tools/
├── index.html                       # Landing page linking to each tool
├── yt-thumbnail-downloader.html     # YT Thumbnail Downloader
├── docx-batch-to-wordpress.html     # DOCX Batch → WordPress
├── pdf-to-jpg.html                  # PDF → JPG converter
├── docx-link-extractor.html         # DOCX Link Extractor
└── README.md                        # This file
```

---

## Hosting

Hosted via **GitHub Pages** from the `main` branch root. To enable on a fresh repo:

1. Repo → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** / **(root)** → **Save**
4. Site goes live at `https://pollrrm.github.io/rrm-web-tools/` within ~30 seconds.

---

## Roadmap

### Phase 2 — Direct WordPress publishing (DOCX tool)

Replace the manual paste step with REST API calls. Planned:

- Per-site configuration screen (URL + username + Application Password), stored in the browser's `localStorage`.
- Per-card site selector with a **Schedule on \[site]** button.
- Bulk **Schedule All** across the queue, with progress and retry on failure.
- Direct upload of featured images to the WordPress Media Library.
- Yoast SEO meta fields set automatically (`_yoast_wpseo_title`, `_yoast_wpseo_metadesc`).
- Category assignment based on the site/topic mapping.

Setup requirement per site: an [Application Password](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/) (Admin → Users → Profile → Application Passwords). Built-in to WordPress 5.6+, ~2 minutes per site.

### Future tool ideas

Tools we've discussed that fit this repo:

- WordPress sitemap diff checker
- Bulk redirect tester
- Yoast/AIO meta description audit across a sitemap
- Form submission tracking sanity-checker

---

## Reporting issues

Open a GitHub issue with:

- Which tool
- Browser and version
- A short description of what happened vs. what you expected
- A screenshot if it's a UI issue
- For parsing issues: attach (or describe) the offending input file

---

## Maintainer

Web Support Team — Ring Ring Marketing.
For tool requests, bugs, or SOP updates, contact the SOP owner listed in the relevant SOP doc.

## License

Internal team tooling. Not for external redistribution.
