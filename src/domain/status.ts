// Freshness and status. Computed at render time from the notice's own dates and the time now, so a notice whose end
// has passed is never shown as current just because it is still in the feed.
//
// Rules (documented in docs/data-model.md):
//   end passed                      → "ended" (an event) or "expired" (an official warning's validity)
//   start in the future             → "upcoming"
//   start passed, end in the future → "active"
//   start passed, no end published  → "open_ended", until 14 days after the latest announcement, then "stale"
//   no dates, a disruption category → "open_ended" (reported as in effect when published), "stale" after 14 days
//   no dates, an announcement       → "info", "archived" after 30 days
//   ended/expired over 14 days ago  → "archived"
// Overlay: `unverified` when the notice's source failed on the last check, or it was last verified over 6 hours ago.
import { dayBounds, DAY, HOUR } from "./time.ts";
import type { Notice, TimePoint } from "./types.ts";

export type State = "active" | "upcoming" | "open_ended" | "ended" | "expired" | "stale" | "info" | "archived";

export interface Status {
  state: State;
  unverified: boolean;
  startMs?: number;
  endMs?: number;
  /** milliseconds since the latest announcement (published or updated) */
  ageMs?: number;
}

export function bounds(t: TimePoint, edge: "start" | "end", tz: string): number {
  if (t.precision === "datetime") return Date.parse(t.at);
  const [a, b] = dayBounds(t.at, tz);
  return edge === "start" ? a : b;
}

const DISRUPTION = new Set(["water", "power", "roads", "transport", "services", "emergency"]);

export function statusOf(n: Notice, now: number, tz: string, failedSources: ReadonlySet<string> = new Set()): Status {
  const startMs = n.start ? bounds(n.start, "start", tz) : undefined;
  const endMs = n.end ? bounds(n.end, "end", tz) : undefined;
  const latest = Date.parse(n.updatedAt ?? n.publishedAt ?? n.lastVerifiedAt);
  const ageMs = Number.isFinite(latest) ? now - latest : undefined;
  let state: State;
  if (endMs !== undefined && now >= endMs) state = now - endMs > 14 * DAY ? "archived" : n.endKind === "validity" ? "expired" : "ended";
  else if (startMs !== undefined && now < startMs) state = "upcoming";
  else if (startMs !== undefined && endMs !== undefined) state = "active";
  else if (DISRUPTION.has(n.category)) state = ageMs !== undefined && ageMs > 14 * DAY ? "stale" : "open_ended";
  else state = ageMs !== undefined && ageMs > 30 * DAY ? "archived" : "info";
  const verifiedAgo = now - Date.parse(n.lastVerifiedAt);
  const unverified = n.sources.some((s) => failedSources.has(s.sourceId)) || verifiedAgo > 6 * HOUR;
  return { state, unverified, ...(startMs !== undefined ? { startMs } : {}), ...(endMs !== undefined ? { endMs } : {}), ...(ageMs !== undefined ? { ageMs } : {}) };
}

/** Is the notice current or still ahead (the part of the feed people act on)? */
export const isLive = (s: Status) => s.state === "active" || s.state === "upcoming" || s.state === "open_ended";
