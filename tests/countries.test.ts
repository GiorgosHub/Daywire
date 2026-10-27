// International sources, each run on a real response captured from the official service (tests/fixtures/README.md),
// and the country table that decides what "supported" means. These prove the parsing and the place matching; they
// do not prove the live services are up (see docs/sources.md for when each was checked live).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { GeoLocation, Notice } from "../src/domain/types.ts";
import { dpcAdapter } from "../src/sources/adapters/dpc.ts";
import { dwdAdapter } from "../src/sources/adapters/dwd.ts";
import { fmiAdapter } from "../src/sources/adapters/fmi.ts";
import { geosphereAdapter } from "../src/sources/adapters/geosphere.ts";
import { ipmaAdapter, ipmaArea } from "../src/sources/adapters/ipma.ts";
import { metnoAdapter } from "../src/sources/adapters/metno.ts";
import { mscAdapter } from "../src/sources/adapters/msc.ts";
import { smhiAdapter } from "../src/sources/adapters/smhi.ts";
import { parseCap } from "../src/sources/cap.ts";
import { COUNTRIES, countryStatus } from "../src/sources/countries.ts";
import { inPolygon, topoDecoder, type Topology } from "../src/sources/geo.ts";
import { SOURCES, sourcesFor } from "../src/sources/registry.ts";
import type { Adapter } from "../src/sources/types.ts";
import { Notice as NoticeSchema } from "../src/domain/types.ts";

