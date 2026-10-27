// The page glides on the mouse wheel, as on the Giannotas site: each notch moves a target and the page eases towards
// it frame by frame, so a stepped wheel feels like one continuous motion. Only for a mouse or trackpad (phones and
// tablets keep their own scrolling), never with reduced motion, and it hands scrolling back to the browser for good
// if this computer can't keep up. Boxes with their own scroll (an open dialog, a long list) keep the wheel while they
// can still move. Keys, the scrollbar and links to a place on the page behave as usual.
import { reducedMotion } from "./loop.ts";

export function installGlide(): void {
  if (reducedMotion() || typeof matchMedia === "undefined" || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const doc = document.documentElement;
  let target = 0, pos = 0, raf = 0, prev = 0, mine = 0, room = 0;
  const measure = () => { room = Math.max(0, doc.scrollHeight - innerHeight); };
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(measure).observe(document.body);
  measure();
  const clamp = (y: number) => Math.max(0, Math.min(room, y));

  // if many frames run long while gliding, give the wheel back to the browser
  let seen = 0, slow = 0, last = 0, off = false;
  const check = (now: number): boolean => {
    if (last && now - last < 200) { seen++; if (now - last > 42) slow++; }
    last = now;
    if (seen >= 40) { if (slow >= 12) { off = true; stop(); return false; } seen = slow = 0; }
    return true;
  };
  const step = (now: number) => {
    if (!check(now)) return;
    const dt = prev ? Math.min(50, now - prev) : 16.7; prev = now;
    pos += (target - pos) * (1 - Math.exp(-dt / 105));
    if (Math.abs(target - pos) < 0.5) pos = target;
    mine++; scrollTo({ top: pos, behavior: "instant" as ScrollBehavior });
    if (pos !== target) raf = requestAnimationFrame(step); else { raf = 0; prev = 0; }
  };
  const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; prev = 0; } target = pos = scrollY; };

  const scrolls = new WeakMap<Element, boolean>();
  const canScrollY = (el: Element) => { let v = scrolls.get(el); if (v === undefined) { const o = getComputedStyle(el).overflowY; v = o === "auto" || o === "scroll"; scrolls.set(el, v); } return v; };
  const innerScroller = (el: Element | null, dy: number): boolean => {
    for (; el && el !== document.body && el !== doc; el = el.parentElement) {
      if (!canScrollY(el) || el.scrollHeight <= el.clientHeight + 1) continue;
      if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
    }
    return false;
  };

  addEventListener("wheel", (e) => {
    if (off || e.defaultPrevented || e.ctrlKey || document.querySelector("dialog[open]")) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (innerScroller(e.target as Element, e.deltaY)) return;
    e.preventDefault();
    const d = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
    if (!raf) { pos = scrollY; prev = 0; target = scrollY; }
    target = clamp(target + d);
    if (!raf) raf = requestAnimationFrame(step);
  }, { passive: false });
  addEventListener("scroll", () => { if (mine) { mine--; return; } if (!raf) target = pos = scrollY; }, { passive: true });
  addEventListener("keydown", (e) => { if (raf && /^(Arrow|Page|Home|End| $)/.test(e.key)) stop(); });
  addEventListener("pointerdown", (e) => { if (raf && e.target === doc) stop(); });
  addEventListener("resize", () => { measure(); target = clamp(target); });
}
