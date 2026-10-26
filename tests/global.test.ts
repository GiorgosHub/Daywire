// Global architecture: locations, coverage, source isolation, other countries' adapters, time zones, localization.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolveLocation } from "../functions/feed.ts";
import { el } from "../src/app/i18n/el.ts";
import { en } from "../src/app/i18n/en.ts";
import { FEATURED } from "../src/domain/localities.ts";
import { statusOf } from "../src/domain/status.ts";
import { zonedToUtc } from "../src/domain/time.ts";
import type { GeoLocation } from "../src/domain/types.ts";
import { coverageFor } from "../src/server/coverage.ts";
import { fixtureGeocoder } from "../src/server/geocoder.ts";
import { buildFeed, clearSharedCache } from "../src/server/ingest.ts";
import { memoryStore } from "../src/server/store.ts";
import { covers, sourcesFor, SOURCES } from "../src/sources/registry.ts";

const read = (f: string) => readFile(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const geo = fixtureGeocoder(() => read("geocoder-search.json"));
const [LARISSA, LONDON] = FEATURED as [GeoLocation, GeoLocation];

async function place(q: string, cc: string): Promise<GeoLocation> {
  const r = (await geo.search(q, "en")).find((x) => x.countryCode === cc);
  assert.ok(r, `${q} in ${cc}`);
  return r!;
}
const mk = (p: Partial<GeoLocation> & Pick<GeoLocation, "geonameId" | "countryCode" | "lat" | "lon" | "tz">): GeoLocation => ({ id: `gn:${p.geonameId}`, name: { en: "Test" }, country: { en: p.countryCode }, ...p });

test("geocoder: populated places only, GeoNames ids, time zones, no results handled", async () => {
  const lar = await geo.search("Larissa", "en");
  assert.equal(lar[0]!.id, "gn:258576");
  assert.equal(lar[0]!.tz, "Europe/Athens");
  assert.equal(lar[0]!.admin1Id, 6697809);
  assert.ok(!lar.some((x) => x.featureCode === "AIRP"), "airports are not places to follow");
  assert.equal((await place("Tokyo", "JP")).tz, "Asia/Tokyo");
  assert.deepEqual(await geo.search("zzqqxx", "en"), []);
  assert.equal((await geo.get(2643743))?.name.el, "Λονδίνο"); // featured: no network needed
  assert.equal(await geo.get(999999999), undefined);
});

test("coverage is computed from the registry, per location, with honest levels", async () => {
  const env = {};
  assert.equal(coverageFor(LARISSA, env).level, "good");
  assert.equal(coverageFor(LARISSA, env).connected, 5);
  const ldn = coverageFor(LONDON, env);
  assert.equal(ldn.level, "limited"); // floods only until a TfL key is configured
  assert.equal(ldn.categories.find((c) => c.category === "transport")!.state, "needs-config");
  assert.equal(coverageFor(LONDON, { TFL_APP_KEY: "k" }).level, "partial");
  assert.equal(coverageFor(await place("Springfield", "US"), env).level, "limited");
  const tokyo = coverageFor(await place("Tokyo", "JP"), env);
  assert.equal(tokyo.level, "none");
  assert.ok(tokyo.categories.every((c) => c.state === "none"));
  // a Greek city outside the regions mapped to MeteoAlarm: no weather, power and 112 as links only
  const kozani = mk({ geonameId: 735563, countryCode: "GR", admin1Id: 6697811, lat: 40.3, lon: 21.79, tz: "Europe/Athens" });
  const kc = coverageFor(kozani, env);
  assert.equal(kc.level, "none");
  assert.equal(kc.categories.find((c) => c.category === "power")!.state, "link-only");
  const athens = mk({ geonameId: 264371, countryCode: "GR", admin1Id: 6692632, lat: 37.98, lon: 23.72, tz: "Europe/Athens" });
  assert.equal(coverageFor(athens, env).level, "limited");
  // operators can switch a source off
  assert.equal(coverageFor(LARISSA, { DAYWIRE_DISABLED_SOURCES: "deyal-water" }).categories.find((c) => c.category === "water")!.state, "none");
});

test("registry: coverage predicates match geography, not names", async () => {
  const ontario = (await geo.search("London", "en")).find((x) => x.countryCode === "CA")!;
  assert.ok(!sourcesFor(ontario).some((s) => s.id === "tfl-status" || s.id === "ea-floods"));
  assert.ok(sourcesFor(LONDON).some((s) => s.id === "tfl-status"));
  const tfl = SOURCES.find((s) => s.id === "tfl-status")!;
  assert.equal(covers(tfl.coverage, { ...LONDON, lat: 51.75, lon: -1.25 }), false); // Oxford, 80 km away
  for (const s of SOURCES) assert.ok(s.where.en && s.categories.length && s.note.en, `${s.id} is documented`);
});

test("one failing or hanging source never affects the others", async () => {
  clearSharedCache();
  const f = await buildFeed({
    location: LARISSA, now: Date.parse("2026-10-26T13:00:00Z"), store: memoryStore(), sourceTimeoutMs: 300,
    get: async (url) => {
      if (url.includes("deyal.gr")) return new Promise<string>(() => {}); // never answers
      if (url.includes("larissa.gov.gr")) throw new Error("ECONNRESET");
      return read("meteoalarm-greece.json");
    },
  });
  const st = Object.fromEntries(f.sources.map((s) => [s.id, s.state]));
  assert.equal(st["deyal-water"], "error");
  assert.equal(st["larissa-wp"], "error");
  assert.equal(st["meteoalarm-gr"], "ok");
  assert.match(f.sources.find((s) => s.id === "deyal-water")!.error!, /no answer within/);
  assert.equal(f.notices.filter((n) => n.category === "weather").length, 4);
});

test("US: NWS point alerts, CAP severity as issued, times in the location's zone", async () => {
  clearSharedCache();
  // the point the fixture was captured for (Dallam/Hartley counties, Texas)
  const dalhart = mk({ geonameId: 1, countryCode: "US", lat: 35.97, lon: -102.445, tz: "America/Chicago" });
  let asked = "";
  const f = await buildFeed({ location: dalhart, now: Date.parse("2026-10-26T13:25:00Z"), store: memoryStore(), get: async (url) => { asked = url; return read("nws-alerts-point.json"); } });
  assert.equal(asked, "https://api.weather.gov/alerts/active?point=35.9700,-102.4450");
  const n = f.notices[0]!;
  assert.equal(n.headline.en, "Flood Warning");
  assert.equal(n.language, "en");
  assert.deepEqual([n.severity?.scheme, n.severity?.code, n.severity?.rank], ["cap", "Severe", 3]);
  assert.equal(n.start?.at, "2026-10-26T11:54:00.000Z"); // 06:54 CDT
  assert.equal(n.end?.at, "2026-10-26T15:00:00.000Z"); // 10:00 CDT
  assert.equal(n.tz, "America/Chicago");
  assert.equal(statusOf(n, Date.parse("2026-10-26T13:25:00Z")).state, "active");
  assert.equal(statusOf(n, Date.parse("2026-10-26T15:30:00Z")).state, "expired");
  assert.ok(n.action?.startsWith("Turn around, don't drown"));
  assert.equal(n.sourceUrl, "https://api.weather.gov/alerts/urn:oid:2.49.0.1.840.0.a2faf30f966a8c4db472aef0eca5bee9ecf78869.001.1");
});

test("England: EA flood alerts; zone-less times read as UK time and flagged", async () => {
  clearSharedCache();
  const f = await buildFeed({ location: LONDON, now: Date.parse("2026-10-26T13:30:00Z"), store: memoryStore(), fixture: { read } });
  const west = f.notices.find((n) => n.id === "ea-flood:063WAT23West")!;
  assert.equal(west.start?.from, "source-field-no-tz");
  assert.equal(west.start?.at, "2026-10-26T08:27:00.000Z"); // GMT after the clocks went back on 25 Oct
  assert.equal(west.sourceUrl, "https://check-for-flooding.service.gov.uk/target-area/063WAT23West");
  assert.deepEqual([west.severity?.label.en, west.severity?.rank], ["Flood alert", 2]);
  assert.equal(statusOf(west, Date.parse("2026-10-26T13:30:00Z")).state, "active");
  const central = f.notices.find((n) => n.id === "ea-flood:063WAT23Central")!;
  assert.equal(statusOf(central, Date.parse("2026-10-26T13:30:00Z")).state, "expired"); // "no longer in force"
  assert.equal(f.sources.find((s) => s.id === "tfl-status")!.state, "needs-config");
  assert.equal(f.coverage.level, "limited");
  // during British Summer Time the same rule gives UTC+1
  assert.equal(new Date(zonedToUtc(2026, 7, 1, 8, 0, "Europe/London")).toISOString(), "2026-07-01T07:00:00.000Z");
});

test("London transport: TfL needs its key; disruptions only; no invented end; stale when unverified", async () => {
  clearSharedCache();
  const now = Date.parse("2026-10-26T13:35:00Z");
  const f = await buildFeed({ location: LONDON, now, env: { TFL_APP_KEY: "test" }, store: memoryStore(), fixture: { read } });
  assert.equal(f.coverage.level, "partial");
  const lines = f.notices.filter((n) => n.category === "transport");
  assert.deepEqual(lines.map((n) => n.id).sort(), ["tfl:central", "tfl:suffragette", "tfl:windrush"]);
  const s = lines.find((n) => n.id === "tfl:suffragette")!;
  assert.equal(s.headline.en, "Suffragette: Part Suspended, Minor Delays");
  assert.equal(s.severity?.rank, 3);
  assert.equal(s.end, undefined);
  assert.equal(statusOf(s, now).state, "active");
  assert.equal(statusOf(s, now, new Set(["tfl-status"])).state, "stale");
  assert.equal(statusOf(s, now + 7 * 3600_000).state, "stale"); // not re-verified for 7 hours
});

test("fixture mode never applies a captured response to another place", async () => {
  clearSharedCache();
  const springfield = await place("Springfield", "US");
  const f = await buildFeed({ location: springfield, now: Date.now(), store: memoryStore(), fixture: { read } });
  const nws = f.sources.find((s) => s.id === "nws-alerts")!;
  assert.equal(nws.state, "error");
  assert.equal(f.notices.length, 0);
});

test("feed endpoint resolves locations by GeoNames id only", async () => {
  assert.equal((await resolveLocation({ loc: "gn:258576" }))?.name.en, "Larissa");
  assert.equal((await resolveLocation({ city: "larisa" }))?.id, "gn:258576"); // first-release links keep working
  assert.equal(await resolveLocation({ loc: "Larissa" }), null);
  assert.equal(await resolveLocation({ loc: "gn:1; DROP" }), null);
});

test("localization: every language has every message, with the same parameters", () => {
  const walk = (a: Record<string, unknown>, b: Record<string, unknown>, path: string) => {
    for (const k of Object.keys(a)) {
      const va = a[k], vb = b[k];
      assert.ok(vb !== undefined, `el is missing ${path}${k}`);
      assert.equal(typeof vb, typeof va, `${path}${k} has a different type`);
      if (typeof va === "function") assert.equal((vb as (...x: unknown[]) => unknown).length, (va as (...x: unknown[]) => unknown).length, `${path}${k} takes different parameters`);
      else if (Array.isArray(va)) assert.equal((vb as unknown[]).length, va.length, `${path}${k} has a different number of items`);
      else if (va && typeof va === "object") walk(va as Record<string, unknown>, vb as Record<string, unknown>, `${path}${k}.`);
    }
    for (const k of Object.keys(b)) assert.ok(k in a, `el has an extra key ${path}${k}`);
  };
  walk(en as unknown as Record<string, unknown>, el as unknown as Record<string, unknown>, "");
  assert.equal(el.heroTitle, "Η μέρα σου, με μια ματιά.");
  assert.equal(en.calm(1, "15:00"), "No active or upcoming notices in the 1 connected source. Last checked 15:00.");
});
