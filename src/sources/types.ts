import type { Category, GeoLocation, LText, Notice, SourceHealth } from "../domain/types.ts";

/**
 * Where a source applies. Checked against a location's GeoNames record; never against free text.
 * - places: specific cities (GeoNames ids)
 * - regions: whole first-level regions (GeoNames admin1 ids) within a country
 * - countries: whole countries (ISO 3166-1 alpha-2)
 * - radius: within `km` of a point (for city transport networks without an admin boundary in GeoNames)
 */
export type Coverage =
  | { kind: "places"; geonameIds: number[] }
  | { kind: "regions"; country: string; admin1Ids: number[] }
  | { kind: "countries"; countries: string[] }
  | { kind: "radius"; lat: number; lon: number; km: number };

export interface SourceDef {
  id: string;
  name: LText;
  publisher: LText;
  method: SourceHealth["method"];
  categories: Category[];
  coverage: Coverage;
  /** Human description of `coverage`, shown on the Sources page. */
  where: LText;
  /** Machine-readable endpoint (template) we read. Absent for link-only sources. */
  endpoint?: string;
  homepage: string;
  /** What this source covers, how it's read, and its limits. Shown on the Sources page. */
  note: LText;
  /** Required by the publisher's terms (e.g. Open Government Licence wording). */
  attribution?: LText;
  /** Environment variables that must be set before this source may be used (e.g. a registered API key). */
  requires?: string[];
  /** Real captured response used by tests and the local fixture mode. Never used in production. */
  fixture?: string;
  /** GeoNames ids of the locations the fixture was captured for; fixture mode refuses to use it anywhere else. */
  fixtureFor?: number[];
  adapter?: Adapter;
  /** Official contact lines published by the source (checked on the publisher's site). */
  contacts?: { label: LText; phone: string; checkedOn: string; url: string }[];
  /** How long one response may be reused across locations and requests (seconds). */
  ttl?: number;
}

export interface AdapterContext {
  source: SourceDef;
  location: GeoLocation;
  now: number;
  fixture: boolean;
  env: Record<string, string | undefined>;
  get: (url: string, headers?: Record<string, string>) => Promise<string>;
  /** Report an item the adapter could not validate (counted on the Sources page, never shown as a notice). */
  reject: (why: string) => void;
}

export type Adapter = (ctx: AdapterContext) => Promise<{ notices: Notice[]; fetched: number }>;
