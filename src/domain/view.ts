// Turns notices + the person's preferences into what the homepage shows: relevance, priority, sections, counts.
// All counts come from the records passed in. Nothing is padded or estimated.
import { areaNames } from "./build.ts";
import { fold } from "./greek.ts";
import { isLive, statusOf, type State, type Status } from "./status.ts";
import { DAY } from "./time.ts";
import type { Category, Notice } from "./types.ts";

/** What the person chose for one location. */
export interface Prefs {
  locationId: string;
  placeIds: string[];
  /** Streets or places typed by the person, matched against the streets and areas named in notices. */
  terms: string[];
  /** Categories the person follows; empty = all. */
  categories: Category[];
  saved: string[];
}

export type Relevance = "mine" | "citywide" | "elsewhere" | "unspecified";

export interface Row { n: Notice; st: Status; rel: Relevance; matched: string[]; priority: boolean }

export function relevance(n: Notice, p: Prefs): { rel: Relevance; matched: string[] } {
  const matched: string[] = [];
  for (const a of n.areas) if (a.placeId && p.placeIds.includes(a.placeId)) matched.push(a.label);
  if (p.terms.length) {
    const hay = [...n.segments.flatMap((s) => s.streets), ...n.areas.map((a) => a.label)].map(fold);
    for (const t of p.terms) { const ft = fold(t); if (ft.length >= 3 && hay.some((h) => h.includes(ft))) matched.push(t); }
  }
  if (matched.length) return { rel: "mine", matched };
  if (n.scope === "region" || n.scope === "city") return { rel: "citywide", matched };
  if (n.scope === "unspecified") return { rel: "unspecified", matched };
  return { rel: p.placeIds.length || p.terms.length ? "elsewhere" : "unspecified", matched };
}

/**
 * High priority (deterministic):
 *  - an official warning whose source classification ranks 3 or 4 (MeteoAlarm orange/red, CAP Severe/Extreme,
 *    EA flood warning/severe flood warning) in force, or starting within 24 hours;
 *  - a civil-protection notice that is in force;
 *  - a public-transport disruption ranked 3 by its operator (suspensions, closures, severe delays) in force;
 *  - a water, power or road disruption in force or starting within 24 hours, in one of the person's places
 *    (or anywhere in the city when they have not chosen places).
 */
export function isPriority(n: Notice, st: Status, rel: Relevance, now: number, hasPlaces: boolean): boolean {
  const soon = st.state === "upcoming" && st.startMs !== undefined && st.startMs - now <= DAY;
  const inForce = st.state === "active" || st.state === "open_ended";
  const rank = n.severity?.rank ?? 0;
  if (n.category === "weather") return rank >= 3 && (st.state === "active" || soon);
  if (n.category === "emergency") return inForce;
  if (n.category === "transport") return rank >= 3 && st.state === "active";
  if (n.category === "water" || n.category === "power" || n.category === "roads") {
    if (!(st.state === "active" || soon)) return false;
    return hasPlaces ? rel === "mine" : true;
  }
  return false;
}

export function rows(notices: Notice[], p: Prefs, now: number, failed: ReadonlySet<string>): Row[] {
  const hasPlaces = p.placeIds.length + p.terms.length > 0;
  return notices.map((n) => {
    const st = statusOf(n, now, failed);
    const { rel, matched } = relevance(n, p);
    return { n, st, rel, matched, priority: isPriority(n, st, rel, now, hasPlaces) };
  });
}

const relRank: Record<Relevance, number> = { mine: 0, citywide: 1, unspecified: 2, elsewhere: 3 };
const byStart = (a: Row, b: Row) => (a.st.startMs ?? Infinity) - (b.st.startMs ?? Infinity);
const byRelThen = (f: (a: Row, b: Row) => number) => (a: Row, b: Row) => relRank[a.rel] - relRank[b.rel] || f(a, b);
const newest = (a: Row, b: Row) => Date.parse(b.n.updatedAt ?? b.n.publishedAt ?? "") - Date.parse(a.n.updatedAt ?? a.n.publishedAt ?? "");

