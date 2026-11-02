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

// Execute arbitrary JS in page context (for bulk operations)
// Command: {action: "execute", code: "...", timeout: 30000}
firebase.on("execute", async (cmd) => {
  console.log("[muse] execute command received");
  try {
    // Wrap in async function for await support
    const fn = new Function("muse", "archiver", "player", "recorder", `
      return (async () => {
        ${cmd.code}
      })();
    `);
    const timeout = cmd.timeout || 60000;
    const result = await Promise.race([
      fn(window.muse, archiver, player, recorder),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeout)),
    ]);
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
