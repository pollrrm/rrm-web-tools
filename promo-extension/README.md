# RRM Promo Helper (browser extension)

Side-panel Chrome extension for posting the **homepage promo** on RRM and SCMM. Paste the promo request email → it parses the fields → fills the **real WPBakery "Solo Promo" row** (your exact shortcodes, only the per-promo values swapped) → copy it or auto-fill it into the homepage editor. The promo **auto-shows on its start date and removes itself after the end date** with no plugin.

Independent of the RRM Training / Blog / Video helpers (distinct message type `RRM_PROMO_FILL`).

## Install (unpacked)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this `promo-extension/` folder.
3. Pin it, then click the icon (sky-blue **P**) on any tab to open the side panel.

## One-time setup per site (the scheduler)

The scheduler is generic and lives on the page **once**:

1. Edit the homepage → add a WPBakery **Raw HTML** element (bottom of the page is fine).
2. Copy the **Scheduler snippet** from the side panel (under "One-time setup") and paste it in. Save.

It hides every promo row by default and shows one only while the current **Pacific / Los Angeles** time (the site's timezone) is inside the window encoded in that row's `el_class` (`rrmPromoSched rrmS<YYYYMMDDHHMMSS> rrmE<YYYYMMDDHHMMSS>`). The window is precise **to the second** (set start/end times in the panel); a date-only window pads to `00:00:00` → `23:59:59` for whole-day scheduling, and it re-checks every second. Because it runs in the browser, page caching can never keep an expired promo visible.

## Posting a promo

1. Open the side panel, paste the email, click **Parse**, then pick the **slot** — `Solo Promo`, `Solo Promo 2`, or `Dual Promo`. Parse auto-picks Solo vs Dual; use the tabs to choose between the two solo slots.
2. Fix anything the parser missed (dates are editable) and add the **Media Library image ID(s)** — WPBakery's `vc_single_image` needs the ID, not a URL. Find it in Media Library (the `item=` / `post=` number in the URL).
3. Either:
   - **Copy** the row and paste it over that slot's row in the homepage (switch WPBakery to **Classic Mode** so you're editing the shortcode source), **or**
   - with the homepage page editor open (Classic Mode), click **Fill the homepage** — it finds the chosen slot's `row_title="…"` row and swaps it in place. Review, then **Update**.
4. Clear the site/page cache once after updating.

### Just the schedule class (manual edits)

If you're editing a WPBakery row by hand instead of pasting a whole generated row, use the **Schedule class only** section: set Start/End and it outputs the `el_class` value (`rrmPromoSched rrmS<…> rrmE<…>`). Paste it into the row's **Extra class name** field (Row settings → General). The row still needs the one-time scheduler snippet installed on the page. Leaving a date blank makes that end open (start-only = "show from then on"; none = always show).

### The three slots & `disable_element`

The homepage keeps three prebuilt promo rows, identified by `row_title`: **Solo Promo**, **Solo Promo 2**, and **Dual Promo**. Historically the team shows/hides each by toggling WPBakery's `disable_element="yes"` by hand.

The extension replaces the manual toggle with date scheduling: the row it outputs is **enabled** (no `disable_element`) and carries its window in `el_class`, so the one-time scheduler shows it only on its dates. `disable_element="yes"` still works as a **manual hard-off** — a disabled row is stripped from the page entirely, so JavaScript can't schedule it; only use it when you want a slot dark regardless of dates. To hand a slot back to date-scheduling, re-enable it (the extension's output already is).

### Testing from another timezone

The window is evaluated in **Pacific / Los Angeles time** — the visitor's device clock converted to `America/Los_Angeles` (the site's timezone), *not* local time — so it behaves identically for a viewer in Manila or Los Angeles. Since "now in LA" can be ~15 h behind your local clock (PH), the panel shows a live **Now in LA** readout and a **Test: now → +5 min** button that sets the window to the current LA instant through five minutes later. Paste that row (with the scheduler installed) and the promo appears immediately, then hides ~5 minutes later — no timezone math needed.

You can post days early — the row stays hidden until its start date, then removes itself after the end date. No return trip to take it down.

### Recognized labels (parser)

The parser is **keyword-based and prefix-tolerant** — it reads the text before each `:` and classifies it by the keyword it contains, so `Solo CEM Headline:`, `Dual Headline:`, and `Title:` all map to the same field. It doesn't need an exact label.

| Field | Label contains any of |
|-------|-----------------------|
| Schedule | `posting schedule`, `schedule` |
| Title | `headline`, `title` |
| Date line | `date`, `time`, `details`, `when` |
| Description | `body`, `description`, `copy` |
| Link | `link`, `url` (a line starting with `Add…` is ignored as an instruction) |
| CTA button | `cta`, `button` |

Template is **Single** unless the email says "Dual" (or carries two links). Everything parsed is editable in the panel before you build the row, so an odd label just means one quick manual fix rather than a failed parse. To teach it a brand-new keyword, edit `classifyLabel()` in `sidepanel.js`.

## How the output is built

- **Template = your real shortcodes.** Only Title, Date line, Description, Image ID, Link, and CTA are tokenized; fonts, `vc_custom_*` spacing IDs, the hidden "Next Workshop" eyebrow, and `rrmButtonStyle1` are reused verbatim, so it renders identically to a hand-built promo.
- **Both link encodings** are produced from one URL: `vc_single_image link=""` gets the raw URL with `&amp;`; `vc_btn link=""` gets `url:<percent-encoded>|target:_blank`.
- **Scheduling** is data-driven via the row's `el_class` — no per-promo script, no base64.

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 config — side panel, host permissions, content script on `post.php` |
| `background.js` | Opens the side panel on toolbar click |
| `sidepanel.html` / `sidepanel.js` | The UI: parse → editable fields → build row → copy / fill |
| `content-wp.js` | On the page editor: finds `row_title="…"` and replaces only that row in `#content` |

## Status / notes

- All three slot templates (`Solo Promo`, `Solo Promo 2`, `Dual Promo`) are byte-verified against the live homepage source — each reproduces that slot's own `vc_custom_*` spacing IDs and `row_title`.
- Slots are defined in the `SLOTS` map in `sidepanel.js` (row title + the 3 spacing IDs per solo slot). If the team restructures a slot's design on the live page, update its template/IDs there so the next swap doesn't revert the change.
- Auto-fill works on the Classic Mode `#content` source. In **Backend Editor** mode WPBakery doesn't keep `#content` in sync, so switch to Classic Mode before **Fill** (or just use **Copy**).
- To add a third site later: add it to `host_permissions` + `content_scripts.matches` in `manifest.json` and to the `SITES` array in `sidepanel.js`.