export interface Sections {
  priority: Row[];
  now: Row[];
  upcoming: Row[];
  other: Row[];
  resolved: Row[];
  counts: { inForce: number; next7: number; endedRecently: number };
}

export function sections(all: Row[], p: Prefs, now: number): Sections {
  const followed = (r: Row) => !p.categories.length || p.categories.includes(r.n.category) || r.priority;
  const rs = all.filter(followed);
  const priority = rs.filter((r) => r.priority).sort(byRelThen(byStart));
  const rest = rs.filter((r) => !r.priority);
  const inForceStates: State[] = ["active", "open_ended"];
  return {
    priority,
    now: rest.filter((r) => inForceStates.includes(r.st.state) && r.n.category !== "announcement").sort(byRelThen(newest)),
    upcoming: rest.filter((r) => r.st.state === "upcoming").sort(byRelThen(byStart)),
    other: rest.filter((r) => r.st.state === "info" || (r.n.category === "announcement" && inForceStates.includes(r.st.state))).sort(newest),
    // ended, expired, and disruptions whose last announcement is too old to trust ("stale")
    resolved: rs.filter((r) => r.st.state === "ended" || r.st.state === "expired" || r.st.state === "stale").sort((a, b) => (b.st.endMs ?? b.st.startMs ?? 0) - (a.st.endMs ?? a.st.startMs ?? 0)),
    counts: {
      inForce: rs.filter((r) => inForceStates.includes(r.st.state) && r.n.category !== "announcement").length,
      next7: rs.filter((r) => r.st.state === "upcoming" && (r.st.startMs ?? Infinity) - now <= 7 * DAY).length,
      endedRecently: rs.filter((r) => (r.st.state === "ended" || r.st.state === "expired") && now - (r.st.endMs ?? 0) <= 7 * DAY).length,
    },
  };
}

/**
 * Accent- and case-insensitive search over what a notice says and where it applies, in every language we hold
 * for it. `labels` adds interface words (category names) in the person's language. All words must match.
 */
export function haystack(n: Notice, labels: string[] = []): string {
  const names = areaNames(n.locationId, n.areas);
  return fold([n.originalTitle, ...Object.values(n.headline), n.body, ...n.bodyAlt.map((b) => b.text), ...Object.values(names),
    ...n.segments.flatMap((s) => s.streets), ...Object.values(n.publisher), ...Object.values(n.regionLabel ?? { en: "" }),
    ...Object.values(n.severity?.label ?? { en: "" }), ...labels].join(" \n "));
}

export function matches(n: Notice, q: string, labels: string[] = []): boolean {
  const words = fold(q).split(" ").filter(Boolean);
  if (!words.length) return true;
  const h = haystack(n, labels);
  return words.every((w) => h.includes(w));
}

export type TimeFilter = "all" | "now" | "next7" | "ended";
export interface Filters { q: string; categories: Category[]; time: TimeFilter; publisher: string; mineOnly: boolean; savedOnly: boolean }

export function applyFilters(all: Row[], f: Filters, p: Prefs, now: number, labelsFor: (n: Notice) => string[] = () => []): Row[] {
  return all.filter((r) => {
    if (f.q && !matches(r.n, f.q, labelsFor(r.n))) return false;
    if (f.categories.length && !f.categories.includes(r.n.category)) return false;
    if (f.publisher && r.n.publisher.en !== f.publisher) return false;
    if (f.mineOnly && r.rel !== "mine" && r.rel !== "citywide") return false;
    if (f.savedOnly && !p.saved.includes(r.n.id)) return false;
    if (f.time === "now" && !(r.st.state === "active" || r.st.state === "open_ended")) return false;
    if (f.time === "next7" && !(r.st.state === "upcoming" && (r.st.startMs ?? Infinity) - now <= 7 * DAY)) return false;
    if (f.time === "ended" && !(r.st.state === "ended" || r.st.state === "expired" || r.st.state === "archived")) return false;
    return true;
  });
}

export { isLive };
