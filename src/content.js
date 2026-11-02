// Main content script — wires everything together.

(function() {
  console.log("[muse] content script loaded");

  // Wait for config
  if (typeof MUSE_CONFIG === "undefined") {
    console.error("[muse] config.local.js not found — copy config.example.js and fill it in");
    return;
  }

  const recorder = new MovementRecorder();
  const player = new MovementPlayer(recorder);
  const archiver = new ThreadArchiver(player);
  const firebase = new MuseFirebase({
    databaseURL: MUSE_CONFIG.firebase.databaseURL,
    secretToken: MUSE_CONFIG.secretToken,
    paths: MUSE_CONFIG.paths,
  });

  // Record real mouse movements for the movement library
  let isDown = false;
  document.addEventListener("mousedown", (e) => {
    isDown = true;
    recorder.beginStroke(e.clientX, e.clientY);
  }, true);
  document.addEventListener("mousemove", (e) => {
    if (isDown) recorder.addPoint(e.clientX, e.clientY);
  }, true);
  document.addEventListener("mouseup", () => {
    if (isDown) {
      isDown = false;
      recorder.endStroke();
    }
  }, true);

  // Command handlers
  firebase.on("archive", async (cmd) => {
    console.log(`[muse] archive command: ${cmd.addresses.length} addresses`);
    const result = await archiver.archiveAll(cmd.addresses, (done, total) => {
      console.log(`[muse] archived ${done}/${total}`);
    });
    await firebase.sendResult({ action: "archive", ...result, token: MUSE_CONFIG.secretToken });
  });

  firebase.on("snapshot", async (cmd) => {
    const screenshot = await archiver.captureScreenshot();
    const html = cmd.includeHtml ? archiver.getHTML() : null;
    // Upload to Firebase Storage via background script (large payloads)
    await firebase.sendResult({
      action: "snapshot",
      screenshot: screenshot ? screenshot.slice(0, 100) + "..." : null, // placeholder
      htmlLength: html ? html.length : 0,
      token: MUSE_CONFIG.secretToken,
    });
  });

  firebase.on("record", (cmd) => {
    if (cmd.enable) recorder.start();
    else recorder.stop();
  });

  firebase.on("ping", async () => {
    await firebase.sendResult({
      action: "pong",
      recordings: recorder.recordings.length,
      threads: archiver.getThreads().length,
      token: MUSE_CONFIG.secretToken,
    });
  });

  // Connect to Firebase
  firebase.connect();

  // Expose for debugging
  window.muse = { recorder, player, archiver, firebase };
})();

// Execute arbitrary JS in page context via service worker (MV3 compliant).
// Command: {action: "execute", code: "...", timeout: 30000}
firebase.on("execute", async (cmd) => {
  console.log("[muse] execute command received");
  try {
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), cmd.timeout || 60000);
      chrome.runtime.sendMessage(
        { action: "execute-code", code: cmd.code },
        (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (response.error) reject(new Error(response.error));
          else resolve(response.result);
        }
      );
    });
    await firebase.sendResult({
      action: "execute",
      success: true,
      result: typeof result === "object" ? JSON.stringify(result).slice(0, 5000) : String(result).slice(0, 5000),
      token: MUSE_CONFIG.secretToken,
    });
  } catch (err) {
    await firebase.sendResult({
      action: "execute",
      success: false,
      error: err.message,
      token: MUSE_CONFIG.secretToken,
    });
  }
});

// Run a named script from the repo's /scripts/ directory via service worker.
// Command: {action: "run-script", name: "bulk-archive", params: {...}}
firebase.on("run-script", async (cmd) => {
  console.log(`[muse] run-script: ${cmd.name}`);
  try {
    const url = `https://raw.githubusercontent.com/BentleyDavis/muse-browser-extension/main/scripts/${cmd.name}.js`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Script not found: ${cmd.name} (${res.status})`);
    const code = await res.text();

    // Convert kebab-case to camelCase for function name
    const fnName = cmd.name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const wrappedCode = `
      ${code}
      return (${fnName})(${JSON.stringify(cmd.params || {})}, {
        archiver: window.muse.archiver,
        player: window.muse.player,
        recorder: window.muse.recorder,
        muse: window.muse,
      });
    `;

    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), cmd.timeout || 300000);
      chrome.runtime.sendMessage(
        { action: "execute-code", code: wrappedCode },
        (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (response.error) reject(new Error(response.error));
          else resolve(response.result);
        }
      );
    });

    await firebase.sendResult({
      action: "run-script",
      name: cmd.name,
      success: true,
      result: JSON.stringify(result).slice(0, 10000),
      token: MUSE_CONFIG.secretToken,
    });
  } catch (err) {
    await firebase.sendResult({
      action: "run-script",
      name: cmd.name,
      success: false,
      error: err.message,
      token: MUSE_CONFIG.secretToken,
    });
  }
});

// Open URL in new tab (via background service worker).
// Command: {action: "open-url", url: "https://..."}
firebase.on("open-url", async (cmd) => {
  console.log(`[muse] open-url: ${cmd.url}`);
  const result = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "open-url", url: cmd.url }, resolve);
  });
  await firebase.sendResult({
    action: "open-url",
    success: true,
    tabId: result.tabId,
    url: cmd.url,
    token: MUSE_CONFIG.secretToken,
  });
});
