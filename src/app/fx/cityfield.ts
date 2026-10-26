// The city field: an abstract, generative street grid behind the hero (WebGL2).
// - Every city gets its own layout, seeded by its GeoNames id; switching city morphs from one to the other.
// - Each light travelling along the streets is a real notice in force or due today. Its colour is its severity or
//   category; hovering a notice in the page lights its pulses. With no notices there are no pulses, only a slow sweep.
// - The light of the scene follows the sun at that place (computed, not decorative).
// - Switching on (Giannotas' sign, an x-ray scan): on first view and on each new city, a scanner crosses the
//   dark grid left to right, the streets light up behind it, and then each notice's light comes on in turn.
// - It is labelled on the page as an abstract picture: it is not a map and its streets are not real streets.
//
// Smoothness: the streets do not change from frame to frame, so they are drawn once per city (and per size) into a
// texture: warped street coordinates, line strength and street mask. Each frame then only samples that texture and
// adds the moving parts (lights, scan, pointer, sweep, grain), which is a few operations per pixel instead of the
// dozens of noise evaluations the streets need. If the GPU cannot render to a float texture, a lighter single pass
// runs at a lower resolution. The resolution also adapts: if frames run long, it steps down until they don't.
// Reduced motion: one still frame. No WebGL2: the CSS background stays (the page never depends on this).
import { clamp, frame, lerp, reducedMotion } from "./loop.ts";

export interface Signal { id: string; color: [number, number, number]; strength: number; count: number }

export interface Field {
  setSeed(seed: number): void;
  setSignals(s: Signal[]): void;
  setDaylight(d: number): void;
  highlight(id: string | null): void;
  ripple(clientX: number, clientY: number): void;
  /** Run the switch-on: scan, then the lights one by one. */
  boot(): void;
  /** Stop drawing while the page covers the field (it keeps its state). */
  setActive(on: boolean): void;
  dispose(): void;
}

const VERT = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }`;

const HASH = `float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }`;
const NOISE = `
${HASH}
float nz(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a*nz(p); p = p*2.03 + 17.1; a *= .5; } return s; }
vec2 warpOf(vec2 c, float s){ return c + 1.1*vec2(fbm(c*.16 + s) - .5, fbm(c*.16 + s + 31.7) - .5); }`;

// Pass 1, once per city and size: the streets. r,g = warped coordinates; b = line strength; a = street mask.
const STREETS = `#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uS;
out vec4 o;
${NOISE}
const float SCALE = 9.;
void main(){
  vec2 c = gl_FragCoord.xy / uRes.y * SCALE;
  vec2 p = warpOf(c, uS);
  vec2 fw = fwidth(p);
  vec2 gd = abs(fract(p + .5) - .5);
  vec2 ln = 1. - smoothstep(vec2(0.), fw*1.4, gd);
  float blocks = smoothstep(.3, .42, fbm(floor(p)*.37 + uS*.13));
  float streets = max(ln.x, ln.y) * mix(.18, 1., blocks);
  vec2 ga = abs(fract(p/4. + .5) - .5) * 4.;
  vec2 la = 1. - smoothstep(vec2(0.), fw*2.4, ga);
  float avenues = max(la.x, la.y);
  float f = fbm(c*.085 + uS*.05) * 10.;
  float cont = 1. - smoothstep(0., fwidth(f)*1.3, abs(fract(f) - .5));
  o = vec4(p, streets*.07 + avenues*.12 + cont*.03, streets);
}`;

// The moving light, shared by both paths. Expects p, lines, streets, c, dm, uv, fc in scope.
const LIGHT_BODY = `
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
  vec3 night = mix(vec3(.03,.03,.033), vec3(.075,.072,.07), uDay);
  vec3 lineCol = mix(vec3(.55,.53,.5), vec3(.72,.7,.66), uDay);
  float lit = uScan < 0. ? 1. : mix(.18, 1., smoothstep(uScan + .02, uScan - .06, uv.x));
  float scan = uScan < 0. ? 0. : exp(-pow((uv.x - uScan)*26., 2.));
  float light = (1. + torch*2.6 + ring*3. + sweep*lit) * lit + scan*4.;
  vec3 col = night + lineCol * lines * light + vec3(.97,.95,.9) * (ring * streets * .25 + scan * (streets*.5 + .05));
  col += glow;
  col *= .72 + .28*smoothstep(1.25, .15, length((uv - vec2(.72, .62)) * vec2(1., 1.5)));
  col = mix(col, vec3(.05,.05,.052), smoothstep(.25, 0., uv.y) * .55);
  col += (h21(fc + fract(uT * 7.3) * 113.) - .5) * .035;
  o = vec4(col, 1.);`;

const UNIFORMS = `
uniform vec2 uRes; uniform float uT; uniform vec3 uM;
uniform float uMix, uDay, uSweep, uScan;
uniform vec4 uP[32]; uniform vec3 uC[32]; uniform int uN;
uniform vec4 uR;
out vec4 o;
const float SCALE = 9.;`;

// Pass 2, every frame: light the cached streets.
const LIGHT = `#version 300 es
precision highp float;
${UNIFORMS}
uniform sampler2D uA, uB;
${HASH}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / uRes;
  vec2 c = fc / uRes.y * SCALE;
  vec2 m = uM.xy / uRes.y * SCALE;
  float dm = length(c - m);
  // the pointer's lens: sample the streets a little towards the pointer
  vec2 luv = uv - (uv - uM.xy / uRes) * .16 * exp(-dm*dm*.3) * uM.z;
  vec4 S = mix(texture(uA, luv), texture(uB, luv), uMix);
  vec2 p = S.xy; float lines = S.z; float streets = S.w;
