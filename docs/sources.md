# Sources (researched and tested 2026-10-26 and 2026-10-27)

Every connected source below was reached and parsed live on 2026-10-26 or 2026-10-27 (through a browser, because the
build machine has no general internet access). The real responses were saved in `tests/fixtures/` and are covered by
tests. What has **not** been verified yet is a fetch from a Vercel server; run `node scripts/probe-live.mjs <url>`
against the first deployment.

## Countries

A country is **supported** only when a connected source was checked against the live service, a real record was read
and parsed, and what it covers is written down (`src/sources/countries.ts`, shown on the Sources page). A country is
never counted because it can be searched, because an adapter exists, or because a mocked test passes. The table is
enforced at start-up: a country marked supported or partial without a verified, connected source stops the server.

| Country | Status | Source | What it covers | What it doesn't | Checked |
|---|---|---|---|---|---|
| United States | **Supported** | NWS alerts | weather alerts for every point | water, power, roads, local notices | 26 Oct, real record |
| Canada | **Supported** | ECCC via MSC GeoMet | weather alerts for every alert area | non-weather | 27 Oct, frost advisory, Toronto |
| Germany | **Supported** | DWD GeoServer (WFS) | warnings for every municipality | non-weather; German text only | 26 Oct, WINDBÖEN, Uelvesbüll |
| Norway | **Supported** | MET Norway MetAlerts 2.0 | land, coast and sea warnings | non-weather; all warnings seen were marine | 27 Oct, 33 marine warnings (nb + en) |
| Sweden | **Supported** | SMHI IBWW API | warnings and messages (weather, flow, sea level, water shortage) | coastal line warnings matched by county | 26 Oct, 4 warnings |
| Finland | **Supported** | FMI CAP feed (en-GB) | land and sea warnings | non-weather; English edition only | 27 Oct, 2 CAP alerts |
| Italy | **Supported** | DPC national alert bulletin (GitHub, CC BY 4.0) | flood, landslide and thunderstorm risk per alert zone, today and tomorrow | wind, heat, snow and other weather; regions may update first | 27 Oct: 26 Oct bulletin (187 zones, no alert) and 16 May 2023 (red alerts) |
| Greece | Partial | MeteoAlarm (HNMS), ΔΕΥΑΛ, Δήμος Λαρισαίων | HNMS warnings in 6 regions; Larissa water and municipal notices | other regions; power (link only); 112 | 26 Oct |
| United Kingdom | Partial | EA floods, TfL | floods in England; London transport with a key | Met Office warnings; Scotland, Wales, NI floods | 26 Oct |
| Portugal | Partial | IPMA warnings | 18 mainland districts (by name), Azores, Funchal, Porto Santo | the rest of Madeira; cities whose district name the geocoder spells differently | 27 Oct, 200 records, all green |
| Austria | Provisional | GeoSphere Austria | warnings per municipality | — no real warning read yet: 12 live answers on 27 Oct, none with a warning; format from GeoSphere's own example | 27 Oct |
| Ireland | Not covered | — | — | Met Éireann's CAP feed had marine warnings only; land format after the 2026 change unverified | 26 Oct |
| New Zealand | Not covered | — | — | MetService CAP feed answered with no alerts; records unverified | 26 Oct |
| Japan | Not covered | — | — | JMA XML feed not updated since 28 May 2026 | 26 Oct |
| Spain, France, Netherlands, South Korea | Not covered | — | — | AEMET, Météo-France, KNMI and KMA need registered keys | 26 Oct |
| Everywhere else | Not covered | — | — | not researched yet | — |

Supported: 7. Partial: 3. Provisional: 1. Working live integrations (supported + partial): **10 countries**, short of
the target of 12; the next candidates are below.

| Source | Where | Categories | Access | Status |
|---|---|---|---|---|
| ΕΜΥ / HNMS warnings via MeteoAlarm | Greece: Thessaly, Attica, Central Macedonia, Epirus, Crete, North Aegean | weather | JSON (CAP) `feeds.meteoalarm.org/api/v1/warnings/feeds-greece` | **Connected** |
| ΔΕΥΑΛ water interruptions | Larissa | water | RSS (Joomla K2) | **Connected** |
| Δήμος Λαρισαίων | Larissa | announcements, roads, services | WordPress REST API | **Connected** |
| National Weather Service alerts | USA (50 states + DC) | weather | `api.weather.gov/alerts/active?point=lat,lon` | **Connected** |
| Environment Agency flood warnings | England | weather (floods) | `environment.data.gov.uk/flood-monitoring/id/floods?lat&long&dist=10` | **Connected** |
| TfL line status | London (30 km) | transport | `api.tfl.gov.uk/Line/Mode/…/Status` | **Built and tested; off until `TFL_APP_KEY` is set** |
| ΔΕΔΔΗΕ / HEDNO planned power cuts | Greece | power | HTML form behind Imperva bot protection | Link only (we don't bypass bot protection) |
| 112 Greece | Greece | civil protection | Cell broadcast; no feed | Link only |
| Location search: Open-Meteo geocoder | World | — | `geocoding-api.open-meteo.com/v1/search` and `/v1/get` (GeoNames) | **Connected** |

## Notes per source

### International warning services (added 2026-10-27)
- **Place matching.** Each service publishes its warning areas differently. MET Norway, FMI, SMHI and ECCC publish
  polygons: a warning is kept only when the city's point is inside (`src/sources/geo.ts`, even-odd test, holes
  respected). DWD and GeoSphere answer for the municipality containing the point (the filtering is theirs). IPMA is
  matched by district name; DPC by the alert zone outline in its TopoJSON. Nothing is buffered or guessed.
