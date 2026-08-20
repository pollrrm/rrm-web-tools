# RRM Blog Batch Helper (Chrome / Edge Extension)

A **standalone** extension that fills a whole month of WordPress blog posts from a
single ZIP, in a guided, resumable walk-through. It is completely independent of
the existing **RRM Blog Helper** and **RRM WP Helper** extensions — separate
files, separate storage, separate message channel. Installing this does not touch
either of them.

---

## What it does

Drop the monthly ZIP (one `.docx` + one image per post — typically 4 or 5, one per Monday) into the side panel and it:

1. Unzips, pairs each `.docx` with its image, and parses all posts at once.
2. Runs the same **Quality Check** as the DOCX Batch web tool on every post —
   Format & Accessibility, Consistency, Structure & Pattern, and Content Parity
   vs the source `.docx` — plus parse/pairing flags: missing title / SEO title /
   meta description, no H2s, no image, and **`TOPIC_MISMATCH`** (the image
   filename names a different niche than the selected topic — e.g. a Funeral
   image on a Hospice post; the pairing is right but the source asset is wrong).
   The content HTML is **editable** in the panel, **Apply Fix** buttons apply the
   safe fixes, and your edits carry through to the WordPress fill.
3. Walks you through the posts one at a time — **Post 2 of 4** — with a **Fill
   This Post** button that fills the WordPress Classic Editor tab you have open
   (Title, Date @ 4:00 AM, Author *Welton Hong*, Yoast SEO Title + Meta
   Description, Category, and the HTML content).
4. Saves progress to the extension's own storage, so closing the browser
   mid-batch and reopening the panel **resumes where you left off**.

A single `.docx` also works as a one-post batch.

Featured-image upload is **not** included (still set manually in WP), and it does
**not** use the WordPress REST API.

---

## Install (one-time)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `blog-batch-extension/` folder.
4. Pin **RRM Blog Batch Helper** and click its icon to open the side panel.

> **Only enable one filler extension at a time.** RRM Blog Batch Helper, RRM Blog
> Helper, and RRM WP Helper all inject a content script into the WordPress post
> pages. Messages are per-extension so they won't cross wires, but if you click
> Fill in two of them they'll both write the same fields. Keep the one you're
> using enabled and disable the others.

---

## Using it

1. Pick the **Site** and **Topic** (auto-detected from the ZIP name when possible).
2. Open a **New Post** page (`post-new.php`) on that site in a normal tab — the
   panel's status line turns green when the tab is ready.
3. Drop the monthly ZIP. Review the parsed posts and any warnings.
4. For each post: click **Fill This Post**, watch the on-page progress panel,
   then Publish/Schedule in WordPress yourself. The panel advances to the next
   post automatically.
5. **Skip** defers a post; **Prev / Next** and the numbered chips jump around;
   **Clear batch** discards everything and returns to the drop screen.

---

## Files

```
blog-batch-extension/
  manifest.json     MV3; storage + sidePanel + tabs; content script on the 4 sites' post pages
  background.js     opens the side panel on toolbar-icon click
  sidepanel.html    panel UI
  sidepanel.js      ZIP unzip + pair + parse + queue + walk-through
  content-wp.js     WordPress Classic Editor filler (copied from RRM Blog Helper,
                    message type RRM_BATCH_FILL_POST so it can't collide)
  vendor/           jszip.min.js, mammoth.browser.min.js
```

The parser, the `SITES`/topic config, and the WordPress filler are **copied** from
the RRM Blog Helper extension rather than shared, so that extension is never
modified. If either is changed there in future, update the copy here to match.
