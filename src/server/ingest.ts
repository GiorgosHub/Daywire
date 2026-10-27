// Ingestion for one location: run every source that covers it, validate, deduplicate, report each source's health.
// Isolation: each source runs on its own with a hard time limit; a failure or a hang in one source (or one country's
// adapter) never affects the others. A failing source's last good snapshot is served with its own (older)
// verification time and the source is marked stale; with no snapshot it is marked as unavailable with no notices.
import { dedupe } from "../domain/dedupe.ts";
import { Feed, Notice, type GeoLocation, type SourceHealth } from "../domain/types.ts";
import { fetchText } from "../sources/http.ts";
import { disabledFrom, missingConfig, sourcesFor } from "../sources/registry.ts";
import type { SourceDef } from "../sources/types.ts";
import { coverageFor } from "./coverage.ts";
import { countryStatus } from "../sources/countries.ts";
import type { Store } from "./store.ts";

interface SourceState {
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastError?: string;
  failures: number;
  fetched?: number;
  kept?: number;
  rejected?: string[];
  snapshot?: Notice[];
}

export interface IngestOpts {
  location: GeoLocation;
  now: number;
  store: Store;
  env?: Record<string, string | undefined>;
  /** Fixture mode reads captured files instead of the network. Local development and tests only. */
  fixture?: { read: (file: string) => Promise<string> };
  get?: (url: string, headers?: Record<string, string>) => Promise<string>;
  log?: (msg: string) => void;
  /** Hard limit for one source, including retries (ms). */
  sourceTimeoutMs?: number;
}

const BACKOFF_AFTER = 3;
const BACKOFF_MS = 10 * 60_000;

/** Responses shared across locations and requests within one server instance (a country feed serves many cities). */
const shared = new Map<string, { at: number; body: Promise<string> }>();
export function clearSharedCache(): void { shared.clear(); }

function sharedGet(get: NonNullable<IngestOpts["get"]>, ttlS: number, now: number) {
  return (url: string, headers?: Record<string, string>) => {
    const hit = shared.get(url);
    if (hit && now - hit.at < ttlS * 1000) return hit.body;
    const body = get(url, headers);
    shared.set(url, { at: now, body });
    body.catch(() => shared.delete(url));
    if (shared.size > 500) shared.delete(shared.keys().next().value!);
    return body;
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([p, new Promise<T>((_, rej) => { t = setTimeout(() => rej(new Error(`${what}: no answer within ${ms / 1000} s`)), ms); })]).finally(() => clearTimeout(t));
}

const base = (src: SourceDef) => ({
  id: src.id, name: src.name, publisher: src.publisher, method: src.method, categories: src.categories, homepage: src.homepage, note: src.note,
  ...(src.endpoint ? { endpoint: src.endpoint } : {}), ...(src.attribution ? { attribution: src.attribution } : {}), ...(src.contacts ? { contacts: src.contacts } : {}),
});

async function runSource(src: SourceDef, o: IngestOpts): Promise<{ health: SourceHealth; notices: Notice[] }> {
  const env = o.env ?? {};
  if (!src.adapter || src.method === "link-only") return { health: { ...base(src), state: "link-only" }, notices: [] };
  const missing = missingConfig(src, env);
  if (missing.length) return { health: { ...base(src), state: "needs-config", error: `missing ${missing.join(", ")}` }, notices: [] };

  const key = `daywire:v2:source:${src.id}:${o.location.id}`;
  const prev = (await o.store.get<SourceState>(key)) ?? { failures: 0 };
  const checkedAt = new Date(o.now).toISOString();

  if (!o.fixture && prev.failures >= BACKOFF_AFTER && prev.lastFailureAt && o.now - Date.parse(prev.lastFailureAt) < BACKOFF_MS) {
    return {
      health: { ...base(src), state: "backoff", ...(prev.lastSuccessAt ? { lastSuccessAt: prev.lastSuccessAt } : {}), error: prev.lastError ?? "repeated failures" },
      notices: prev.snapshot ?? [],
    };
  }

  const rejected: string[] = [];
  const network = o.get ?? ((url: string, headers?: Record<string, string>) => fetchText(url, { timeoutMs: 8000, retries: 1, ...(headers?.accept ? { accept: headers.accept } : {}) }));
  const get = o.fixture
    ? async () => {
        if (!src.fixture || !(src.fixtureFor ?? []).includes(o.location.geonameId)) throw new Error("no captured test response for this location");
        return o.fixture!.read(src.fixture);
      }
    : sharedGet(network, src.ttl ?? 240, o.now);
  try {
    const run = src.adapter({ source: src, location: o.location, now: o.now, fixture: Boolean(o.fixture), env, get, reject: (w) => rejected.push(w) });
    const { notices, fetched } = await withTimeout(run, o.sourceTimeoutMs ?? 15_000, src.id);
    const valid: Notice[] = [];
    for (const n of notices) {
      const p = Notice.safeParse(n);
      if (p.success) valid.push(p.data);
      else rejected.push(`${n.id}: ${p.error.issues[0]?.path.join(".")} ${p.error.issues[0]?.message}`);
    }
    await o.store.set(key, { failures: 0, lastSuccessAt: checkedAt, fetched, kept: valid.length, rejected, snapshot: valid } satisfies SourceState, 30 * 86400);
    return { health: { ...base(src), state: "ok", checkedAt, lastSuccessAt: checkedAt, fetched, kept: valid.length, ...(rejected.length ? { error: `${rejected.length} item(s) failed validation` } : {}) }, notices: valid };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    o.log?.(`source ${src.id} @ ${o.location.id} failed: ${msg}`);
    await o.store.set(key, { ...prev, failures: prev.failures + 1, lastFailureAt: checkedAt, lastError: msg } satisfies SourceState, 30 * 86400);
    const snap = prev.snapshot ?? [];
    return {
      health: { ...base(src), state: snap.length ? "stale" : "error", checkedAt, ...(prev.lastSuccessAt ? { lastSuccessAt: prev.lastSuccessAt } : {}), error: msg },
      notices: snap,
    };
  }
}

export async function buildFeed(o: IngestOpts): Promise<Feed> {
  const env = o.env ?? {};
  const loc = o.location;
  const sources = sourcesFor(loc, disabledFrom(env));
  // allSettled: even an exception outside runSource's own handling cannot take down the other sources
  const settled = await Promise.allSettled(sources.map((s) => runSource(s, o)));
  const results = settled.map((r, i) => r.status === "fulfilled" ? r.value : { health: { ...base(sources[i]!), state: "error" as const, error: String(r.reason) }, notices: [] });
  let notices = dedupe(results.flatMap((r) => r.notices), loc.tz);

  if (o.store.durable) {
    const key = `daywire:v2:firstseen:${loc.id}`;
    const seen = (await o.store.get<Record<string, string>>(key)) ?? {};
    let changed = false;
    for (const n of notices) if (!seen[n.id]) { seen[n.id] = new Date(o.now).toISOString(); changed = true; }
    if (changed) await o.store.set(key, seen, 120 * 86400);
    notices = notices.map((n) => ({ ...n, firstSeenAt: seen[n.id]! }));
  }

  return Feed.parse({
    version: 2,
    location: loc,
    generatedAt: new Date(o.now).toISOString(),
    mode: o.fixture ? "fixture" : "live",
    durableStore: o.store.durable,
    coverage: coverageFor(loc, env),
    country: countryStatus(loc.countryCode),
    sources: results.map((r) => r.health),
    notices,
  });
}
