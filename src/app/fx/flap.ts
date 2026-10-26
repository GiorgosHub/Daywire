// Split-flap cells, as on a station departure board. Each cell has four halves:
//   t  (static top)    shows the NEXT character's top, revealed as the flap above it falls
//   b  (static bottom) shows the CURRENT character's bottom, covered as the new flap lands
//   ft (falling top)   the CURRENT character's top, turning 0° → -90° about its bottom edge
//   fb (landing bottom) the NEXT character's bottom, turning 90° → 0° about its top edge
// Changing a cell turns it through the characters between the old and the new one, as real boards do (at most a
// handful, so a change reads in well under a second). One frame loop drives every moving cell; at rest nothing runs.
// Reduced motion: characters are set directly. Flap text is decoration for sighted readers (aria-hidden): every
// board row carries its full text as an accessible name.
import { frame, reducedMotion } from "./loop.ts";

const ORDER = " ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.,-/+·'&()%";
const STEP_MS = 64;        // one character's turn (two halves)
const MAX_STEPS = 7;       // characters shown on the way to the target

interface Cell { el: HTMLElement; t: HTMLElement; b: HTMLElement; ft: HTMLElement; fb: HTMLElement; cur: string; queue: string[]; start: number; from: string }

const moving = new Set<Cell>();
let stop: (() => void) | null = null;

function half(cls: string): [HTMLElement, HTMLElement] {
  const o = document.createElement("span"); o.className = `fh ${cls}`;
  const i = document.createElement("span"); o.append(i);
  return [o, i];
}

/** Upper-case for a board: Greek capitals carry no accents (Η ΜΕΡΑ, not Η ΜΈΡΑ). */
export function boardCase(s: string, lang = "el"): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleUpperCase(lang).replace(/\s+/g, " ").trim();
}

function setChar(c: Cell, ch: string): void {
  for (const x of [c.t, c.b, c.ft, c.fb]) x.firstChild!.textContent = ch;
  c.cur = ch;
  c.el.classList.toggle("blank", ch === " ");
}

function path(from: string, to: string): string[] {
  const a = ORDER.indexOf(from), b = ORDER.indexOf(to);
  if (a < 0 || b < 0) return [to];
  const steps: string[] = [];
  const n = ORDER.length;
  let d = (b - a + n) % n;
  let i = a;
  if (d > MAX_STEPS) { i = (b - MAX_STEPS + n) % n; d = MAX_STEPS; }
  for (let k = 0; k < d; k++) { i = (i + 1) % n; steps.push(ORDER[i]!); }
  return steps.length ? steps : [to];
}

function tick(now: number): void {
  for (const c of moving) {
    if (now < c.start) continue;
    const next = c.queue[0]!;
    const k = (now - c.start) / STEP_MS;
    if (c.ft.dataset.from !== c.from) {
      // begin a turn: the falling flap still shows what was there, the halves behind show what comes
      c.ft.dataset.from = c.from;
      c.ft.firstChild!.textContent = c.from;
      c.b.firstChild!.textContent = c.from;
      c.t.firstChild!.textContent = next;
      c.fb.firstChild!.textContent = next;
    }
    if (k < 0.5) {
      c.ft.style.transform = `rotateX(${-180 * k}deg)`;
      c.ft.style.filter = `brightness(${1 - k * 0.9})`;
      c.fb.style.transform = "rotateX(90deg)";
    } else if (k < 1) {
      c.ft.style.transform = "rotateX(-90deg)";
      c.fb.style.transform = `rotateX(${90 - 180 * (k - 0.5)}deg)`;
      c.fb.style.filter = `brightness(${0.55 + (k - 0.5) * 0.9})`;
    } else {
      c.queue.shift();
      c.from = next;
      c.start = now;
      if (!c.queue.length) {
        setChar(c, next);
        c.ft.style.transform = ""; c.fb.style.transform = ""; c.ft.style.filter = ""; c.fb.style.filter = "";
        delete c.ft.dataset.from;
        c.el.classList.remove("turning");
        moving.delete(c);
      }
    }
  }
  if (!moving.size && stop) { stop(); stop = null; }
}

function animate(c: Cell, to: string, delay: number): void {
  if (reducedMotion() || !c.el.isConnected) { moving.delete(c); c.queue = []; setChar(c, to); return; }
  const from = moving.has(c) ? c.queue[0] ?? c.cur : c.cur;
  c.queue = path(from, to);
  c.from = from;
  c.start = performance.now() + delay;
  c.el.classList.add("turning");
  moving.add(c);
  if (!stop) stop = frame((t) => tick(t));
}

/** A fixed-width run of flap cells. */
export class FlapText {
  readonly el: HTMLElement;
  private cells: Cell[] = [];
  constructor(readonly width: number, cls = "") {
    this.el = document.createElement("span");
    this.el.className = `flaps ${cls}`.trim();
    this.el.setAttribute("aria-hidden", "true");
    for (let i = 0; i < width; i++) {
      const el = document.createElement("span"); el.className = "fc blank";
      const [t] = half("t"), [b] = half("b"), [ft] = half("ft"), [fb] = half("fb");
      el.append(t, b, ft, fb);
      const c: Cell = { el, t, b, ft, fb, cur: " ", queue: [], start: 0, from: " " };
      for (const x of [t, b, ft, fb]) x.firstChild!.textContent = " ";
      this.cells.push(c);
      this.el.append(el);
    }
  }
  /** Show `text` (padded or cut to the width, with "…" when cut). `delay` staggers the cells, in ms. */
  set(text: string, { delay = 0, stagger = 22, align = "left" as "left" | "right" | "center", animate: anim = true } = {}): void {
    let s = text.length > this.width ? text.slice(0, this.width - 1).trimEnd() + "…" : text;
    const pad = this.width - s.length;
    s = align === "right" ? " ".repeat(pad) + s : align === "center" ? " ".repeat(pad >> 1) + s + " ".repeat(pad - (pad >> 1)) : s + " ".repeat(pad);
    this.cells.forEach((c, i) => {
      const ch = s[i] ?? " ";
      const target = moving.has(c) ? c.queue[c.queue.length - 1] : c.cur;
      if (ch === target) return;
      if (!anim) { moving.delete(c); c.queue = []; setChar(c, ch); return; }
      animate(c, ch, delay + i * stagger);
    });
  }
  /** Spin every cell through random characters (a board fetching new data). */
  scramble(on: boolean): void {
    this.el.classList.toggle("scrambling", on && !reducedMotion());
    if (!on || reducedMotion()) return;
    this.cells.forEach((c, i) => {
      if (Math.random() < 0.55) return;
      const ch = ORDER[1 + Math.floor(Math.random() * (ORDER.length - 1))]!;
      animate(c, ch, i * 9 + Math.random() * 200);
    });
  }
  get text(): string { return this.cells.map((c) => (moving.has(c) ? c.queue[c.queue.length - 1] : c.cur)).join(""); }
}

const lastShown = new Map<string, string>();
/** A small flap counter that turns only when its value changed since it was last shown (re-renders don't replay it). */
export function flapNumber(key: string, value: string, width = value.length, cls = "c-num"): HTMLElement {
  const f = new FlapText(Math.max(width, value.length), cls);
  const before = lastShown.get(key);
  lastShown.set(key, value);
  if (before === value) f.set(value, { animate: false, align: "right" });
  else {
    if (before !== undefined) f.set(before, { animate: false, align: "right" });
    requestAnimationFrame(() => f.set(value, { align: "right", stagger: 90, delay: 150 }));
  }
  return f.el;
}
