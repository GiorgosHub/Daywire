// Source registry. Every source DAYWIRE knows about, where it applies, how it is read and what it does not cover.
// Access methods and terms were checked on 2026-10-26 (docs/sources.md). Adding a city or country means adding
// entries here (and an adapter when the access method is new); the rest of the app reads coverage from this list.
import type { GeoLocation } from "../domain/types.ts";
import { deyalAdapter, DEYAL_PUBLISHER } from "./adapters/deyal.ts";
import { EA, eaFloodsAdapter } from "./adapters/ea-floods.ts";
import { larissaWpAdapter, MUNICIPALITY } from "./adapters/larissa-wp.ts";
import { meteoalarmAdapter, METEOALARM_COUNTRIES } from "./adapters/meteoalarm.ts";
import { nwsAdapter } from "./adapters/nws.ts";
import { TFL, TFL_MODES, TFL_STATUS_PAGE, tflAdapter } from "./adapters/tfl.ts";
import type { Coverage, SourceDef } from "./types.ts";

const LARISSA = 258576;
const LONDON = 2643743;

export const SOURCES: SourceDef[] = [
  // ——— Greece ———
  {
    id: "meteoalarm-gr",
    name: { en: "HNMS weather warnings", el: "Προειδοποιήσεις ΕΜΥ" },
    publisher: METEOALARM_COUNTRIES.GR!.service,
    method: "json-api",
    categories: ["weather"],
    coverage: { kind: "regions", country: "GR", admin1Ids: Object.keys(METEOALARM_COUNTRIES.GR!.regions).map(Number) },
    where: { en: "Greece: Thessaly, Attica, Central Macedonia, Epirus, Crete, North Aegean", el: "Ελλάδα: Θεσσαλία, Αττική, Κεντρική Μακεδονία, Ήπειρος, Κρήτη, Βόρειο Αιγαίο" },
    endpoint: "https://feeds.meteoalarm.org/api/v1/warnings/feeds-greece",
    homepage: "https://www.emy.gr",
    note: {
      en: "Official HNMS warnings from MeteoAlarm's public feed, for the warning region your city is in (Thessaly, Attica, Central Macedonia, Epirus, Crete, North Aegean; other Greek regions don't map one-to-one yet). The level (yellow, orange, red) is set by HNMS. Warnings cover the whole region.",
      el: "Επίσημες προειδοποιήσεις της ΕΜΥ από το δημόσιο feed του MeteoAlarm, για την περιοχή προειδοποιήσεων της πόλης σου (Θεσσαλία, Αττική, Κεντρική Μακεδονία, Ήπειρος, Κρήτη, Βόρειο Αιγαίο· οι υπόλοιπες περιφέρειες δεν αντιστοιχούν ακόμα ένα προς ένα). Το επίπεδο (κίτρινο, πορτοκαλί, κόκκινο) το ορίζει η ΕΜΥ. Καλύπτουν όλη την περιοχή.",
    },
    attribution: { en: "Warnings: HNMS via MeteoAlarm (EUMETNET).", el: "Προειδοποιήσεις: ΕΜΥ μέσω MeteoAlarm (EUMETNET)." },
    fixture: "meteoalarm-greece.json",
    fixtureFor: [LARISSA],
    adapter: meteoalarmAdapter,
    ttl: 300,
  },
  {
    id: "deyal-water",
    name: { en: "DEYAL water interruptions", el: "Διακοπές νερού ΔΕΥΑΛ" },
    publisher: DEYAL_PUBLISHER,
    method: "rss",
    categories: ["water"],
    coverage: { kind: "places", geonameIds: [LARISSA] },
    where: { en: "Larissa, Greece", el: "Λάρισα" },
    endpoint: "https://deyal.gr/el/gia-polites/vlaves-diakopes?format=feed&type=rss",
    homepage: "https://deyal.gr/el/gia-polites/vlaves-diakopes",
    note: {
      en: "The RSS feed of DEYAL's “Faults - Interruptions” section (latest 10 notices). It carries planned interruptions; sudden faults are not always posted there.",
      el: "Το RSS της ενότητας «Βλάβες - Διακοπές» της ΔΕΥΑΛ (τελευταίες 10 ανακοινώσεις). Περιέχει τις προγραμματισμένες διακοπές· βλάβες της στιγμής δεν δημοσιεύονται πάντα εκεί.",
    },
    fixture: "deyal-water.rss",
    fixtureFor: [LARISSA],
    adapter: deyalAdapter,
    contacts: [
      { label: { en: "DEYAL faults (office hours)", el: "Βλάβες ΔΕΥΑΛ (ώρες γραφείου)" }, phone: "2410687210", checkedOn: "2026-10-26", url: "https://deyal.gr/el/" },
      { label: { en: "DEYAL faults (24 h)", el: "Βλάβες ΔΕΥΑΛ (24ωρο)" }, phone: "2410687220", checkedOn: "2026-10-26", url: "https://deyal.gr/el/" },
    ],
  },
  {
    id: "larissa-wp",
    name: { en: "Municipality of Larissa notices", el: "Ανακοινώσεις Δήμου Λαρισαίων" },
    publisher: MUNICIPALITY,
    method: "wp-rest",
    categories: ["announcement", "roads", "services"],
    coverage: { kind: "places", geonameIds: [LARISSA] },
    where: { en: "Larissa, Greece", el: "Λάρισα" },
    endpoint: "https://www.larissa.gov.gr/wp-json/wp/v2/posts?categories=5,35&per_page=60&_fields=id,date_gmt,modified_gmt,link,title,content,categories",
    homepage: "https://www.larissa.gov.gr/category/anakoinoseis/",
    note: {
      en: "The municipality's public WordPress API: every “Announcement”, and only those press releases whose titles match traffic, interruption or service-change rules. Dates are read from the text.",
      el: "Το δημόσιο WordPress API του δήμου: όλες οι «Ανακοινώσεις» και, από τα «Δελτία Τύπου», μόνο όσα αφορούν κυκλοφοριακές ρυθμίσεις, διακοπές ή λειτουργία υπηρεσιών (κανόνες στον τίτλο). Οι ημερομηνίες βγαίνουν από το κείμενο.",
    },
    fixture: "larissa-wp.json",
    fixtureFor: [LARISSA],
    adapter: larissaWpAdapter,
  },
  {
    id: "hedno-outages",
    name: { en: "Planned power cuts", el: "Προγραμματισμένες διακοπές ρεύματος" },
    publisher: { en: "HEDNO", el: "ΔΕΔΔΗΕ" },
    method: "link-only",
    categories: ["power"],
    coverage: { kind: "countries", countries: ["GR"] },
    where: { en: "Greece", el: "Ελλάδα" },
    homepage: "https://siteapps.deddie.gr/Outages2Public/",
    note: {
      en: "Not connected: HEDNO's page is behind bot protection, which we will not bypass. Open the page and choose your prefecture.",
      el: "Δεν συνδέεται αυτόματα: η σελίδα του ΔΕΔΔΗΕ προστατεύεται από σύστημα κατά των αυτόματων επισκέψεων και δεν θα το παρακάμψουμε. Ανοίξτε τη σελίδα και επιλέξτε Νομό.",
    },
  },
  {
    id: "civil-protection-112-gr",
    name: { en: "112 · Civil Protection", el: "112 · Πολιτική Προστασία" },
    publisher: { en: "Ministry for Climate Crisis & Civil Protection", el: "Υπουργείο Κλιματικής Κρίσης & Πολιτικής Προστασίας" },
    method: "link-only",
    categories: ["emergency"],
    coverage: { kind: "countries", countries: ["GR"] },
    where: { en: "Greece", el: "Ελλάδα" },
    homepage: "https://civilprotection.gov.gr/en/112",
    note: {
      en: "112 alerts are sent straight to mobile phones. DAYWIRE does not relay or replace them.",
      el: "Τα μηνύματα 112 φτάνουν απευθείας στα κινητά. Το DAYWIRE δεν τα αναμεταδίδει και δεν τα αντικαθιστά.",
    },
  },
  // ——— United States ———
  {
    id: "nws-alerts",
    name: { en: "NWS alerts", el: "Ειδοποιήσεις NWS" },
    publisher: { en: "National Weather Service" },
    method: "json-api",
    categories: ["weather"],
    coverage: { kind: "countries", countries: ["US"] },
    where: { en: "United States (50 states and DC)", el: "ΗΠΑ (50 πολιτείες και DC)" },
    endpoint: "https://api.weather.gov/alerts/active?point={lat},{lon}",
    homepage: "https://www.weather.gov",
    note: {
      en: "Active watches, warnings and advisories from the US National Weather Service for the city's point. Severity is the one NWS assigns. Free, open data; we identify ourselves as NWS asks.",
      el: "Ενεργές ειδοποιήσεις της Εθνικής Μετεωρολογικής Υπηρεσίας των ΗΠΑ για το σημείο της πόλης. Η σοβαρότητα είναι αυτή που ορίζει η NWS. Ανοιχτά δεδομένα.",
    },
    fixture: "nws-alerts-point.json",
    fixtureFor: [],
    adapter: nwsAdapter,
    ttl: 180,
  },
  // ——— United Kingdom ———
  {
    id: "ea-floods",
    name: { en: "Flood warnings (England)", el: "Προειδοποιήσεις πλημμύρας (Αγγλία)" },
    publisher: EA,
    method: "json-api",
    categories: ["weather"],
    coverage: { kind: "regions", country: "GB", admin1Ids: [6269131] }, // England
    where: { en: "England, UK", el: "Αγγλία, ΗΒ" },
    endpoint: "https://environment.data.gov.uk/flood-monitoring/id/floods?lat={lat}&long={lon}&dist=10",
    homepage: "https://check-for-flooding.service.gov.uk",
    note: {
      en: "Current flood alerts and warnings from the Environment Agency for flood areas within 10 km of the city centre. Flood risk only: no general weather warnings. The API gives times without a zone; we read them as UK time.",
      el: "Τρέχουσες ειδοποιήσεις πλημμύρας της Environment Agency για περιοχές σε ακτίνα 10 km από το κέντρο. Μόνο πλημμύρες, όχι γενικές καιρικές προειδοποιήσεις. Οι ώρες δίνονται χωρίς ζώνη· τις διαβάζουμε ως ώρα ΗΒ.",
    },
    attribution: { en: "This uses Environment Agency flood and river level data from the real-time data API (Beta).", el: "Χρησιμοποιεί δεδομένα πλημμυρών της Environment Agency από το real-time data API (Beta)." },
    fixture: "ea-floods-london.json",
    fixtureFor: [LONDON],
    adapter: eaFloodsAdapter,
    ttl: 300,
  },
  {
    id: "tfl-status",
    name: { en: "TfL line status", el: "Κατάσταση γραμμών TfL" },
    publisher: TFL,
    method: "json-api",
    categories: ["transport"],
    coverage: { kind: "radius", lat: 51.50853, lon: -0.12574, km: 30 }, // Greater London
    where: { en: "London, UK (within 30 km of the centre)", el: "Λονδίνο, ΗΒ (σε ακτίνα 30 km από το κέντρο)" },
    endpoint: `https://api.tfl.gov.uk/Line/Mode/${TFL_MODES}/Status`,
    homepage: TFL_STATUS_PAGE,
    note: {
      en: "Live status of Tube, Elizabeth line, DLR, Overground and Tram lines. Lines with good service are not listed. Needs a registered TfL key (TFL_APP_KEY).",
      el: "Ζωντανή κατάσταση γραμμών Tube, Elizabeth line, DLR, Overground και Tram. Οι γραμμές χωρίς προβλήματα δεν εμφανίζονται. Χρειάζεται κλειδί TfL (TFL_APP_KEY).",
    },
    attribution: { en: "Powered by TfL Open Data.", el: "Powered by TfL Open Data." },
    requires: ["TFL_APP_KEY"],
    fixture: "tfl-line-status.json",
    fixtureFor: [LONDON],
    adapter: tflAdapter,
    ttl: 60,
  },
];

