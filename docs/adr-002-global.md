# ADR-002: From Larissa to a global location model

**Status:** Accepted · **Date:** 2026-10-26 · Builds on ADR-001 (it does not replace it).

## Context
The first release hard-coded:
- one city (`cityId: "larisa"`)
- one time zone (`Europe/Athens`) in the UI
- Greek/English text pairs inline in every view
- MeteoAlarm's Thessaly region code

Its domain logic was sound: extraction, status, deduplication, honest source health.

## Decision
1. **Locations are GeoNames records.**
   - Every location has a GeoNames id (`gn:<id>`), ISO country code, first-level region (admin1, by GeoNames id), coordinates and an IANA time zone.
   - Worldwide search uses the Open-Meteo geocoder, through our own `/api/places` (strict CSP, CDN cache, coverage attached).
   - Neighbourhood lists are optional per-city *locality profiles* (`src/domain/localities.ts`).
   - Larissa and London ship as featured records, so they work without the geocoder.
2. **Sources declare where they apply** as data:
   - specific GeoNames places
   - regions within a country (admin1 ids)
   - whole countries
   - a radius around a point

   The registry is indexed by country. Each source also declares:
   - its categories
   - required configuration (`requires: ["TFL_APP_KEY"]`)
   - attribution
   - a fixture tied to the location it was captured for

   Operators can disable a source with `DAYWIRE_DISABLED_SOURCES`.
3. **Coverage is computed from the registry, never from results.** Each of the 8 categories is connected, waiting for setup, link only, or not covered. The level is set by the number of connected categories:
   - good: 3 or more
   - partial: 2
   - limited: 1
   - none: 0

   "Temporarily unavailable" comes from live source health. A location with no connected source gets an explanation page, never an empty feed.
4. **Isolation.** Each source runs under its own hard time limit, with `Promise.allSettled` over all of them. A failing country adapter affects only its own rows. Responses are shared per URL inside an instance, so one country feed serves all its cities.
5. **Time.**
   - Every notice carries the time zone it belongs to.
   - All display is done in that zone, naming the zone when it differs from the viewer's.
   - Times a source gives without a zone are tagged `source-field-no-tz`, read in the publisher's zone, and labelled as such.
6. **Severity** is the issuer's own classification (scheme, code, label in the issuer's words). A documented per-scheme `rank` (1–4) is used only for ordering and priority.
7. **Localization.**
   - Keyed catalogs per language: `en.ts` is the reference, and each other catalog must have the same keys (a type error otherwise) with the same parameters (a test).
   - Data-level text (`LText`) has a required English fallback and any number of languages.
   - Official text is never machine-translated. Where an issuer publishes its own other-language version (MeteoAlarm), that version is shown and labelled as the issuer's.
8. **Preferences v2:**
   - several saved locations, each with its own label, neighbourhoods and streets;
   - v1 preferences migrate automatically;
   - links like `#/at/gn:<id>` open any location.

## Consequences
- **Adding a city or country is configuration:**
  - one registry entry per source (an adapter only when the access method is new);
  - optionally a locality profile and a fixture.
- **Coverage claims stay bounded by the registry.** Choosing a location anywhere does not imply coverage there.
- **Limits:**
  - The geocoder's free tier is non-commercial and under 10,000 calls a day. `OPEN_METEO_API_KEY` switches to the paid endpoint.
  - MeteoAlarm needs a region-to-EMMA mapping per country; only one-to-one matches are listed.
  - Point-based sources (NWS, EA) are queried at the city's centre point.
