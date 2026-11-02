// Main content script — wires everything together.

(function() {
  console.log("[muse] content script loaded");

  chrome.storage.local.get(["museConfig"], (result) => {
    if (!result.museConfig) {
      console.error("[muse] No config found — open the side panel to set it up");
      return;
    }
    startMuse(result.museConfig);
  });

  function startMuse(MUSE_CONFIG) {
    const recorder = new MovementRecorder();
    const player = new MovementPlayer(recorder);
    const archiver = new ThreadArchiver(player);
    const firebase = new MuseFirebase({
      databaseURL: MUSE_CONFIG.firebase.databaseURL,
      secretToken: MUSE_CONFIG.secretToken,
    });

    // Record real mouse movements
    let isDown = false;
    document.addEventListener("mousedown", (e) => {
      isDown = true;
      recorder.beginStroke(e.clientX, e.clientY);
    }, true);
    document.addEventListener("mousemove", (e) => {
      if (isDown) recorder.addPoint(e.clientX, e.clientY);
    }, true);
    document.addEventListener("mouseup", () => {
      if (isDown) { isDown = false; recorder.endStroke(); }
    }, true);

    // --- Command handlers ---

    firebase.on("archive", async (cmd) => {
      const result = await archiver.archiveAll(cmd.addresses);
      await firebase.sendResult({ action: "archive", ...result, token: MUSE_CONFIG.secretToken });
    });

    firebase.on("snapshot", async (cmd) => {
      const screenshot = await archiver.captureScreenshot();
      await firebase.sendResult({
        action: "snapshot",
        htmlLength: cmd.includeHtml ? archiver.getHTML().length : 0,
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

    firebase.on("execute", async (cmd) => {
      try {
        const result = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("timeout")), cmd.timeout || 60000);
          chrome.runtime.sendMessage({ action: "execute-code", code: cmd.code }, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else if (response.error) reject(new Error(response.error));
            else resolve(response.result);
          });
        });
        await firebase.sendResult({
          action: "execute", success: true,
          result: JSON.stringify(result).slice(0, 5000),
          token: MUSE_CONFIG.secretToken,
        });
      } catch (err) {
        await firebase.sendResult({
          action: "execute", success: false,
          error: err.message, token: MUSE_CONFIG.secretToken,
        });
      }
    });

    firebase.on("run-script", async (cmd) => {
      try {
        const url = `https://raw.githubusercontent.com/BentleyDavis/muse-browser-extension/main/scripts/${cmd.name}.js`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Script not found: ${cmd.name}`);
        const code = await res.text();
        const fnName = cmd.name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const wrapped = `${code}\nreturn (${fnName})(${JSON.stringify(cmd.params || {})}, {archiver: window.muse.archiver, player: window.muse.player, recorder: window.muse.recorder, muse: window.muse});`;

        const result = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("timeout")), cmd.timeout || 300000);
          chrome.runtime.sendMessage({ action: "execute-code", code: wrapped }, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else if (response.error) reject(new Error(response.error));
            else resolve(response.result);
          });
        });
        await firebase.sendResult({
          action: "run-script", name: cmd.name, success: true,
          result: JSON.stringify(result).slice(0, 10000),
          token: MUSE_CONFIG.secretToken,
        });
      } catch (err) {
        await firebase.sendResult({
          action: "run-script", name: cmd.name, success: false,
          error: err.message, token: MUSE_CONFIG.secretToken,
        });
      }
    });

    firebase.on("open-url", async (cmd) => {
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "open-url", url: cmd.url }, resolve);
      });
      await firebase.sendResult({
        action: "open-url", success: true,
        tabId: result.tabId, url: cmd.url,
        token: MUSE_CONFIG.secretToken,
      });
    });

    // Connect and report status
    firebase.connect();
    console.log("[muse] connecting to Firebase...");

    // Report successful startup after a short delay (let connection establish)
    setTimeout(() => {
      firebase.sendResult({
        action: "hello",
        status: "connected",
        url: window.location.href,
        recordings: recorder.recordings.length,
        token: MUSE_CONFIG.secretToken,
      }).catch(() => console.warn("[muse] hello failed - Firebase not connected"));
    }, 3000);

    window.muse = { recorder, player, archiver, firebase };
  }
})();
