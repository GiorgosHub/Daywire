// Split-flap cells, as on a station departure board.
// At rest a cell is ONE element: a two-tone plate (top half lighter, bottom darker, a hinge line) with its character
// as plain text. Only while it turns does it get four halves:
//   t  (static top)    shows the NEXT character's top, revealed as the flap above it falls
//   b  (static bottom) shows the CURRENT character's bottom, covered as the new flap lands
//   ft (falling top)   the CURRENT character's top, turning 0° → -90° about its bottom edge
//   fb (landing bottom) the NEXT character's bottom, turning 90° → 0° about its top edge
// The halves are removed when it lands, so a board of ~400 cells is ~400 elements, not ~3,600, and only the cells
// that are moving cost anything. Changing a cell turns it through the characters between the old and the new one, as
// real boards do (at most a handful). One frame loop drives every moving cell and stops when none move; it writes
// transforms only (no filters, no layout). Reduced motion: characters are set directly. Flap text is decoration for
// sighted readers (aria-hidden): every board row carries its full text as an accessible name.
import { frame, reducedMotion } from "./loop.ts";

const ORDER = " ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.,-/+·'&()%";
const STEP_MS = 70;        // one character's turn (two halves)
const MAX_STEPS = 6;       // characters shown on the way to the target

interface Halves { t: Text; b: Text; ft: HTMLElement; ftx: Text; fb: HTMLElement; fbx: Text; wrap: HTMLElement[] }
interface Cell { el: HTMLElement; txt: Text; cur: string; queue: string[]; start: number; from: string; h: Halves | null; begun: string }

const moving = new Set<Cell>();
let stop: (() => void) | null = null;

/** Upper-case for a board: Greek capitals carry no accents (Η ΜΕΡΑ, not Η ΜΈΡΑ). */
export function boardCase(s: string, lang = "el"): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleUpperCase(lang).replace(/\s+/g, " ").trim();
}

function half(cls: string): [HTMLElement, Text] {
  const o = document.createElement("span"); o.className = `fh ${cls}`;
  const i = document.createElement("span"); const t = document.createTextNode(""); i.append(t); o.append(i);
  return [o, t];
}

function setChar(c: Cell, ch: string): void {
  c.txt.data = ch;
  c.cur = ch;
  c.el.classList.toggle("blank", ch === " ");
}

function attach(c: Cell): Halves {
  const [t, tt] = half("t"), [b, bt] = half("b"), [ft, ftx] = half("ft"), [fb, fbx] = half("fb");
  c.el.append(t, b, ft, fb);
  c.el.classList.add("turning");
  return { t: tt, b: bt, ft, ftx, fb, fbx, wrap: [t, b, ft, fb] };
}

function detach(c: Cell): void {
  if (!c.h) return;
  for (const x of c.h.wrap) x.remove();
  c.h = null;
  c.el.classList.remove("turning");
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
    const h = c.h ?? (c.h = attach(c));
    const next = c.queue[0]!;
    const k = (now - c.start) / STEP_MS;
    if (c.begun !== c.from + next) {
      // begin a turn: the falling flap still shows what was there, the halves behind show what comes
      c.begun = c.from + next;
      h.ftx.data = c.from; h.b.data = c.from; h.t.data = next; h.fbx.data = next;
      h.fb.style.transform = "rotateX(90deg)";
    }
    if (k < 0.5) {
      h.ft.style.transform = `rotateX(${(-180 * k).toFixed(1)}deg)`;
    } else if (k < 1) {
      h.ft.style.transform = "rotateX(-90deg)";
      h.fb.style.transform = `rotateX(${(90 - 180 * (k - 0.5)).toFixed(1)}deg)`;
    } else {
      c.queue.shift();
      c.from = next;
      c.start = now;
      h.ft.style.transform = "";
      if (!c.queue.length) {
        setChar(c, next);
        detach(c);
        c.begun = "";
        moving.delete(c);
      }
    }
  }
  if (!moving.size && stop) { stop(); stop = null; }
}

function animate(c: Cell, to: string, delay: number): void {
  if (reducedMotion() || !c.el.isConnected) { moving.delete(c); c.queue = []; detach(c); setChar(c, to); return; }
  const from = moving.has(c) ? c.queue[0] ?? c.cur : c.cur;
  c.queue = path(from, to);
  c.from = from;
  c.start = performance.now() + delay;
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
      const txt = document.createTextNode(" "); el.append(txt);
      this.cells.push({ el, txt, cur: " ", queue: [], start: 0, from: " ", h: null, begun: "" });
      this.el.append(el);
    }
  }
  /** Show `text` (padded or cut to the width, with "…" when cut). `delay` staggers the cells, in ms. */
  set(text: string, { delay = 0, stagger = 22, align = "left" as "left" | "right" | "center", animate: anim = true } = {}): void {
    let s = text.length > this.width ? text.slice(0, this.width - 1).trimEnd() + "…" : text;
    const pad = this.width - s.length;
    s = align === "right" ? " ".repeat(pad) + s : align === "center" ? " ".repeat(pad >> 1) + s + " ".repeat(pad - (pad >> 1)) : s + " ".repeat(pad);
    let k = 0;
    this.cells.forEach((c, i) => {
      const ch = s[i] ?? " ";
      const target = moving.has(c) ? c.queue[c.queue.length - 1] : c.cur;
      if (ch === target) return;
      if (!anim) { moving.delete(c); c.queue = []; detach(c); setChar(c, ch); return; }
      // stagger by the cells that actually change, so a short change doesn't wait for the cells before it
      animate(c, ch, delay + (k++) * stagger);
    });
  }
  /** Spin some cells through random characters (a board fetching new data). */
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
