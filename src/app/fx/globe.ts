// A small turning globe for the location picker (canvas 2D, orthographic). It draws only what we know: a graticule,
// the places DAYWIRE has sources for, your saved places and the search results, at their real coordinates.
// It turns to face the place you are pointing at. No land shapes: we don't ship map data, and we don't fake it.
import { clamp, frame, lerp, reducedMotion } from "./loop.ts";

export interface GlobePoint { id: string; lat: number; lon: number; kind: "covered" | "saved" | "result" | "current" }

export interface Globe { setPoints(p: GlobePoint[]): void; focus(lat: number, lon: number, id?: string): void; dispose(): void }

const RAD = Math.PI / 180;
const COLORS: Record<GlobePoint["kind"], string> = { covered: "#F7F4EC", saved: "#151515", result: "#F4F1EA", current: "#F7F4EC" };

export function mountGlobe(canvas: HTMLCanvasElement): Globe {
  const ctx = canvas.getContext("2d")!;
  let points: GlobePoint[] = [];
  let lat0 = 30, lon0 = 15, latT = 30, lonT = 15, focusId: string | undefined;
  let t = 0, spin = true;

  const size = () => {
    const r = canvas.getBoundingClientRect();
    const k = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(r.width * k), h = Math.round(r.height * k);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { w, h, k };
  };

  const project = (lat: number, lon: number, R: number, cx: number, cy: number) => {
    const φ = lat * RAD, λ = (lon - lon0) * RAD, φ0 = lat0 * RAD;
    const cosc = Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(λ);
    return { x: cx + R * Math.cos(φ) * Math.sin(λ), y: cy - R * (Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(λ)), front: cosc > 0, depth: cosc };
  };

  function draw() {
    const { w, h, k } = size();
    const R = Math.min(w, h) * 0.42, cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    g.addColorStop(0, "#2A2A2D"); g.addColorStop(1, "#0E0E0F");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1 * k; ctx.strokeStyle = "rgba(168,164,156,.18)";
    const line = (pts: { x: number; y: number; front: boolean }[]) => {
      ctx.beginPath(); let pen = false;
      for (const p of pts) { if (!p.front) { pen = false; continue; } if (pen) ctx.lineTo(p.x, p.y); else { ctx.moveTo(p.x, p.y); pen = true; } }
      ctx.stroke();
    };
    for (let la = -60; la <= 60; la += 30) line(Array.from({ length: 73 }, (_, i) => project(la, i * 5 - 180, R, cx, cy)));
    for (let lo = -180; lo < 180; lo += 30) line(Array.from({ length: 37 }, (_, i) => project(i * 5 - 90, lo, R, cx, cy)));
    ctx.strokeStyle = "rgba(247,244,236,.35)"; ctx.lineWidth = 1.2 * k;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    const sorted = [...points].sort((a, b) => project(a.lat, a.lon, R, cx, cy).depth - project(b.lat, b.lon, R, cx, cy).depth);
    for (const p of sorted) {
      const q = project(p.lat, p.lon, R, cx, cy);
      if (!q.front) continue;
      const focused = p.id === focusId;
      const r = (focused ? 5 : p.kind === "result" ? 2.6 : 3.4) * k;
      if (focused || p.kind === "current") {
        const pulse = reducedMotion() ? 0.5 : (Math.sin(t * 3) + 1) / 2;
        ctx.fillStyle = `rgba(247,244,236,${0.15 + pulse * 0.2})`;
        ctx.beginPath(); ctx.arc(q.x, q.y, r * (2.4 + pulse), 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = COLORS[p.kind]; ctx.globalAlpha = 0.45 + q.depth * 0.55;
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  const stop = frame((_, dt) => {
    if (!canvas.isConnected) { stop(); return; }
    if (reducedMotion()) { lat0 = latT; lon0 = lonT; draw(); return; }
    t += dt;
    if (spin) lonT -= dt * 6;
    lat0 = lerp(lat0, latT, clamp(dt * 3));
    const dl = ((lonT - lon0 + 540) % 360) - 180;
    lon0 += dl * clamp(dt * 3);
    draw();
  });

  return {
    setPoints(p) { points = p; draw(); },
    focus(lat, lon, id) { latT = clamp(lat, -60, 60); lonT = lon; focusId = id; spin = false; },
    dispose() { stop(); },
  };
}
