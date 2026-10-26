# Sources (researched and tested 2026-10-26)

Every source below was reached and parsed live on 2026-10-26 (through a browser, because the build machine has no
general internet access). The real responses were saved in `tests/fixtures/` and are covered by tests.
What has **not** been verified yet is a fetch from a Vercel server; see the README.

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