${LIGHT_BODY}
}`;

// Fallback, when the GPU cannot render to a float texture: streets and light in one pass, without the contours.
const SINGLE = `#version 300 es
precision highp float;
${UNIFORMS}
uniform float uSA, uSB;
${NOISE}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / uRes;
  vec2 c = fc / uRes.y * SCALE;
  vec2 m = uM.xy / uRes.y * SCALE;
  float dm = length(c - m);
  vec2 cc = c - (c - m) * .16 * exp(-dm*dm*.3) * uM.z;
  vec2 p = mix(warpOf(cc, uSA), warpOf(cc, uSB), uMix);
  vec2 fw = fwidth(p);
  vec2 gd = abs(fract(p + .5) - .5);
  vec2 ln = 1. - smoothstep(vec2(0.), fw*1.4, gd);
  float streets = max(ln.x, ln.y) * .6;
  vec2 ga = abs(fract(p/4. + .5) - .5) * 4.;
  vec2 la = 1. - smoothstep(vec2(0.), fw*2.4, ga);
  float lines = streets*.07 + max(la.x, la.y)*.12;
${LIGHT_BODY}
}`;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

interface Pulse { sig: number; axis: 0 | 1; dir: 1 | -1; lane: number; speed: number; phase: number }
interface Layer { tex: WebGLTexture; fb: WebGLFramebuffer; seed: number; w: number; h: number }

export function mountField(canvas: HTMLCanvasElement): Field | null {
  const ctx = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false, alpha: false, powerPreference: "low-power" });
  if (!ctx) return null;
  const gl: WebGL2RenderingContext = ctx;
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader"); return s; };
  const program = (frag: string): WebGLProgram | null => {
    const p = gl.createProgram()!;
    try { gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag)); } catch (e) { console.warn("[daywire] field shader:", e); return null; }
    gl.bindAttribLocation(p, 0, "a");
    gl.linkProgram(p);
    return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
  };
  // the cached streets need a float render target; without one, the lighter single pass
  const canCache = Boolean(gl.getExtension("EXT_color_buffer_float"));
  const streetsProg = canCache ? program(STREETS) : null;
  const lightProg = streetsProg ? program(LIGHT) : null;
  const twoPass = Boolean(streetsProg && lightProg);
  const mainProg = twoPass ? lightProg! : program(SINGLE);
  if (!mainProg) return null;

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const U = (n: string) => gl.getUniformLocation(mainProg, n);
  const u = { res: U("uRes"), t: U("uT"), m: U("uM"), mix: U("uMix"), day: U("uDay"), sweep: U("uSweep"), p: U("uP"), c: U("uC"), n: U("uN"), r: U("uR"), scan: U("uScan"),
    a: U("uA"), b: U("uB"), sa: U("uSA"), sb: U("uSB") };
  const su = streetsProg ? { res: gl.getUniformLocation(streetsProg, "uRes"), s: gl.getUniformLocation(streetsProg, "uS") } : null;

  let seedA = 0, seedB = 0, mixV = 1, mixTarget = 1, day = 0.5, dayTarget = 0.5;
  let signals: Signal[] = [];
  let pulses: Pulse[] = [];
  let hi: string | null = null;
  const boost: number[] = [];
  const mouse = { x: -9999, y: -9999, on: 0, target: 0 };
  let ripple = { x: 0, y: 0, t0: -99, on: 0 };
  let visible = true, active = true, t = 0, lastDraw = 0;
  let bootT = -99;
  const SCAN = 1.5, LIGHT_GAP = 0.2;
  const P = new Float32Array(32 * 4), C = new Float32Array(32 * 3);
  const SCALE = 9;
  let cssW = 1, cssH = 1;
  // resolution as a share of CSS pixels: the picture is soft by design, so it can afford fewer pixels
  let quality = twoPass ? 0.7 : 0.45;
  const frameTimes: number[] = [];

  // ——— cached street layers (at most two: the city being left and the one arriving) ———
  const layers: Layer[] = [];
  function layerFor(seed: number): Layer | null {
    if (!twoPass || !su) return null;
    const w = canvas.width, h = canvas.height;
    const found = layers.find((x) => x.seed === seed && x.w === w && x.h === h);
    if (found) return found;
    const L = layers.length >= 2 ? layers.shift()! : { tex: gl.createTexture()!, fb: gl.createFramebuffer()!, seed: 0, w: 0, h: 0 };
    gl.bindTexture(gl.TEXTURE_2D, L.tex);
    if (L.w !== w || L.h !== h) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, L.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, L.tex, 0);
    gl.viewport(0, 0, w, h);
    gl.useProgram(streetsProg);
    gl.uniform2f(su.res, w, h);
    gl.uniform1f(su.s, seed);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    L.seed = seed; L.w = w; L.h = h;
    layers.push(L);
    return L;
  }

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    cssW = Math.max(1, r.width); cssH = Math.max(1, r.height);
    const k = Math.min(devicePixelRatio || 1, 1.5) * quality;
    const w = Math.max(2, Math.round(cssW * k)), h = Math.max(2, Math.round(cssH * k));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  };
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { resize(); rect = canvas.getBoundingClientRect(); if (reducedMotion()) draw(); }) : null;
  let rect = canvas.getBoundingClientRect();
  ro?.observe(canvas);
  resize();

  const rebuild = () => {
    pulses = [];
    const lanesX = Math.max(4, Math.round((cssW / cssH) * SCALE));
    signals.forEach((s, si) => {
      for (let k = 0; k < s.count && pulses.length < 32; k++) {
        const r = (n: number) => hash(`${s.id}:${k}:${n}`);
        const axis = (r(1) < 0.55 ? 0 : 1) as 0 | 1;
        pulses.push({ sig: si, axis, dir: r(2) < 0.5 ? 1 : -1, lane: axis === 0 ? 1 + Math.floor(r(3) * (SCALE - 1)) : 1 + Math.floor(r(3) * (lanesX - 1)), speed: 0.55 + r(4) * 0.9, phase: r(5) * 40 });
      }
    });
  };

  function draw(): void {
    if (!seedB) return;
    const w = canvas.width, h = canvas.height;
    const LA = twoPass ? layerFor(seedA) : null;
    const LB = twoPass ? layerFor(seedB) : null;
    const spanX = (w / h) * SCALE + 4, spanY = SCALE + 4;
    pulses.forEach((p, i) => {
      const span = p.axis === 0 ? spanX : spanY;
      const pos = (((p.phase + t * p.speed * p.dir) % span) + span) % span - 2;
      const sig = signals[p.sig]!;
      const b = (boost[p.sig] ?? 1) * switchOn(p.sig);
      P[i * 4] = p.axis === 0 ? pos : p.lane;
      P[i * 4 + 1] = p.axis === 0 ? p.lane : pos;
      P[i * 4 + 2] = sig.strength * b;
      P[i * 4 + 3] = p.axis + (p.dir > 0 ? 2 : 0);
      C.set(sig.color, i * 3);
    });
    gl.viewport(0, 0, w, h);
    gl.useProgram(mainProg);
    if (LA && LB) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, LA.tex); gl.uniform1i(u.a, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, LB.tex); gl.uniform1i(u.b, 1);
    } else { gl.uniform1f(u.sa, seedA); gl.uniform1f(u.sb, seedB); }
    gl.uniform2f(u.res, w, h);
    gl.uniform1f(u.t, t);
    const k = w / cssW;
    gl.uniform3f(u.m, mouse.x * k, h - mouse.y * k, mouse.on);
    gl.uniform1f(u.mix, mixV);
    gl.uniform1f(u.day, day);
    gl.uniform1f(u.sweep, reducedMotion() ? 0.3 : (t * 0.018) % 1);
    gl.uniform4fv(u.p, P); gl.uniform3fv(u.c, C); gl.uniform1i(u.n, pulses.length);
    gl.uniform4f(u.r, ripple.x * k, h - ripple.y * k, ripple.t0, ripple.on);
    const since = t - bootT;
    gl.uniform1f(u.scan, since >= 0 && since < SCAN ? -0.08 + (since / SCAN) * 1.2 : -1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** 0 → 1 as a notice's light comes on after the scan, with a short flare as it does. */
  function switchOn(si: number): number {
    const since = t - bootT - SCAN * 0.7 - si * LIGHT_GAP;
    if (bootT < 0 || since > 2) return 1;
    if (since < 0) return 0;
    return clamp(since / 0.25) * (1 + 1.6 * Math.exp(-since * 4));
  }

  /** If frames keep running long (slower than ~45 a second), draw fewer pixels, down to a floor. */
  function adapt(dt: number): void {
    frameTimes.push(dt);
    if (frameTimes.length < 40) return;
    const sorted = frameTimes.sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1]!;
    frameTimes.length = 0;
    if (median > 1 / 45 && quality > 0.3) { quality = Math.max(0.3, quality * 0.8); resize(); }
  }

  const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([e]) => { visible = Boolean(e?.isIntersecting); }) : null;
  io?.observe(canvas);

  const stop = frame((now, dt) => {
    if (!visible || !active || !canvas.isConnected) return;
    if (reducedMotion()) { if (now - lastDraw > 1000) { lastDraw = now; mixV = mixTarget; day = dayTarget; draw(); } return; }
    t += dt;
    mixV = lerp(mixV, mixTarget, clamp(dt * 1.6));
    if (Math.abs(mixV - mixTarget) < 0.002) mixV = mixTarget;
    day = lerp(day, dayTarget, clamp(dt * 0.8));
    mouse.on = lerp(mouse.on, mouse.target, clamp(dt * 4));
    signals.forEach((_, i) => { boost[i] = lerp(boost[i] ?? 1, hi === null ? 1 : signals[i]!.id === hi ? 2.4 : 0.3, clamp(dt * 6)); });
    if (ripple.on && t - ripple.t0 > 4) ripple.on = 0;
    draw();
    adapt(dt);
  });

  // pointer position against a rectangle measured on enter and on scroll, never per move or per frame
  const host = canvas.parentElement!;
  const hostEl = host.parentElement ?? host;
  const measure = () => { rect = canvas.getBoundingClientRect(); };
  const move = (e: PointerEvent) => { mouse.x = e.clientX - rect.left; mouse.y = e.clientY - rect.top; mouse.target = e.pointerType === "touch" ? 0 : 1; };
  const leave = () => { mouse.target = 0; };
  hostEl.addEventListener("pointerenter", measure);
  hostEl.addEventListener("pointermove", move, { passive: true });
  hostEl.addEventListener("pointerleave", leave);
  addEventListener("scroll", measure, { passive: true });

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
    ripple(x, y) { measure(); ripple = { x: x - rect.left, y: y - rect.top, t0: t, on: 1 }; },
    boot() { if (!reducedMotion()) bootT = t; },
    setActive(on) { active = on; },
    dispose() {
      stop(); ro?.disconnect(); io?.disconnect();
      hostEl.removeEventListener("pointerenter", measure); hostEl.removeEventListener("pointermove", move); hostEl.removeEventListener("pointerleave", leave);
      removeEventListener("scroll", measure);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
