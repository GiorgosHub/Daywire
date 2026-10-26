// Builds normalized notices: fills defaults and composes the short headline from extracted fields only.
import { cityById } from "./cities.ts";
import type { AreaRef, Category, Notice, Text2 } from "./types.ts";

export function areaNames(cityId: string, areas: AreaRef[]): Text2 {
  const city = cityById(cityId);
  const el: string[] = [], en: string[] = [];
  for (const a of areas) {
    const p = a.placeId ? city?.places.find((x) => x.id === a.placeId) : undefined;
    el.push(p ? p.name.el : a.label);
    en.push(p ? p.name.en : a.label);
  }
  return { el: el.join(", "), en: en.join(", ") };
}

export const CATEGORY_LABEL: Record<Category, Text2> = {
  weather: { el: "Καιρός", en: "Weather" },
  water: { el: "Νερό", en: "Water" },
  power: { el: "Ρεύμα", en: "Power" },
  roads: { el: "Δρόμοι", en: "Roads" },
  transport: { el: "Συγκοινωνίες", en: "Transport" },
  services: { el: "Υπηρεσίες", en: "Services" },
  emergency: { el: "Πολιτική προστασία", en: "Civil protection" },
  announcement: { el: "Ανακοινώσεις", en: "Announcements" },
};

export function headlineFor(category: Category, cityId: string, areas: AreaRef[], streets: string[], originalTitle: string): Text2 {
  const where = areaNames(cityId, areas);
  const firstStreets = streets.slice(0, 3).map((s) => s.replace(/\s*\(.*$/, "")).join(", ");
  if (category === "water") {
    const w = where.el || firstStreets;
    return w ? { el: `Διακοπή νερού · ${w}`, en: `Water interruption · ${where.en || firstStreets}` } : { el: "Διακοπή νερού", en: "Water interruption" };
  }
  if (category === "roads" && (firstStreets || where.el)) {
    const w = firstStreets || where.el;
    return { el: `Κυκλοφοριακές ρυθμίσεις · ${w}`, en: `Traffic arrangements · ${firstStreets || where.en}` };
  }
  return { el: originalTitle, en: originalTitle };
}

export type Draft = Omit<Notice, "headline" | "notes" | "related" | "fixture" | "language" | "segments" | "areas"> &
  Partial<Pick<Notice, "headline" | "notes" | "related" | "fixture" | "segments" | "areas">>;

export function makeNotice(d: Draft): Notice {
  const segments = d.segments ?? [];
  const areas = d.areas ?? [];
  const streets = segments.flatMap((s) => s.streets);
  return {
    ...d,
    language: "el",
    segments,
    areas,
    notes: d.notes ?? [],
    related: d.related ?? [],
    fixture: d.fixture ?? false,
    headline: d.headline ?? headlineFor(d.category, d.cityId, areas, streets, d.originalTitle),
  };
}

/** Remove whitespace noise and cap length; the full text stays at the source. */
export function excerpt(text: string, max = 1400): string {
  const t = text.replace(/\n{3,}/g, "\n\n").trim();
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, "") + " …" : t;
}
