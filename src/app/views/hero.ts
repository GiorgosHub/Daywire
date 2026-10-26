// The hero: where you are and what time it is there, the headline, the day's numbers, today's wire, and the city
// field behind it all. The field is mounted once and persists across re-renders; only its data changes.
import { sunAltitude } from "../../domain/sun.ts";
import type { Feed } from "../../domain/types.ts";
import { sections, type Row } from "../../domain/view.ts";
import { h, icon } from "../dom.ts";
import { mountField, type Field, type Signal } from "../fx/cityfield.ts";
import { reducedMotion } from "../fx/loop.ts";
import { countTo } from "../fx/motion.ts";
import { words } from "../fx/reveal.ts";
import { clock, M, num, tx, viewerTz } from "../i18n/index.ts";
import { prefsHere, S, switchTo } from "../state.ts";
import { coverageBadge } from "./home.ts";
import { wire } from "./wire.ts";

let field: Field | null = null;
let fieldTried = false;
export const fieldApi = () => field;

/** Mount the field into the persistent stage, once. */
export function mountStage(stage: HTMLElement): void {
  if (fieldTried) return;
  fieldTried = true;
  const canvas = h("canvas", { class: "cf", "aria-hidden": "true" }) as HTMLCanvasElement;
  stage.append(canvas);
  try { field = mountField(canvas); } catch (e) { console.warn("[daywire] field:", e); field = null; }
  if (field) stage.classList.add("has-field"); else canvas.remove();
}

const SEV: Record<number, [number, number, number]> = { 4: [0.92, 0.32, 0.27], 3: [0.96, 0.55, 0.22], 2: [0.93, 0.8, 0.3], 1: [0.72, 0.83, 0.88] };
const CAT: Record<string, [number, number, number]> = { water: [0.36, 0.83, 0.92], transport: [0.72, 0.64, 1], roads: [0.98, 0.74, 0.36], power: [0.98, 0.9, 0.45] };

/** Today's notices for the field: in force, or starting before the end of the local day. */
export function signalsFrom(rows: Row[], now: number): Signal[] {
  return rows
    .filter((r) => r.st.state === "active" || r.st.state === "open_ended" || (r.st.state === "upcoming" && (r.st.startMs ?? Infinity) - now < 86_400_000))
    .filter((r) => r.n.category !== "announcement")
    .sort((a, b) => (b.n.severity?.rank ?? 0) - (a.n.severity?.rank ?? 0))
    .map((r) => {
      const rank = r.n.severity?.rank ?? 0;
      return {
        id: r.n.id,
        color: rank ? SEV[rank]! : CAT[r.n.category] ?? [0.56, 0.83, 0.91],
        strength: r.st.unverified ? 0.45 : r.st.state === "upcoming" ? 0.6 : 1,
        count: (rank >= 3 ? 3 : rank === 2 ? 2 : 1) + (r.priority ? 1 : 0),
      };
    });
}

let bootedFor = "";
export function feedField(f: Feed | undefined, rows: Row[], now: number): void {
  if (!field) return;
  const loc = f?.location ?? S.current;
  if (loc) {
    field.setSeed(loc.geonameId);
    // a new place switches on: the scan crosses its streets, then its notices light up one by one
    if (loc.id !== bootedFor) { bootedFor = loc.id; field.boot(); }
    const alt = sunAltitude(now, loc.lat, loc.lon);
    field.setDaylight((alt + 8) / 26);
  }
  field.setSignals(f && f.coverage.level !== "none" ? signalsFrom(rows, now) : []);
}

