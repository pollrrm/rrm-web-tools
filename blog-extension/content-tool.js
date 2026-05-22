// Runs on the RRM Web Support Tools site (pollrrm.github.io) and on locally
// opened tool HTML files (file://). Listens for "Send blog to WP" requests
// from the page via window.postMessage, stashes the payload in
// chrome.storage.local under a BLOG-specific key, and opens the target site's
// WordPress new-post page in a new tab.
//
// IMPORTANT: This extension uses message type RRM_BLOG_SEND_TO_WP and storage
// key rrm_blog_pending — distinct from the RRM WP Helper (video) extension's
// RRM_SEND_TO_WP / rrm_pending. That keeps the two extensions completely
// independent even though they install on the same pages.

const TARGET_URLS = {
  rrmathome: 'https://www.rrmathome.com/wp-admin/post-new.php',
  scmm:      'https://www.seniorcaremarketingmax.com/wp-admin/post-new.php',
  rrm:       'https://www.ringringmarketing.com/wp-admin/post-new.php',
  hospice:   'https://www.hospicehavenmarketing.com/wp-admin/post-new.php'
};

// Announce extension presence so a tool page can light up its blog Fill buttons.
window.dispatchEvent(new CustomEvent('rrm-blog-ext-ready'));
const flag = document.createElement('meta');
flag.name = 'rrm-blog-ext-installed';
flag.content = '1';
document.head?.appendChild(flag);

window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  const data = e.data;
  if (!data || data.type !== 'RRM_BLOG_SEND_TO_WP') return;
  if (!data.payload || !data.target) return;

  const url = TARGET_URLS[data.target];
  if (!url) {
    console.warn('[RRM Blog Helper] Unknown target site:', data.target);
    return;
  }

  chrome.storage.local.set({
    rrm_blog_pending: {
      target: data.target,
      payload: data.payload,
      ts: Date.now()
    }
  }, () => {
    window.open(url, '_blank');
  });
});
