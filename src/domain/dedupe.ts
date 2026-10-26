// Duplicates and updates.
// 1. The same water interruption is published by ΔΕΥΑΛ and republished by the municipality. Same category, same
//    local start date, at least one shared place → one notice, the originating publisher first, both links kept.
// 2. Road works are announced several times as they progress. Road notices within 21 days that name a common street
//    become one thread: the newest announcement leads, earlier ones are listed as related (not discarded).
// 3. A revised post keeps its id; `updatedAt` comes from the source's own modified time.
import { sameStreet } from "./extract.ts";
import { fold } from "./greek.ts";
import type { Notice } from "./types.ts";

const ORIGIN_RANK: Record<string, number> = { "deyal-water": 0, "meteoalarm-gr": 0, "larissa-wp": 1 };
const rank = (n: Notice) => ORIGIN_RANK[n.sources[0]!.sourceId] ?? 5;

function placeKeys(n: Notice): Set<string> {
  return new Set(n.areas.map((a) => a.placeId ?? fold(a.label)));
}

function sameWaterEvent(a: Notice, b: Notice, tz: string): boolean {
  if (a.category !== "water" || b.category !== "water") return false;
  if (a.sources[0]!.sourceId === b.sources[0]!.sourceId) return false;
  const da = localStart(a, tz), db = localStart(b, tz);
  if (!da || da !== db) return false;
  const ka = placeKeys(a), kb = placeKeys(b);
  return [...ka].some((k) => kb.has(k));
}

function localStart(n: Notice, tz: string): string | undefined {
  if (!n.start) return undefined;
  if (n.start.precision === "date") return n.start.at;
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(n.start.at));
}

const GENERIC = new Set(["οδου", "οδοσ", "οδων", "κομβοσ", "κομβο", "ηρωων", "λεωφοροσ", "πλατεια"]);
function streetTokens(n: Notice): Set<string> {
  const out = new Set<string>();
  for (const s of n.segments.flatMap((x) => x.streets)) for (const w of fold(s.replace(/\(.*?\)/g, "")).split(/[\s.-]+/)) if (w.length >= 5 && !GENERIC.has(w)) out.add(w);
  return out;
}

export function dedupe(notices: Notice[], tz: string): Notice[] {
  // 1: cross-source duplicates
  const sorted = [...notices].sort((a, b) => rank(a) - rank(b));
  const kept: Notice[] = [];
  for (const n of sorted) {
    const twin = kept.find((k) => sameWaterEvent(k, n, tz));
    if (!twin) { kept.push(structuredClone(n)); continue; }
    twin.sources = [...twin.sources, ...n.sources];
    if (!twin.notes.includes("merged-duplicate")) twin.notes = [...twin.notes, "merged-duplicate"];
    for (const a of n.areas) if (!twin.areas.some((x) => (x.placeId ?? fold(x.label)) === (a.placeId ?? fold(a.label)))) twin.areas = [...twin.areas, a];
  }

  // 2: road-works threads
  const roads = kept.filter((n) => n.category === "roads").sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""));
  const absorbed = new Set<string>();
  for (const lead of roads) {
    if (absorbed.has(lead.id)) continue;
    const lt = streetTokens(lead);
    if (!lt.size) continue;
    for (const other of roads) {
      if (other === lead || absorbed.has(other.id)) continue;
      const gap = Math.abs(Date.parse(lead.publishedAt ?? "") - Date.parse(other.publishedAt ?? ""));
      if (gap > 21 * 86_400_000) continue;
      if (![...streetTokens(other)].some((t) => lt.has(t))) continue;
      absorbed.add(other.id);
      lead.related = [...lead.related, { title: other.originalTitle, url: other.sourceUrl, ...(other.publishedAt ? { publishedAt: other.publishedAt } : {}) }];
      if (!lead.start && other.start) { lead.start = other.start; lead.notes = [...lead.notes, "start-from-related"]; }
      for (const s of other.segments.flatMap((x) => x.streets)) {
        const seg = lead.segments[0];
        if (seg && !seg.streets.some((x) => sameStreet(x, s))) seg.streets.push(s);
      }
    }
  }
  return kept.filter((n) => !absorbed.has(n.id));
}

