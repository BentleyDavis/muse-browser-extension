// Background service worker — Chrome API access, side panel, screenshots.

// Enable side panel
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "screenshot") {
    chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 70 }, (dataUrl) => {
      sendResponse({ dataUrl: dataUrl || null });
    });
    return true;
  }

  if (msg.action === "open-url") {
    chrome.tabs.create({ url: msg.url }, (tab) => {
      sendResponse({ tabId: tab.id });
    });
    return true;
  }

  if (msg.action === "store-config") {
    chrome.storage.local.set({ museConfig: msg.config }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
});
