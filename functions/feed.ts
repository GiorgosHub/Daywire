// GET /api/feed?loc=gn:<GeoNames id> → coverage, source health and the normalized notices for that location.
// Sources are read on demand; the CDN keeps a response for 5 minutes per location, so each source is fetched at
// most a few times per 5 minutes per region whatever the traffic. Every notice carries its own verification time.
// (?city=larisa from the first release still works.)
import { readFile } from "node:fs/promises";
import { DEFAULT_LOCATION } from "../src/domain/localities.ts";
import type { Feed, GeoLocation } from "../src/domain/types.ts";
import { fixtureGeocoder, liveGeocoder, type Geocoder } from "../src/server/geocoder.ts";
import { buildFeed } from "../src/server/ingest.ts";
import { safe, storeFromEnv } from "../src/server/store.ts";

export interface Req { method?: string; query?: Record<string, string | string[] | undefined> }
export interface Res { status(c: number): Res; setHeader(k: string, v: string): void; json(b: unknown): void }

const memo = new Map<string, { at: number; feed: Feed }>();
const MEMO_MS = 120_000;

export function fixtureModeAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.DAYWIRE_FIXTURES === "1" && env.VERCEL_ENV !== "production" && env.VERCEL !== "1";
}

export const readFixture = (f: string) => readFile(new URL(`../tests/fixtures/${f}`, import.meta.url), "utf8");

export function geocoder(): Geocoder {
  return fixtureModeAllowed() ? fixtureGeocoder(() => readFixture("geocoder-search.json")) : liveGeocoder(process.env);
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function resolveLocation(q: Req["query"]): Promise<GeoLocation | undefined | null> {
  const loc = one(q?.loc) ?? (one(q?.city) === "larisa" || !one(q?.city) ? DEFAULT_LOCATION.id : undefined);
  const m = loc ? /^gn:(\d{1,10})$/.exec(loc) : null;
  if (!m) return null;
  return geocoder().get(Number(m[1]));
}

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method && req.method !== "GET") { res.status(405).json({ error: "method not allowed" }); return; }
  let location: GeoLocation | undefined | null;
  try { location = await resolveLocation(req.query); }
  catch (e) {
    console.error("location lookup failed:", e instanceof Error ? e.message : e);
    res.setHeader("cache-control", "no-store");
    res.status(503).json({ error: "location lookup unavailable" });
    return;
  }
  if (location === null) { res.status(400).json({ error: "expected loc=gn:<GeoNames id>" }); return; }
  if (!location) { res.status(404).json({ error: "unknown location" }); return; }

  const now = Date.now();
  const hit = memo.get(location.id);
  let feed = hit && now - hit.at < MEMO_MS ? hit.feed : undefined;
  if (!feed) {
    try {
      feed = await buildFeed({
        location,
        now,
        env: process.env,
        store: safe(storeFromEnv(), (e) => console.error("store:", e instanceof Error ? e.message : e)),
        ...(fixtureModeAllowed() ? { fixture: { read: readFixture } } : {}),
        log: (m) => console.warn(m),
      });
      memo.set(location.id, { at: now, feed });
      if (memo.size > 300) memo.delete(memo.keys().next().value!);
    } catch (e) {
      console.error("feed failed:", e instanceof Error ? e.message : e);
      res.setHeader("cache-control", "no-store");
      res.status(500).json({ error: "feed unavailable" });
      return;
    }
  }
  const degraded = feed.sources.some((s) => s.state === "error" || s.state === "stale" || s.state === "backoff");
  res.setHeader("cache-control", degraded ? "public, s-maxage=60, stale-while-revalidate=120" : "public, s-maxage=300, stale-while-revalidate=600");
  res.status(200).json(feed);
}
