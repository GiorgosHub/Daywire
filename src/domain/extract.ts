// Deterministic extraction of dates, times, places and streets from Greek announcement text.
// Rules are conservative: when the text does not say something explicitly, we return nothing rather than guess.
import { matchPlace } from "./localities.ts";
import { fold, monthFromGreek, MONTH_PATTERN, weekdayFromGreek, WEEKDAY_PATTERN } from "./greek.ts";
import { DAY, wallAt, weekdayOf, ymd, zonedToUtc } from "./time.ts";
import type { AreaRef, Segment, TimePoint } from "./types.ts";

export interface FoundDate {
  index: number;
  y: number; m: number; d: number;
  yearGiven: boolean;
  weekdayGiven: boolean;
  weekdayOk: boolean;
  text: string;
}

/** Lines like "Λάρισα, 23 Οκτωβρίου 2026" are the signing date of the announcement, not the event date. */
const SIGNATURE_LINE = /^\s*(?:Λάρισα|Larissa)\s*,\s*\d{1,2}\s+\S+\s+\d{4}\s*$/i;

export function withoutSignatures(text: string): string {
  return text.split("\n").map((l) => (SIGNATURE_LINE.test(l) ? "" : l)).join("\n");
}

/** Pick the year for a date written without one: the year of publication, unless that puts it well before. */
export function inferYear(m: number, d: number, publishedMs: number, tz: string): number {
  const pub = wallAt(publishedMs, tz);
  const candidate = Date.UTC(pub.y, m - 1, d);
  const pubDay = Date.UTC(pub.y, pub.m - 1, pub.d);
  return candidate < pubDay - 60 * DAY ? pub.y + 1 : pub.y;
}

/**
 * Dates written as "Δευτέρα 26 Οκτωβρίου [2026]" or "26/10/2026".
 * Ordinal forms ("28ης Οκτωβρίου") are names of streets and holidays, not dates, and are skipped.
 */
export function findDates(text: string, publishedMs: number, tz: string): FoundDate[] {
  const src = withoutSignatures(text);
  const out: FoundDate[] = [];
  const re = new RegExp(`(?:(${WEEKDAY_PATTERN})\\s*,?\\s+)?(?<![\\d/])(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?`, "gu");
  for (const mt of src.matchAll(re)) {
    const d = Number(mt[2]);
    const m = monthFromGreek(mt[3]!);
    if (!m || d < 1 || d > 31) continue;
    const yearGiven = Boolean(mt[4]);
    const y = yearGiven ? Number(mt[4]) : inferYear(m, d, publishedMs, tz);
    const wd = mt[1] ? weekdayFromGreek(mt[1]) : undefined;
    out.push({ index: mt.index ?? 0, y, m, d, yearGiven, weekdayGiven: wd !== undefined, weekdayOk: wd === undefined || wd === weekdayOf(y, m, d), text: mt[0] });
  }
  const num = /(?<![\d/])(\d{1,2})\/(\d{1,2})\/(\d{4})(?![\d/])/g;
  for (const mt of src.matchAll(num)) {
    const d = Number(mt[1]), m = Number(mt[2]), y = Number(mt[3]);
    if (m < 1 || m > 12 || d < 1 || d > 31) continue;
    out.push({ index: mt.index ?? 0, y, m, d, yearGiven: true, weekdayGiven: false, weekdayOk: true, text: mt[0] });
  }
  return out.sort((a, b) => a.index - b.index);
}

export interface TimeRange { from: [number, number]; to: [number, number] }

export function findTimeRange(text: string): TimeRange | undefined {
  const mt = /(?:από\s*)?(\d{1,2})[:.](\d{2})\s*(?:έως|εως|μέχρι|ως|-|–)\s*(?:τις\s+)?(\d{1,2})[:.](\d{2})/u.exec(text);
  if (!mt) return undefined;
  const a: [number, number] = [Number(mt[1]), Number(mt[2])];
  const b: [number, number] = [Number(mt[3]), Number(mt[4])];
  if (a[0] > 23 || b[0] > 24 || a[1] > 59 || b[1] > 59) return undefined;
  return { from: a, to: b };
}

