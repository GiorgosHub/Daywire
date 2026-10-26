import type { Feed, GeoLocation } from "../domain/types.ts";
import type { Filters, Prefs } from "../domain/view.ts";
import { load, save, type SavedLocation, type Stored } from "./prefs.ts";

export type FeedState = "idle" | "loading" | "ok" | "error" | "cached";

export const S: {
  prefs: Stored;
  /** The location being viewed: a saved one, or one opened from search or a link and not saved (yet). */
  current?: GeoLocation;
  feed?: Feed;
  feedState: FeedState;
  error?: string;
  filters: Filters;
  previousVisit?: number;
  /** Test clock: only honoured for fixture data, never for live data. */
  nowOverride?: number;
} = {
  prefs: load(),
  feedState: "idle",
  filters: { q: "", categories: [], time: "all", publisher: "", mineOnly: false, savedOnly: false },
};

export function now(): number {
  return S.nowOverride !== undefined && S.feed?.mode === "fixture" ? S.nowOverride : Date.now();
}

let renderFn: () => void = () => {};
export const onRender = (fn: () => void) => { renderFn = fn; };
export const rerender = () => renderFn();

let switchFn: (loc: GeoLocation) => void = () => {};
export const onSwitch = (fn: (loc: GeoLocation) => void) => { switchFn = fn; };
/** Show another location (loads its feed). */
export const switchTo = (loc: GeoLocation) => switchFn(loc);

export function update(p: Partial<Stored>): void {
  S.prefs = { ...S.prefs, ...p };
  save(S.prefs);
  rerender();
}

export const savedEntry = (id = S.current?.id): SavedLocation | undefined => S.prefs.locations.find((l) => l.location.id === id);
export const isSaved = (id = S.current?.id) => Boolean(savedEntry(id));

export function updateEntry(id: string, patch: Partial<SavedLocation>): void {
  update({ locations: S.prefs.locations.map((l) => (l.location.id === id ? { ...l, ...patch } : l)) });
}

export function saveLocation(loc: GeoLocation, label?: string): void {
  if (isSaved(loc.id)) return;
  update({ locations: [...S.prefs.locations, { location: loc, ...(label ? { label } : {}), placeIds: [], terms: [] }].slice(0, 12), activeId: loc.id });
}

export function removeLocation(id: string): void {
  const locations = S.prefs.locations.filter((l) => l.location.id !== id);
  update({ locations, ...(S.prefs.activeId === id ? (locations[0] ? { activeId: locations[0].location.id } : { activeId: undefined }) : {}) });
}

/** Relevance preferences for the location being viewed. */
export function prefsHere(): Prefs {
  const e = savedEntry();
  return { locationId: S.current?.id ?? "", placeIds: e?.placeIds ?? [], terms: e?.terms ?? [], categories: S.prefs.categories, saved: S.prefs.savedNotices };
}

export const filtersActive = () => {
  const f = S.filters;
  return Boolean(f.q.trim() || f.categories.length || f.time !== "all" || f.publisher || f.mineOnly || f.savedOnly);
};

export function failedSources(): Set<string> {
  if (!S.feed) return new Set();
  if (S.feedState === "cached") return new Set(S.feed.sources.map((s) => s.id));
  return new Set(S.feed.sources.filter((s) => s.state === "error" || s.state === "stale" || s.state === "backoff").map((s) => s.id));
}
