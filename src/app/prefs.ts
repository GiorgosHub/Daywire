// Preferences live only in this browser (localStorage). No account, nothing sent to the server.
import type { Category, Feed } from "../domain/types.ts";
import type { Prefs } from "../domain/view.ts";
import type { Lang } from "./i18n.ts";

export interface Stored extends Prefs { lang: Lang; lastVisit?: string; introDismissed?: boolean }

const KEY = "daywire:prefs:v1";
const FEED_KEY = "daywire:lastfeed:v1";
const CATS: Category[] = ["weather", "water", "power", "roads", "transport", "services", "emergency", "announcement"];

export const defaults = (): Stored => ({ cityId: "larisa", placeIds: [], terms: [], categories: [], saved: [], lang: "el" });

export function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const p = JSON.parse(raw) as Partial<Stored>;
    const arr = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string").slice(0, 200) : []);
    return {
      ...defaults(),
      cityId: typeof p.cityId === "string" ? p.cityId : "larisa",
      placeIds: arr(p.placeIds),
      terms: arr(p.terms).map((s) => s.slice(0, 60)),
      categories: arr(p.categories).filter((c): c is Category => (CATS as string[]).includes(c)),
      saved: arr(p.saved),
      lang: p.lang === "en" ? "en" : "el",
      ...(typeof p.lastVisit === "string" ? { lastVisit: p.lastVisit } : {}),
      ...(p.introDismissed ? { introDismissed: true } : {}),
    };
  } catch {
    return defaults();
  }
}

export function save(p: Stored): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: keep in memory only */ }
}

export function wipe(): void {
  try { localStorage.removeItem(KEY); localStorage.removeItem(FEED_KEY); } catch { /* nothing stored */ }
}

/** The last feed we received, so a failed refresh can still show what we knew, clearly marked as old. */
export function rememberFeed(f: Feed): void {
  try { localStorage.setItem(FEED_KEY, JSON.stringify(f)); } catch { /* quota: skip */ }
}
export function lastFeed(): Feed | undefined {
  try {
    const raw = localStorage.getItem(FEED_KEY);
    const f = raw ? (JSON.parse(raw) as Feed) : undefined;
    return f && f.version === 1 && Array.isArray(f.notices) && Array.isArray(f.sources) && f.mode === "live" ? f : undefined;
  } catch { return undefined; }
}
