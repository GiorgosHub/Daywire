# DAYWIRE

**Know what affects your day.** DAYWIRE shows verified local notices from official sources: interruptions, traffic arrangements, service changes, transport disruptions and official warnings.

- Every notice shows its source, publication time and last verification time, with an honest status.
- You can choose any city in the world. DAYWIRE says plainly which official sources it has there, and when it has none.

## Where it has sources

| Location | Connected | Coverage |
|---|---|---|
| Larissa, Greece | ΔΕΥΑΛ water cuts, municipal announcements, traffic and services, ΕΜΥ weather warnings | good |
| London, UK | Environment Agency flood warnings; TfL line status once `TFL_APP_KEY` is set | limited, or partial with the key |
| Anywhere in the USA | National Weather Service alerts | limited |
| Anywhere in England | Environment Agency flood warnings within 10 km | limited |
| Six Greek regions (Thessaly, Attica, Central Macedonia, Epirus, Crete, North Aegean) | ΕΜΥ weather warnings | limited |
| Everywhere else | — | none: the page says so and shows no feed |

Details and terms are in [docs/sources.md](docs/sources.md).

## What works
- **Locations:**
  - Worldwide location search by GeoNames id (no GPS).
  - Several saved locations, each with its own label, neighbourhoods and streets.
  - Links to any location: `#/at/gn:<id>`.
- **Coverage:** per location and per category (connected, waiting for setup, link only, not covered), computed from the source registry.
- **Homepage:**
  - Today's line from 00:00 to 24:00, in the location's own time zone.
  - Priority, in force, coming up, other updates, recently ended.
  - Search that ignores accents, and filters.
- **Detail view:** every date shows where it came from, including zone-less source times. Official text appears in its original language; an issuer's own other-language version is shown when it publishes one.
- **Honest states:**
  - test data
  - a source failing (last snapshot kept, marked unverified)
  - all sources failing
  - the API failing (cached copy marked old)
  - no coverage
  - no results
- **Interface languages:** Greek and English, from keyed catalogs. To add a language, add a catalog.

## Run it
```bash
npm install
npm run dev:fixtures   # http://localhost:4180 with real captured responses (labelled as test data)
npm run dev            # live sources (needs internet access)
npm run check          # typecheck + unit tests + build + end-to-end checks
```

## Deploy (Vercel)
Import the repo; `vercel.json` sets the build. Optional environment variables:

| Variable | Effect |
|---|---|
| `TFL_APP_KEY` | Enables TfL line status for London (register at api-portal.tfl.gov.uk). |
| `OPEN_METEO_API_KEY` | Uses Open-Meteo's paid geocoding endpoint (needed for commercial use). |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_*`) | Durable store: first-seen times, backoff, stale snapshots across instances. |
| `DAYWIRE_DISABLED_SOURCES` | Comma-separated source ids to switch off without a code change. |

`DAYWIRE_FIXTURES=1` works only locally and is refused on Vercel.

## Layout
```
src/domain/     model (zod), localities, Greek text, time zones, extraction, status, dedupe, view logic
src/sources/    registry (coverage, categories, config), HTTP, RSS/HTML helpers, one adapter per source
src/server/     ingestion (isolation, shared fetch cache), coverage, geocoder, store
src/app/        browser UI; i18n/ holds the message catalogs and zone-aware formatting
functions/      Vercel functions: /api/feed, /api/places, /api/sources
tests/          unit tests + real captured fixtures
e2e/            Playwright journeys
docs/           sources, data model and rules, ADR-001 (architecture), ADR-002 (global model)
```

## Known limits
- **Freshness depends on traffic.** Sources are read when a location is opened, at most once per 5-minute CDN window per location. There is no scheduled job.
- **Point queries.** Point-based sources (NWS, EA) are queried at the city's centre point.
- **ΕΜΥ regions.** Weather warnings cover only Greek regions that map one-to-one to MeteoAlarm regions.
- **Not covered:** ΔΕΔΔΗΕ (power) is link only. There is no admin UI and no map.
- **Emergency alerts.** DAYWIRE does not replace official emergency alerts.
