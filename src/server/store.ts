// Persistence for source health, last good snapshots and first-seen times.
// Durable when Upstash Redis REST credentials are configured (Vercel Marketplace sets KV_REST_API_URL / _TOKEN);
// otherwise an in-memory store that lives as long as the server instance, and the UI is told it is not durable.

export interface Store {
  durable: boolean;
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
}

export function memoryStore(): Store {
  const m = new Map<string, { v: string; exp: number }>();
  return {
    durable: false,
    async get<T>(key: string) {
      const e = m.get(key);
      if (!e || (e.exp && Date.now() > e.exp)) return undefined;
      return JSON.parse(e.v) as T;
    },
    async set(key, value, ttl) { m.set(key, { v: JSON.stringify(value), exp: ttl ? Date.now() + ttl * 1000 : 0 }); },
  };
}

export function upstashStore(url: string, token: string): Store {
  const call = async (cmd: unknown[]) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    try {
      const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(cmd), signal: ctl.signal });
      if (!r.ok) throw new Error(`store HTTP ${r.status}`);
      return ((await r.json()) as { result?: unknown }).result;
    } finally { clearTimeout(t); }
  };
  return {
    durable: true,
    async get<T>(key: string) {
      const v = await call(["GET", key]);
      return typeof v === "string" ? (JSON.parse(v) as T) : undefined;
    },
    async set(key, value, ttl) { await call(ttl ? ["SET", key, JSON.stringify(value), "EX", ttl] : ["SET", key, JSON.stringify(value)]); },
  };
}

let cached: Store | undefined;
export function storeFromEnv(env: Record<string, string | undefined> = process.env): Store {
  if (cached) return cached;
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  cached = url && token ? upstashStore(url, token) : memoryStore();
  return cached;
}

/** A store that never fails the request: errors degrade to "nothing stored". */
export function safe(store: Store, onError: (e: unknown) => void): Store {
  return {
    durable: store.durable,
    async get(key) { try { return await store.get(key); } catch (e) { onError(e); return undefined; } },
    async set(key, v, ttl) { try { await store.set(key, v, ttl); } catch (e) { onError(e); } },
  };
}
