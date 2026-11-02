// Records real mouse movements for later transform-and-replay.
// Each recording: array of {x, y, t} where t is ms since movement start.

class MovementRecorder {
  constructor() {
    this.recordings = [];
    this.current = null;
    this.isRecording = false;
    this.load();
  }

  start() {
    this.isRecording = true;
    console.log("[muse] movement recording started");
  }

  stop() {
    this.isRecording = false;
    this.save();
    console.log(`[muse] movement recording stopped, ${this.recordings.length} saved`);
  }

  // Call on mousedown to begin a movement capture
  beginStroke(x, y) {
    if (!this.isRecording) return;
    this.current = [{ x, y, t: 0 }];
    this._startTime = performance.now();
  }

  // Call on mousemove during a stroke
  addPoint(x, y) {
    if (!this.isRecording || !this.current) return;
    const t = performance.now() - this._startTime;
    const last = this.current[this.current.length - 1];
    // Only record if moved enough or enough time passed (reduce noise)
    const dx = x - last.x, dy = y - last.y;
    if (Math.hypot(dx, dy) > 1 || t - last.t > 16) {
      this.current.push({ x, y, t: Math.round(t) });
    }
  }

  // Call on mouseup to finalize
  endStroke() {
    if (!this.isRecording || !this.current) return;
    if (this.current.length > 5) {
      const dist = this._distance(this.current);
      const angle = this._angle(this.current);
      this.recordings.push({
        points: this.current,
        distance: Math.round(dist),
        angle: Math.round(angle * 180 / Math.PI),
        duration: this.current[this.current.length - 1].t,
      });
    }
    this.current = null;
  }

  _distance(pts) {
    const a = pts[0], b = pts[pts.length - 1];
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  _angle(pts) {
    const a = pts[0], b = pts[pts.length - 1];
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  save() {
    try {
      localStorage.setItem("muse_recordings", JSON.stringify(this.recordings));
    } catch (e) { /* storage full, ignore */ }
  }

  load() {
    try {
      this.recordings = JSON.parse(localStorage.getItem("muse_recordings") || "[]");
    } catch (e) {
      this.recordings = [];
    }
  }

  clear() {
    this.recordings = [];
    this.save();
  }
}
