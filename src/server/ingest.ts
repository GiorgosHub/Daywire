// Ingestion: run every connected source for a city, validate, deduplicate, and report each source's health.
// A failing source never takes the feed down: its last good snapshot is served with its own (older) verification
// time and the source is marked stale, or, with no snapshot, marked as unavailable with no notices.
import { cityById } from "../domain/cities.ts";
import { dedupe } from "../domain/dedupe.ts";
import { Feed, Notice, type SourceHealth } from "../domain/types.ts";
import { fetchText } from "../sources/http.ts";
import { sourcesFor } from "../sources/registry.ts";
import type { SourceDef } from "../sources/types.ts";
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
  cityId: string;
  now: number;
  store: Store;
  /** Fixture mode reads captured files instead of the network. Local development and tests only. */
  fixture?: { read: (file: string) => Promise<string> };
  get?: (url: string) => Promise<string>;
  log?: (msg: string) => void;
}

const BACKOFF_AFTER = 3;
const BACKOFF_MS = 10 * 60_000;

async function runSource(src: SourceDef, o: IngestOpts): Promise<{ health: SourceHealth; notices: Notice[] }> {
  const base = { id: src.id, name: src.name, publisher: src.publisher, method: src.method, homepage: src.homepage, note: src.note, ...(src.endpoint ? { endpoint: src.endpoint } : {}), ...(src.contacts ? { contacts: src.contacts } : {}) };
  if (!src.adapter || src.method === "link-only") return { health: { ...base, state: "link-only" }, notices: [] };
  const key = `daywire:v1:source:${o.cityId}:${src.id}`;
  const prev = (await o.store.get<SourceState>(key)) ?? { failures: 0 };
  const checkedAt = new Date(o.now).toISOString();

  if (!o.fixture && prev.failures >= BACKOFF_AFTER && prev.lastFailureAt && o.now - Date.parse(prev.lastFailureAt) < BACKOFF_MS) {
    return {
      health: { ...base, state: "backoff", ...(prev.lastSuccessAt ? { lastSuccessAt: prev.lastSuccessAt } : {}), error: prev.lastError ?? "repeated failures" },
      notices: prev.snapshot ?? [],
    };
  }

  const rejected: string[] = [];
  const get = o.fixture
    ? async () => { if (!src.fixture) throw new Error("no fixture"); return o.fixture!.read(src.fixture); }
    : (o.get ?? ((url: string) => fetchText(url, { timeoutMs: 8000, retries: 1 })));
  try {
    const { notices, fetched } = await src.adapter({ source: src, cityId: o.cityId, now: o.now, fixture: Boolean(o.fixture), get, reject: (w) => rejected.push(w) });
    const valid: Notice[] = [];
    for (const n of notices) {
      const p = Notice.safeParse(n);
      if (p.success) valid.push(p.data);
      else rejected.push(`${n.id}: ${p.error.issues[0]?.path.join(".")} ${p.error.issues[0]?.message}`);
    }
    const next: SourceState = { failures: 0, lastSuccessAt: checkedAt, fetched, kept: valid.length, rejected, snapshot: valid };
    await o.store.set(key, next, 30 * 86400);
    return { health: { ...base, state: "ok", checkedAt, lastSuccessAt: checkedAt, fetched, kept: valid.length, ...(rejected.length ? { error: `${rejected.length} item(s) failed validation` } : {}) }, notices: valid };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    o.log?.(`source ${src.id} failed: ${msg}`);
    const next: SourceState = { ...prev, failures: prev.failures + 1, lastFailureAt: checkedAt, lastError: msg };
    await o.store.set(key, next, 30 * 86400);
    const snap = prev.snapshot ?? [];
    return {
      health: { ...base, state: snap.length ? "stale" : "error", checkedAt, ...(prev.lastSuccessAt ? { lastSuccessAt: prev.lastSuccessAt } : {}), error: msg },
      notices: snap,
    };
  }
}

export async function buildFeed(o: IngestOpts): Promise<Feed> {
  const city = cityById(o.cityId);
  if (!city) throw new Error(`unknown city ${o.cityId}`);
  const results = await Promise.all(sourcesFor(city.id).map((s) => runSource(s, o)));
  let notices = dedupe(results.flatMap((r) => r.notices), city.tz);

  if (o.store.durable) {
    const key = `daywire:v1:firstseen:${city.id}`;
    const seen = (await o.store.get<Record<string, string>>(key)) ?? {};
    let changed = false;
    for (const n of notices) if (!seen[n.id]) { seen[n.id] = new Date(o.now).toISOString(); changed = true; }
    if (changed) await o.store.set(key, seen, 120 * 86400);
    notices = notices.map((n) => ({ ...n, firstSeenAt: seen[n.id]! }));
  }

  return Feed.parse({
    version: 1,
    cityId: city.id,
    generatedAt: new Date(o.now).toISOString(),
    mode: o.fixture ? "fixture" : "live",
    durableStore: o.store.durable,
    sources: results.map((r) => r.health),
    notices,
  });
}
