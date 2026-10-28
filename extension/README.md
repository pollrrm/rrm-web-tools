# RRM WP Helper (Chrome / Edge Extension)

Fills WordPress Classic Editor **New Post** pages for video posts on the RRM niche sites, from the video-posting task email.

Supports: **rrmathome.com** (Home Improvement), **seniorcaremarketingmax.com** (Home Care), **ringringmarketing.com** (Funeral Homes → `Funeral > Videos`), **hospicehavenmarketing.com** (Hospice). All use Classic Editor + Yoast SEO + ACF.

---

## How it works

- **`sidepanel.js`** (main flow) — paste the email in the side panel, Extract, then **Fill This Post** on the open New Post page. After the fill it uploads the YouTube thumbnail to the Media Library and sets it as the featured image (runs in the WP tab using WordPress's own upload nonce and your login — no passwords).
- **`content-tool.js`** runs on `pollrrm.github.io`. The YT Thumbnail Downloader's **Send to ...** buttons post a payload; this stashes it and opens the target site's new-post page. (This path does not set the featured image.)
- **`content-wp.js`** runs on the WP post editor. It leaves WPBakery Backend Editor if needed, switches to the Text view, and fills title, publish date, content, author, Yoast meta description, categories, and the ACF YouTube ID, with a step-by-step progress panel.

No data leaves your browser except the uploads to your own WordPress sites.

---

## Install (one-time)

### Chrome / Edge

1. Download or clone the [`rrm-web-tools`](https://github.com/pollrrm/rrm-web-tools) repo to your computer.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked**.
5. Select the `extension/` folder inside the repo (the one containing `manifest.json`).
6. The extension shows up as **RRM WP Helper**. Pin it to the toolbar if you want easy access (optional).

### Verify it's working

1. Open the [YT Thumbnail Downloader](https://pollrrm.github.io/rrm-web-tools/yt-thumbnail-downloader.html).
2. You should see a green banner at the top: *"RRM WP Helper detected."*
3. Paste a sample email and click **Extract All Thumbnails** — each card should now have a purple **Send to RRM@home** button.

---

## Using it

1. Click the extension icon to open the side panel, paste the task email, click **Extract**.
2. Open a **New Post** page on the matching site (the niche dropdown auto-switches to it).
3. Click **Fill This Post** and wait for **Filled ✓**. The progress panel fills: editor mode, title, publish date (email date, 5:00 AM), content, author, Yoast meta description, categories, ACF YouTube ID, featured image.
4. Review, then **Publish** (or save as draft).

### Featured image safeguards

- If the post already has a featured image, it is left alone (a second Fill on the same post won't upload again).
- Uploaded attachment IDs are remembered per site + video. Filling the same video again reuses that upload, after checking it still exists in the Media Library, instead of adding a duplicate.
- If the step fails, use **Download Thumbnail** and upload it by hand.

---

## What it doesn't do

- **Publish** — always reviewed and published by hand.
- **Featured image from the YT tool's Send buttons** — only the side panel flow sets it.

---

## Troubleshooting

**"Send to RRM@home" button is grayed out**
The extension isn't detected. Confirm it's installed and enabled at `chrome://extensions`. Reload the YT tool page.

**New tab opens but nothing fills in**
- Open DevTools on the WP new-post tab → Console. Look for any errors.
- Confirm the editor is **Classic Editor**, not Block Editor (Gutenberg). If WP is in Gutenberg mode, the script won't find `#title` or TinyMCE the same way.
- Confirm the ACF field's slug is exactly `youtube_id` (ACF → Field Groups → look at the Name column). If it changed, update the selector in `content-wp.js`.

**Yoast meta description didn't fill**
Yoast's input has the ID `yoast_wpseo_metadesc`. If your version uses a different ID, inspect the input element and update `content-wp.js`.

**Author doesn't switch to Welton Hong**
Open the post editor → top-right → **Screen Options** → check **Author**. The dropdown will appear and the script will set it on the next send.

**The payload expired**
If you wait more than 60 seconds between clicking Send and the WP page loading, the payload self-destructs (security guard). Just click Send again.

---

## Updating the extension

After changing any file in `extension/`:

1. Go to `chrome://extensions`.
2. Find **RRM WP Helper** → click the refresh icon.

Reload any open WP / tool tabs to pick up the new content scripts.

---

## Distributing to the team

For now: each team member follows the install steps above with the unpacked folder.

When the extension stabilizes, package it for the Chrome Web Store as **Unlisted** (~$5 one-time developer fee on the team's Google account). Team members get a clean install link, auto-updates included.
