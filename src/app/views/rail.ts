// The rail: on wide screens, a wire down the left margin with one stop per section of the page. A pulse rides it at
// your reading position (teleia's travelling full stop, as a signal on a line); the stop you are at is lit. The stops
// are buttons that take you to their section, so the rail is navigation, not decoration.
import { h } from "../dom.ts";
import { M } from "../i18n/index.ts";
import { reducedMotion } from "../fx/loop.ts";

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

/** Light the stop you are at and move the pulse between stops with the scroll. */
export function railUpdate(rail: HTMLElement | null, main: HTMLElement): void {
  if (!rail || !rail.isConnected) return;
  const stops = [...rail.querySelectorAll<HTMLElement>("li[data-for]")];
  const mark = innerHeight * 0.35;
  let at = -1, frac = 0;
  const tops = stops.map((li) => document.getElementById(li.dataset.for!)?.getBoundingClientRect().top ?? Infinity);
  for (let i = 0; i < tops.length; i++) if (tops[i]! <= mark) at = i;
  if (at >= 0 && at < tops.length - 1) frac = Math.min(1, Math.max(0, (mark - tops[at]!) / Math.max(1, tops[at + 1]! - tops[at]!)));
  stops.forEach((li, i) => { li.classList.toggle("on", i === at); li.classList.toggle("past", i < at); });
  const first = stops[0], last = stops[stops.length - 1];
  if (!first || !last) return;
  const y0 = first.offsetTop + first.offsetHeight / 2, y1 = last.offsetTop + last.offsetHeight / 2;
  const cur = at < 0 ? y0 : at >= stops.length - 1 ? y1 : (() => {
    const a = stops[at]!, b = stops[at + 1]!;
    return a.offsetTop + a.offsetHeight / 2 + (b.offsetTop - a.offsetTop) * frac;
  })();
  rail.style.setProperty("--y0", `${y0}px`);
  rail.style.setProperty("--y1", `${y1}px`);
  rail.style.setProperty("--py", `${cur}px`);
  rail.classList.toggle("ahead", at < 0);
  void main;
}
