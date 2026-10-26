import type { Feed } from "../domain/types.ts";
import type { Filters } from "../domain/view.ts";
import { load, save, type Stored } from "./prefs.ts";

export type FeedState = "loading" | "ok" | "error" | "cached";

export const S: {
  prefs: Stored;
  feed?: Feed;
  feedState: FeedState;
  error?: string;
  filters: Filters;
  /** Previous visit, read once at start (for "new since your last visit"). */
  previousVisit?: number;
  /** Test clock: only honoured for fixture data, never for live data. */
  nowOverride?: number;
} = {
  prefs: load(),
  feedState: "loading",
  filters: { q: "", categories: [], time: "all", publisher: "", mineOnly: false, savedOnly: false },
};

export function now(): number {
  return S.nowOverride !== undefined && S.feed?.mode === "fixture" ? S.nowOverride : Date.now();
}

let renderFn: () => void = () => {};
export const onRender = (fn: () => void) => { renderFn = fn; };
export const rerender = () => renderFn();

export function update(p: Partial<Stored>): void {
  S.prefs = { ...S.prefs, ...p };
  save(S.prefs);
  rerender();
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
