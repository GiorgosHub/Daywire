// Country status. A country earns "supported" only when a connected source was checked against the live service,
// a real record was read, and what it covers is written down here. Being selectable in the search box earns nothing:
// every place on Earth can be searched; most countries are "not covered".
//   supported   — a verified source covers the whole country for what it does (the explanation says what that is)
//   partial     — verified, but only some regions or cities, or only some categories that matter (said below)
//   provisional — connected and answering live, but no real warning has been seen yet to prove the format
//   unsupported — nothing connected; `note` says what was researched, if anything
import type { LText } from "../domain/types.ts";
import { SOURCES } from "./registry.ts";

export type CountryStatus = "supported" | "partial" | "provisional" | "unsupported";
export interface CountryEntry { code: string; name: LText; status: CountryStatus; sources: string[]; covers: LText; gaps: LText }

export const COUNTRIES: CountryEntry[] = [
  {
    code: "US", name: { en: "United States", el: "ΗΠΑ" }, status: "supported", sources: ["nws-alerts"],
    covers: { en: "Weather watches, warnings and advisories for every point (NWS).", el: "Ειδοποιήσεις καιρού για κάθε σημείο (NWS)." },
    gaps: { en: "No water, power, roads or local notices.", el: "Όχι νερό, ρεύμα, δρόμοι ή τοπικές ανακοινώσεις." },
  },
  {
    code: "CA", name: { en: "Canada", el: "Καναδάς" }, status: "supported", sources: ["msc-alerts"],
    covers: { en: "Public weather alerts for every alert area (Environment Canada).", el: "Ειδοποιήσεις καιρού για κάθε περιοχή (Environment Canada)." },
    gaps: { en: "Weather only.", el: "Μόνο καιρός." },
  },
  {
    code: "DE", name: { en: "Germany", el: "Γερμανία" }, status: "supported", sources: ["dwd-warnings"],
    covers: { en: "DWD weather warnings for every municipality.", el: "Προειδοποιήσεις DWD για κάθε δήμο." },
    gaps: { en: "Weather only; texts in German.", el: "Μόνο καιρός· κείμενα στα γερμανικά." },
  },
  {
    code: "NO", name: { en: "Norway", el: "Νορβηγία" }, status: "supported", sources: ["metno-alerts"],
    covers: { en: "MET Norway warnings for land, coast and sea areas.", el: "Προειδοποιήσεις MET Norway για ξηρά, ακτές και θάλασσα." },
    gaps: { en: "Weather only. When we checked, every current warning was a marine one.", el: "Μόνο καιρός. Στον έλεγχο, όλες οι τρέχουσες ήταν θαλάσσιες." },
  },
  {
    code: "SE", name: { en: "Sweden", el: "Σουηδία" }, status: "supported", sources: ["smhi-warnings"],
    covers: { en: "SMHI warnings and messages (weather, floods, sea level, water shortage).", el: "Προειδοποιήσεις και μηνύματα SMHI (καιρός, πλημμύρες, στάθμη θάλασσας, λειψυδρία)." },
    gaps: { en: "Coastal warnings are matched by county.", el: "Οι παράκτιες αντιστοιχίζονται ανά κομητεία." },
  },
  {
    code: "FI", name: { en: "Finland", el: "Φινλανδία" }, status: "supported", sources: ["fmi-warnings"],
    covers: { en: "FMI warnings for land and sea areas.", el: "Προειδοποιήσεις FMI για ξηρά και θάλασσα." },
    gaps: { en: "Weather only; FMI's English edition.", el: "Μόνο καιρός· αγγλική έκδοση του FMI." },
  },
  {
    code: "IT", name: { en: "Italy", el: "Ιταλία" }, status: "supported", sources: ["dpc-bulletin"],
    covers: { en: "The national flood, landslide and thunderstorm alert bulletin for every alert zone (Civil Protection).", el: "Το εθνικό δελτίο επιφυλακής για πλημμύρες, κατολισθήσεις και καταιγίδες σε κάθε ζώνη (Πολιτική Προστασία)." },
    gaps: { en: "No wind, heat, snow or other weather warnings; one bulletin a day, regions may update first.", el: "Όχι άνεμος, καύσωνας, χιόνι· ένα δελτίο τη μέρα." },
  },
  {
    code: "GR", name: { en: "Greece", el: "Ελλάδα" }, status: "partial", sources: ["meteoalarm-gr", "deyal-water", "larissa-wp"],
    covers: { en: "HNMS warnings for Thessaly, Attica, Central Macedonia, Epirus, Crete and the North Aegean; water and municipal notices in Larissa.", el: "Προειδοποιήσεις ΕΜΥ για Θεσσαλία, Αττική, Κεντρική Μακεδονία, Ήπειρο, Κρήτη, Βόρειο Αιγαίο· νερό και ανακοινώσεις δήμου στη Λάρισα." },
    gaps: { en: "Other regions don't map one-to-one to HNMS warning areas yet. Power cuts: link only. 112 alerts reach phones directly.", el: "Οι υπόλοιπες περιφέρειες δεν αντιστοιχούν ακόμη. Ρεύμα: μόνο σύνδεσμος. Τα 112 φτάνουν απευθείας στα κινητά." },
  },
  {
    code: "GB", name: { en: "United Kingdom", el: "Ηνωμένο Βασίλειο" }, status: "partial", sources: ["ea-floods", "tfl-status"],
    covers: { en: "Flood alerts and warnings in England; London transport status (with a TfL key).", el: "Ειδοποιήσεις πλημμύρας στην Αγγλία· συγκοινωνίες Λονδίνου (με κλειδί TfL)." },
    gaps: { en: "No Met Office weather warnings; no Scotland, Wales or Northern Ireland flood data.", el: "Όχι προειδοποιήσεις Met Office· όχι Σκωτία, Ουαλία, Β. Ιρλανδία." },
  },
  {
    code: "PT", name: { en: "Portugal", el: "Πορτογαλία" }, status: "partial", sources: ["ipma-warnings"],
    covers: { en: "IPMA warnings for the 18 mainland districts, the Azores, Funchal and Porto Santo.", el: "Προειδοποιήσεις IPMA για τις 18 ηπειρωτικές περιφέρειες, τις Αζόρες, Φουνσάλ και Πόρτο Σάντο." },
    gaps: { en: "The rest of Madeira isn't matched; cities are matched by district name, so a city whose district name the geocoder spells differently is not covered.", el: "Η υπόλοιπη Μαδέρα δεν αντιστοιχίζεται· η αντιστοίχιση γίνεται με το όνομα της περιφέρειας." },
  },
  {
    code: "AT", name: { en: "Austria", el: "Αυστρία" }, status: "provisional", sources: ["geosphere-warnings"],
    covers: { en: "GeoSphere Austria warnings for every municipality.", el: "Προειδοποιήσεις GeoSphere Austria για κάθε δήμο." },
    gaps: { en: "The service answers live, but no warning was in force when we checked, so a real warning has not been read yet.", el: "Η υπηρεσία απαντά ζωντανά, αλλά δεν ίσχυε καμία προειδοποίηση στον έλεγχο· δεν έχει διαβαστεί ακόμη πραγματική." },
  },
  // researched, not connected
  {
    code: "IE", name: { en: "Ireland", el: "Ιρλανδία" }, status: "unsupported", sources: [],
    covers: { en: "Nothing connected yet.", el: "Τίποτα ακόμη." },
    gaps: { en: "Met Éireann's CAP feed carried only marine warnings when we checked; the land warning format after its 2026 change is unverified.", el: "Το CAP της Met Éireann είχε μόνο θαλάσσιες προειδοποιήσεις· η μορφή για την ξηρά δεν έχει επαληθευτεί." },
  },
  {
    code: "NZ", name: { en: "New Zealand", el: "Νέα Ζηλανδία" }, status: "unsupported", sources: [],
    covers: { en: "Nothing connected yet.", el: "Τίποτα ακόμη." },
    gaps: { en: "MetService's CAP feed answered but carried no alerts, so its records could not be checked.", el: "Το CAP της MetService απάντησε χωρίς ειδοποιήσεις· δεν ελέγχθηκαν εγγραφές." },
  },
  {
    code: "JP", name: { en: "Japan", el: "Ιαπωνία" }, status: "unsupported", sources: [],
    covers: { en: "Nothing connected.", el: "Τίποτα." },
    gaps: { en: "The JMA XML feed we found had not been updated since 28 May 2026, so it can't be trusted for current warnings.", el: "Το XML feed της JMA δεν είχε ενημερωθεί από τις 28 Μαΐου 2026." },
  },
  ...(["ES", "FR", "NL", "KR"] as const).map((code) => ({
    code,
    name: { ES: { en: "Spain", el: "Ισπανία" }, FR: { en: "France", el: "Γαλλία" }, NL: { en: "Netherlands", el: "Ολλανδία" }, KR: { en: "South Korea", el: "Νότια Κορέα" } }[code],
    status: "unsupported" as const, sources: [],
    covers: { en: "Nothing connected.", el: "Τίποτα." },
    gaps: {
      en: { ES: "AEMET's open data API needs a registered key.", FR: "Météo-France's warning API needs a registered key.", NL: "KNMI's data platform needs a registered key.", KR: "KMA's API needs a registered key." }[code],
      el: "Η υπηρεσία χρειάζεται εγγεγραμμένο κλειδί.",
    },
  })),
];

const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));
export function countryStatus(code: string): CountryStatus { return byCode.get(code)?.status ?? "unsupported"; }

// keep the table honest: a supported or partial country must name a connected source with a real verified record
for (const c of COUNTRIES) {
  if (c.status !== "supported" && c.status !== "partial") continue;
  const ok = c.sources.some((id) => { const s = SOURCES.find((x) => x.id === id); return s?.adapter && s.verified?.realRecord; });
  if (!ok) throw new Error(`country ${c.code} is marked ${c.status} without a verified source`);
}
