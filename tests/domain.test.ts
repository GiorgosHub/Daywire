import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fixtureModeAllowed } from "../functions/feed.ts";
import { findDates, findTimeRange, inferYear } from "../src/domain/extract.ts";
import { fold } from "../src/domain/greek.ts";
import { statusOf } from "../src/domain/status.ts";
import { offsetMinutes, zonedToUtc } from "../src/domain/time.ts";
import { Feed, type Notice } from "../src/domain/types.ts";
import { matches, rows, sections, type Prefs } from "../src/domain/view.ts";
import { buildFeed } from "../src/server/ingest.ts";
import { memoryStore } from "../src/server/store.ts";

const TZ = "Europe/Athens";
const read = (f: string) => readFile(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const NOW = Date.parse("2026-10-26T13:00:00Z"); // 15:00 in Larissa, the day the fixtures were captured
const prefs = (p: Partial<Prefs> = {}): Prefs => ({ cityId: "larisa", placeIds: [], terms: [], categories: [], saved: [], ...p });
const feed = (now = NOW) => buildFeed({ cityId: "larisa", now, store: memoryStore(), fixture: { read } });
const byId = (f: Feed, id: string) => f.notices.find((n) => n.id === id)!;

test("Greek folding ignores accents, case and final sigma", () => {
  assert.equal(fold("Γιάννουλης"), fold("ΓΙΑΝΝΟΥΛΗΣ"));
  assert.equal(fold("Φαρσάλων"), "φαρσαλων");
  assert.equal(fold("Μαΐου"), "μαιου");
});

test("Athens time: winter and summer offsets, wall time → UTC", () => {
  assert.equal(offsetMinutes(Date.parse("2026-10-26T12:00:00Z"), TZ), 120);
  assert.equal(offsetMinutes(Date.parse("2026-07-01T12:00:00Z"), TZ), 180);
  assert.equal(new Date(zonedToUtc(2026, 10, 26, 9, 0, TZ)).toISOString(), "2026-10-26T07:00:00.000Z");
  assert.equal(new Date(zonedToUtc(2026, 7, 1, 9, 0, TZ)).toISOString(), "2026-07-01T06:00:00.000Z");
});

test("dates: street/holiday ordinals and signature lines are not event dates", () => {
  const pub = Date.parse("2026-09-23T11:43:15Z");
  const text = "θα πραγματοποιηθεί διακοπή στην Πέμπτη 24 Σεπτεμβρίου στην οδό:\n• 28ης Οκτωβρίου (από την οδό Γαλάτη)\nΛάρισα, 23 Σεπτεμβρίου 2026";
  const d = findDates(text, pub, TZ);
  assert.equal(d.length, 1);
  assert.deepEqual([d[0]!.y, d[0]!.m, d[0]!.d, d[0]!.weekdayOk], [2026, 9, 24, true]);
  assert.deepEqual(findTimeRange("από 08:30 έως 14:30"), { from: [8, 30], to: [14, 30] });
});

test("year inference: an announcement in late December about early January", () => {
  assert.equal(inferYear(1, 3, Date.parse("2026-12-29T10:00:00Z"), TZ), 2027);
  assert.equal(inferYear(10, 26, Date.parse("2026-10-23T10:00:00Z"), TZ), 2026);
});

test("ΔΕΥΑΛ RSS: hours in Athens time, places, streets, link to the original", async () => {
  const f = await feed();
  const falani = byId(f, "deyal-water:3727");
  assert.equal(falani.start?.at, "2026-10-26T07:00:00.000Z"); // 09:00 Athens
  assert.equal(falani.end?.at, "2026-10-26T09:00:00.000Z"); // 11:00 Athens
  assert.equal(falani.areas[0]?.placeId, "falani");
  assert.equal(falani.sourceUrl, "https://deyal.gr/el/gia-polites/vlaves-diakopes/item/3727-diakopi-nerou");
  const pyro = byId(f, "deyal-water:3716");
  assert.deepEqual(pyro.segments[0]!.streets, ["Χάλκης", "Μοσχοχωρίου", "Τερψιθέας", "Αμυγδαλέας"]);
  // "Τερψιθέας" is a street here, not the Terpsithea community
  assert.ok(!pyro.areas.some((a) => a.placeId === "terpsithea"));
  const two = byId(f, "deyal-water:3717");
  assert.equal(two.segments.length, 2);
  assert.deepEqual(two.areas.map((a) => a.placeId), ["larisa-city", "giannouli"]);
});

test("municipality: press releases kept only when they are about a service change", async () => {
  const f = await feed();
  const ids = f.notices.map((n) => n.id);
  assert.ok(!ids.includes("larissa-wp:184460"), "food donation press release dropped");
  assert.ok(!ids.includes("larissa-wp:184289"), "tourist signage press release dropped");
  const markets = byId(f, "larissa-wp:184419");
  assert.equal(markets.category, "services");
  assert.deepEqual(markets.start, { at: "2026-10-27", precision: "date", from: "text-year-inferred" });
  const src = f.sources.find((s) => s.id === "larissa-wp")!;
  assert.equal(src.fetched, 11);
});

test("road works: successive announcements become one thread; no end date is invented", async () => {
  const f = await feed();
  const lead = byId(f, "larissa-wp:184277");
  assert.equal(lead.related.length, 2);
  assert.ok(lead.segments[0]!.streets.includes("Φαρσάλων"));
  assert.equal(lead.end, undefined);
  assert.equal(statusOf(lead, NOW, TZ).state, "open_ended");
  assert.equal(statusOf(lead, NOW + 20 * 86400000, TZ).state, "stale");
  assert.ok(!f.notices.some((n) => n.id === "larissa-wp:184188" || n.id === "larissa-wp:184154"));
});

test("dedup: the same water interruption from ΔΕΥΑΛ and the municipality is one notice with both links", async () => {
  const f = await feed();
  const falani = byId(f, "deyal-water:3727");
  assert.deepEqual(falani.sources.map((s) => s.sourceId), ["deyal-water", "larissa-wp"]);
  assert.ok(!f.notices.some((n) => n.id === "larissa-wp:184373"));
});

test("MeteoAlarm: only warnings for Thessaly, severity exactly as the source states", async () => {
  const f = await feed();
  const w = f.notices.filter((n) => n.category === "weather");
  assert.equal(w.length, 4);
  const orange = w.filter((n) => n.severity?.level === "orange");
  assert.equal(orange.length, 2);
  for (const n of orange) assert.equal(statusOf(n, NOW, TZ).state, "active");
  const yellow = w.find((n) => n.id.endsWith("261024111900.001000001"))!;
  assert.equal(statusOf(yellow, NOW, TZ).state, "expired");
});

test("status: before, during and after a water interruption", async () => {
  const f = await feed();
  const n = byId(f, "deyal-water:3727");
  assert.equal(statusOf(n, Date.parse("2026-10-26T06:00:00Z"), TZ).state, "upcoming");
  assert.equal(statusOf(n, Date.parse("2026-10-26T08:00:00Z"), TZ).state, "active");
  assert.equal(statusOf(n, Date.parse("2026-10-26T10:00:00Z"), TZ).state, "ended");
  assert.equal(statusOf(n, Date.parse("2026-11-20T10:00:00Z"), TZ).state, "archived");
});

test("a failing source is reported as failing, not as an empty city", async () => {
  const f = await buildFeed({ cityId: "larisa", now: NOW, store: memoryStore(), get: async () => { throw new Error("ECONNRESET"); } });
  for (const s of f.sources.filter((x) => x.method !== "link-only")) assert.equal(s.state, "error");
  assert.equal(f.notices.length, 0);
  assert.equal(f.mode, "live");
});

test("after a failure, the last good snapshot is kept with its old verification time and marked unverified", async () => {
  const store = memoryStore();
  const good = await buildFeed({ cityId: "larisa", now: NOW, store, get: async (url) => {
    const map: Record<string, string> = { "feeds.meteoalarm.org": "meteoalarm-greece.json", "deyal.gr": "deyal-water.rss", "www.larissa.gov.gr": "larissa-wp.json" };
    return read(map[new URL(url).host]!);
  } });
  assert.ok(good.sources.every((s) => s.state === "ok" || s.state === "link-only"));
  const later = NOW + 3600_000;
  const bad = await buildFeed({ cityId: "larisa", now: later, store, get: async () => { throw new Error("timeout"); } });
  const deyal = bad.sources.find((s) => s.id === "deyal-water")!;
  assert.equal(deyal.state, "stale");
  const n = bad.notices.find((x) => x.id === "deyal-water:3724")!;
  assert.equal(n.lastVerifiedAt, new Date(NOW).toISOString());
  const failed = new Set(bad.sources.filter((s) => s.state !== "ok").map((s) => s.id));
  assert.equal(statusOf(n, later, TZ, failed).unverified, true);
});

test("relevance and priority follow the person's places; counts come from records", async () => {
  const f = await feed();
  const r = rows(f.notices, prefs({ terms: ["Χαροκοπου"] }), NOW, TZ, new Set());
  assert.equal(r.find((x) => x.n.id === "deyal-water:3718")!.rel, "mine"); // accent-free street match
  const s = sections(rows(f.notices, prefs(), NOW, TZ, new Set()), prefs(), NOW);
  assert.deepEqual(s.priority.map((x) => x.n.severity?.level), ["orange", "orange"]);
  assert.equal(s.counts.next7, 1); // the market day moved to Tuesday
  assert.equal(s.upcoming[0]!.n.id, "larissa-wp:184419");
});

test("search is accent-insensitive and needs every word", async () => {
  const f = await feed();
  const hit = (q: string) => f.notices.filter((n: Notice) => matches(n, q)).map((n) => n.id);
  assert.ok(hit("φαλανη").includes("deyal-water:3727"));
  assert.ok(hit("ΛΑΪΚΕΣ ΑΓΟΡΕΣ").includes("larissa-wp:184419"));
  assert.ok(hit("water Γιάννουλη").length >= 2);
  assert.deepEqual(hit("φαλανη αγορες"), []);
});

test("the feed validates against the schema; fixture mode can never run in production", async () => {
  const f = await feed();
  assert.equal(Feed.safeParse(f).success, true);
  assert.equal(f.mode, "fixture");
  assert.ok(f.notices.every((n) => n.fixture));
  assert.equal(fixtureModeAllowed({ DAYWIRE_FIXTURES: "1", VERCEL: "1", VERCEL_ENV: "production" }), false);
  assert.equal(fixtureModeAllowed({ DAYWIRE_FIXTURES: "1", VERCEL: "1", VERCEL_ENV: "preview" }), false);
  assert.equal(fixtureModeAllowed({ DAYWIRE_FIXTURES: "1" }), true);
  assert.equal(fixtureModeAllowed({}), false);
});
