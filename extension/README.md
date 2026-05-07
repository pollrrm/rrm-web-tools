# RRM WP Helper (Chrome / Edge Extension)

Bridges the [YT Thumbnail Downloader](../yt-thumbnail-downloader.html) and the WordPress Classic Editor on RRM niche sites. Click **Send to RRM@home** on a video card → a new tab opens at the WP new-post page → title, content, SEO meta description, ACF YouTube ID, and the Videos category are prefilled, ready for review and publish.

Currently supports: **rrmathome.com** (Classic Editor + Yoast SEO + ACF).

---

## How it works

- **`content-tool.js`** runs on `pollrrm.github.io`. It listens for a `postMessage` from the tool, stashes the post payload in `chrome.storage.local`, and opens the WP new-post page in a new tab.
- **`content-wp.js`** runs on `rrmathome.com/wp-admin/post-new.php`. It reads the payload, waits for the editor to be ready, and fills the form via DOM manipulation (TinyMCE API for the body content).

No data leaves your browser. No remote server is involved.

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

Per video card on the YT Thumbnail Downloader:

1. Click **Download Thumbnail** to save the thumbnail locally (per the SOP).
2. Click **Send to RRM@home**. A new tab opens at `rrmathome.com/wp-admin/post-new.php`.
3. Wait ~1 second. You'll see fields populate:
   - **Title** — from the email
   - **Content** — paragraphs in the Visual editor
   - **Yoast Meta Description** — single-paragraph version with proper spacing
   - **ACF YouTube ID** (`youtube_id`) — the 11-char ID
   - **Videos category** — checked
   - **Author** — set to *Welton Hong* (only if the Author meta box is enabled in Screen Options)
4. Set the **Featured Image** by uploading the downloaded thumbnail.
5. Set the **Publish Date** to the email's date at **5:00 AM** per the SOP.
6. **Publish** (or save as draft for review).

---

## What it doesn't do (yet)

- **Featured image upload** — manual for now. Future: auto-fetch the YT thumbnail server-side and set as featured image.
- **Other niche sites** — only rrmathome.com is wired up. To add another (e.g., ringringmarketing.com, seniorcaremarketingmax.com, hospice site), update:
  - `manifest.json` → add the new domain to `host_permissions` and `content_scripts`
  - `content-tool.js` → add the new entry to `TARGET_URLS`
  - `content-wp.js` → adjust the category lookup, ACF field name, etc., if the target site differs
  - `yt-thumbnail-downloader.html` → add a per-industry button or a target dropdown
- **Scheduled publish date** — the SOP requires 5:00 AM on the email's date. Currently you set this manually in the editor.

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
