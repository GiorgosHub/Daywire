// The normalized domain model. Every notice DAYWIRE shows has this shape, whatever its country or source.
// Validated with zod at the boundary (server output), so a broken adapter cannot reach the screen.
import { z } from "zod";

import { CATEGORIES } from "./categories.ts";

export const Category = z.enum(CATEGORIES);
export type Category = z.infer<typeof Category>;
export { CATEGORIES };

/** Text in several languages. English is required as the fallback; any BCP 47 language key may be added. */
export const LText = z.object({ en: z.string() }).catchall(z.string());
export type LText = z.infer<typeof LText>;

/**
 * A place, identified by its GeoNames id. Country → region (admin1) → district (admin2) → city.
 * Neighbourhoods below the city live in locality profiles (src/domain/localities.ts) where we have them.
 */
export const GeoLocation = z.object({
  id: z.string().regex(/^gn:\d+$/), // "gn:258576"
  geonameId: z.number().int().positive(),
  name: LText,
  countryCode: z.string().regex(/^[A-Z]{2}$/), // ISO 3166-1 alpha-2
  country: LText,
  admin1: LText.optional(),
  admin1Id: z.number().int().optional(),
  admin2: LText.optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  tz: z.string().min(1), // IANA time zone
  population: z.number().optional(),
  featureCode: z.string().optional(),
});
export type GeoLocation = z.infer<typeof GeoLocation>;

/**
 * A point in time as precisely as the source states it.
 * - datetime: `at` is an ISO instant (UTC).
 * - date: `at` is a local calendar date YYYY-MM-DD in the notice's zone (`Notice.tz`). No time of day was stated.
 * `from`: a structured source field with a zone, a source field whose zone the source does not state (we read it
 * in the location's zone and say so), the announcement text, or text with the year inferred.
 */
export const TimePoint = z.object({
  at: z.string(),
  precision: z.enum(["datetime", "date"]),
  from: z.enum(["source-field", "source-field-no-tz", "text", "text-year-inferred"]),
});
export type TimePoint = z.infer<typeof TimePoint>;

export const AreaRef = z.object({
  label: z.string(), // as written in the source, e.g. "Γιάννουλης"
  placeId: z.string().optional(), // matched neighbourhood in the locality profile, if any
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
  publisher: LText,
  url: z.string().url(),
  nativeId: z.string(),
  title: z.string(),
  publishedAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

/** The source's own classification, shown with the source's own words. `rank` (1 low … 4 high) is a documented
 *  per-scheme mapping used only for ordering and priority (see docs/data-model.md). */
export const Severity = z.object({
  scheme: z.enum(["meteoalarm", "cap", "ea-flood", "tfl"]),
  code: z.string(),
  label: LText,
  rank: z.number().int().min(1).max(4),
  hazard: LText.optional(),
});
export type Severity = z.infer<typeof Severity>;

export const Notice = z.object({
  id: z.string(),
  locationId: z.string(),
  /** IANA zone the notice's local dates and times belong to. */
  tz: z.string(),
  category: Category,
  /** Title as published by the source. Never rewritten. */
  originalTitle: z.string(),
  /** Short deterministic headline built from extracted fields, per interface language. */
  headline: LText,
  /** Plain-text excerpt of the source text, tags removed. */
  body: z.string(),
  /** Language of `originalTitle` and `body` (BCP 47). */
  language: z.string(),
  /** Other official language versions published by the source itself (e.g. MeteoAlarm's English text). */
  bodyAlt: z.array(z.object({ lang: z.string(), text: z.string() })),
  publisher: LText,
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
  /** The source lists only what is in force now (live status feeds): in force while listed and recently verified. */
  currentWhileListed: z.boolean(),
  scope: z.enum(["region", "city", "area", "unspecified"]),
  regionLabel: LText.optional(),
  areas: z.array(AreaRef),
  segments: z.array(Segment),
  severity: Severity.optional(),
  /** A sentence quoted from the source that tells people what to do (in the source's language). */
  action: z.string().optional(),
  notes: z.array(z.string()),
  related: z.array(z.object({ title: z.string(), url: z.string().url(), publishedAt: z.string().optional() })),
  fixture: z.boolean(),
});
export type Notice = z.infer<typeof Notice>;

export const SourceHealth = z.object({
  id: z.string(),
  name: LText,
  publisher: LText,
  method: z.enum(["rss", "wp-rest", "json-api", "link-only"]),
  categories: z.array(Category),
  endpoint: z.string().optional(),
  homepage: z.string().url(),
  state: z.enum(["ok", "error", "stale", "link-only", "backoff", "needs-config"]),
  checkedAt: z.string().optional(),
  lastSuccessAt: z.string().optional(),
  error: z.string().optional(),
  fetched: z.number().optional(),
  kept: z.number().optional(),
  note: LText,
  attribution: LText.optional(),
  contacts: z.array(z.object({ label: LText, phone: z.string(), checkedOn: z.string(), url: z.string().url() })).optional(),
});
export type SourceHealth = z.infer<typeof SourceHealth>;

export const CategoryCoverage = z.object({
  category: Category,
  state: z.enum(["connected", "needs-config", "link-only", "none"]),
  sources: z.array(z.string()),
});
export const Coverage = z.object({
  level: z.enum(["good", "partial", "limited", "none"]),
  connected: z.number().int(),
  categories: z.array(CategoryCoverage),
});
export type Coverage = z.infer<typeof Coverage>;

export const Feed = z.object({
  version: z.literal(2),
  location: GeoLocation,
  generatedAt: z.string(),
  mode: z.enum(["live", "fixture"]),
  durableStore: z.boolean(),
  coverage: Coverage,
  sources: z.array(SourceHealth),
  notices: z.array(Notice),
});
export type Feed = z.infer<typeof Feed>;
