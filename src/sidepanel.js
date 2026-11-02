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
  const dot = document.getElementById("connDot");
  const text = document.getElementById("connText");
  if (dot) dot.className = "dot " + (connected ? "green" : "red");
  if (text) text.textContent = connected ? "Connected" : "Disconnected";
}

document.getElementById("saveConfigBtn").addEventListener("click", () => {
  const raw = document.getElementById("configInput").value;
  console.log("[muse] Save clicked, raw length:", raw.length);
  try {
    const config = parseConfig(raw);
    console.log("[muse] Parsed OK:", Object.keys(config));
    chrome.storage.local.set({ museConfig: config }, () => {
      console.log("[muse] Stored OK");
      showMain();
      init(config);
    });
  } catch (e) {
    console.error("[muse] Parse failed:", e.message);
    const errDiv = document.getElementById("configError");
    if (errDiv) {
      errDiv.textContent = "Error: " + e.message;
      errDiv.style.display = "block";
    }
  }
});

// Lenient parser: accepts JS-style objects with unquoted keys,
// single/multi-line comments, and trailing commas. No eval.
function parseConfig(raw) {
  let pos = 0;

  function skipWsAndComments() {
    while (pos < raw.length) {
      const c = raw[pos], next = raw[pos + 1] || "";
      if (c === " " || c === "\t" || c === "\n" || c === "\r") { pos++; continue; }
      if (c === "/" && next === "/") {
        while (pos < raw.length && raw[pos] !== "\n") pos++;
        continue;
      }
      if (c === "/" && next === "*") {
        pos += 2;
        while (pos < raw.length - 1 && !(raw[pos] === "*" && raw[pos + 1] === "/")) pos++;
        pos += 2;
        continue;
      }
      break;
    }
  }

  function parseString() {
    const quote = raw[pos];
    pos++;
    let s = "";
    while (pos < raw.length && raw[pos] !== quote) {
      if (raw[pos] === "\\") {
        pos++;
        const e = raw[pos] || "";
        s += e === "n" ? "\n" : e === "t" ? "\t" : e === "r" ? "\r" : e;
      } else {
        s += raw[pos];
      }
      pos++;
    }
    pos++; // closing quote
    return s;
  }

  function parseKey() {
    skipWsAndComments();
    const c = raw[pos];
    if (c === '"' || c === "'") return parseString();
    // Unquoted key: letters, digits, underscore, $
    let key = "";
    while (pos < raw.length && /[a-zA-Z0-9_$]/.test(raw[pos])) {
      key += raw[pos++];
    }
    if (!key) throw new Error("Expected key at position " + pos);
    return key;
  }

  function parseValue() {
    skipWsAndComments();
    const c = raw[pos];
    if (c === "{") return parseObject();
    if (c === "[") return parseArray();
    if (c === '"' || c === "'") return parseString();
    if (raw.substr(pos, 4) === "true") { pos += 4; return true; }
    if (raw.substr(pos, 5) === "false") { pos += 5; return false; }
    if (raw.substr(pos, 4) === "null") { pos += 4; return null; }
    // Number
    const numMatch = raw.substr(pos).match(/^-?\d+(\.\d+)?/);
    if (numMatch) { pos += numMatch[0].length; return parseFloat(numMatch[0]); }
    throw new Error("Unexpected value at position " + pos);
  }

  function parseObject() {
    const obj = {};
    pos++; // {
    while (true) {
      skipWsAndComments();
      if (raw[pos] === "}") { pos++; break; }
      const key = parseKey();
      skipWsAndComments();
      if (raw[pos] !== ":") throw new Error("Expected : at position " + pos);
      pos++;
      obj[key] = parseValue();
      skipWsAndComments();
      if (raw[pos] === ",") { pos++; continue; }
      if (raw[pos] === "}") { pos++; break; }
      throw new Error("Expected , or } at position " + pos);
    }
    return obj;
  }

  function parseArray() {
    const arr = [];
    pos++; // [
    while (true) {
      skipWsAndComments();
      if (raw[pos] === "]") { pos++; break; }
      arr.push(parseValue());
      skipWsAndComments();
      if (raw[pos] === ",") { pos++; continue; }
      if (raw[pos] === "]") { pos++; break; }
      throw new Error("Expected , or ] at position " + pos);
    }
    return arr;
  }

  skipWsAndComments();
  const config = parseValue();
  skipWsAndComments();
  if (pos < raw.length) throw new Error("Unexpected trailing content at position " + pos);
  if (!config.firebase || !config.secretToken || !config.paths) {
    throw new Error("Missing firebase, secretToken, or paths");
  }
  return config;
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

document.getElementById("resetBtn")?.addEventListener("click", () => {
  chrome.storage.local.remove(["museConfig"], () => {
    location.reload();
  });
});

document.getElementById("editConfigBtn")?.addEventListener("click", () => {
  chrome.storage.local.get(["museConfig"], (result) => {
    if (result.museConfig) {
      // Pre-fill with current config as formatted JSON
      document.getElementById("configInput").value = JSON.stringify(result.museConfig, null, 2);
    }
    showSetup();
  });
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
