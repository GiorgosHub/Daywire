// The daylight band and the field's light come from a sunrise equation; check it against known cases.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sunAltitude, sunTimes } from "../src/domain/sun.ts";

const hm = (ms: number, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

test("Larissa, 21 June: sunrise about 06:10 and sunset about 21:00 local (EEST)", () => {
  const s = sunTimes("2026-06-21", 39.6385, 22.4161);
  assert.ok(s.rise && s.set && !s.polar);
  assert.ok(Math.abs(mins(hm(s.rise!, "Europe/Athens")) - mins("06:10")) <= 12, hm(s.rise!, "Europe/Athens"));
  assert.ok(Math.abs(mins(hm(s.set!, "Europe/Athens")) - mins("21:00")) <= 12, hm(s.set!, "Europe/Athens"));
});

test("Tromsø has polar day in June and polar night in December", () => {
  assert.equal(sunTimes("2026-06-21", 69.6492, 18.9553).polar, "day");
  assert.equal(sunTimes("2026-12-21", 69.6492, 18.9553).polar, "night");
});

test("the sun is up at local noon and down at local midnight in London in March", () => {
  assert.ok(sunAltitude(Date.parse("2026-03-20T12:10:00Z"), 51.5085, -0.1257) > 30);
  assert.ok(sunAltitude(Date.parse("2026-03-20T00:10:00Z"), 51.5085, -0.1257) < -20);
});
