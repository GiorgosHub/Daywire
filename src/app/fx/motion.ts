// Small reactions: numbers that count, sparks on save, a circle that opens a new place, pointer light on cards,
// buttons that lean toward the pointer. All respect reduced motion.
import { clamp, easeOut, finePointer, reducedMotion } from "./loop.ts";

const shown = new Map<string, number>();
/** Count a number up from what this element last showed (or 0). Uses the given formatter. */
export function countTo(el: HTMLElement, key: string, to: number, fmt: (n: number) => string, dur = 1100): void {
  const from = shown.get(key) ?? 0;
  shown.set(key, to);
  if (reducedMotion() || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  el.textContent = fmt(from);
  const step = (t: number) => {
    if (!el.isConnected) return;
    const k = clamp((t - t0) / dur);
    el.textContent = fmt(Math.round(from + (to - from) * easeOut(k)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function burst(x: number, y: number, n = 14): void {
  if (reducedMotion()) return;
  const C = ["#F7F4EC", "#CFC8BA", "#FFFFFF", "#151515"];
  for (let i = 0; i < n; i++) {
    const s = document.createElement("i");
    s.className = "spark";
    s.style.left = `${x}px`; s.style.top = `${y}px`; s.style.background = C[i % C.length]!;
    document.body.append(s);
    const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 60, sz = 0.5 + Math.random() * 0.8;
    s.animate([{ transform: `scale(${sz})`, opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d + 24}px) scale(0)`, opacity: 1 }],
      { duration: 600 + Math.random() * 350, easing: "cubic-bezier(.16,1,.3,1)" }).finished.then(() => s.remove(), () => s.remove());
  }
}

let lastPoint = { x: innerWidth / 2, y: 0 };
/** Run `update` inside a circle that opens from the last click (View Transitions where supported). */
export function circleSwap(update: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> } };
  if (reducedMotion() || !doc.startViewTransition) { update(); return; }
  const { x, y } = lastPoint;
  document.documentElement.dataset.vt = "swap";
  const vt = doc.startViewTransition(update);
  vt.ready.then(() => {
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 620, easing: "cubic-bezier(.65,0,.35,1)", pseudoElement: "::view-transition-new(root)" });
  }).catch(() => {});
  vt.finished.finally(() => { delete document.documentElement.dataset.vt; }).catch(() => {});
}

export function installPointerFx(): void {
  document.addEventListener("pointerdown", (e) => { lastPoint = { x: e.clientX, y: e.clientY }; }, { capture: true, passive: true });
  if (!finePointer()) return;
  let raf = 0, ev: PointerEvent | null = null, held: HTMLElement | null = null;
  const release = () => { if (held) { held.style.translate = ""; held = null; } };
  document.addEventListener("pointermove", (e) => {
    ev = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const t = ev!.target as Element | null;
      // light that follows the pointer across cards and panels
      const lit = t?.closest?.(".card, .panel-lit") as HTMLElement | null;
      if (lit) { const r = lit.getBoundingClientRect(); lit.style.setProperty("--mx", `${ev!.clientX - r.left}px`); lit.style.setProperty("--my", `${ev!.clientY - r.top}px`); }
      if (reducedMotion()) return;
      const b = t?.closest?.(".magnet") as HTMLElement | null;
      if (b !== held) release();
      if (!b) return;
      held = b;
      const r = b.getBoundingClientRect();
      const x = (ev!.clientX - (r.left + r.width / 2)) * 0.2, y = (ev!.clientY - (r.top + r.height / 2)) * 0.3;
      b.style.translate = `${clamp(x, -8, 8).toFixed(1)}px ${clamp(y, -6, 6).toFixed(1)}px`;
    });
  }, { passive: true });
  document.addEventListener("pointerleave", release);
}
