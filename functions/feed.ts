// GET /api/feed?city=larisa → the normalized, deduplicated notices and each source's health.
// Sources are read on demand. The CDN keeps a response for 5 minutes, so each source is fetched at most a few times
// per 5 minutes per region, whatever the traffic. Every notice carries its own verification time.
import { cityById } from "../src/domain/cities.ts";
import { buildFeed } from "../src/server/ingest.ts";
import { safe, storeFromEnv } from "../src/server/store.ts";
import type { Feed } from "../src/domain/types.ts";

interface Req { method?: string; query?: Record<string, string | string[] | undefined> }
interface Res { status(c: number): Res; setHeader(k: string, v: string): void; json(b: unknown): void }

const memo = new Map<string, { at: number; feed: Feed }>();
const MEMO_MS = 120_000;

export function fixtureModeAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.DAYWIRE_FIXTURES === "1" && env.VERCEL_ENV !== "production" && env.VERCEL !== "1";
}

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method && req.method !== "GET") { res.status(405).json({ error: "method not allowed" }); return; }
  const q = req.query?.city;
  const cityId = (Array.isArray(q) ? q[0] : q) ?? "larisa";
  if (!/^[a-z-]{2,32}$/.test(cityId) || !cityById(cityId)) { res.status(404).json({ error: "unknown city" }); return; }

  const now = Date.now();
  const hit = memo.get(cityId);
  let feed = hit && now - hit.at < MEMO_MS ? hit.feed : undefined;
  if (!feed) {
    const fixture = fixtureModeAllowed()
      ? { read: async (f: string) => (await import("node:fs/promises")).readFile(new URL(`../tests/fixtures/${f}`, import.meta.url), "utf8") }
      : undefined;
    try {
      feed = await buildFeed({
        cityId,
        now,
        store: safe(storeFromEnv(), (e) => console.error("store:", e instanceof Error ? e.message : e)),
        ...(fixture ? { fixture } : {}),
        log: (m) => console.warn(m),
      });
      memo.set(cityId, { at: now, feed });
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
