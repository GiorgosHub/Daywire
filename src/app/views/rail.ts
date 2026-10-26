// The rail: on wide screens, a wire down the left margin with one stop per section of the page. A pulse rides it at
// your reading position (teleia's travelling full stop, as a signal on a line); the stop you are at is lit. The stops
// are buttons that take you to their section, so the rail is navigation, not decoration.
// Smoothness: positions are measured once per layout (railMeasure) and the scroll only writes (railUpdate).
import { h } from "../dom.ts";
import { M } from "../i18n/index.ts";
import { reducedMotion } from "../fx/loop.ts";

export interface RailLayout { secTops: number[]; stopYs: number[] }

export function railFor(main: HTMLElement): HTMLElement | null {
  const secs = [...main.querySelectorAll<HTMLElement>("section.sec[id]")];
  if (secs.length < 2) return null;
  return h("nav", { class: "rail", "aria-label": M().railLabel },
    h("span", { class: "rl-line", "aria-hidden": "true" }, h("span", { class: "rl-pulse" })),
    h("ol", {}, secs.map((s) => {
      const title = s.querySelector(".sh-t")?.textContent ?? "";
      const count = s.querySelector(".count")?.textContent ?? "";
      return h("li", { "data-for": s.id },
        h("button", { type: "button", class: "rl-stop", onclick: () => {
          s.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
          (s.querySelector("h2, summary") as HTMLElement | null)?.focus?.({ preventScroll: true });
        } },
          h("span", { class: "rl-dot", "aria-hidden": "true" }),
          h("span", { class: "rl-label" }, title, count ? h("span", { class: "rl-n" }, count) : null)));
    })));
}

/** Read everything the rail needs, once per layout: where each section starts on the page, where each stop sits. */
export function railMeasure(rail: HTMLElement | null): RailLayout | null {
  if (!rail || !rail.isConnected) return null;
  const stops = [...rail.querySelectorAll<HTMLElement>("li[data-for]")];
  const y = scrollY;
  return {
    secTops: stops.map((li) => (document.getElementById(li.dataset.for!)?.getBoundingClientRect().top ?? Infinity) + y),
    stopYs: stops.map((li) => li.offsetTop + li.offsetHeight / 2),
  };
}

let lastAt = -2, lastPy = -1;
/** Light the stop you are at and move the pulse between stops. Writes only; no layout reads. */
export function railUpdate(rail: HTMLElement | null, L: RailLayout | null, scrollTop: number): void {
  if (!rail || !L || !L.stopYs.length) return;
  const mark = scrollTop + innerHeight * 0.35;
  let at = -1;
  for (let i = 0; i < L.secTops.length; i++) if (L.secTops[i]! <= mark) at = i;
  let frac = 0;
  if (at >= 0 && at < L.secTops.length - 1) frac = Math.min(1, Math.max(0, (mark - L.secTops[at]!) / Math.max(1, L.secTops[at + 1]! - L.secTops[at]!)));
  const y0 = L.stopYs[0]!, y1 = L.stopYs[L.stopYs.length - 1]!;
  const py = at < 0 ? y0 : at >= L.stopYs.length - 1 ? y1 : L.stopYs[at]! + (L.stopYs[at + 1]! - L.stopYs[at]!) * frac;
  if (at !== lastAt) {
    lastAt = at;
    rail.querySelectorAll<HTMLElement>("li[data-for]").forEach((li, i) => { li.classList.toggle("on", i === at); li.classList.toggle("past", i < at); });
    rail.classList.toggle("ahead", at < 0);
    rail.style.setProperty("--y0", `${y0}px`);
    rail.style.setProperty("--y1", `${y1}px`);
  }
  if (Math.abs(py - lastPy) > 0.5) { lastPy = py; rail.style.setProperty("--py", `${py.toFixed(1)}px`); }
}

/** A new rail (after a render) starts from scratch. */
export function railReset(): void { lastAt = -2; lastPy = -1; }