const AREA_PATTERNS: RegExp[] = [
  /κατοίκους\s+(?:της|του|των)\s+([\p{Lu}][\p{Ll}\p{M}]+(?:\s+[\p{Lu}][\p{Ll}\p{M}]+)?)/u,
  /(?:στη|στην|της)\s+(?:Δ\.\s?Κ\.|Τ\.\s?Κ\.|Δημοτική\s+Κοινότητα|Τοπική\s+Κοινότητα|Δημοτικής\s+Κοινότητας|Τοπικής\s+Κοινότητας)\s+([\p{Lu}][\p{Ll}\p{M}]+)/u,
  /συνοικία\s+([\p{Lu}][\p{Ll}\p{M}]+)/u,
  /περιοχής\s+του\s+((?:Αγ\.|Αγίου|Αγίας)\s?[\p{Lu}][\p{Ll}\p{M}]+|[\p{Lu}][\p{Ll}\p{M}]+)/u,
];

/** Where a notice belongs: the city's GeoNames id (for its locality profile) and its time zone. */
export interface Where { geonameId: number; tz: string }

export function areasIn(text: string, city: Where): AreaRef[] {
  const out: AreaRef[] = [];
  for (const re of AREA_PATTERNS) {
    const mt = re.exec(text);
    if (!mt) continue;
    addArea(out, mt[1]!.trim(), city);
  }
  return out;
}

export function addArea(list: AreaRef[], label: string, city: Where): void {
  const clean = label.replace(/\s+/g, " ").trim();
  if (!clean) return;
  const placeId = matchPlace(city.geonameId, clean);
  const key = placeId ?? fold(clean);
  if (list.some((a) => (a.placeId ?? fold(a.label)) === key)) return;
  list.push(placeId ? { label: clean, placeId } : { label: clean });
}

/** "• Παλαιολόγου (από την οδό Σμύρνης έως την οδό Καραβίδα)" lines that list affected streets. */
export function streetLines(text: string): string[] {
  return text
    .split("\n")
    .filter((l) => l.startsWith("• "))
    .map((l) => l.slice(2).trim())
    .filter((l) => l.length > 1 && l.length < 160 && !/ενημερώνει|ανακοινώνει|ζητά|Δ\.Ε\.Υ\.Α/u.test(l));
}

/** Streets named in "συμβολή των οδών Α-Β-Γ" or "στην οδό Χ". */
export function namedStreets(text: string): string[] {
  const out: string[] = [];
  const j = /(?:συμβολή|διασταύρωση)\s+των\s+οδών\s+([^,.;\n]+?)(?=,|\.|;|\n|\s+(?:ξεκινούν|σύμφωνα|με\s|θα\s|και\s+την))/u.exec(text);
  if (j) out.push(...j[1]!.split(/\s*[-–]\s*|\s+και\s+/u).map((s) => s.trim()).filter(Boolean));
  const k = /κόμβο(?:υ)?\s+((?:[\p{Lu}][\p{L}\p{M}.]+)(?:[-–][\p{Lu}][\p{L}\p{M}.]+)*)/u.exec(text);
  if (k) for (const s of k[1]!.split(/[-–]/)) if (!out.some((o) => sameStreet(o, s))) out.push(s.trim());
  return [...new Set(out)];
}

/** Significant words of a street name: "Ηρ.Πολυτεχνείου" and "Ηρώων Πολυτεχνείου" share "πολυτεχνειου". */
export function streetWords(s: string): string[] {
  return fold(s.replace(/\(.*?\)/g, "")).split(/[\s.]+/).filter((w) => w.length >= 5);
}

export function sameStreet(a: string, b: string): boolean {
  const wa = streetWords(a), wb = streetWords(b);
  return wb.length > 0 && wb.every((w) => wa.includes(w));
}

