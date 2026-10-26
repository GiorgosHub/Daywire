# Test fixtures

Real responses captured from the official sources on 2026-10-26, through a browser, for tests and the local
`npm run dev:fixtures` mode. They are never served in production (fixture mode refuses to run on Vercel).

| File | Captured from | Notes |
|---|---|---|
| `deyal-water.rss` | https://deyal.gr/el/gia-polites/vlaves-diakopes?format=feed&type=rss | first 5 of 10 items |
| `larissa-wp.json` | https://www.larissa.gov.gr/wp-json/wp/v2/posts | 11 posts, markup attributes stripped, long texts shortened |
| `meteoalarm-greece.json` | https://feeds.meteoalarm.org/api/v1/warnings/feeds-greece | 5 of 61 warnings |
| `nws-alerts-point.json` | https://api.weather.gov/alerts/active?point=35.9700,-102.4450 | full response |
| `ea-floods-london.json` | https://environment.data.gov.uk/flood-monitoring/id/floods?lat=51.50853&long=-0.12574&dist=15 | full response |
| `tfl-line-status.json` | https://api.tfl.gov.uk/Line/Mode/tube,elizabeth-line,dlr,overground/Status | 4 of 19 lines, `$type` and unused fields removed |
| `geocoder-search.json` | https://geocoding-api.open-meteo.com/v1/search and /v1/get | Larissa, London (en, el), Springfield, Tokyo, a no-result query; postcodes trimmed. `get-1850147-en` and `get-4409896-en` reuse the search records (same fields as `/v1/get`) |