const read = (f: string) => readFile(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const loc = (p: Partial<GeoLocation> & Pick<GeoLocation, "countryCode" | "lat" | "lon" | "tz">): GeoLocation =>
  ({ id: "gn:1", geonameId: 1, name: { en: "Test" }, country: { en: p.countryCode }, ...p });

async function run(adapter: Adapter, sourceId: string, fixture: string, l: GeoLocation, now: string, fixtureMode = false): Promise<{ notices: Notice[]; urls: string[]; rejected: string[] }> {
  const body = await read(fixture);
  const urls: string[] = [], rejected: string[] = [];
  const source = SOURCES.find((s) => s.id === sourceId)!;
  assert.ok(source, sourceId);
  const r = await adapter({ source, location: l, now: Date.parse(now), fixture: fixtureMode, env: {}, get: async (u) => { urls.push(u); return body; }, reject: (w) => rejected.push(w) });
  for (const n of r.notices) NoticeSchema.parse(n); // every notice passes the same schema as the server output
  return { notices: r.notices, urls, rejected };
}

test("geometry: rings, holes, TopoJSON arcs", () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  const hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
  assert.ok(inPolygon(1, 1, [sq]));
  assert.ok(!inPolygon(5, 5, [sq, hole]));
  assert.ok(!inPolygon(11, 1, [sq]));
  // delta-encoded, quantized arcs; a negative index walks an arc backwards
  const t: Topology = { type: "Topology", transform: { scale: [1, 1], translate: [0, 0] }, arcs: [[[0, 0], [10, 0], [0, 10]], [[10, 10], [-10, 0], [0, -10]]], objects: { o: { type: "GeometryCollection", geometries: [] } } };
  const g = topoDecoder(t)({ type: "Polygon", arcs: [[0, 1]] })!;
  assert.deepEqual(g.coordinates[0], [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
});

test("CAP reader: FMI's feed, polygons in lat,lon order turned into lon,lat", async () => {
  const alerts = parseCap(await read("fmi-cap-feed.xml"));
  assert.equal(alerts.length, 2);
  const land = alerts.find((a) => a.infos[0]!.event === "Wind warning for land areas")!;
  assert.equal(land.status, "Actual");
  assert.equal(land.infos[0]!.severity, "Moderate");
  const uusimaa = land.infos[0]!.areas.find((a) => a.areaDesc === "Uusimaa")!;
  assert.ok(uusimaa.polygons[0]!.length > 100);
  assert.ok(uusimaa.polygons[0]!.every(([lo, la]) => lo! > 19 && lo! < 32 && la! > 59 && la! < 71), "lon,lat within Finland");
});

test("Finland (FMI): a land warning reaches Helsinki, the sea warning does not", async () => {
  const r = await run(fmiAdapter, "fmi-warnings", "fmi-cap-feed.xml", loc({ countryCode: "FI", lat: 60.1699, lon: 24.9384, tz: "Europe/Helsinki" }), "2026-10-27T10:00:00Z");
  assert.equal(r.notices.length, 1);
  const n = r.notices[0]!;
  assert.equal(n.headline.en, "Wind warning for land areas");
  assert.equal(n.regionLabel?.en, "Uusimaa");
  assert.equal(n.severity?.rank, 2);
  assert.match(n.sourceUrl, /^https:\/\/alerts\.fmi\.fi\/cap\/2026\//);
  // far inland (Rovaniemi): none of these areas
  const north = await run(fmiAdapter, "fmi-warnings", "fmi-cap-feed.xml", loc({ countryCode: "FI", lat: 66.5, lon: 25.73, tz: "Europe/Helsinki" }), "2026-10-27T10:00:00Z");
  assert.equal(north.notices.length, 0);
  // after expiry: gone
  const later = await run(fmiAdapter, "fmi-warnings", "fmi-cap-feed.xml", loc({ countryCode: "FI", lat: 60.1699, lon: 24.9384, tz: "Europe/Helsinki" }), "2026-10-29T10:00:00Z");
  assert.equal(later.notices.length, 0);
});

test("Norway (MET Norway): kept only inside the warning polygon; level and type are MET's", async () => {
  const inside = await run(metnoAdapter, "metno-alerts", "metno-alerts-point.json", loc({ countryCode: "NO", lat: 62.26, lon: 5.22, tz: "Europe/Oslo" }), "2026-10-27T00:00:00Z");
  assert.ok(inside.notices.length >= 1);
  const n = inside.notices[0]!;
  assert.equal(n.severity?.code, "yellow");
  assert.equal(n.severity?.hazard?.en, "Wind");
  assert.equal(n.regionLabel?.en, "Stad - Svinoey");
  assert.match(n.sourceUrl, /^https:\/\/api\.met\.no\/weatherapi\/metalerts\/2\.0\/current\?cap=/);
  assert.ok(inside.urls.some((u) => u.endsWith("&lang=en")), "MET Norway's English version is asked for");
  const oslo = await run(metnoAdapter, "metno-alerts", "metno-alerts-point.json", loc({ countryCode: "NO", lat: 59.91, lon: 10.75, tz: "Europe/Oslo" }), "2026-10-27T00:00:00Z");
  assert.equal(oslo.notices.length, 0, "a marine area off Stad does not apply to Oslo");
});

test("Germany (DWD): municipality warning from the point filter, DWD's severity and German text", async () => {
  const r = await run(dwdAdapter, "dwd-warnings", "dwd-warnings-point.json", loc({ countryCode: "DE", lat: 54.41, lon: 8.94, tz: "Europe/Berlin" }), "2026-10-27T10:00:00Z");
  assert.equal(r.notices.length, 1);
  const n = r.notices[0]!;
  assert.equal(n.originalTitle, "Amtliche WARNUNG vor WINDBÖEN");
  assert.equal(n.language, "de");
  assert.equal(n.severity?.code, "Minor");
  assert.equal(n.start?.at, "2026-10-27T08:00:00.000Z");
  assert.match(r.urls[0]!, /CONTAINS\(THE_GEOM,POINT\(54\.4100%2008\.9400\)\)|CONTAINS\(THE_GEOM,POINT\(54\.4100%208\.9400\)\)/);
  assert.ok(n.action?.includes("lose Gegenstände sichern"));
});

test("Sweden (SMHI): polygon match, county match for coastal lines, messages without a level", async () => {
  // the high-flow warning covers "central parts of Värmland County": a point there gets it, Karlstad (outside) does not
  const central = await run(smhiAdapter, "smhi-warnings", "smhi-warnings.json", loc({ countryCode: "SE", lat: 59.805, lon: 13.273, tz: "Europe/Stockholm", admin1: { en: "Värmland" } }), "2026-10-26T12:00:00Z");
  assert.ok(central.notices.find((n) => n.severity?.code === "yellow"), "high-flow warning in central Värmland");
  const karlstad = await run(smhiAdapter, "smhi-warnings", "smhi-warnings.json", loc({ countryCode: "SE", lat: 59.3793, lon: 13.5036, tz: "Europe/Stockholm", admin1: { en: "Värmland" } }), "2026-10-26T12:00:00Z");
  assert.equal(karlstad.notices.length, 0, "the polygon, not the county name, decides");
  const gbg = await run(smhiAdapter, "smhi-warnings", "smhi-warnings.json", loc({ countryCode: "SE", lat: 57.7072, lon: 11.9668, tz: "Europe/Stockholm", admin1: { en: "Västra Götaland" } }), "2026-10-26T12:00:00Z");
  const sea = gbg.notices.find((n) => n.notes.includes("matched-by-county"));
  assert.ok(sea, "sea-level warning for the West Coast reaches Gothenburg through its county");
  const sthlm = await run(smhiAdapter, "smhi-warnings", "smhi-warnings.json", loc({ countryCode: "SE", lat: 59.3293, lon: 18.0686, tz: "Europe/Stockholm", admin1: { en: "Stockholm" } }), "2026-10-26T12:00:00Z");
  const msg = sthlm.notices.find((n) => n.category === "water");
  assert.ok(msg, "water shortage message for Stockholm County");
  assert.equal(msg!.severity, undefined, "a message has no warning level");
});

test("Austria (GeoSphere): level from the warning's own text, times from its timestamps", async () => {
  // the provider's published example (Schwechat); the live Vienna answer has no warnings
  const r = await run(geosphereAdapter, "geosphere-warnings", "geosphere-coords-example.json", loc({ countryCode: "AT", lat: 48.14, lon: 16.47, tz: "Europe/Vienna" }), "2023-03-27T09:00:00Z");
  assert.ok(r.notices.length >= 1);
  assert.equal(r.notices[0]!.severity?.code, "yellow");
  assert.equal(r.notices[0]!.headline.de, "Gelbe Windwarnung");
  assert.equal(r.notices[0]!.start?.at, "2023-03-27T06:00:00.000Z");
  const vienna = await run(geosphereAdapter, "geosphere-warnings", "geosphere-coords-vienna.json", loc({ countryCode: "AT", lat: 48.21, lon: 16.37, tz: "Europe/Vienna" }), "2026-10-26T12:00:00Z");
  assert.equal(vienna.notices.length, 0);
  assert.equal(vienna.rejected.length, 0);
});

test("Canada (MSC GeoMet): alert polygon contains Toronto; colour is ECCC's", async () => {
  const r = await run(mscAdapter, "msc-alerts", "msc-alerts-toronto.json", loc({ countryCode: "CA", lat: 43.6532, lon: -79.3832, tz: "America/Toronto" }), "2026-10-27T10:00:00Z");
  assert.equal(r.notices.length, 1);
  assert.equal(r.notices[0]!.headline.en, "Frost advisory");
  assert.equal(r.notices[0]!.severity?.code, "yellow");
  assert.equal(r.notices[0]!.regionLabel?.en, "City of Toronto");
  const ottawa = await run(mscAdapter, "msc-alerts", "msc-alerts-toronto.json", loc({ countryCode: "CA", lat: 45.4215, lon: -75.6972, tz: "America/Toronto" }), "2026-10-27T10:00:00Z");
  assert.equal(ottawa.notices.length, 0);
});

test("Portugal (IPMA): district by name, Azores by island group; green is not a warning", async () => {
  const lisbon = loc({ countryCode: "PT", lat: 38.7167, lon: -9.1333, tz: "Europe/Lisbon", admin1: { en: "Lisbon" } });
  assert.equal(ipmaArea(lisbon), "LSB");
  assert.equal(ipmaArea(loc({ countryCode: "PT", lat: 41.1496, lon: -8.611, tz: "Europe/Lisbon", admin1: { en: "Porto" } })), "PTO");
  assert.equal(ipmaArea(loc({ countryCode: "PT", lat: 37.7412, lon: -25.6756, tz: "Atlantic/Azores", admin1: { en: "Azores" } })), "AOR");
  assert.equal(ipmaArea(loc({ countryCode: "PT", lat: 38.5363, lon: -28.6315, tz: "Atlantic/Azores", admin1: { en: "Azores" } })), "ACE");
  assert.equal(ipmaArea(loc({ countryCode: "PT", lat: 32.6669, lon: -16.9241, tz: "Atlantic/Madeira", admin1: { en: "Madeira" } })), "MCS");
  assert.equal(ipmaArea(loc({ countryCode: "PT", lat: 32.8167, lon: -17.15, tz: "Atlantic/Madeira", admin1: { en: "Madeira" } })), undefined, "Madeira's north coast: not guessed");
  assert.equal(ipmaArea(loc({ countryCode: "PT", lat: 40.0, lon: -8.0, tz: "Europe/Lisbon", admin1: { en: "Somewhere" } })), undefined);
  const r = await run(ipmaAdapter, "ipma-warnings", "ipma-warnings.json", lisbon, "2026-10-27T10:00:00Z");
  assert.equal(r.notices.length, 0, "every record in the capture is green");
  // the same record with a yellow level becomes a notice, read in local time and marked as such
  const rows = JSON.parse(await read("ipma-warnings.json")) as Record<string, string>[];
  const yellow = JSON.stringify([{ ...rows.find((x) => x.idAreaAviso === "PTO")!, idAreaAviso: "LSB", awarenessLevelID: "yellow", text: "Vento forte." }]);
  const source = SOURCES.find((s) => s.id === "ipma-warnings")!;
  const y = await ipmaAdapter({ source, location: lisbon, now: Date.parse("2026-10-27T10:00:00Z"), fixture: true, env: {}, get: async () => yellow, reject: () => {} });
  assert.equal(y.notices.length, 1);
  assert.equal(y.notices[0]!.end?.from, "source-field-no-tz");
  assert.equal(y.notices[0]!.regionLabel?.en, "Lisboa");
  // the registry only claims cities it can match
  assert.ok(sourcesFor(lisbon).some((s) => s.id === "ipma-warnings"));
  assert.ok(!sourcesFor(loc({ countryCode: "PT", lat: 32.8167, lon: -17.15, tz: "Atlantic/Madeira" })).some((s) => s.id === "ipma-warnings"));
});

test("Italy (DPC bulletin): the alert zone containing the city, one notice per risk, DPC's words", async () => {
  const cesena = await run(dpcAdapter, "dpc-bulletin", "dpc-bulletin-20230516.json", loc({ countryCode: "IT", lat: 44.1391, lon: 12.2431, tz: "Europe/Rome" }), "2023-05-16T12:00:00Z", true);
  assert.equal(cesena.notices.length, 2, "hydraulic and hydrogeological: red; thunderstorms: none");
  assert.ok(cesena.notices.every((n) => n.severity?.code === "red"));
  assert.equal(cesena.notices[0]!.regionLabel?.it, "Bassa collina e pianura romagnola");
  assert.equal(cesena.notices[0]!.start?.at, "2023-05-15T22:00:00.000Z"); // 16 May 00:00 Rome
  assert.equal(cesena.notices[0]!.publishedAt, "2023-05-16T13:22:00.000Z"); // issued 15:22 Rome
  assert.match(cesena.notices[0]!.sourceUrl, /\/files\/topojson\/20230516_1522_today\.json$/);
  const rome = await run(dpcAdapter, "dpc-bulletin", "dpc-bulletin-20230516.json", loc({ countryCode: "IT", lat: 41.9028, lon: 12.4964, tz: "Europe/Rome" }), "2023-05-16T12:00:00Z", true);
  assert.equal(rome.notices.length, 0, "Rome is not in the captured zones");
});

test("live discovery for Italy picks today's bulletin, or yesterday's 'tomorrow' before 16:00", async () => {
  const source = SOURCES.find((s) => s.id === "dpc-bulletin")!;
  const topo = await read("dpc-bulletin-20230516.json");
  const asked: string[] = [];
  const listing = (names: string[]) => JSON.stringify({ tree: names.map((path) => ({ path })) });
  const runAt = async (now: string, names: string[]) => {
    asked.length = 0;
    await dpcAdapter({ source, location: loc({ countryCode: "IT", lat: 44.1391, lon: 12.2431, tz: "Europe/Rome" }), now: Date.parse(now), fixture: false, env: {}, reject: () => {},
      get: async (u) => { asked.push(u); return u.includes("api.github.com") ? listing(names) : topo; } });
    return asked.slice(1).map((u) => u.split("/").pop());
  };
  assert.deepEqual(await runAt("2026-10-27T09:00:00Z", ["20261026_1402_today.json", "20261026_1402_tomorrow.json"]), ["20261026_1402_tomorrow.json"]);
  assert.deepEqual(await runAt("2026-10-27T15:00:00Z", ["20261026_1402_tomorrow.json", "20261027_1410_today.json", "20261027_1410_tomorrow.json", "20261027_1655_today.json"]), ["20261027_1655_today.json", "20261027_1410_tomorrow.json"]);
  await assert.rejects(runAt("2026-10-27T09:00:00Z", ["20261020_1400_today.json"]), /no bulletin/);
});

test("country status is earned: supported needs a verified, connected source; search alone earns nothing", () => {
  for (const c of COUNTRIES.filter((x) => x.status === "supported" || x.status === "partial")) {
    const ok = c.sources.map((id) => SOURCES.find((s) => s.id === id)!).filter((s) => s.adapter && s.verified?.realRecord);
    assert.ok(ok.length, `${c.code} has a verified source`);
    assert.ok(c.covers.en.length > 10 && c.gaps.en.length > 5, `${c.code} explains its coverage`);
  }
  assert.equal(countryStatus("AT"), "provisional", "Austria answers live but no real warning has been read yet");
  assert.equal(countryStatus("JP"), "unsupported");
  assert.equal(countryStatus("BR"), "unsupported", "not in the table: not covered");
  const supported = COUNTRIES.filter((c) => c.status === "supported").map((c) => c.code).sort();
  assert.deepEqual(supported, ["CA", "DE", "FI", "IT", "NO", "SE", "US"]);
  assert.deepEqual(COUNTRIES.filter((c) => c.status === "partial").map((c) => c.code).sort(), ["GB", "GR", "PT"]);
});
