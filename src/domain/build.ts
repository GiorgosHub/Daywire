// Builds normalized notices: fills defaults and composes the short headline from extracted fields only.
import { localityFor } from "./localities.ts";
import type { AreaRef, Category, LText, Notice } from "./types.ts";

export const geonameIdOf = (locationId: string): number => Number(locationId.replace(/^gn:/, ""));

/** Area names in each language we have them in. Unmatched areas keep the source's label in every language. */
export function areaNames(locationId: string, areas: AreaRef[]): LText {
  const loc = localityFor(geonameIdOf(locationId));
  const langs = new Set<string>(["en"]);
  const parts = areas.map((a) => {
    const p = a.placeId ? loc?.places.find((x) => x.id === a.placeId) : undefined;
    if (p) Object.keys(p.name).forEach((l) => langs.add(l));
    return p ? p.name : { en: a.label };
  });
  const out: LText = { en: "" };
  for (const l of langs) out[l] = parts.map((t) => t[l] ?? t.en).join(", ");
  return out;
}

/**
 * Headlines we compose for Greek announcements (whose titles are long and inconsistent). They state only extracted
 * facts. Every other notice uses the source's own title; we never translate official titles.
 */
export function headlineFor(category: Category, locationId: string, areas: AreaRef[], streets: string[], originalTitle: string, language: string): LText {
  if (language !== "el") return { en: originalTitle };
  const where = areaNames(locationId, areas);
  const firstStreets = streets.slice(0, 3).map((s) => s.replace(/\s*\(.*$/, "")).join(", ");
  if (category === "water") {
    const el = where.el ?? where.en;
    return el || firstStreets
      ? { el: `Διακοπή νερού · ${el || firstStreets}`, en: `Water interruption · ${where.en || firstStreets}` }
      : { el: "Διακοπή νερού", en: "Water interruption" };
  }
  if (category === "roads" && (firstStreets || where.en)) {
    return { el: `Κυκλοφοριακές ρυθμίσεις · ${firstStreets || where.el || where.en}`, en: `Traffic arrangements · ${firstStreets || where.en}` };
  }
  return { en: originalTitle, el: originalTitle };
}

export type Draft = Omit<Notice, "headline" | "notes" | "related" | "fixture" | "segments" | "areas" | "bodyAlt" | "currentWhileListed"> &
  Partial<Pick<Notice, "headline" | "notes" | "related" | "fixture" | "segments" | "areas" | "bodyAlt" | "currentWhileListed">>;

export function makeNotice(d: Draft): Notice {
  const segments = d.segments ?? [];
  const areas = d.areas ?? [];
  const streets = segments.flatMap((s) => s.streets);
  return {
    ...d,
    segments,
    areas,
    bodyAlt: d.bodyAlt ?? [],
    currentWhileListed: d.currentWhileListed ?? false,
    notes: d.notes ?? [],
    related: d.related ?? [],
    fixture: d.fixture ?? false,
    headline: d.headline ?? headlineFor(d.category, d.locationId, areas, streets, d.originalTitle, d.language),
  };
}

/** Remove whitespace noise and cap length; the full text stays at the source. */
export function excerpt(text: string, max = 1400): string {
  const t = text.replace(/\n{3,}/g, "\n\n").trim();
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, "") + " …" : t;
}
