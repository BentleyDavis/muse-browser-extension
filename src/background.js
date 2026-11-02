// Background service worker — handles screenshot capture.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "screenshot") {
    chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 70 }, (dataUrl) => {
      sendResponse({ dataUrl: dataUrl || null });
    });
    return true; // async response
  }
});
