// Live probe of a running DAYWIRE (local `npm run dev` with internet access, or a deployment): one city per country
// with a connected source. For each, it finds the city through /api/places, asks /api/feed, and prints every
// source's state, how many records it read and kept, and the country's status. Nothing here is mocked.
// Run: node scripts/probe-live.mjs https://<your-deployment>   (default http://localhost:4180)
const BASE = (process.argv[2] ?? "http://localhost:4180").replace(/\/$/, "");
const CITIES = [
  ["Larissa", "GR"], ["London", "GB"], ["New York", "US"], ["Toronto", "CA"], ["Berlin", "DE"], ["Oslo", "NO"], ["Stockholm", "SE"],
  ["Helsinki", "FI"], ["Vienna", "AT"], ["Lisbon", "PT"], ["Rome", "IT"], ["Bologna", "IT"], ["Tokyo", "JP"],
];
let failures = 0;
for (const [q, cc] of CITIES) {
  try {
    const places = await (await fetch(`${BASE}/api/places?q=${encodeURIComponent(q)}&lang=en`)).json();
    const hit = places.results?.find((r) => r.location.countryCode === cc);
    if (!hit) { console.log(`${q} (${cc}): not found by the geocoder`); failures++; continue; }
    const feed = await (await fetch(`${BASE}/api/feed?loc=${hit.location.id}`)).json();
    if (feed.mode !== "live") console.log("  warning: this server is in fixture mode; the probe proves nothing about live sources");
    console.log(`${q} (${cc}) ${hit.location.id}: country ${feed.country ?? "?"}, coverage ${feed.coverage?.level}, ${feed.notices?.length ?? 0} notices`);
    for (const s of feed.sources ?? []) {
      if (s.state === "link-only") continue;
      console.log(`  ${s.state.padEnd(12)} ${s.id.padEnd(20)} read ${s.fetched ?? "-"}, kept ${s.kept ?? "-"}${s.error ? `  (${s.error})` : ""}`);
      if (s.state === "error") failures++;
    }
  } catch (e) { console.log(`${q} (${cc}): ${e.message}`); failures++; }
}
console.log(failures ? `\n${failures} problem(s)` : "\nall sources answered");
process.exit(failures ? 1 : 0);
