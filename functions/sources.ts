// GET /api/sources → every source in the registry, where it applies and whether it is configured here.
// Powers the "Where DAYWIRE works" list. Never claims coverage beyond this registry.
import { SOURCES, missingConfig } from "../src/sources/registry.ts";
import type { Req, Res } from "./feed.ts";

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method && req.method !== "GET") { res.status(405).json({ error: "method not allowed" }); return; }
  res.setHeader("cache-control", "public, s-maxage=3600");
  res.status(200).json({
    sources: SOURCES.map((s) => ({
      id: s.id, name: s.name, publisher: s.publisher, method: s.method, categories: s.categories, where: s.where, homepage: s.homepage, note: s.note,
      ...(s.attribution ? { attribution: s.attribution } : {}),
      state: s.method === "link-only" || !s.adapter ? "link-only" : missingConfig(s, process.env).length ? "needs-config" : "connected",
    })),
  });
}
