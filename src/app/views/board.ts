// The city board: the hero is a split-flap departure board for the place you are looking at.
// - Its title row is the promise ("Η ΜΕΡΑ ΣΟΥ, ΜΕ ΜΙΑ ΜΑΤΙΑ."), its clock flips with the place's minutes.
// - Each row is a real notice for today, read like a timetable: from, until, what, where, status, and its hours on a
//   small 24-hour track with "now" on it. Rows link to the notice. Nothing is invented to fill the board: empty slots
//   stay blank, and the board says in words when there is nothing for today, no source here, or no answer.
// - While a feed loads the flaps spin, as a real board does when it is updating. A new place flips the whole board.
// - The board is built once and kept: re-renders call update(), and only cells whose text changed turn over.
// - Accessibility: the flaps are hidden; the title is an h1 with its text, each row is a link with a full name, and
//   the timetable is described by the column labels.
import { sunTimes } from "../../domain/sun.ts";
import { dayBounds } from "../../domain/time.ts";
import { areaNames } from "../../domain/build.ts";
import type { Notice } from "../../domain/types.ts";
import type { Row } from "../../domain/view.ts";
import { h } from "../dom.ts";
import { boardCase, FlapText } from "../fx/flap.ts";
import { clock, dayLabel, getLang, localDay, M, tx, viewerTz, zoneName } from "../i18n/index.ts";
import { S } from "../state.ts";
import { fieldApi } from "./hero.ts";
import { isNew } from "./card.ts";
import { statusText } from "./status-ui.ts";

type Tone = "now" | "next" | "ended" | "msg";
interface Line { fresh?: boolean; id?: string; href?: string; label?: string; from: string; to: string; what: string; where: string; status: string; tone: Tone; tile?: string; span?: [number, number, boolean] }

const WIDE = { title: 26, from: 5, to: 5, what: 20, where: 12, status: 9, slots: 7 };
const NARROW = { title: 13, from: 5, to: 5, what: 14, where: 0, status: 0, slots: 5 };
type Layout = typeof WIDE;

const SEV_TILE: Record<number, string> = { 1: "var(--sev1-on-dark)", 2: "var(--sev2-on-dark)", 3: "var(--sev3-on-dark)", 4: "var(--sev4-on-dark)" };
const CAT_TILE: Record<string, string> = { water: "var(--water-on-dark)", roads: "var(--roads-on-dark)", transport: "var(--transport-on-dark)", power: "var(--power-on-dark)", weather: "var(--sev1-on-dark)", services: "var(--sky)", emergency: "var(--sev4-on-dark)" };

