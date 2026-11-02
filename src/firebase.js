// Firebase Realtime Database listener for Muse commands.
// Uses REST streaming (EventSource) — no Firebase SDK needed.

class MuseFirebase {
  constructor(config) {
    this.config = config;
    this.eventSource = null;
    this.handlers = {};
  }

  on(event, handler) {
    this.handlers[event] = handler;
  }

  connect() {
    const { databaseURL, secretToken, paths } = this.config;
    const url = `${databaseURL}/${paths.commands}.json?auth=${secretToken}`;
    // Note: RTDB REST streaming via EventSource
    this.eventSource = new EventSource(url);
    this.eventSource.onmessage = (e) => {
      if (e.data === "null") return;
      try {
        const cmd = JSON.parse(e.data);
        const handler = this.handlers[cmd.action];
        if (handler) handler(cmd);
      } catch (err) {
        console.error("[muse] command parse error", err);
      }
    };
    this.eventSource.onerror = (e) => {
      console.error("[muse] firebase stream error, reconnecting in 5s");
      setTimeout(() => this.connect(), 5000);
    };
    console.log("[muse] firebase connected");
  }

  async sendResult(result) {
    const { databaseURL, secretToken, paths } = this.config;
    const url = `${databaseURL}/${paths.results}.json?auth=${secretToken}`;
    await fetch(url, {
      method: "POST",
      body: JSON.stringify({ ...result, timestamp: Date.now() }),
    });
  }
}
