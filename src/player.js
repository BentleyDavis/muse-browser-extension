// Transforms recorded mouse movements to fit new start/end points.
// Philosophy: transform real data, never synthesize.
//
// Variation strategies (all from real recordings, never generated):
// 1. Pick randomly from 3-5 closest recordings (not always the closest)
// 2. Perturb rotation ±3° and scale ±5%
// 3. Time-warp ±10%
// 4. Mirror across movement axis (doubles effective library)
// 5. Target jitter within clickable bounds

class MovementPlayer {
  constructor(recorder) {
    this.recorder = recorder;
  }

  // Move from (x1,y1) to (x2,y2) using a transformed real recording
  async move(x1, y1, x2, y2, options = {}) {
    const recording = this._selectRecording(x1, y1, x2, y2);
    if (!recording) {
      // Fallback: simple direct move if no recordings yet
      console.warn("[muse] no recordings, using fallback");
      return this._fallbackMove(x1, y1, x2, y2);
    }

    const points = this._transform(recording, x1, y1, x2, y2, options);
    await this._play(points);
  }

  _selectRecording(x1, y1, x2, y2) {
    const recs = this.recorder.recordings;
    if (!recs.length) return null;

    const targetDist = Math.hypot(x2 - x1, y2 - y1);
    const targetAngle = Math.atan2(y2 - y1, x2 - x1);

    // Score by distance and angle similarity
    const scored = recs.map(r => ({
      r,
      score: Math.abs(r.distance - targetDist) / Math.max(targetDist, 1)
           + Math.abs(this._angleDiff(r.angle * Math.PI / 180, targetAngle)) / Math.PI,
    }));
    scored.sort((a, b) => a.score - b.score);

    // Pick randomly from top 5 (or fewer) — avoids identical signatures
    const candidates = scored.slice(0, Math.min(5, scored.length));
    return candidates[Math.floor(Math.random() * candidates.length)].r;
  }

  _angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  _transform(rec, x1, y1, x2, y2, options) {
    let pts = rec.points.map(p => ({ ...p }));

    // Optional mirror across movement axis
    if (Math.random() < 0.5) {
      pts = this._mirror(pts);
    }

    // Normalize: translate to origin
    const ox = pts[0].x, oy = pts[0].y;
    pts = pts.map(p => ({ x: p.x - ox, y: p.y - oy, t: p.t }));

    // Calculate transform
    const srcEnd = pts[pts.length - 1];
    const srcDist = Math.hypot(srcEnd.x, srcEnd.y) || 1;
    const srcAngle = Math.atan2(srcEnd.y, srcEnd.x);

    const dstDist = Math.hypot(x2 - x1, y2 - y1);
    const dstAngle = Math.atan2(y2 - y1, x2 - x1);

    // Perturb: ±3° rotation, ±5% scale
    const rotPerturb = (Math.random() - 0.5) * 2 * (3 * Math.PI / 180);
    const scalePerturb = 1 + (Math.random() - 0.5) * 2 * 0.05;

    const scale = (dstDist / srcDist) * scalePerturb;
    const rotate = dstAngle - srcAngle + rotPerturb;

    const cos = Math.cos(rotate), sin = Math.sin(rotate);

    // Time warp: ±10%
    const timeScale = 1 + (Math.random() - 0.5) * 2 * 0.10;

    return pts.map(p => ({
      x: Math.round(x1 + (p.x * cos - p.y * sin) * scale),
      y: Math.round(y1 + (p.x * sin + p.y * cos) * scale),
      t: Math.round(p.t * timeScale),
    }));
  }

  _mirror(pts) {
    // Mirror across the line from first to last point
    const a = pts[0], b = pts[pts.length - 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    return pts.map(p => {
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
      const projX = a.x + t * dx, projY = a.y + t * dy;
      return { x: Math.round(2 * projX - p.x), y: Math.round(2 * projY - p.y), t: p.t };
    });
  }

  async _play(points) {
    // Dispatch synthetic mousemove events along the transformed path
    // Note: these don't move the real cursor (browser security),
    // but they trigger the same event handlers a real move would.
    const startTime = performance.now();
    const t0 = points[0].t;

    for (const p of points) {
      const wait = (p.t - t0) - (performance.now() - startTime);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));

      document.dispatchEvent(new MouseEvent("mousemove", {
        clientX: p.x, clientY: p.y, bubbles: true,
      }));
    }
  }

  async _fallbackMove(x1, y1, x2, y2) {
    // Simple linear fallback when no recordings exist yet
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const x = x1 + (x2 - x1) * i / steps;
      const y = y1 + (y2 - y1) * i / steps;
      document.dispatchEvent(new MouseEvent("mousemove", {
        clientX: Math.round(x), clientY: Math.round(y), bubbles: true,
      }));
      await new Promise(r => setTimeout(r, 10 + Math.random() * 10));
    }
  }

  // Click at (x,y) with target jitter
  async click(x, y, radius = 3) {
    const jx = x + Math.round((Math.random() - 0.5) * 2 * radius);
    const jy = y + Math.round((Math.random() - 0.5) * 2 * radius);
    const el = document.elementFromPoint(jx, jy);
    if (el) {
      el.dispatchEvent(new MouseEvent("mousedown", { clientX: jx, clientY: jy, bubbles: true }));
      await new Promise(r => setTimeout(r, 50 + Math.random() * 50));
      el.dispatchEvent(new MouseEvent("mouseup", { clientX: jx, clientY: jy, bubbles: true }));
      el.dispatchEvent(new MouseEvent("click", { clientX: jx, clientY: jy, bubbles: true }));
    }
  }
}
