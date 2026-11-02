// Side panel logic — sends commands via Firebase, displays results.

let firebase = null;

// Check for stored config
chrome.storage.local.get(["museConfig"], (result) => {
  if (result.museConfig) {
    showMain();
    init(result.museConfig);
  } else {
    showSetup();
  }
});

function showSetup() {
  document.getElementById("setupSection").classList.remove("hidden");
  document.getElementById("mainSection").classList.add("hidden");
}

function showMain() {
  document.getElementById("setupSection").classList.add("hidden");
  document.getElementById("mainSection").classList.remove("hidden");
}

document.getElementById("saveConfigBtn").addEventListener("click", () => {
  try {
    const config = JSON.parse(document.getElementById("configInput").value);
    chrome.storage.local.set({ museConfig: config }, () => {
      log("Config saved!");
      showMain();
      init(config);
    });
  } catch (e) {
    alert("Invalid JSON: " + e.message);
  }
});

function init(config) {
  firebase = {
    config,
    async send(action, data = {}) {
      const url = `${config.firebase.databaseURL}/${config.paths.commands}.json?auth=${config.secretToken}`;
      const cmd = { action, ...data, token: config.secretToken, timestamp: Date.now() };
      await fetch(url, { method: "POST", body: JSON.stringify(cmd) });
      log(`→ Sent: ${action}`);
    },
    listen() {
      const url = `${config.firebase.databaseURL}/${config.paths.results}.json?auth=${config.secretToken}`;
      const es = new EventSource(url);
      es.onmessage = (e) => {
        if (e.data === "null") return;
        try {
          const result = JSON.parse(e.data);
          log(`← Result: ${result.action} — ${result.success !== false ? "OK" : "FAIL"}`);
          if (result.result) log(`  ${result.result.slice(0, 200)}`);
          if (result.error) log(`  Error: ${result.error}`);
        } catch (err) { /* ignore */ }
      };
      es.onopen = () => setConn(true);
      es.onerror = () => setConn(false);
    }
  };
  firebase.listen();
}

function setConn(connected) {
  document.getElementById("connDot").className = "dot " + (connected ? "green" : "red");
  document.getElementById("connText").textContent = connected ? "Connected" : "Disconnected";
}

function log(msg) {
  const el = document.getElementById("log");
  if (!el) return;
  const div = document.createElement("div");
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  el.prepend(div);
  while (el.children.length > 50) el.removeChild(el.lastChild);
}

document.getElementById("pingBtn")?.addEventListener("click", () => {
  firebase?.send("run-script", { name: "ping", params: {} });
});

let recording = false;
document.getElementById("recordBtn")?.addEventListener("click", (e) => {
  recording = !recording;
  firebase?.send("record", { enable: recording });
  e.target.textContent = recording ? "Stop Recording" : "Start Recording";
});

document.getElementById("snapshotBtn")?.addEventListener("click", () => {
  firebase?.send("snapshot", { includeHtml: false });
});

document.getElementById("openUrlBtn")?.addEventListener("click", () => {
  const url = document.getElementById("urlInput").value.trim();
  if (url) firebase?.send("open-url", { url });
});

document.getElementById("runScriptBtn")?.addEventListener("click", () => {
  const name = document.getElementById("scriptName").value.trim();
  let params = {};
  try {
    params = JSON.parse(document.getElementById("scriptParams").value || "{}");
  } catch (e) {
    log("Invalid JSON params");
    return;
  }
  if (name) firebase?.send("run-script", { name, params });
});
