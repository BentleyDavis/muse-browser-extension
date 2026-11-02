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

  if (msg.action === "execute-code") {
    // Inject code as a script tag in the sender tab (no eval).
    // The script posts its result back via a custom event.
    const tabId = sender.tab.id;
    const requestId = "muse_" + Date.now() + "_" + Math.random().toString(36).slice(2);

    // First, set up a one-time listener for the result
    const listener = (message, sender2, sendResp) => {
      if (message.action === "execute-result" && message.requestId === requestId) {
        chrome.runtime.onMessage.removeListener(listener);
        if (message.error) sendResponse({ error: message.error });
        else sendResponse({ result: message.result });
      }
    };
    chrome.runtime.onMessage.addListener(listener);

    // Inject the execution wrapper
    chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (code, reqId) => {
        const script = document.createElement("script");
        script.textContent = `
          (async () => {
            const reqId = "${reqId}";
            try {
              const muse = window.muse;
              const result = await (async (muse, archiver, player, recorder) => {
                ${code}
              })(muse, muse.archiver, muse.player, muse.recorder);
              window.dispatchEvent(new CustomEvent("muse-execute-done", {
                detail: { requestId: reqId, result: JSON.stringify(result).slice(0, 10000) }
              }));
            } catch (err) {
              window.dispatchEvent(new CustomEvent("muse-execute-done", {
                detail: { requestId: reqId, error: err.message }
              }));
            }
          })();
        `;
        document.documentElement.appendChild(script);
        script.remove();

        // Forward the custom event to the extension
        const handler = (e) => {
          if (e.detail.requestId === reqId) {
            window.removeEventListener("muse-execute-done", handler);
            chrome.runtime.sendMessage({
              action: "execute-result",
              requestId: reqId,
              result: e.detail.result ? JSON.parse(e.detail.result) : undefined,
              error: e.detail.error,
            });
          }
        };
        window.addEventListener("muse-execute-done", handler);
      },
      args: [msg.code, requestId],
    }).catch((err) => {
      chrome.runtime.onMessage.removeListener(listener);
      sendResponse({ error: err.message });
    });
    return true;
  }
});
