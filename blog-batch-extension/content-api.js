// RRM Blog Batch Helper — WordPress REST API sender.
// Runs on the same WP post pages as content-wp.js, but never touches the
// editor. The side panel sends one RRM_BATCH_API_CREATE message per post and
// this script creates the post through the site's REST API, using the
// logged-in user's session (cookie + REST nonce) — no Application Passwords.
//
// Requires the "RRM - Yoast fields in REST API" snippet on the site, which
// registers the Yoast meta for REST: _yoast_wpseo_title / _yoast_wpseo_metadesc /
// _yoast_wpseo_primary_category plus the Social/X image keys
// (_yoast_wpseo_opengraph-image[-id], _yoast_wpseo_twitter-image[-id]).
// Without it WordPress silently ignores those fields.
//
// Uses /index.php?rest_route= rather than /wp-json/ because rrmathome.com
// returns an empty response on the pretty /wp-json/ route.
//
// Order per post:
//   1. Duplicate check by exact title — an existing post is reported, not re-created
//   2. Resolve category path names → IDs (parent + child; WP doesn't auto-tick parents)
//   3. Resolve author display name → user ID
//   4. Upload the featured image
//   5. Create the post as a DRAFT with every field
//   6. If Scheduled was requested, switch to 'future' only when WordPress's own
//      date_gmt is in the future. A past date would make WP publish immediately,
//      so those stay Draft and are flagged.

const API_BASE = location.origin + '/index.php?rest_route=';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'RRM_BATCH_API_CREATE' || !msg.payload) return;
  createPostViaApi(msg.payload).then(sendResponse, (err) => {
    console.error('[RRM Blog Batch] API create failed:', err);
    sendResponse({ ok: false, error: err.message || String(err) });
  });
  return true; // keep the message channel open for async response
});

async function getNonce() {
  const res = await fetch('/wp-admin/admin-ajax.php?action=rest-nonce', { credentials: 'same-origin' });
  const nonce = (await res.text()).trim();
  if (!/^[a-f0-9]{10}$/.test(nonce)) throw new Error('Not logged in to WordPress on this site');
  return nonce;
}

async function api(nonce, path, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { 'X-WP-Nonce': nonce, ...headers },
    body,
    credentials: 'same-origin'
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const why = (data && (data.message || data.code)) || `HTTP ${res.status}`;
    throw new Error(`${method} ${path.split('&')[0]} — ${why}`);
  }
  return data;
}

// REST returns names HTML-encoded ("Windows &amp; Doors").
function decodeEntities(s) {
  const ta = document.createElement('textarea');
  ta.innerHTML = s || '';
  return ta.value;
}
const sameName = (a, b) => decodeEntities(a).trim().toLowerCase() === String(b || '').trim().toLowerCase();

async function resolveCategoryPath(nonce, names) {
  const ids = [];
  let parent = 0;
  for (const name of names) {
    const list = await api(nonce, `/wp/v2/categories&parent=${parent}&per_page=100&_fields=id,name`);
    const hit = list.find(c => sameName(c.name, name));
    if (!hit) {
      throw new Error(`Category "${name}" not found${ids.length ? ` under "${names[ids.length - 1]}"` : ' at top level'}`);
    }
    ids.push(hit.id);
    parent = hit.id;
  }
  return ids;
}

async function resolveAuthor(nonce, name) {
  const list = await api(nonce, `/wp/v2/users&search=${encodeURIComponent(name)}&per_page=20&_fields=id,name`);
  const hit = list.find(u => sameName(u.name, name));
  if (!hit) throw new Error(`Author "${name}" not found`);
  return hit.id;
}

async function findExistingByTitle(nonce, title) {
  const list = await api(nonce,
    `/wp/v2/posts&search=${encodeURIComponent(title)}&status=publish,future,draft,pending,private&context=edit&per_page=20&_fields=id,title,status,date`);
  return list.find(p => decodeEntities((p.title && p.title.raw) || '').trim() === title.trim()) || null;
}

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function uploadImage(nonce, image) {
  const blob = dataUrlToBlob(image.dataUrl);
  // Header values must be plain ASCII — strip anything else from the filename.
  const safeName = image.name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'featured.jpg';
  const media = await api(nonce, '/wp/v2/media', {
    method: 'POST',
    headers: { 'Content-Disposition': `attachment; filename="${safeName}"`, 'Content-Type': blob.type },
    body: blob
  });
  return { id: media.id, url: media.source_url };
}

const editUrl = (id) => `${location.origin}/wp-admin/post.php?post=${id}&action=edit`;

// payload: { title, content, seoTitle, metaDesc, authorName, categoryPath,
//            primaryCategory, date: 'YYYY-MM-DDTHH:MM:SS' (site time),
//            status: 'future' | 'draft', image: { name, dataUrl } | null }
async function createPostViaApi(p) {
  const nonce = await getNonce();

  const existing = await findExistingByTitle(nonce, p.title);
  if (existing) {
    return { ok: true, duplicate: true, id: existing.id, status: existing.status, date: existing.date, editUrl: editUrl(existing.id) };
  }

  const categories = await resolveCategoryPath(nonce, p.categoryPath);
  const primaryIdx = p.primaryCategory ? p.categoryPath.findIndex(n => sameName(n, p.primaryCategory)) : -1;
  if (p.primaryCategory && primaryIdx < 0) throw new Error(`Primary category "${p.primaryCategory}" is not in the category path`);
  const author = await resolveAuthor(nonce, p.authorName);
  const featured = p.image ? await uploadImage(nonce, p.image) : null;

  const meta = {};
  if (p.seoTitle) meta._yoast_wpseo_title = p.seoTitle;
  if (p.metaDesc) meta._yoast_wpseo_metadesc = p.metaDesc;
  if (primaryIdx >= 0) meta._yoast_wpseo_primary_category = String(categories[primaryIdx]);
  // Mirror the featured image to Yoast's Social (Open Graph) + X image. Yoast Free
  // only sometimes falls back to the featured image for shared links, so setting
  // these explicitly makes the image show reliably on X / Facebook / LinkedIn.
  // Needs the four *-image keys registered by the Yoast REST snippet.
  if (featured) {
    meta['_yoast_wpseo_opengraph-image'] = featured.url;
    meta['_yoast_wpseo_opengraph-image-id'] = String(featured.id);
    meta['_yoast_wpseo_twitter-image'] = featured.url;
    meta['_yoast_wpseo_twitter-image-id'] = String(featured.id);
  }

  let post = await api(nonce, '/wp/v2/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: p.title,
      content: p.content,
      status: 'draft',
      date: p.date,
      categories,
      author,
      ...(featured && { featured_media: featured.id }),
      meta
    })
  });

  let note = null;
  if (p.status === 'future') {
    if (new Date(post.date_gmt + 'Z').getTime() > Date.now() + 60000) {
      post = await api(nonce, `/wp/v2/posts/${post.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'future', date: p.date })
      });
    } else {
      note = 'Date has already passed — left as Draft so it does not publish immediately.';
    }
  }

  return { ok: true, id: post.id, status: post.status, date: post.date, editUrl: editUrl(post.id), note };
}
