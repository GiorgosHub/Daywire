// The normalized domain model. Every notice DAYWIRE shows has this shape, whatever its source.
// Validated with zod at the boundary (server output, client input), so a broken adapter cannot reach the screen.
import { z } from "zod";

export const Category = z.enum(["weather", "water", "power", "roads", "transport", "services", "emergency", "announcement"]);
export type Category = z.infer<typeof Category>;

export const Text2 = z.object({ el: z.string(), en: z.string() });
export type Text2 = z.infer<typeof Text2>;

/**
 * A point in time as precisely as the source states it.
 * - datetime: `at` is an ISO instant (UTC). The source gave a clock time in a known zone.
 * - date: `at` is a local calendar date YYYY-MM-DD in the city's zone. No time of day was stated.
 * `from` says where it came from: a structured source field, the announcement text, or text + inferred year.
 */
export const TimePoint = z.object({
  at: z.string(),
  precision: z.enum(["datetime", "date"]),
  from: z.enum(["source-field", "text", "text-year-inferred"]),
});
export type TimePoint = z.infer<typeof TimePoint>;

export const AreaRef = z.object({
  label: z.string(), // as written in the announcement, e.g. "Γιάννουλης"
  placeId: z.string().optional(), // matched place in the city registry, if any
});
export type AreaRef = z.infer<typeof AreaRef>;

export const Segment = z.object({
  areas: z.array(AreaRef),
  streets: z.array(z.string()),
  start: TimePoint.optional(),
  end: TimePoint.optional(),
});
export type Segment = z.infer<typeof Segment>;

export const SourceRef = z.object({
  sourceId: z.string(),
  publisher: Text2,
  url: z.string().url(),
  nativeId: z.string(),
  title: z.string(),
  publishedAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

export const Notice = z.object({
  id: z.string(),
  cityId: z.string(),
  category: Category,
  /** Title as published by the source (Greek). Never rewritten. */
  originalTitle: z.string(),
  /** Short deterministic headline built from extracted fields, in both UI languages. */
  headline: Text2,
  /** Plain-text excerpt of the source text (Greek), tags removed. */
  body: z.string(),
  /** Official English text, only when the source itself publishes one (MeteoAlarm does). */
  bodyEn: z.string().optional(),
  language: z.literal("el"),
  publisher: Text2,
  /** The primary source; `sources` also lists republications that were merged into this notice. */
  sourceUrl: z.string().url(),
  sources: z.array(SourceRef).min(1),
  publishedAt: z.string().optional(),
  updatedAt: z.string().optional(),
  /** Set only when a durable store is configured; otherwise unknown and not shown. */
  firstSeenAt: z.string().optional(),
  /** When DAYWIRE last read this notice from its source successfully. */
  lastVerifiedAt: z.string(),
  start: TimePoint.optional(),
  end: TimePoint.optional(),
  /** "event": the disruption ends; "validity": an official warning expires. */
  endKind: z.enum(["event", "validity"]).optional(),
  scope: z.enum(["region", "city", "area", "unspecified"]),
  regionLabel: Text2.optional(),
  areas: z.array(AreaRef),
  segments: z.array(Segment),
  /** Only from a source classification (MeteoAlarm awareness level). Never derived by DAYWIRE. */
  severity: z.object({ level: z.enum(["yellow", "orange", "red"]), hazard: Text2 }).optional(),
  /** A sentence quoted from the source that tells people what to do. */
  action: z.string().optional(),
  actionEn: z.string().optional(),
  notes: z.array(z.string()),
  related: z.array(z.object({ title: z.string(), url: z.string().url(), publishedAt: z.string().optional() })),
  fixture: z.boolean(),
});
export type Notice = z.infer<typeof Notice>;

export const SourceHealth = z.object({
  id: z.string(),
  name: Text2,
  publisher: Text2,
  method: z.enum(["rss", "wp-rest", "json-api", "link-only"]),
  endpoint: z.string().optional(),
  homepage: z.string().url(),
  state: z.enum(["ok", "error", "stale", "link-only", "backoff"]),
  checkedAt: z.string().optional(),
  lastSuccessAt: z.string().optional(),
  error: z.string().optional(),
  fetched: z.number().optional(),
  kept: z.number().optional(),
  note: Text2,
  contacts: z.array(z.object({ label: Text2, phone: z.string(), checkedOn: z.string(), url: z.string().url() })).optional(),
});
export type SourceHealth = z.infer<typeof SourceHealth>;

export const Feed = z.object({
  version: z.literal(1),
  cityId: z.string(),
  generatedAt: z.string(),
  mode: z.enum(["live", "fixture"]),
  durableStore: z.boolean(),
  sources: z.array(SourceHealth),
  notices: z.array(Notice),
});
export type Feed = z.infer<typeof Feed>;