function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLon - aLon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function covers(c: Coverage, loc: GeoLocation): boolean {
  switch (c.kind) {
    case "places": return c.geonameIds.includes(loc.geonameId);
    case "regions": return loc.countryCode === c.country && loc.admin1Id !== undefined && c.admin1Ids.includes(loc.admin1Id);
    case "countries": return c.countries.includes(loc.countryCode);
    case "radius": return km(c.lat, c.lon, loc.lat, loc.lon) <= c.km;
  }
}

/** Index by country so lookups stay cheap as the registry grows. */
const byCountry = new Map<string, SourceDef[]>();
const anywhere: SourceDef[] = [];
for (const s of SOURCES) {
  const c = s.coverage;
  const countries = c.kind === "countries" ? c.countries : c.kind === "regions" ? [c.country] : null;
  if (countries) for (const k of countries) byCountry.set(k, [...(byCountry.get(k) ?? []), s]);
  else anywhere.push(s);
}

export function sourcesFor(loc: GeoLocation, disabled: ReadonlySet<string> = new Set()): SourceDef[] {
  return [...(byCountry.get(loc.countryCode) ?? []), ...anywhere].filter((s) => !disabled.has(s.id) && covers(s.coverage, loc));
}

/** Operators can switch sources off without a deploy of new code: DAYWIRE_DISABLED_SOURCES=id,id */
export function disabledFrom(env: Record<string, string | undefined>): Set<string> {
  return new Set((env.DAYWIRE_DISABLED_SOURCES ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

export const missingConfig = (s: SourceDef, env: Record<string, string | undefined>) => (s.requires ?? []).filter((k) => !env[k]);
