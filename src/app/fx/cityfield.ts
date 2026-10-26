// The city field: an abstract, generative street grid behind the hero (WebGL2).
// - Every city gets its own layout, seeded by its GeoNames id; switching city morphs from one to the other.
// - Each light travelling along the streets is a real notice in force or due today. Its colour is its severity or
//   category; hovering a notice in the page lights its pulses. With no notices there are no pulses, only a slow sweep.
// - The light of the scene follows the sun at that place (computed, not decorative).
// - It is labelled on the page as an abstract picture: it is not a map and its streets are not real streets.
// Reduced motion: one still frame. No WebGL2: the CSS background stays (the page never depends on this).
import { clamp, frame, lerp, reducedMotion } from "./loop.ts";

export interface Signal { id: string; color: [number, number, number]; strength: number; count: number }

export interface Field {
  setSeed(seed: number): void;
  setSignals(s: Signal[]): void;
  setDaylight(d: number): void;
  highlight(id: string | null): void;
  ripple(clientX: number, clientY: number): void;
  dispose(): void;
}

const VERT = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uT; uniform vec3 uM;
uniform float uSA, uSB, uMix, uDay, uSweep;
uniform vec4 uP[32]; uniform vec3 uC[32]; uniform int uN;
uniform vec4 uR;
out vec4 o;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float nz(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a*nz(p); p = p*2.03 + 17.1; a *= .5; } return s; }
vec2 warpOf(vec2 c, float s){ return c + 1.1*vec2(fbm(c*.16 + s) - .5, fbm(c*.16 + s + 31.7) - .5); }
const float SCALE = 9.;
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 c = fc / uRes.y * SCALE;
  vec2 m = uM.xy / uRes.y * SCALE;
  float dm = length(c - m);
  c -= (c - m) * .16 * exp(-dm*dm*.3) * uM.z;
  vec2 p = mix(warpOf(c, uSA), warpOf(c, uSB), uMix);
  vec2 fw = fwidth(p);
  vec2 gd = abs(fract(p + .5) - .5);
  vec2 ln = 1. - smoothstep(vec2(0.), fw*1.4, gd);
  float blocks = mix(smoothstep(.3, .42, fbm(floor(p)*.37 + uSA*.13)), smoothstep(.3, .42, fbm(floor(p)*.37 + uSB*.13)), uMix);
  float streets = max(ln.x, ln.y) * mix(.18, 1., blocks);
  vec2 ga = abs(fract(p/4. + .5) - .5) * 4.;
  vec2 la = 1. - smoothstep(vec2(0.), fw*2.4, ga);
  float avenues = max(la.x, la.y);
  float f = mix(fbm(c*.085 + uSA*.05), fbm(c*.085 + uSB*.05), uMix) * 10.;
  float cont = 1. - smoothstep(0., fwidth(f)*1.3, abs(fract(f) - .5));
  vec3 glow = vec3(0.);
  for (int i = 0; i < 32; i++) {
    if (i >= uN) break;
    vec4 P = uP[i];
    float axis = mod(P.w, 2.); float dir = P.w >= 2. ? 1. : -1.;
    vec2 d = p - P.xy;
    float along = axis < .5 ? d.x : d.y; float across = axis < .5 ? d.y : d.x;
    float head = exp(-dot(d, d)*20.);
    float behind = -along*dir;
    float trail = exp(-across*across*300.) * exp(-max(behind, 0.)*1.4) * step(0., behind);
    glow += uC[i] * (head*1.5 + trail*.6) * P.z;
  }
  float ring = 0.;
  if (uR.w > 0.) { float rt = uT - uR.z; float rr = length(c - uR.xy/uRes.y*SCALE); ring = exp(-pow(rr - rt*6., 2.)*3.) * exp(-rt*1.3); }
  float sweep = exp(-pow(fract(c.x/ (uRes.x/uRes.y*SCALE) - uSweep) - .5, 2.)*90.) * .6;
  float torch = exp(-dm*dm*.05) * uM.z;
  vec3 navy = mix(vec3(.024,.052,.098), vec3(.055,.105,.18), uDay);
  vec3 lineCol = mix(vec3(.42,.55,.78), vec3(.6,.72,.86), uDay);
  float light = 1. + torch*2.6 + ring*3. + sweep;
  vec3 col = navy + lineCol * (streets*.07 + avenues*.12 + cont*.03) * light + vec3(.78,.94,.3) * ring * streets * .25;
  col += glow;
  vec2 uv = fc / uRes;
  col *= .72 + .28*smoothstep(1.25, .15, length((uv - vec2(.72, .62)) * vec2(1., 1.5)));
  col = mix(col, vec3(.047,.102,.18), smoothstep(.25, 0., uv.y) * .55);
  o = vec4(col, 1.);
}`;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

interface Pulse { sig: number; axis: 0 | 1; dir: 1 | -1; lane: number; speed: number; phase: number }

export function mountField(canvas: HTMLCanvasElement): Field | null {
  const ctx = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false, alpha: false, powerPreference: "low-power" });
  if (!ctx) return null;
  const gl: WebGL2RenderingContext = ctx;
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader"); return s; };
  const prog = gl.createProgram()!;
  try { gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); } catch (e) { console.warn("[daywire] field shader:", e); return null; }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n: string) => gl.getUniformLocation(prog, n);
  const u = { res: U("uRes"), t: U("uT"), m: U("uM"), sa: U("uSA"), sb: U("uSB"), mix: U("uMix"), day: U("uDay"), sweep: U("uSweep"), p: U("uP"), c: U("uC"), n: U("uN"), r: U("uR") };

  let seedA = 0, seedB = 0, mixV = 1, mixTarget = 1, day = 0.5, dayTarget = 0.5;
  let signals: Signal[] = [];
  let pulses: Pulse[] = [];
  let hi: string | null = null;
  const boost: number[] = [];
  const mouse = { x: -9999, y: -9999, on: 0, target: 0 };
  let ripple = { x: 0, y: 0, t0: -99, on: 0 };
  let visible = true, t = 0, lastDraw = 0;
  const P = new Float32Array(32 * 4), C = new Float32Array(32 * 3);
  const SCALE = 9;

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const k = Math.min(devicePixelRatio || 1, 1.5) * 0.62;
    const w = Math.max(2, Math.round(r.width * k)), h = Math.max(2, Math.round(r.height * k));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  };
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { resize(); if (reducedMotion()) draw(); }) : null;
  ro?.observe(canvas);
  resize();

  const rebuild = () => {
    pulses = [];
    const lanesX = Math.max(4, Math.round((canvas.width / Math.max(1, canvas.height)) * SCALE));
    signals.forEach((s, si) => {
      for (let k = 0; k < s.count && pulses.length < 32; k++) {
        const r = (n: number) => hash(`${s.id}:${k}:${n}`);
        const axis = (r(1) < 0.55 ? 0 : 1) as 0 | 1;
        pulses.push({ sig: si, axis, dir: r(2) < 0.5 ? 1 : -1, lane: axis === 0 ? 1 + Math.floor(r(3) * (SCALE - 1)) : 1 + Math.floor(r(3) * (lanesX - 1)), speed: 0.55 + r(4) * 0.9, phase: r(5) * 40 });
      }
    });
  };

  function draw(): void {
    const w = canvas.width, h = canvas.height;
    const spanX = (w / h) * SCALE + 4, spanY = SCALE + 4;
    pulses.forEach((p, i) => {
      const span = p.axis === 0 ? spanX : spanY;
      const pos = (((p.phase + t * p.speed * p.dir) % span) + span) % span - 2;
      const sig = signals[p.sig]!;
      const b = boost[p.sig] ?? 1;
      P[i * 4] = p.axis === 0 ? pos : p.lane;
      P[i * 4 + 1] = p.axis === 0 ? p.lane : pos;
      P[i * 4 + 2] = sig.strength * b;
      P[i * 4 + 3] = p.axis + (p.dir > 0 ? 2 : 0);
      C.set(sig.color, i * 3);
    });
    gl.uniform2f(u.res, w, h);
    gl.uniform1f(u.t, t);
    const k = w / Math.max(1, canvas.getBoundingClientRect().width);
    gl.uniform3f(u.m, mouse.x * k, h - mouse.y * k, mouse.on);
    gl.uniform1f(u.sa, seedA); gl.uniform1f(u.sb, seedB); gl.uniform1f(u.mix, mixV);
    gl.uniform1f(u.day, day);
    gl.uniform1f(u.sweep, reducedMotion() ? 0.3 : (t * 0.018) % 1);
    gl.uniform4fv(u.p, P); gl.uniform3fv(u.c, C); gl.uniform1i(u.n, pulses.length);
    gl.uniform4f(u.r, ripple.x * k, h - ripple.y * k, ripple.t0, ripple.on);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([e]) => { visible = Boolean(e?.isIntersecting); }) : null;
  io?.observe(canvas);

  const stop = frame((now, dt) => {
    if (!visible || !canvas.isConnected) return;
    if (reducedMotion()) { if (now - lastDraw > 1000) { lastDraw = now; mixV = mixTarget; day = dayTarget; draw(); } return; }
    t += dt;
    mixV = lerp(mixV, mixTarget, clamp(dt * 1.6));
    if (Math.abs(mixV - mixTarget) < 0.002) mixV = mixTarget;
    day = lerp(day, dayTarget, clamp(dt * 0.8));
    mouse.on = lerp(mouse.on, mouse.target, clamp(dt * 4));
    signals.forEach((_, i) => { boost[i] = lerp(boost[i] ?? 1, hi === null ? 1 : signals[i]!.id === hi ? 2.4 : 0.3, clamp(dt * 6)); });
    if (ripple.on && t - ripple.t0 > 4) ripple.on = 0;
    draw();
  });

  const host = canvas.parentElement!;
  const move = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.target = e.pointerType === "touch" ? 0 : 1; };
  const leave = () => { mouse.target = 0; };
  const hostEl = host.parentElement ?? host;
  hostEl.addEventListener("pointermove", move, { passive: true });
  hostEl.addEventListener("pointerleave", leave);

  return {
    setSeed(seed) {
      const s = (seed % 997) * 0.731 + 3.1;
      if (s === seedB) return;
      if (seedA === 0 && seedB === 0) { seedA = seedB = s; mixV = mixTarget = 1; draw(); return; }
      seedA = mixV >= 0.5 ? seedB : seedA;
      seedB = s; mixV = 0; mixTarget = 1;
      if (reducedMotion()) { mixV = 1; draw(); }
    },
    setSignals(s) { signals = s.slice(0, 16); boost.length = 0; rebuild(); if (reducedMotion()) draw(); },
    setDaylight(d) { dayTarget = clamp(d); if (reducedMotion()) { day = dayTarget; draw(); } },
    highlight(id) { hi = id; },
    ripple(x, y) { const r = canvas.getBoundingClientRect(); ripple = { x: x - r.left, y: y - r.top, t0: t, on: 1 }; },
    dispose() { stop(); ro?.disconnect(); io?.disconnect(); hostEl.removeEventListener("pointermove", move); hostEl.removeEventListener("pointerleave", leave); gl.getExtension("WEBGL_lose_context")?.loseContext(); },
  };
}