function coords(lat: number, lon: number): string {
  const c = M().compass;
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? c.n : c.s} · ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? c.e : c.w}`;
}

/** Live local time for the location; every element with data-clock-tz is updated by one timer. */
export function liveClock(tz: string): HTMLElement {
  const el = h("time", { class: "live", "data-clock-tz": tz });
  el.textContent = clockSeconds(Date.now(), tz);
  return el;
}
const clockSeconds = (ms: number, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(ms);
let clockTimer = 0;
export function startClocks(): void {
  if (clockTimer) return;
  clockTimer = window.setInterval(() => {
    for (const el of document.querySelectorAll<HTMLElement>("[data-clock-tz]")) el.textContent = clockSeconds(Date.now(), el.dataset.clockTz!);
  }, 1000);
}

let lastKey = "";

export function hero(all: Row[], now: number): HTMLElement {
  const m = M();
  const f = S.feed;
  const loc = S.current;
  const key = `${loc?.id ?? "-"}|${m.heroTitleA}`;
  const entering = key !== lastKey && !reducedMotion();
  lastKey = key;

  const titleA = words(m.heroTitleA);
  const titleB = words(m.heroTitleB, titleA.length);
  const underline = h("span", { class: "pulse-line", "aria-hidden": "true" });
  underline.innerHTML = '<svg viewBox="0 0 400 24" preserveAspectRatio="none"><path class="d" pathLength="1" d="M0 14 H170 L182 14 L190 3 L200 22 L209 8 L216 14 H400"/><path class="s" pathLength="1" d="M0 14 H170 L182 14 L190 3 L200 22 L209 8 L216 14 H400"/></svg>';

  const sec = f && f.coverage.level !== "none" ? sections(all, prefsHere(), now) : null;
  const counter = (k: string, v: number, label: string, tone: string) => {
    const n = h("strong", { class: "ro-n" });
    countTo(n, `${loc?.id}:${k}`, v, num);
    return h("div", { class: `ro ro-${tone}` }, n, h("span", { class: "ro-l" }, label));
  };

  const copy = h("div", { class: "hero-copy" },
    loc ? h("div", { class: "here" },
      h("p", { class: "here-place" }, h("span", {}, h("strong", {}, tx(loc.name)), [tx(loc.admin1), tx(loc.country)].filter(Boolean).map((x) => `, ${x}`).join(""))),
      h("p", { class: "here-time" }, liveClock(loc.tz),
        h("span", { class: "here-zone" }, loc.tz !== viewerTz() ? m.localTime(clock(now, loc.tz).split(" ").slice(1).join(" ")) : m.localTime("").trim()),
        h("span", { class: "here-coord" }, coords(loc.lat, loc.lon))),
    ) : h("div", { class: "here" }, h("p", { class: "here-place" }, h("strong", {}, m.noLocationYet))),
    h("h1", { class: "title" }, ...titleA, " ", h("em", {}, ...titleB, underline)),
    h("p", { class: "sub" }, m.heroSub),
    sec ? h("div", { class: "readout", role: "group", "aria-label": m.readout },
      counter("now", sec.counts.inForce, m.ovInForce, "now"),
      counter("next", sec.counts.next7, m.ovNext7, "next"),
      counter("ended", sec.counts.endedRecently, m.ovEnded, "ended"),
      h("div", { class: "ro ro-cov" }, coverageBadge(f!.coverage.level)),
    ) : null,
    h("div", { class: "hero-foot" }, freshness(), locationChips()),
  );

  const panel = heroPanel(all, now);
  const caption = f && f.coverage.level !== "none" && field
    ? h("p", { class: "field-cap" }, (() => { const k = signalsFrom(all, now).length; return k ? m.fieldCaption(k) : m.fieldCaptionNone; })())
    : null;
  return h("div", { class: `wrap hero${entering ? " entering" : " settled"}` }, copy, panel, caption);
}

function freshness(): HTMLElement {
  const m = M();
  const f = S.feed;
  if (!S.current) return h("span", { class: "fresh none" }, h("span", { class: "fresh-dot", "aria-hidden": "true" }), m.noLocationYet);
  if (!f) return h("span", { class: "fresh" }, h("span", { class: "fresh-dot", "aria-hidden": "true" }), S.feedState === "error" ? m.notChecked : m.checking);
  const connected = f.sources.filter((s) => s.state !== "link-only" && s.state !== "needs-config");
  const ok = connected.filter((s) => s.state === "ok").length;
  return h("a", { class: `fresh${!connected.length ? " none" : ok < connected.length || S.feedState === "cached" ? " warn" : ""}`, href: "#/sources", title: m.sourceStatus },
    h("span", { class: "fresh-dot", "aria-hidden": "true" }),
    connected.length ? m.checkedSources(clock(Date.parse(f.generatedAt), f.location.tz), ok, connected.length) : m.noConnectedSources);
}

function locationChips(): HTMLElement | null {
  const saved = S.prefs.locations;
  if (saved.length < 2) return null;
  return h("nav", { class: "loc-chips", "aria-label": M().yourLocations }, saved.map((s) => h("button", {
    type: "button", class: "loc-chip", "aria-current": s.location.id === S.current?.id ? "true" : null, onclick: () => switchTo(s.location),
  }, s.label ? h("span", { class: "lc-label" }, s.label) : null, tx(s.location.name))));
}

function heroPanel(all: Row[], now: number): HTMLElement | null {
  const m = M();
  const f = S.feed;
  if (!S.current) return h("div", { class: "hero-empty", "aria-hidden": "true" }, icon("pin"));
  if (!f) return h("div", { class: "wire wire-loading", "aria-hidden": "true" }, h("span", { class: "wl-scan" }));
  if (f.coverage.level === "none") return h("section", { class: "wire wire-local", "aria-label": m.localTime("") },
    h("p", { class: "wl-big" }, liveClock(f.location.tz)),
    h("p", { class: "wire-empty" }, `${tx(f.location.name)} · ${m.localTime(clock(now, f.location.tz).split(" ").slice(1).join(" ") || f.location.tz)}`),
    h("p", { class: "wire-empty" }, m.covLevel.none));
  return wire(all, now, f.location);
}