- **Levels.** Always the service's own: CAP severity (DWD, FMI), colour (MET Norway, SMHI, ECCC, IPMA, DPC, GeoSphere's
  own wording). Green / "nessuna allerta" is never turned into a notice.
- **Language.** Texts are the service's originals; where a service publishes its own second language (MET Norway's
  English, ECCC's French, SMHI's English) it is kept as an official alternative. Nothing is machine-translated.
- **Times.** All carry offsets except IPMA, whose times are read in the city's zone and marked as having no zone.
- **Italy discovery.** The bulletin file name carries its issue time (e.g. `20261026_1402_today.json`), so the adapter
  lists the folder once (GitHub API, cached 1 h; set `GITHUB_TOKEN` to avoid the shared 60-requests-per-hour limit)
  and takes today's bulletin, or yesterday's "tomorrow" bulletin before today's is out.
- **Terms.** FMI, SMHI, DPC: CC BY 4.0 (stated by the publisher). ECCC: Open Government Licence – Canada. DWD: open
  data with source attribution; area geometry © GeoBasis-DE / BKG. MET Norway, IPMA, GeoSphere: attribution as
  shown; confirm the exact wording by hand before launch.

### MeteoAlarm (ΕΜΥ)
- **Region mapping.** Cities are matched to EMMA warning regions through their GeoNames admin1 id. The mappings, checked against the area names in the feed:

  | GeoNames admin1 | id | EMMA region |
  |---|---|---|
  | Thessaly | 6697809 | GR001 |
  | Attica | 6692632 | GR011 |
  | Central Macedonia | 6697801 | GR007 |
  | Epirus | 6697804 | GR008 |
  | Crete | 6697802 | GR016 |
  | North Aegean | 6697806 | GR014 |

  West Greece, Peloponnese, Central Greece, South Aegean, East Macedonia & Thrace and West Macedonia are split differently between the two systems, so they are not mapped. Mapping them needs EMMA polygons.
- **Severity:** HNMS's awareness level is kept as it is (2 yellow, 3 orange, 4 red).
- **Text:** the Greek text is primary. HNMS's own English version is shown to English readers and labelled as HNMS's own text.
- **Terms:** we could not read the MeteoAlarm terms page programmatically. The feed is offered publicly for redistribution; we credit HNMS and MeteoAlarm (EUMETNET). Confirm the wording by hand.
- Adding another European country means adding an entry to `METEOALARM_COUNTRIES`: its slug, its issuing service, and the admin1→EMMA map.

### ΔΕΥΑΛ and Δήμος Λαρισαίων
Unchanged from the first release. Details are in the git history of this file and in `docs/data-model.md`.

### National Weather Service (USA)
- **Terms:** open data, free for any purpose. NWS asks for a User-Agent that identifies the application, which we send.
- **Query:** one request per city, at its point (4 decimal places).
- **Severity:** NWS's CAP severity is kept as it is (Extreme 4, Severe 3, Moderate 2, Minor 1).
- **Dates:** `onset`/`effective` is the start. The end is `ends`, or `expires` when `ends` is absent.
- **Text:** `instruction` is quoted as the source's own guidance.
- **Link:** the official alert record (`@id`).

### Environment Agency (England)
- **Terms:** Open Government Licence v3. We show the required attribution wording.
- **Query:** flood areas within 10 km of the city's centre point. Severity levels:
  - 1: severe flood warning
  - 2: flood warning
  - 3: flood alert
  - 4: no longer in force, shown as expired
- **Times:** the API's times carry no zone. We read them as UK local time and flag them as `source-field-no-tz`.
- **Links:** `check-for-flooding.service.gov.uk/target-area/<id>`, a page we confirmed exists.

### TfL (London)
- **Access:** TfL's site says applications must register for keys. Anonymous requests worked in testing, but we follow the terms: the source is off until `TFL_APP_KEY` is set. Attribution: "Powered by TfL Open Data".
- **What we keep:** only lines with a disruption (severity not in 10, 18, 19 or 20).
- **No end shown:** TfL's validity "to" is the end of the service day, not a forecast of when the problem clears, so it is not used as an end.

### Open-Meteo geocoder
- **Terms:** free for non-commercial use, under 10,000 calls a day, CC BY 4.0. Its data is from GeoNames.
- **Caching and paid tier:** results are cached by the CDN (1 day) and in memory. Set `OPEN_METEO_API_KEY` to use the paid customer endpoint for commercial use.
- **What we keep:** populated places only (GeoNames feature codes `PPL*`).

## Adding a city or country
1. If the city has neighbourhood names that notices use, add a locality profile in `src/domain/localities.ts`.
2. Add a registry entry in `src/sources/registry.ts`:
   - `coverage` (places / regions / countries / radius), `where`, `categories`, `note`
   - `attribution` and `requires` if the source needs them
   - a captured `fixture` with `fixtureFor`
3. Write an adapter in `src/sources/adapters/` only when the access method is new. It returns `Notice[]` built with `makeNotice()`, and must:
   - set `tz`
   - use `currentWhileListed` for live-status feeds
   - keep the issuer's own severity in `severity`
4. Add tests against the fixture (see `tests/global.test.ts`).
