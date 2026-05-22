# RRM Blog Helper (Chrome / Edge Extension)

Standalone side-panel helper for prefilling **blog posts** in the WordPress Classic Editor on RRM niche sites. Independent of the **RRM WP Helper** (video) extension — both can be installed side by side and they will never interfere with each other.

Supports: **rrmathome.com**, **seniorcaremarketingmax.com**, **ringringmarketing.com**, **hospicehavenmarketing.com**.

---

## How it works

There are two ways to send a post to WordPress:

### A. Side panel (single .docx)

1. Click the extension icon → side panel opens.
2. Pick the site and topic.
3. Open `wp-admin/post-new.php` on the target site.
4. Drop a `.docx` into the dropzone.
5. Click **Fill This Post** on the parsed card → fields populate on the WP tab.

### B. DOCX Batch → WordPress tool (multiple posts)

1. Open [`docx-batch-to-wordpress.html`](https://pollrrm.github.io/rrm-web-tools/docx-batch-to-wordpress.html).
2. Pick site + topic at the top.
3. Drop the monthly ZIP.
4. Expand a post card → click **Fill on [Site] ([Topic])** → opens a new tab and fills it.

Both flows route through this extension's `content-wp.js`. They write the same fields via `RRM_BLOG_FILL_POST` (side panel) or `RRM_BLOG_SEND_TO_WP` (batch tool).

---

## What it fills

| Field | Source | WordPress target |
|---|---|---|
| Title | First bold paragraph after the date hint | `#title` |
| Publish Date | `M.D` line at top of the doc / filename | Classic Editor mm/jj/aa/hh/mn — **5:00 AM** |
| Content | Body HTML (H2 promotion from "H Tags Used") | `#content` textarea + TinyMCE background sync |
| SEO Title | `SEO Title Tag: …` line | Yoast Draft.js SEO Title field |
| Meta Description | `Meta Description: …` line | Yoast Draft.js Meta Description field |
| Author | Hard-coded `Welton Hong` | `#post_author_override` |
| Category | Per topic (e.g. `["Funeral","Blogs"]`) | `#categorychecklist` |
| Primary Category | RRM Funeral / Cemetery only | Yoast "Make Primary" link |

---

## Install (one-time, per machine)

1. Download or `git pull` this repo.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Toggle **Developer mode** ON (top-right).
4. Click **Load unpacked**.
5. Select the `blog-extension/` folder (the one containing `manifest.json`).
6. Click the extension icon to open the side panel.

You can have both extensions installed at the same time:
- **RRM WP Helper** → video posts
- **RRM Blog Helper** → blog posts

They use different message types internally, so they never interfere.

---

## Updating

Whenever you change files in `blog-extension/`:

1. Go to `chrome://extensions`.
2. Find **RRM Blog Helper** → click the refresh icon.
3. Reload any open WP and tool tabs.

---

## Why a separate extension?

The original RRM WP Helper handled video posts and worked reliably. Adding blog-post logic to the same extension created edge cases that broke video-post filling. Splitting blogs into their own extension keeps the video flow stable while blog filling can iterate independently.
