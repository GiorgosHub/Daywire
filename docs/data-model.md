# Data model and rules

The full schema is in `src/domain/types.ts` and is validated with zod on the server before anything is served.

## Location (`GeoLocation`)
A location is a GeoNames record:
- id `gn:<geonameId>`
- `name`, `country`, `admin1` (region) and `admin2` as `LText`: English is required, any other language is optional
- ISO 3166-1 `countryCode` and GeoNames `admin1Id`
- coordinates
- IANA `tz`

The hierarchy goes Country → Region (admin1) → District (admin2) → City. Neighbourhoods below the city come from optional locality profiles. Below that, people can add streets as free-text terms.

## Notice
- **`publishedAt` / `updatedAt`:** the source's own timestamps.
- **`start` / `end`:** when the event happens, as `TimePoint`s.
  - `precision` is `datetime` (an instant) or `date` (a local date in `tz`; no time of day is ever added).
  - `from` is one of:
    - `source-field`
    - `source-field-no-tz` (read in the publisher's zone and labelled as such)
    - `text`
    - `text-year-inferred`
- **`tz`:** the IANA zone the notice belongs to. Every date is shown in it.
- **`endKind`:** `event` (the disruption ends) or `validity` (a warning expires).
- **`currentWhileListed`:** the source lists only what is in force now (NWS, EA, TfL). The notice is in force while it is listed and verified.
- **`lastVerifiedAt`:** when DAYWIRE last read the notice from its source.
- **`firstSeenAt`:** set only when a durable store is configured.
- **`language`:** the language of the source text. `bodyAlt` holds other-language versions published by the source itself. Nothing is machine-translated.
- **`severity`:** the issuer's classification, in the issuer's words.
  - `scheme`: `meteoalarm`, `cap`, `ea-flood` or `tfl`
  - `code`
  - `label`
  - `rank`: 1–4, used only for ordering and priority:
    - MeteoAlarm: yellow 2, orange 3, red 4
    - CAP (NWS): Minor 1, Moderate 2, Severe 3, Extreme 4
    - EA: level 4 (no longer in force) 1, alert 2, warning 3, severe warning 4
    - TfL: severities 1–6 → 3, 7–9 → 2, others → 1
- **`scope`:** `region`, `city`, `area` or `unspecified`.
  - `areas` lists the areas as the source names them.
  - `segments` holds several interruptions within one announcement.
- **`notes`:** machine-readable flags:
  - `merged-duplicate`
  - `republication`
  - `start-from-related`
  - `weekday-mismatch`
  - `mentions-city`
  - `no-per-warning-page`
  - `no-tz-source-times`
  - `within-10km`
  - `live-status`
  - `official-alert-record`

## Status (`src/domain/status.ts`, computed at render time, in the notice's own zone)

| Condition | State |
|---|---|
| end has passed | `ended` (event) / `expired` (validity). More than 14 days ago: `archived` |
| start is in the future | `upcoming` |
| live-status notice with no end, verified | `active`. If not verified (source failed, or over 6 h old): `stale` |
| start has passed and end is in the future | `active` |
| start has passed, no end; or a disruption with no dates | `open_ended`. Becomes `stale` 14 days after the latest announcement |
| announcement with no dates | `info`. Becomes `archived` after 30 days |

**Overlay `unverified`:** the source failed at the last check, or `lastVerifiedAt` is older than 6 hours.

## Coverage (`src/server/coverage.ts`)
Each category's state comes from the sources whose coverage contains the location:
- `connected`: has an adapter and is configured
- `needs-config`: has an adapter but its key is missing
- `link-only`
- `none`

The level follows the number of connected categories:
- good: 3 or more
- partial: 2
- limited: 1
- none: 0

Coverage never depends on how many notices exist.

## Priority (`src/domain/view.ts`)
A notice is priority when it is one of these:
- A warning ranked 3 or more that is in force or starts within 24 hours.
- A civil-protection notice that is in force.
- A transport disruption ranked 3 that is in force.
- A water, power or road disruption that is in force or starts within 24 hours, in one of the person's places. If they have chosen no places, anywhere in the city counts.

## Relevance and counts
- **Relevance:** places are matched by exact alias from the locality profile, and typed terms (3 letters or more, accents ignored) against the streets and areas a notice names explicitly. Regional and citywide notices concern everyone.
- **Counts** come from the same rows the sections show:
  - in force now
  - upcoming within 7 days
  - ended or expired within the last 7 days
