// Polite HTTP for source adapters: a timeout, one retry on network errors and 5xx, an honest User-Agent.
export const USER_AGENT = "DAYWIRE/0.1 (local information aggregator; +https://github.com/GiorgosHub/daywire)";

export class SourceError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

export interface FetchOpts { timeoutMs?: number; retries?: number; accept?: string }

export async function fetchText(url: string, opts: FetchOpts = {}): Promise<string> {
  const { timeoutMs = 8000, retries = 1, accept = "*/*" } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept }, signal: ctl.signal, redirect: "follow" });
      if (res.status >= 500) throw new SourceError(`HTTP ${res.status}`, res.status);
      if (!res.ok) throw Object.assign(new SourceError(`HTTP ${res.status}`, res.status), { final: true });
      return await res.text();
    } catch (e) {
      lastErr = e;
      if ((e as { final?: boolean }).final) break;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastErr instanceof SourceError) throw lastErr;
  const msg = (lastErr as Error)?.name === "AbortError" ? `timeout after ${opts.timeoutMs ?? 8000} ms` : String((lastErr as Error)?.message ?? lastErr);
  throw new SourceError(msg);
}