export function timePoint(date: FoundDate, hm: [number, number] | undefined, tz: string): TimePoint {
  const from = date.yearGiven ? "text" : "text-year-inferred";
  if (!hm) return { at: ymd(date.y, date.m, date.d), precision: "date", from };
  const [hh, mm] = hm;
  const ms = hh === 24 ? zonedToUtc(date.y, date.m, date.d, 23, 59, tz) + 60000 : zonedToUtc(date.y, date.m, date.d, hh, mm, tz);
  return { at: new Date(ms).toISOString(), precision: "datetime", from };
}

/**
 * Water interruption announcements (ΔΕΥΑΛ, and the municipality's republications of them).
 * One announcement can hold several interruptions ("Η Δ.Ε.Υ.Α.Λ. ενημερώνει…" paragraphs), each with its own
 * place, streets, date and hours. Each becomes a segment.
 */
export function extractWater(text: string, publishedMs: number, city: Where): { segments: Segment[]; notes: string[] } {
  const notes: string[] = [];
  const body = withoutSignatures(text);
  const chunks = body.split(/(?=Η\s+Δ\.?\s?Ε\.?\s?Υ\.?\s?Α\.?\s?(?:Λ\.|Λάρισας)\s+(?:ενημερώνει|ανακοινώνει))/u);
  const segments: Segment[] = [];
  for (const chunk of chunks) {
    const dates = findDates(chunk, publishedMs, city.tz);
    const range = findTimeRange(chunk);
    const areas = areasIn(chunk, city);
    const streets = streetLines(chunk);
    if (!dates.length && !range && !areas.length && !streets.length) continue;
    const date = dates[0];
    if (date && !date.weekdayOk) notes.push("weekday-mismatch");
    // a street list without its own intro belongs to the previous segment ("Η διακοπή αφορά τις κάτωθι οδούς:")
    if (!date && !areas.length && segments.length) {
      segments[segments.length - 1]!.streets.push(...streets);
      continue;
    }
    segments.push({
      areas,
      streets,
      ...(date ? { start: timePoint(date, range?.from, city.tz), end: timePoint(date, range?.to, city.tz) } : {}),
    });
  }
  return { segments, notes };
}

/** Earliest start and latest end over segments. */
export function envelope(segments: Segment[]): { start?: TimePoint; end?: TimePoint } {
  const key = (t: TimePoint, edge: "start" | "end") => (t.precision === "datetime" ? Date.parse(t.at) : Date.parse(t.at + (edge === "start" ? "T00:00:00Z" : "T23:59:59Z")));
  let start: TimePoint | undefined, end: TimePoint | undefined;
  for (const s of segments) {
    if (s.start && (!start || key(s.start, "start") < key(start, "start"))) start = s.start;
    if (s.end && (!end || key(s.end, "end") > key(end, "end"))) end = s.end;
  }
  return { ...(start ? { start } : {}), ...(end ? { end } : {}) };
}

/** The first sentence in the text that tells people what to do (quoted as the source's own guidance). */
export function actionSentence(text: string): string | undefined {
  const flat = text.replace(/\n/g, " ");
  const sentences = flat.split(/(?<=[^\p{Lu}.][.!;])\s+/u); // not after "Δ.Ε.Υ.Α.Λ."
  const s = sentences.find((x) => /μεριμνήσουν|παρακαλούνται|καλούνται|συνιστά|να αποφεύγουν|να είναι ιδιαίτερα προσεκτικοί/u.test(x));
  return s ? s.trim().replace(/^•\s*/, "") : undefined;
}

/** The date in a service announcement on which the change applies: the first one written with its weekday. */
export function serviceDate(text: string, publishedMs: number, tz: string): FoundDate | undefined {
  const dates = findDates(text, publishedMs, tz);
  return dates.find((d) => d.weekdayGiven && d.weekdayOk) ?? undefined;
}
