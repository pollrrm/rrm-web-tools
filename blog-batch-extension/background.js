// Open the side panel when the user clicks the extension toolbar icon.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn('[RRM Helper] Side panel setup failed:', err));
});
