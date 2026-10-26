// Local server: serves dist/ and /api/feed the way Vercel does.
// Run: npm run dev            (live sources; needs internet access)
//      npm run dev:fixtures   (real captured responses in tests/fixtures, clearly labelled as test data)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = join(process.cwd(), "dist");
const PORT = Number(process.env.PORT || 4180);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff": "font/woff", ".txt": "text/plain" };
const SEC = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  for (const [k, v] of Object.entries(SEC)) res.setHeader(k, v);
  if (url.pathname === "/api/feed") {
    const mod = await import("../functions/feed.ts");
    const r = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      setHeader: (k, v) => res.setHeader(k, v),
      json(b) { res.writeHead(this.statusCode, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(b)); },
    };
    if (process.env.FAIL_FEED === "1") { res.writeHead(500); return res.end("{}"); }
    try { await mod.default({ method: req.method, query: Object.fromEntries(url.searchParams) }, r); }
    catch (e) { console.error(e); res.writeHead(500); res.end("{}"); }
    return;
  }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (p.endsWith("/")) p += "index.html";
  const file = join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw 0;
    res.setHeader("content-type", TYPES[extname(file)] || "application/octet-stream");
    res.setHeader("cache-control", "no-cache");
    res.writeHead(200); res.end(await readFile(file));
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }); res.end("Not found");
  }
}).listen(PORT, () => console.log(`DAYWIRE on http://localhost:${PORT}${process.env.DAYWIRE_FIXTURES === "1" ? " (fixture data)" : ""}`));
