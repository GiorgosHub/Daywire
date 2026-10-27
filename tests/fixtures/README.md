# Test fixtures

Real responses captured from the official sources on 2026-10-26 and 2026-10-27, through a browser, for tests and the local
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
| `metno-alerts-point.json` | https://api.met.no/weatherapi/metalerts/2.0/current.json?lat=59.91&lon=10.75 | English text; a marine area off Stad (the point filter is MET Norway's; we test the polygon ourselves) |
| `dwd-warnings-point.json` | https://maps.dwd.de/geoserver/dwd/ows?…typeName=dwd:Warnungen_Gemeinden…CONTAINS(THE_GEOM,POINT(…)) | one WINDBÖEN warning, Uelvesbüll |
| `smhi-warnings.json` | https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json | 3 of the events |
| `fmi-cap-feed.xml` | https://alerts.fmi.fi/cap/feed/atom_en-GB.xml | full feed, 2 entries, polygons as published |
| `msc-alerts-toronto.json` | https://api.weather.gc.ca/collections/weather-alerts/items?f=json&bbox=… | one frost advisory; French fields removed, coordinates rounded to 4 decimals |
| `geosphere-coords-vienna.json` | https://warnungen.zamg.at/wsapp/api/getWarningsForCoords?lon=16.37&lat=48.21&lang=en | live, no warnings |
| `geosphere-coords-example.json` | GeoSphere's published OpenAPI example (https://openapi.hub.geosphere.at/warnapi/v1/) | **documentation example, not a live response**; used only to test the warning format |
| `ipma-warnings.json` | https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json | 10 of 200 records (all green that day) |
| `ipma-districts.json` | https://api.ipma.pt/open-data/distrits-islands.json | full; source of the area codes in the adapter |
| `dpc-bulletin-20230516.json` | https://raw.githubusercontent.com/pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica/master/files/topojson/20230516_1522_today.json | archived bulletin with red alerts; 3 of 170 zones kept with their arcs, `Comuni` cut to the matched names + "…" |
