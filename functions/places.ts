// GET /api/places?q=<text>&lang=<el|en> → matching populated places worldwide, each with DAYWIRE's coverage level.
// Proxied so the browser talks only to DAYWIRE (strict CSP, one cache) and so coverage comes from our registry.
import { FEATURED } from "../src/domain/localities.ts";
import { fold } from "../src/domain/greek.ts";
import type { GeoLocation } from "../src/domain/types.ts";
import { coverageFor } from "../src/server/coverage.ts";
import { geocoder, type Req, type Res } from "./feed.ts";

const cache = new Map<string, { at: number; body: unknown }>();

function withCoverage(locs: GeoLocation[]) {
  return locs.map((location) => {
    const c = coverageFor(location, process.env);
    return { location, coverage: { level: c.level, connected: c.connected, categories: c.categories.filter((x) => x.state === "connected").map((x) => x.category) } };
  });
}

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method && req.method !== "GET") { res.status(405).json({ error: "method not allowed" }); return; }
  const qv = req.query?.q;
  const q = ((Array.isArray(qv) ? qv[0] : qv) ?? "").trim().slice(0, 80);
  const lv = req.query?.lang;
  const langRaw = Array.isArray(lv) ? lv[0] : lv;
  const lang = /^[a-z]{2}$/.test(langRaw ?? "") ? langRaw! : "en";

  if (!q) { // no query: the locations with connected sources
    res.setHeader("cache-control", "public, s-maxage=3600");
    res.status(200).json({ query: "", results: withCoverage(FEATURED) });
    return;
  }
  if ([...q].length < 2) { res.status(400).json({ error: "type at least 2 characters" }); return; }

  const key = `${lang}:${fold(q)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 3_600_000) { res.setHeader("cache-control", "public, s-maxage=86400"); res.status(200).json(hit.body); return; }
  try {
    const found = await geocoder().search(q, lang);
    // big places first; places we cover rise within the same size class
    const rows = withCoverage(found).sort((a, b) => Math.log10((b.location.population ?? 1) + 1) - Math.log10((a.location.population ?? 1) + 1) || b.coverage.connected - a.coverage.connected).slice(0, 8);
    const body = { query: q, results: rows, attribution: "Location search: Open-Meteo, GeoNames (CC BY 4.0)" };
    cache.set(key, { at: Date.now(), body });
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
    res.setHeader("cache-control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).json(body);
  } catch (e) {
    console.error("place search failed:", e instanceof Error ? e.message : e);
    res.setHeader("cache-control", "no-store");
    res.status(503).json({ error: "location search unavailable" });
  }
}
