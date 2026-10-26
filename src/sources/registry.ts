// Source registry. Every source DAYWIRE knows about, how it is read, and what it does not cover.
// Access methods and terms were checked on 2026-10-26 (see docs/sources.md).
import { deyalAdapter } from "./adapters/deyal.ts";
import { larissaWpAdapter, MUNICIPALITY } from "./adapters/larissa-wp.ts";
import { HNMS, meteoalarmAdapter } from "./adapters/meteoalarm.ts";
import type { SourceDef } from "./types.ts";

export const SOURCES: SourceDef[] = [
  {
    id: "meteoalarm-gr",
    cityIds: ["larisa"],
    name: { el: "Προειδοποιήσεις ΕΜΥ", en: "HNMS weather warnings" },
    publisher: HNMS,
    method: "json-api",
    endpoint: "https://feeds.meteoalarm.org/api/v1/warnings/feeds-greece",
    homepage: "https://www.emy.gr",
    note: {
      el: "Επίσημες προειδοποιήσεις της ΕΜΥ για την περιφέρεια Θεσσαλίας (κωδ. GR001), από το δημόσιο feed του MeteoAlarm. Το επίπεδο (κίτρινο, πορτοκαλί, κόκκινο) είναι της ΕΜΥ. Καλύπτουν όλη την περιφέρεια, όχι μόνο τη Λάρισα.",
      en: "Official HNMS warnings for the Thessaly region (code GR001), from MeteoAlarm's public feed. The level (yellow, orange, red) is set by HNMS. They cover the whole region, not just Larissa.",
    },
    fixture: "meteoalarm-greece.json",
    adapter: meteoalarmAdapter,
  },
  {
    id: "deyal-water",
    cityIds: ["larisa"],
    name: { el: "Διακοπές νερού ΔΕΥΑΛ", en: "DEYAL water interruptions" },
    publisher: { el: "ΔΕΥΑΛ", en: "DEYAL (Larissa water utility)" },
    method: "rss",
    endpoint: "https://deyal.gr/el/gia-polites/vlaves-diakopes?format=feed&type=rss",
    homepage: "https://deyal.gr/el/gia-polites/vlaves-diakopes",
    note: {
      el: "Το RSS της ενότητας «Βλάβες - Διακοπές» της ΔΕΥΑΛ (τελευταίες 10 ανακοινώσεις). Περιέχει τις προγραμματισμένες διακοπές· βλάβες της στιγμής δεν δημοσιεύονται πάντα εκεί.",
      en: "The RSS feed of DEYAL's “Faults - Interruptions” section (latest 10 notices). It carries planned interruptions; sudden faults are not always posted there.",
    },
    fixture: "deyal-water.rss",
    adapter: deyalAdapter,
    contacts: [
      { label: { el: "Βλάβες ΔΕΥΑΛ (ώρες γραφείου)", en: "DEYAL faults (office hours)" }, phone: "2410687210", checkedOn: "2026-10-26", url: "https://deyal.gr/el/" },
      { label: { el: "Βλάβες ΔΕΥΑΛ (24ωρο)", en: "DEYAL faults (24 h)" }, phone: "2410687220", checkedOn: "2026-10-26", url: "https://deyal.gr/el/" },
    ],
  },
  {
    id: "larissa-wp",
    cityIds: ["larisa"],
    name: { el: "Ανακοινώσεις Δήμου Λαρισαίων", en: "Municipality of Larissa notices" },
    publisher: MUNICIPALITY,
    method: "wp-rest",
    endpoint: "https://www.larissa.gov.gr/wp-json/wp/v2/posts?categories=5,35&per_page=60&_fields=id,date_gmt,modified_gmt,link,title,content,categories",
    homepage: "https://www.larissa.gov.gr/category/anakoinoseis/",
    note: {
      el: "Το δημόσιο WordPress API του δήμου: όλες οι «Ανακοινώσεις» και, από τα «Δελτία Τύπου», μόνο όσα αφορούν κυκλοφοριακές ρυθμίσεις, διακοπές ή λειτουργία υπηρεσιών (κανόνες στον τίτλο). Οι ημερομηνίες βγαίνουν από το κείμενο.",
      en: "The municipality's public WordPress API: every “Announcement”, and only those press releases whose titles match traffic, interruption or service-change rules. Dates are read from the text.",
    },
    fixture: "larissa-wp.json",
    adapter: larissaWpAdapter,
  },
  {
    id: "hedno-outages",
    cityIds: ["larisa"],
    name: { el: "Προγραμματισμένες διακοπές ρεύματος", en: "Planned power cuts" },
    publisher: { el: "ΔΕΔΔΗΕ", en: "HEDNO" },
    method: "link-only",
    homepage: "https://siteapps.deddie.gr/Outages2Public/?PrefectureID=35",
    note: {
      el: "Δεν συνδέεται αυτόματα: η σελίδα του ΔΕΔΔΗΕ προστατεύεται από σύστημα κατά των αυτόματων επισκέψεων και δεν θα το παρακάμψουμε. Ανοίξτε τη σελίδα και επιλέξτε Νομό Λάρισας.",
      en: "Not connected: HEDNO's page is behind bot protection, which we will not bypass. Open the page and choose the Larissa prefecture.",
    },
  },
  {
    id: "civil-protection-112",
    cityIds: ["larisa"],
    name: { el: "112 · Πολιτική Προστασία", en: "112 · Civil Protection" },
    publisher: { el: "Υπουργείο Κλιματικής Κρίσης & Πολιτικής Προστασίας", en: "Ministry for Climate Crisis & Civil Protection" },
    method: "link-only",
    homepage: "https://civilprotection.gov.gr/en/112",
    note: {
      el: "Τα μηνύματα 112 φτάνουν απευθείας στα κινητά. Το DAYWIRE δεν τα αναμεταδίδει και δεν τα αντικαθιστά.",
      en: "112 alerts are sent straight to mobile phones. DAYWIRE does not relay or replace them.",
    },
  },
];

export function sourcesFor(cityId: string): SourceDef[] {
  return SOURCES.filter((s) => s.cityIds.includes(cityId));
}
