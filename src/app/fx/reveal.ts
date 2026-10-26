// Things arrive once: blocks settle in as they scroll into view, headings rise word by word.
// Only on first appearance; a re-render of something already seen shows it at rest.
import { reducedMotion } from "./loop.ts";

let io: IntersectionObserver | null = null;
const seen = new Set<string>();

function observer(): IntersectionObserver | null {
  if (io || typeof IntersectionObserver === "undefined") return io;
  io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    const el = e.target as HTMLElement;
    el.classList.add("in");
    setTimeout(() => el.classList.add("rv-done"), 1400);
    if (el.dataset.seen) seen.add(el.dataset.seen);
    io!.unobserve(el);
  }), { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });
  return io;
}

/** Mark an element to reveal when it enters the viewport. `key` remembers it across re-renders. */
export function reveal<T extends HTMLElement>(el: T, key?: string, index = 0): T {
  el.classList.add("rv");
  el.style.setProperty("--i", String(Math.min(index, 6)));
  if (key) el.dataset.seen = key;
  if (reducedMotion() || (key && seen.has(key)) || !observer()) { el.classList.add("in", "rv-done"); return el; }
  queueMicrotask(() => { if (el.isConnected) observer()!.observe(el); else requestAnimationFrame(() => el.isConnected && observer()!.observe(el)); });
  return el;
}

export const wasSeen = (key: string) => seen.has(key);
export const markSeen = (key: string) => seen.add(key);

/** Split a heading's text into words that rise from their own line. */
export function words(text: string, startIndex = 0): HTMLElement[] {
  return text.split(/\s+/).filter(Boolean).flatMap((word, i, all) => {
    const w = document.createElement("span");
    w.className = "w";
    const inner = document.createElement("span");
    inner.textContent = word;
    inner.style.setProperty("--i", String(startIndex + i));
    w.append(inner);
    return i < all.length - 1 ? [w, document.createTextNode(" ") as unknown as HTMLElement] : [w];
  });
}
