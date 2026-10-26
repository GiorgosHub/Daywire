// Locality profiles: what DAYWIRE knows below city level (neighbourhoods, communities) for cities where a source
// names them. Keyed by GeoNames id. A city without a profile still works: notices then match only the streets
// and areas a person types. Adding one is configuration, not code.
import { fold } from "./greek.ts";
import type { GeoLocation, LText } from "./types.ts";

export interface Place {
  id: string;
  name: LText;
  /** Spellings that refer to this place in announcements (any case/accents; folded when matching). */
  aliases: string[];
  kind: "community" | "neighbourhood" | "city";
}

export interface Locality {
  geonameId: number;
  places: Place[];
  /** Places offered as one-tap choices in the "where are you during the day?" prompt. */
  quick: string[];
}

const P = (id: string, el: string, en: string, kind: Place["kind"], aliases: string[]): Place => ({ id, name: { en, el }, kind, aliases: [el, en, ...aliases] });

export const LOCALITIES: Locality[] = [
  {
    geonameId: 258576, // Larissa, GR
    quick: ["larisa-city", "giannouli", "falani", "pyrovolika", "agios-achilleios", "neapoli"],
    places: [
      P("larisa-city", "Λάρισα (πόλη)", "Larissa (city)", "city", ["Λάρισας", "Λάρισα", "πόλη της Λάρισας"]),
      P("giannouli", "Γιάννουλη", "Giannouli", "community", ["Γιάννουλης"]),
      P("falani", "Φαλάνη", "Falani", "community", ["Φαλάνης"]),
      P("terpsithea", "Τερψιθέα", "Terpsithea", "community", ["Τερψιθέας"]),
      P("amygdalea", "Αμυγδαλέα", "Amygdalea", "community", ["Αμυγδαλέας"]),
      P("loutro", "Λουτρό", "Loutro", "community", ["Λουτρού"]),
      P("pyrovolika", "Πυροβολικά", "Pyrovolika", "neighbourhood", ["Πυροβολικών"]),
      P("agios-achilleios", "Άγιος Αχίλλειος", "Agios Achilleios", "neighbourhood", ["Αγ. Αχιλλείου", "Αγίου Αχιλλείου", "Αγ Αχιλλείου", "Αγ. Αχίλλειος"]),
      P("ampelokipoi", "Αμπελόκηποι", "Ampelokipoi", "neighbourhood", ["Αμπελοκήπων"]),
      P("neapoli", "Νεάπολη", "Neapoli", "neighbourhood", ["Νεάπολης"]),
      P("chatzichalari", "Χατζηχαλάρη", "Chatzichalari", "neighbourhood", []),
      P("livadi", "Λιβάδι", "Livadi", "neighbourhood", ["Λιβαδίου"]),
      P("kaminia", "Καμίνια", "Kaminia", "neighbourhood", ["Καμινίων"]),
      P("filippoupoli", "Φιλιππούπολη", "Filippoupoli", "neighbourhood", ["Φιλιππούπολης"]),
      P("nea-smyrni", "Νέα Σμύρνη", "Nea Smyrni", "neighbourhood", ["Νέας Σμύρνης"]),
      P("anastasioupoli", "Αναστασιούπολη", "Anastasioupoli", "neighbourhood", ["Αναστασιούπολης"]),
      P("averof", "Αβέρωφ", "Averof", "neighbourhood", []),
      P("agia-paraskevi", "Αγία Παρασκευή", "Agia Paraskevi", "neighbourhood", ["Αγίας Παρασκευής"]),
      P("agios-thomas", "Άγιος Θωμάς", "Agios Thomas", "neighbourhood", ["Αγίου Θωμά", "Αγ. Θωμά"]),
      P("tampakika", "Ταμπάκικα", "Tampakika", "neighbourhood", []),
      P("alkazar", "Αλκαζάρ", "Alcazar", "neighbourhood", []),
      P("kentro", "Κέντρο", "City centre", "neighbourhood", ["κέντρο της πόλης", "κέντρου"]),
    ],
  },
];

export function localityFor(geonameId: number): Locality | undefined {
  return LOCALITIES.find((l) => l.geonameId === geonameId);
}

/** Match an area phrase from an announcement to a place in the locality profile, by exact folded alias. */
export function matchPlace(geonameId: number, label: string): string | undefined {
  const loc = localityFor(geonameId);
  if (!loc) return undefined;
  const f = fold(label).replace(/[.,;:]+$/, "");
  for (const p of loc.places) if (p.aliases.some((a) => fold(a) === f)) return p.id;
  return undefined;
}

/**
 * Locations with connected sources, shipped with the app so they work without the location-search service.
 * Values are GeoNames records as returned by the Open-Meteo geocoder on 2026-10-26.
 */
export const FEATURED: GeoLocation[] = [
  {
    id: "gn:258576", geonameId: 258576, name: { en: "Larissa", el: "Λάρισα" }, countryCode: "GR", country: { en: "Greece", el: "Ελλάδα" },
    admin1: { en: "Thessaly", el: "Θεσσαλία" }, admin1Id: 6697809, admin2: { en: "Larissa", el: "Λάρισα" },
    lat: 39.62847, lon: 22.42112, tz: "Europe/Athens", population: 146926, featureCode: "PPLA",
  },
  {
    id: "gn:2643743", geonameId: 2643743, name: { en: "London", el: "Λονδίνο" }, countryCode: "GB", country: { en: "United Kingdom", el: "Ηνωμένο Βασίλειο" },
    admin1: { en: "England", el: "Αγγλία" }, admin1Id: 6269131, admin2: { en: "Greater London" },
    lat: 51.50853, lon: -0.12574, tz: "Europe/London", population: 8961989, featureCode: "PPLC",
  },
];

export const DEFAULT_LOCATION = FEATURED[0]!;
