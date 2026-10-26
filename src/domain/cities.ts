// City registry. A city lists its places (for the place picker and for matching announcement text) and the
// sources that cover it. Adding a city = adding an entry here plus source entries in src/sources/registry.ts.
import { fold } from "./greek.ts";
import type { Text2 } from "./types.ts";

export interface Place {
  id: string;
  name: Text2;
  /** Spellings that refer to this place in announcements (any case/accents; folded at load). */
  aliases: string[];
  kind: "community" | "neighbourhood" | "city";
}

export interface City {
  id: string;
  name: Text2;
  tz: string;
  /** MeteoAlarm EMMA region code that covers the city. */
  emma?: { code: string; name: Text2 };
  places: Place[];
  live: boolean;
}

const P = (id: string, el: string, en: string, kind: Place["kind"], aliases: string[]): Place => ({ id, name: { el, en }, kind, aliases: [el, ...aliases] });

export const CITIES: City[] = [
  {
    id: "larisa",
    name: { el: "Λάρισα", en: "Larissa" },
    tz: "Europe/Athens",
    emma: { code: "GR001", name: { el: "Θεσσαλία", en: "Thessaly" } },
    live: true,
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

export function cityById(id: string): City | undefined {
  return CITIES.find((c) => c.id === id);
}

/** Match an area phrase from an announcement to a registered place, by exact folded alias. Never by substring. */
export function matchPlace(city: City, label: string): string | undefined {
  const f = fold(label).replace(/[.,;:]+$/, "");
  for (const p of city.places) if (p.aliases.some((a) => fold(a) === f)) return p.id;
  return undefined;
}
