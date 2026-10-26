// Preferences live only in this browser (localStorage). No account, nothing sent to the server.
// v2: several saved locations, each with its own neighbourhoods and streets. v1 (Larissa only) is migrated.
import { DEFAULT_LOCATION } from "../domain/localities.ts";
import { CATEGORIES } from "../domain/categories.ts";
import type { Category, Feed, GeoLocation } from "../domain/types.ts";
import { isLang, type Lang } from "./i18n/index.ts";

export interface SavedLocation {
  location: GeoLocation;
  /** The person's own name for it: "Home", "Work"… */
  label?: string;
  placeIds: string[];
  terms: string[];
}

export interface Stored {
  v: 2;
  lang: Lang;
  activeId?: string;
  locations: SavedLocation[];
  categories: Category[];
  savedNotices: string[];
  lastVisit?: string;
  dismissed: string[];
}

const KEY = "daywire:prefs:v2";
const OLD_KEY = "daywire:prefs:v1";
const FEED_KEY = "daywire:feeds:v2";

export const defaults = (): Stored => ({ v: 2, lang: "el", locations: [], categories: [], savedNotices: [], dismissed: [] });

const strs = (x: unknown, max = 200) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string").slice(0, max) : []);

function validLocation(x: unknown): x is GeoLocation {
  const l = x as GeoLocation;
  return Boolean(l && typeof l.id === "string" && /^gn:\d+$/.test(l.id) && typeof l.geonameId === "number" && l.name && typeof l.name.en === "string"
    && typeof l.tz === "string" && typeof l.lat === "number" && typeof l.lon === "number" && typeof l.countryCode === "string");
}

export function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Stored>;
      const locations = (Array.isArray(p.locations) ? p.locations : []).filter((s) => s && validLocation(s.location)).slice(0, 12)
        .map((s) => ({ location: s.location, ...(typeof s.label === "string" ? { label: s.label.slice(0, 40) } : {}), placeIds: strs(s.placeIds), terms: strs(s.terms).map((t) => t.slice(0, 60)) }));
      return {
        ...defaults(),
        lang: isLang(p.lang) ? p.lang : "el",
        locations,
        ...(typeof p.activeId === "string" && locations.some((l) => l.location.id === p.activeId) ? { activeId: p.activeId } : locations[0] ? { activeId: locations[0].location.id } : {}),
        categories: strs(p.categories).filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c)),
        savedNotices: strs(p.savedNotices, 500),
        ...(typeof p.lastVisit === "string" ? { lastVisit: p.lastVisit } : {}),
        dismissed: strs(p.dismissed),
      };
    }
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const o = JSON.parse(old) as { placeIds?: unknown; terms?: unknown; categories?: unknown; saved?: unknown; lang?: unknown; lastVisit?: unknown };
      const s: Stored = {
        ...defaults(),
        lang: isLang(o.lang) ? o.lang : "el",
        locations: [{ location: DEFAULT_LOCATION, placeIds: strs(o.placeIds), terms: strs(o.terms) }],
        activeId: DEFAULT_LOCATION.id,
        categories: strs(o.categories).filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c)),
        savedNotices: strs(o.saved, 500),
        ...(typeof o.lastVisit === "string" ? { lastVisit: o.lastVisit } : {}),
      };
      save(s);
      localStorage.removeItem(OLD_KEY);
      return s;
    }
  } catch { /* storage blocked or corrupt: start fresh */ }
  return defaults();
}

export function save(p: Stored): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: keep in memory only */ }
}

export function wipe(): void {
  try { for (const k of [KEY, OLD_KEY, FEED_KEY, "daywire:lastfeed:v1"]) localStorage.removeItem(k); } catch { /* nothing stored */ }
}

/** The last live feed per location, so a failed refresh can still show what we knew, clearly marked as old. */
export function rememberFeed(f: Feed): void {
  try {
    const all = JSON.parse(localStorage.getItem(FEED_KEY) ?? "{}") as Record<string, Feed>;
    all[f.location.id] = f;
    const keep = Object.entries(all).sort((a, b) => Date.parse(b[1].generatedAt) - Date.parse(a[1].generatedAt)).slice(0, 4);
    localStorage.setItem(FEED_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch { /* quota: skip */ }
}
export function lastFeed(id: string): Feed | undefined {
  try {
    const f = (JSON.parse(localStorage.getItem(FEED_KEY) ?? "{}") as Record<string, Feed>)[id];
    return f && f.version === 2 && Array.isArray(f.notices) && Array.isArray(f.sources) && f.mode === "live" ? f : undefined;
  } catch { return undefined; }
}
