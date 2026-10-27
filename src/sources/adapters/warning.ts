// Shared shape for official warnings (national weather and hydrological services). Every field is taken from the
// source as published; this only fills the parts of a Notice that are the same for all of them.
import { makeNotice } from "../../domain/build.ts";
import { zonedToUtc } from "../../domain/time.ts";
import type { Category, LText, Notice, Severity, TimePoint } from "../../domain/types.ts";
import type { AdapterContext } from "../types.ts";

export interface WarningDraft {
  nativeId: string;
  language: string;
  title: string;
  headline: LText;
  body: string;
  bodyAlt?: { lang: string; text: string }[];
  publisher: LText;
  url: string;
  sent?: string;
  start?: TimePoint;
  end?: TimePoint;
  region?: LText;
  severity?: Severity;
  action?: string;
  notes?: string[];
  category?: Category;
}

export const tidy = (s: string | undefined) => (s ?? "").replace(/\r/g, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();

/** An ISO instant with an offset, from a source field. */
export function at(s: string | undefined | null): TimePoint | undefined {
  if (!s) return undefined;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? { at: new Date(ms).toISOString(), precision: "datetime", from: "source-field" } : undefined;
}

/** "YYYY-MM-DDTHH:MM" with no zone: read in `tz` and marked as such (the source does not state its zone). */
export function atLocal(s: string | undefined, tz: string): TimePoint | undefined {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s) : null;
  if (!m) return undefined;
  return { at: new Date(zonedToUtc(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, tz)).toISOString(), precision: "datetime", from: "source-field-no-tz" };
}

/** National colour scales (yellow / orange / red). Green means no warning and is never turned into a notice. */
export const COLOUR: Record<string, { code: string; rank: number; label: LText }> = {
  yellow: { code: "yellow", rank: 2, label: { en: "Yellow", el: "Κίτρινη" } },
  orange: { code: "orange", rank: 3, label: { en: "Orange", el: "Πορτοκαλί" } },
  red: { code: "red", rank: 4, label: { en: "Red", el: "Κόκκινη" } },
};
export function colour(code: string | undefined, hazard?: LText): Severity | undefined {
  const c = code ? COLOUR[code.toLowerCase()] : undefined;
  return c ? { scheme: "colour", code: c.code, label: c.label, rank: c.rank, ...(hazard ? { hazard } : {}) } : undefined;
}

export function warning(ctx: AdapterContext, prefix: string, w: WarningDraft): Notice {
  const sent = w.sent && Number.isFinite(Date.parse(w.sent)) ? new Date(w.sent).toISOString() : undefined;
  return makeNotice({
    id: `${prefix}:${w.nativeId}`,
    locationId: ctx.location.id,
    tz: ctx.location.tz,
    language: w.language,
    category: w.category ?? "weather",
    originalTitle: w.title,
    headline: w.headline,
    body: tidy(w.body),
    bodyAlt: w.bodyAlt ?? [],
    publisher: w.publisher,
    sourceUrl: w.url,
    sources: [{ sourceId: ctx.source.id, publisher: w.publisher, url: w.url, nativeId: w.nativeId, title: w.title, ...(sent ? { publishedAt: sent } : {}) }],
    ...(sent ? { publishedAt: sent } : {}),
    lastVerifiedAt: new Date(ctx.now).toISOString(),
    ...(w.start ? { start: w.start } : {}),
    ...(w.end ? { end: w.end } : {}),
    endKind: "validity",
    scope: "region",
    ...(w.region ? { regionLabel: w.region } : {}),
    ...(w.severity ? { severity: w.severity } : {}),
    ...(w.action ? { action: tidy(w.action) } : {}),
    notes: w.notes ?? [],
    fixture: ctx.fixture,
  });
}

/** Drop warnings that have already expired at `now` (feeds sometimes keep them for a while). */
export const live = (end: TimePoint | undefined, now: number) => !end || Date.parse(end.at) > now;
