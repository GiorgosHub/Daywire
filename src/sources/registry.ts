// Source registry. Every source DAYWIRE knows about, where it applies, how it is read and what it does not cover.
// Access methods and terms were checked on 2026-10-26 (docs/sources.md). Adding a city or country means adding
// entries here (and an adapter when the access method is new); the rest of the app reads coverage from this list.
import type { GeoLocation } from "../domain/types.ts";
import { deyalAdapter, DEYAL_PUBLISHER } from "./adapters/deyal.ts";
import { dpcAdapter, DPC, DPC_LIST } from "./adapters/dpc.ts";
import { DWD, dwdAdapter } from "./adapters/dwd.ts";
import { FMI, FMI_FEED, fmiAdapter } from "./adapters/fmi.ts";
import { GEOSPHERE, geosphereAdapter } from "./adapters/geosphere.ts";
import { IPMA, IPMA_WARNINGS, ipmaAdapter, ipmaArea } from "./adapters/ipma.ts";
import { METNO, metnoAdapter } from "./adapters/metno.ts";
import { ECCC, mscAdapter } from "./adapters/msc.ts";
import { SMHI, SMHI_URL, smhiAdapter } from "./adapters/smhi.ts";
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
    verified: { on: "2026-10-26", method: "browser", realRecord: true, what: "61 HNMS warnings in the Greek MeteoAlarm feed", fixture: "meteoalarm-greece.json" },
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
    verified: { on: "2026-10-26", method: "browser", realRecord: true, what: "10 interruption notices in the RSS feed", fixture: "deyal-water.rss" },
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
    verified: { on: "2026-10-26", method: "browser", realRecord: true, what: "posts from the WordPress REST API", fixture: "larissa-wp.json" },
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
    verified: { on: "2026-10-26", method: "browser", realRecord: true, what: "active alerts for a Texas point", fixture: "nws-alerts-point.json" },
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
    verified: { on: "2026-10-26", method: "browser", realRecord: true, what: "flood areas within 15 km of central London", fixture: "ea-floods-london.json" },
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
    verified: { on: "2026-10-26", method: "browser", realRecord: true, what: "line statuses (needs TFL_APP_KEY in production)", fixture: "tfl-line-status.json" },
  },
  // ——— Norway ———
  {
    id: "metno-alerts",
    name: { en: "MET Norway weather warnings", el: "Προειδοποιήσεις MET Norway" },
    publisher: METNO,
    method: "json-api",
    categories: ["weather"],
    coverage: { kind: "countries", countries: ["NO"] },
    where: { en: "Norway (land, coast and sea areas)", el: "Νορβηγία (ξηρά, ακτές, θαλάσσιες περιοχές)" },
    endpoint: "https://api.met.no/weatherapi/metalerts/2.0/current.json?lat={lat}&lon={lon}",
    homepage: "https://www.met.no",
    note: {
      en: "MetAlerts 2.0 from the Norwegian Meteorological Institute, asked for the city's point; a warning is shown only when its published area contains that point. Levels (yellow, orange, red) are MET Norway's. Norwegian text, with MET Norway's own English version.",
      el: "MetAlerts 2.0 του Νορβηγικού Μετεωρολογικού Ινστιτούτου για το σημείο της πόλης· μια προειδοποίηση εμφανίζεται μόνο όταν η περιοχή της περιέχει το σημείο. Τα επίπεδα (κίτρινο, πορτοκαλί, κόκκινο) είναι του MET Norway. Κείμενο στα νορβηγικά, με την αγγλική εκδοχή του ίδιου του MET Norway.",
    },
    attribution: { en: "Weather warnings: MET Norway.", el: "Προειδοποιήσεις: MET Norway." },
    fixture: "metno-alerts-point.json",
    fixtureFor: [],
    adapter: metnoAdapter,
    ttl: 300,
    verified: { on: "2026-10-27", method: "browser", realRecord: true, what: "33 current warnings (marine gale, yellow) read in Norwegian and English; point query and lang=en checked", fixture: "metno-alerts-point.json" },
  },
  // ——— Germany ———
  {
    id: "dwd-warnings",
    name: { en: "DWD weather warnings", el: "Προειδοποιήσεις DWD" },
    publisher: DWD,
    method: "json-api",
    categories: ["weather"],
    coverage: { kind: "countries", countries: ["DE"] },
    where: { en: "Germany (every municipality)", el: "Γερμανία (κάθε δήμος)" },
    endpoint: "https://maps.dwd.de/geoserver/dwd/ows?service=WFS&typeName=dwd:Warnungen_Gemeinden&CQL_FILTER=CONTAINS(THE_GEOM,POINT({lat} {lon}))",
    homepage: "https://www.dwd.de/warnungen",
    note: {
      en: "Official warnings of the Deutscher Wetterdienst for the municipality that contains the city's point, from DWD's open GeoServer. Severity is DWD's (Minor, Moderate, Severe, Extreme). Texts are DWD's German originals.",
      el: "Επίσημες προειδοποιήσεις της Γερμανικής Μετεωρολογικής Υπηρεσίας για τον δήμο που περιέχει το σημείο της πόλης, από τον ανοιχτό GeoServer της DWD. Η σοβαρότητα είναι της DWD. Τα κείμενα είναι τα γερμανικά πρωτότυπα.",
    },
    attribution: { en: "Source: Deutscher Wetterdienst. Areas © GeoBasis-DE / BKG (data modified).", el: "Πηγή: Deutscher Wetterdienst. Περιοχές © GeoBasis-DE / BKG." },
    fixture: "dwd-warnings-point.json",
    fixtureFor: [],
    adapter: dwdAdapter,
    ttl: 300,
    verified: { on: "2026-10-26", method: "browser", realRecord: true, what: "a WINDBÖEN (Minor) warning for Gemeinde Uelvesbüll returned by the point filter", fixture: "dwd-warnings-point.json" },
  },
  // ——— Sweden ———
  {
    id: "smhi-warnings",
    name: { en: "SMHI warnings", el: "Προειδοποιήσεις SMHI" },
    publisher: SMHI,
    method: "json-api",
    categories: ["weather", "water"],
    coverage: { kind: "countries", countries: ["SE"] },
    where: { en: "Sweden", el: "Σουηδία" },
    endpoint: SMHI_URL,
    homepage: "https://www.smhi.se",
    note: {
      en: "SMHI's impact-based warnings and messages. A warning is shown when its published area contains the city's point; coastal warnings drawn as a line apply to the counties SMHI lists. Levels are SMHI's (yellow, orange, red); “messages” (such as risk of water shortage) have no level.",
      el: "Οι προειδοποιήσεις και τα μηνύματα της SMHI. Μια προειδοποίηση εμφανίζεται όταν η περιοχή της περιέχει το σημείο της πόλης· οι παράκτιες, που δίνονται ως γραμμή, ισχύουν για τις κομητείες που αναφέρει η SMHI. Τα επίπεδα είναι της SMHI· τα «μηνύματα» δεν έχουν επίπεδο.",
    },
    attribution: { en: "Source: SMHI.", el: "Πηγή: SMHI." },
    fixture: "smhi-warnings.json",
    fixtureFor: [],
    adapter: smhiAdapter,
    ttl: 300,
    verified: { on: "2026-10-26", method: "browser", realRecord: true, what: "4 warnings: high flow (Värmland, yellow), high sea level (West Coast, yellow), water shortage messages", fixture: "smhi-warnings.json" },
  },
  // ——— Finland ———
  {
    id: "fmi-warnings",
    name: { en: "FMI warnings", el: "Προειδοποιήσεις FMI" },
    publisher: FMI,
    method: "rss",
    categories: ["weather"],
    coverage: { kind: "countries", countries: ["FI"] },
    where: { en: "Finland (land and sea areas)", el: "Φινλανδία (ξηρά και θάλασσα)" },
    endpoint: FMI_FEED,
    homepage: "https://en.ilmatieteenlaitos.fi/warnings",
    note: {
      en: "Warnings of the Finnish Meteorological Institute from its open CAP feed (FMI's English edition). A warning is shown when one of its area polygons contains the city's point. Severity is FMI's (Moderate = yellow, Severe = orange, Extreme = red).",
      el: "Προειδοποιήσεις του Φινλανδικού Μετεωρολογικού Ινστιτούτου από το ανοιχτό CAP feed του (αγγλική έκδοση του FMI). Εμφανίζεται όταν μια από τις περιοχές της περιέχει το σημείο της πόλης.",
    },
    attribution: { en: "Copyright Finnish Meteorological Institute. Licensed under CC BY 4.0.", el: "© Finnish Meteorological Institute. Άδεια CC BY 4.0." },
    fixture: "fmi-cap-feed.xml",
    fixtureFor: [],
    adapter: fmiAdapter,
    ttl: 300,
    verified: { on: "2026-10-27", method: "browser", realRecord: true, what: "2 CAP alerts (sea-area wind, Moderate) with polygons, read from the en-GB feed", fixture: "fmi-cap-feed.xml" },
  },
  // ——— Austria ———
  {
    id: "geosphere-warnings",
    name: { en: "GeoSphere Austria warnings", el: "Προειδοποιήσεις GeoSphere Austria" },
    publisher: GEOSPHERE,
    method: "json-api",
    categories: ["weather"],
    coverage: { kind: "countries", countries: ["AT"] },
    where: { en: "Austria (every municipality)", el: "Αυστρία (κάθε δήμος)" },
    endpoint: "https://warnungen.zamg.at/wsapp/api/getWarningsForCoords?lon={lon}&lat={lat}",
    homepage: "https://warnungen.zamg.at",
    note: {
      en: "GeoSphere Austria's warnings for the municipality that contains the city's point. The level is read from the warning's own text (Gelbe, Orange, Rote). Provisional: the endpoint answered live for 12 municipalities, but no warning was in force when we checked, so the warning format is checked only against GeoSphere's published example.",
      el: "Οι προειδοποιήσεις της GeoSphere Austria για τον δήμο που περιέχει το σημείο της πόλης. Το επίπεδο διαβάζεται από το ίδιο το κείμενο. Προσωρινό: η υπηρεσία απάντησε ζωντανά για 12 δήμους, αλλά δεν ίσχυε καμία προειδοποίηση· η μορφή ελέγχθηκε μόνο με το δημοσιευμένο παράδειγμα της GeoSphere.",
    },
    attribution: { en: "Data: GeoSphere Austria.", el: "Δεδομένα: GeoSphere Austria." },
    fixture: "geosphere-coords-example.json",
    fixtureFor: [],
    adapter: geosphereAdapter,
    ttl: 300,
    verified: { on: "2026-10-27", method: "browser", realRecord: false, what: "live answers for Vienna and 11 other municipalities, all with no warnings; format from the provider's OpenAPI example", fixture: "geosphere-coords-vienna.json" },
  },
  // ——— Canada ———
  {
    id: "msc-alerts",
    name: { en: "Environment Canada alerts", el: "Ειδοποιήσεις Environment Canada" },
    publisher: ECCC,
    method: "json-api",
    categories: ["weather"],
    coverage: { kind: "countries", countries: ["CA"] },
    where: { en: "Canada", el: "Καναδάς" },
    endpoint: "https://api.weather.gc.ca/collections/weather-alerts/items?bbox={lon-0.01},{lat-0.01},{lon+0.01},{lat+0.01}",
    homepage: "https://weather.gc.ca",
    note: {
      en: "Public weather alerts of Environment and Climate Change Canada from MSC GeoMet. An alert is shown when its area contains the city's point. Colour (yellow, orange, red) is ECCC's. English text, with ECCC's French version.",
      el: "Δημόσιες ειδοποιήσεις καιρού της Environment and Climate Change Canada από το MSC GeoMet. Εμφανίζεται όταν η περιοχή της περιέχει το σημείο της πόλης. Το χρώμα είναι της ECCC. Αγγλικά, με τη γαλλική εκδοχή της ECCC.",
    },
    attribution: { en: "Contains information licensed under the Open Government Licence – Canada.", el: "Περιέχει πληροφορίες με την Open Government Licence – Canada." },
    fixture: "msc-alerts-toronto.json",
    fixtureFor: [],
    adapter: mscAdapter,
    ttl: 300,
    verified: { on: "2026-10-27", method: "browser", realRecord: true, what: "a frost advisory (yellow) for the City of Toronto, by bounding box", fixture: "msc-alerts-toronto.json" },
  },
  // ——— Portugal ———
  {
    id: "ipma-warnings",
    name: { en: "IPMA weather warnings", el: "Προειδοποιήσεις IPMA" },
    publisher: IPMA,
    method: "json-api",
    categories: ["weather"],
    coverage: { kind: "countries", countries: ["PT"] },
    appliesTo: (loc) => ipmaArea(loc) !== undefined,
    where: { en: "Portugal: mainland districts, the Azores, Funchal and Porto Santo", el: "Πορτογαλία: ηπειρωτικές περιφέρειες, Αζόρες, Φουνσάλ, Πόρτο Σάντο" },
    endpoint: IPMA_WARNINGS,
    homepage: "https://www.ipma.pt",
    note: {
      en: "IPMA's warnings per warning area. Mainland cities are matched to their district by name; Azores cities to their island group. Madeira's north coast and mountains have their own areas that IPMA lists only by name, so there we cover only Funchal and Porto Santo. IPMA's times carry no zone; we read them as local time.",
      el: "Οι προειδοποιήσεις του IPMA ανά περιοχή. Οι ηπειρωτικές πόλεις αντιστοιχίζονται στην περιφέρειά τους με το όνομα· οι πόλεις των Αζορών στην ομάδα νησιών τους. Στη Μαδέρα καλύπτουμε μόνο Φουνσάλ και Πόρτο Σάντο. Οι ώρες του IPMA δεν έχουν ζώνη· τις διαβάζουμε ως τοπική ώρα.",
    },
    attribution: { en: "Source: IPMA.", el: "Πηγή: IPMA." },
    fixture: "ipma-warnings.json",
    fixtureFor: [],
    adapter: ipmaAdapter,
    ttl: 600,
    verified: { on: "2026-10-27", method: "browser", realRecord: true, what: "200 records for 25 areas, all green (no warning in force); area list from distrits-islands.json", fixture: "ipma-warnings.json" },
  },
  // ——— Italy ———
  {
    id: "dpc-bulletin",
    name: { en: "Civil Protection alert bulletin", el: "Δελτίο επιφυλακής Πολιτικής Προστασίας" },
    publisher: DPC,
    method: "json-api",
    categories: ["weather", "emergency"],
    coverage: { kind: "countries", countries: ["IT"] },
    where: { en: "Italy (every alert zone)", el: "Ιταλία (κάθε ζώνη επιφυλακής)" },
    endpoint: DPC_LIST,
    homepage: "https://github.com/pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica",
    note: {
      en: "The national hydrogeological and hydraulic alert bulletin of Italy's Civil Protection Department, published daily (normally by 16:00) for today and tomorrow. Shown for the alert zone that contains the city's point: hydraulic, hydrogeological and thunderstorm risk, at DPC's levels (yellow, orange, red). Flood and landslide risk only, not other weather; regions may issue their own updates first.",
      el: "Το εθνικό δελτίο υδρογεωλογικής και υδραυλικής επιφυλακής της Πολιτικής Προστασίας της Ιταλίας, καθημερινά (συνήθως έως τις 16:00) για σήμερα και αύριο. Για τη ζώνη που περιέχει το σημείο της πόλης: κίνδυνος υδραυλικός, υδρογεωλογικός, καταιγίδων, στα επίπεδα της DPC. Μόνο πλημμύρες και κατολισθήσεις· οι περιφέρειες μπορεί να εκδώσουν πρώτες δικές τους ενημερώσεις.",
    },
    attribution: { en: "Bulletin: Dipartimento della Protezione Civile, CC BY 4.0.", el: "Δελτίο: Dipartimento della Protezione Civile, CC BY 4.0." },
    fixture: "dpc-bulletin-20230516.json",
    fixtureFor: [],
    adapter: dpcAdapter,
    ttl: 3600,
    verified: { on: "2026-10-27", method: "browser", realRecord: true, what: "bulletin 20261026_1402 (187 zones, no alert) and the archived 20230516_1522 (red alerts in Emilia-Romagna) parsed", fixture: "dpc-bulletin-20230516.json" },
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
  return [...(byCountry.get(loc.countryCode) ?? []), ...anywhere].filter((s) => !disabled.has(s.id) && covers(s.coverage, loc) && (!s.appliesTo || s.appliesTo(loc)));
}

/** Operators can switch sources off without a deploy of new code: DAYWIRE_DISABLED_SOURCES=id,id */
export function disabledFrom(env: Record<string, string | undefined>): Set<string> {
  return new Set((env.DAYWIRE_DISABLED_SOURCES ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

export const missingConfig = (s: SourceDef, env: Record<string, string | undefined>) => (s.requires ?? []).filter((k) => !env[k]);