class Slot {
  readonly li: HTMLLIElement;
  readonly a: HTMLAnchorElement;
  readonly from: FlapText; readonly to: FlapText; readonly what: FlapText; readonly where: FlapText | null; readonly status: FlapText | null;
  readonly tile: HTMLElement; readonly bar: HTMLElement; readonly track: HTMLElement;
  id: string | undefined;
  constructor(L: Layout) {
    this.from = new FlapText(L.from, "c-from"); this.to = new FlapText(L.to, "c-to");
    this.what = new FlapText(L.what, "c-what");
    this.where = L.where ? new FlapText(L.where, "c-where") : null;
    this.status = L.status ? new FlapText(L.status, "c-status") : null;
    this.tile = h("span", { class: "br-tile", "aria-hidden": "true" });
    this.bar = h("span", { class: "br-bar" });
    this.track = h("span", { class: "br-track", "aria-hidden": "true" }, this.bar, h("span", { class: "br-now" }));
    this.a = h("a", { class: "br-link", tabindex: "-1", "aria-hidden": "true" },
      h("span", { class: "br-time" }, this.from.el, this.to.el), this.tile, this.what.el, this.where?.el, this.status?.el, this.track) as HTMLAnchorElement;
    this.li = h("li", { class: "br" }, this.a) as HTMLLIElement;
    const field = fieldApi;
    this.a.addEventListener("pointerenter", () => this.id && field()?.highlight(this.id));
    this.a.addEventListener("pointerleave", () => field()?.highlight(null));
    this.a.addEventListener("focus", () => this.id && field()?.highlight(this.id));
    this.a.addEventListener("blur", () => field()?.highlight(null));
  }
  show(l: Line | null, delay: number, anim: boolean): void {
    const o = { delay, animate: anim };
    this.id = l?.id;
    this.from.set(l?.from ?? "", o); this.to.set(l?.to ?? "", { ...o, delay: delay + 60 });
    this.what.set(l?.what ?? "", { ...o, delay: delay + 120 });
    this.where?.set(l?.where ?? "", { ...o, delay: delay + 260 });
    this.status?.set(l?.status ?? "", { ...o, delay: delay + 360 });
    this.li.className = `br${l ? ` t-${l.tone}` : " empty"}${l?.fresh ? " fresh" : ""}`;
    if (l?.tile) this.li.style.setProperty("--c", l.tile); else this.li.style.removeProperty("--c");
    if (l?.href) {
      this.a.setAttribute("href", l.href); this.a.removeAttribute("tabindex"); this.a.removeAttribute("aria-hidden");
      this.a.setAttribute("aria-label", l.label ?? l.what);
    } else {
      this.a.removeAttribute("href"); this.a.setAttribute("tabindex", "-1"); this.a.removeAttribute("aria-label");
      if (l?.tone === "msg" && l.label) { this.a.removeAttribute("aria-hidden"); this.a.setAttribute("role", "note"); this.a.setAttribute("aria-label", l.label ?? l.what); }
      else { this.a.setAttribute("aria-hidden", "true"); this.a.removeAttribute("role"); }
    }
    if (l?.span) {
      const [s, e, open] = l.span;
      this.bar.style.left = `${(s * 100).toFixed(2)}%`;
      this.bar.style.width = `${Math.max(0.6, (e - s) * 100).toFixed(2)}%`;
      this.bar.classList.toggle("open", open);
      this.track.style.visibility = "";
    } else this.track.style.visibility = "hidden";
  }
}

class Board {
  readonly el: HTMLElement;
  private L: Layout;
  private titleLines: FlapText[] = [];
  private clockF: FlapText;
  private slots: Slot[] = [];
  private rowsEl: HTMLOListElement;
  private titleSr: HTMLElement;
  private zone: HTMLElement;
  private sec: HTMLElement;
  private plate: HTMLElement;
  private cols: HTMLElement;
  private foot: HTMLElement;
  private tickSlot: HTMLElement;
  private shownFor = "";
  private scrambleTimer = 0;
  tz = viewerTz();

  constructor(readonly narrow: boolean) {
    this.L = narrow ? NARROW : WIDE;
    this.titleSr = h("span", { class: "sr" });
    const titleFlaps = h("span", { class: "bd-title-flaps", "aria-hidden": "true" });
    for (let i = 0; i < (narrow ? 2 : 1); i++) { const f = new FlapText(this.L.title, "c-title"); this.titleLines.push(f); titleFlaps.append(f.el); }
    this.clockF = new FlapText(5, "c-clock");
    this.sec = h("span", { class: "bd-sec" });
    this.zone = h("span", { class: "bd-zone" });
    this.plate = h("div", { class: "bd-plate" });
    this.cols = h("div", { class: "bd-cols", "aria-hidden": "true" });
    this.rowsEl = h("ol", { class: "bd-rows" }) as HTMLOListElement;
    for (let i = 0; i < this.L.slots; i++) { const s = new Slot(this.L); this.slots.push(s); this.rowsEl.append(s.li); }
    this.foot = h("div", { class: "bd-foot" });
    this.tickSlot = h("div", { class: "bd-led" });
    this.el = h("section", { class: `board${narrow ? " narrow" : ""}`, "aria-labelledby": "board-h" },
      h("span", { class: "bd-screw tl", "aria-hidden": "true" }), h("span", { class: "bd-screw tr", "aria-hidden": "true" }),
      h("div", { class: "bd-head" },
        h("h1", { id: "board-h", class: "bd-title" }, this.titleSr, titleFlaps),
        h("div", { class: "bd-clockbox" }, this.clockF.el, h("span", { class: "bd-clockmeta" }, this.sec, this.zone))),
      this.plate, this.cols, this.rowsEl, this.foot, this.tickSlot);
  }

