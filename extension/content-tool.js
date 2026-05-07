// Runs on the RRM Web Support Tools site (pollrrm.github.io).
// Listens for "Send to WP" requests from the page via window.postMessage,
// stashes the payload in chrome.storage.local, and opens the target
// WordPress new-post page in a new tab.

const TARGET_URLS = {
  rrmathome: 'https://www.rrmathome.com/wp-admin/post-new.php',
  scmm:      'https://www.seniorcaremarketingmax.com/wp-admin/post-new.php'
  // Future sites: ringringmarketing (Funeral), hospice
};

// Announce extension presence so the page can light up its "Send to WP" buttons.
window.dispatchEvent(new CustomEvent('rrm-ext-ready'));
// Also set a marker on window for late-loading scripts.
const flag = document.createElement('meta');
flag.name = 'rrm-ext-installed';
flag.content = '1';
document.head?.appendChild(flag);

window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  const data = e.data;
  if (!data || data.type !== 'RRM_SEND_TO_WP') return;
  if (!data.payload || !data.target) return;

  const url = TARGET_URLS[data.target];
  if (!url) {
    console.warn('[RRM Helper] Unknown target site:', data.target);
    return;
  }

  chrome.storage.local.set({
    rrm_pending: {
      target: data.target,
      payload: data.payload,
      ts: Date.now()
    }
  }, () => {
    window.open(url, '_blank');
  });
});