  private setTitle(anim: boolean, delay = 0): void {
    const t = M().heroTitle;
    this.titleSr.textContent = t;
    const up = boardCase(t, getLang());
    if (this.titleLines.length === 1) this.titleLines[0]!.set(up, { delay, stagger: 30, animate: anim });
    else {
      const cut = up.indexOf(", ");
      const [a, b] = cut > 0 ? [up.slice(0, cut + 1), up.slice(cut + 2)] : [up, ""];
      this.titleLines[0]!.set(a, { delay, stagger: 30, animate: anim });
      this.titleLines[1]!.set(b, { delay: delay + 200, stagger: 30, animate: anim });
    }
  }

  tickClock(): void {
    const now = Date.now();
    const hm = new Intl.DateTimeFormat("en-GB", { timeZone: this.tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
    if (this.clockF.text !== hm) this.clockF.set(hm, { stagger: 40 });
    this.sec.textContent = new Intl.DateTimeFormat("en-GB", { timeZone: this.tz, second: "2-digit" }).format(now).padStart(2, "0");
  }

  update(all: Row[], now: number, ticker: HTMLElement | null, foot: Node[]): void {
    const m = M();
    const loc = S.current;
    const f = S.feed && S.feed.location.id === loc?.id ? S.feed : undefined;
    const key = `${loc?.id ?? "-"}|${getLang()}`;
    const fresh = key !== this.shownFor;
    this.shownFor = key;
    this.tz = loc?.tz ?? viewerTz();
    if (fresh) this.setTitle(true, 80);
    this.tickClock();
    this.zone.textContent = loc && loc.tz !== viewerTz() ? zoneName(now, loc.tz) : "";

    // the plate: where, in plain words, with the date and the sun
    this.plate.replaceChildren(...this.plateContent(now));
    this.cols.replaceChildren(...this.colsContent(now));

    // rows
    clearInterval(this.scrambleTimer);
    const lines = this.linesFor(all, now, f);
    if (lines === "loading") {
      const spin = () => this.slots.forEach((s, i) => { if (i < 3) { s.what.scramble(true); s.from.scramble(true); } });
      spin(); this.scrambleTimer = window.setInterval(spin, 900);
      this.slots.forEach((s) => { s.li.className = "br empty loading"; s.track.style.visibility = "hidden"; });
    } else {
      lines.forEach((l, i) => this.slots[i]?.show(l, (fresh ? 500 : 0) + i * 140, true));
      for (let i = lines.length; i < this.slots.length; i++) this.slots[i]!.show(null, 0, true);
    }
    this.foot.replaceChildren(...foot);
    this.tickSlot.replaceChildren(...(ticker ? [ticker] : []));
    this.el.style.setProperty("--now", `${(this.dayFrac(now) * 100).toFixed(2)}%`);
  }

  private dayFrac(ms: number): number {
    const [d0, d1] = dayBounds(localDay(ms, this.tz), this.tz);
    return Math.min(1, Math.max(0, (ms - d0) / (d1 - d0)));
  }

  private plateContent(now: number): Node[] {
    const m = M();
    const loc = S.current;
    if (!loc) return [h("p", { class: "bd-place" }, m.noLocationYet)];
    const sun = sunTimes(localDay(now, loc.tz), loc.lat, loc.lon);
    const hm = (x: number) => clock(x, loc.tz).split(" ")[0]!;
    return [
      h("p", { class: "bd-place" }, h("strong", {}, tx(loc.name)), [tx(loc.admin1), tx(loc.country)].filter(Boolean).map((x) => `, ${x}`).join("")),
      h("p", { class: "bd-date" }, dayLabel(now, loc.tz)),
      h("p", { class: "bd-sun" }, sun.rise && sun.set ? `${m.sunrise(hm(sun.rise))}  ${m.sunset(hm(sun.set))}` : sun.polar === "day" ? m.polarDay : m.polarNight),
    ];
  }

  private colsContent(now: number): Node[] {
    const m = M();
    const loc = S.current;
    const sun = loc ? sunTimes(localDay(now, loc.tz), loc.lat, loc.lon) : {};
    const frac = (x: number) => `${(this.dayFrac(x) * 100).toFixed(2)}%`;
    const day = sun.rise && sun.set ? h("span", { class: "bc-day", style: `left:${frac(sun.rise)};width:calc(${frac(sun.set)} - ${frac(sun.rise)})` }) : null;
    return [
      h("span", { class: "bc bc-time" }, m.bdFrom, h("span", {}, m.bdTo)),
      h("span", { class: "bc bc-what" }, m.bdWhat),
      this.L.where ? h("span", { class: "bc bc-where" }, m.bdWhere) : null,
      this.L.status ? h("span", { class: "bc bc-status" }, m.bdStatus) : null,
      h("span", { class: "bc bc-track" }, day, ...[0, 6, 12, 18, 24].map((x) => h("span", { class: "bc-tick", style: `left:${(x / 24) * 100}%` }, String(x).padStart(2, "0")))),
    ].filter(Boolean) as Node[];
  }

  /** Break a message into board lines of whole words, one row each. */
  private msgLines(msg: string, label: string): Line[] {
    const w = this.L.what;
    const lines: string[] = [];
    let cur = "";
    for (const word of boardCase(msg, getLang()).split(" ")) {
      const next = cur ? `${cur} ${word}` : word;
      if (next.length > w && cur) { lines.push(cur); cur = word; } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines.map((t, i) => ({ from: "", to: "", what: t, where: "", status: "", tone: "msg" as Tone, ...(i === 0 ? { label } : {}) }));
  }

  private linesFor(all: Row[], now: number, f: typeof S.feed): Line[] | "loading" {
    const m = M();
    const loc = S.current;
    if (!loc) return this.msgLines(m.bdChoose, m.noLocationYet);
    if (!f) return S.feedState === "error" ? this.msgLines(m.bdNoAnswer, m.notChecked) : "loading";
    if (f.coverage.level === "none") return this.msgLines(m.bdNoSource, m.covLevel.none);
    const tz = loc.tz;
    const [d0, d1] = dayBounds(localDay(now, tz), tz);
    const hm = (x: number) => clock(x, tz).split(" ")[0]!;
    const dm = (x: number) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "2-digit" }).format(x);
    const today = all
      .filter((r) => r.n.category !== "announcement" && r.st.state !== "archived" && r.st.state !== "stale")
      .map((r) => {
        const ongoing = r.st.state === "open_ended" || (r.st.state === "active" && r.n.currentWhileListed);
        return { r, s: r.st.startMs ?? (ongoing ? d0 : undefined), e: r.st.endMs ?? (ongoing ? d1 : undefined), open: r.st.endMs === undefined };
      })
      .filter((x): x is { r: Row; s: number; e: number; open: boolean } => x.s !== undefined && x.e !== undefined && x.s < d1 && x.e > d0 && x.e - x.s >= 60_000);
    const rank = (r: Row) => (r.st.state === "active" || r.st.state === "open_ended" ? 0 : r.st.state === "upcoming" ? 1 : 2);
    today.sort((a, b) => rank(a.r) - rank(b.r) || (rank(a.r) === 2 ? b.e - a.e : a.s - b.s));
    if (!today.length) return this.msgLines(m.bdQuiet, m.wireEmpty);
    const room = this.L.slots;
    const shown = today.length > room ? today.slice(0, room - 1) : today;
    const lines: Line[] = shown.map(({ r, s, e, open }) => {
      const n = r.n;
      const st = statusText(n, r.st, now);
      const tone: Tone = r.st.state === "upcoming" ? "next" : r.st.state === "ended" || r.st.state === "expired" ? "ended" : "now";
      const [what, where] = this.whatWhere(n);
      const from = r.st.startMs === undefined ? "" : r.st.startMs < d0 ? dm(r.st.startMs) : hm(r.st.startMs);
      const to = r.st.endMs === undefined ? "" : r.st.endMs > d1 ? dm(r.st.endMs) : hm(r.st.endMs);
      const frac = (x: number) => (Math.min(Math.max(x, d0), d1) - d0) / (d1 - d0);
      return {
        id: n.id, href: `#/n/${encodeURIComponent(n.id)}`, fresh: isNew(n),
        label: `${tx(n.headline)}. ${st.label}${st.detail ? `, ${st.detail}` : ""}${from ? `. ${from}${to ? `–${to}` : ""}` : ""}`,
        from, to, what: boardCase(what, n.language), where: boardCase(where, n.language),
        status: boardCase(tone === "now" ? m.bdStNow : tone === "next" ? m.bdStNext : m.bdStEnded, getLang()), tone,
        tile: n.severity ? SEV_TILE[n.severity.rank] : CAT_TILE[n.category],
        span: [frac(s), frac(e), open],
      };
    });
    if (today.length > room) lines.push(...this.msgLines(m.bdMore(today.length - shown.length), m.bdMore(today.length - shown.length)).slice(0, 1));
    return lines;
  }

  private whatWhere(n: Notice): [string, string] {
    const head = tx(n.headline);
    const city = S.feed ? tx(S.feed.location.name) : "";
    if (n.severity?.hazard) return [tx(n.severity.hazard), n.scope === "region" ? tx(n.regionLabel) || city : city];
    const parts = head.split(" · ");
    if (parts.length > 1) return [parts[0]!, parts.slice(1).join(" ")];
    const areas = tx(areaNames(n.locationId, n.areas));
    return [head, areas || (n.scope === "region" ? tx(n.regionLabel) : city)];
  }
}

/** The notice view's ticket: the board row for this notice, close up, flipping in as the notice opens. */
export function ticketFor(r: Row, now: number): HTMLElement {
  const m = M();
  const n = r.n, tz = n.tz;
  const [d0, d1] = dayBounds(localDay(now, tz), tz);
  const hm = (x: number) => clock(x, tz).split(" ")[0]!;
  const dm = (x: number) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "2-digit" }).format(x);
  const fmt = (x: number | undefined) => x === undefined ? "" : x < d0 || x >= d1 ? dm(x) : hm(x);
  const tone = r.st.state === "upcoming" ? "next" : r.st.state === "active" || r.st.state === "open_ended" ? "now" : "ended";
  const from = new FlapText(5, "c-tk"), to = new FlapText(5, "c-tk"), st = new FlapText(9, "c-tk c-status");
  const go = () => {
    from.set(fmt(r.st.startMs), { delay: 120 });
    to.set(fmt(r.st.endMs), { delay: 260 });
    st.set(boardCase(tone === "now" ? m.bdStNow : tone === "next" ? m.bdStNext : m.bdStEnded, getLang()), { delay: 420 });
  };
  requestAnimationFrame(go);
  const tile = n.severity ? SEV_TILE[n.severity.rank] : CAT_TILE[n.category];
  return h("div", { class: `ticket br t-${tone}`, style: tile ? `--c:${tile}` : "", "aria-hidden": "true" },
    h("span", { class: "tk-col" }, h("span", { class: "tk-l" }, m.bdFrom), from.el),
    h("span", { class: "tk-arrow" }),
    h("span", { class: "tk-col" }, h("span", { class: "tk-l" }, m.bdTo), to.el),
    h("span", { class: "br-tile" }),
    h("span", { class: "tk-col" }, h("span", { class: "tk-l" }, m.bdStatus), st.el));
}

let board: Board | null = null;
let clockTimer = 0;
const isNarrow = () => typeof innerWidth === "number" && innerWidth < 760;

/** The board for this render: the same element every time (so flaps only turn when something changed). */
export function cityBoard(all: Row[], now: number, ticker: HTMLElement | null, foot: Node[]): HTMLElement {
  if (!board || board.narrow !== isNarrow()) board = new Board(isNarrow());
  board.update(all, now, ticker, foot);
  if (!clockTimer) clockTimer = window.setInterval(() => board?.el.isConnected && board.tickClock(), 1000);
  return board.el;
}
