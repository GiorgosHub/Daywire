// Worldwide location search through the Open-Meteo geocoding API (GeoNames data, CC BY 4.0).
// Free tier: non-commercial use, under 10,000 calls a day. Set OPEN_METEO_API_KEY to use the paid customer endpoint.
// Results are populated places only (GeoNames feature codes PPL*), identified by GeoNames id.
import { z } from "zod";
import { fold } from "../domain/greek.ts";
import { FEATURED } from "../domain/localities.ts";
import { GeoLocation, type LText } from "../domain/types.ts";
import { fetchText } from "../sources/http.ts";

const Raw = z.object({
  id: z.number().int(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  feature_code: z.string().default(""),
  country_code: z.string().regex(/^[A-Z]{2}$/),
  country: z.string().optional(),
  admin1: z.string().optional(),
  admin1_id: z.number().int().optional(),
  admin2: z.string().optional(),
  timezone: z.string(),
  population: z.number().optional(),
});
type Raw = z.infer<typeof Raw>;

export type Fetcher = (url: string) => Promise<string>;

export interface Geocoder {
  search(q: string, lang: string): Promise<GeoLocation[]>;
  get(geonameId: number): Promise<GeoLocation | undefined>;
}

const isPlace = (r: Raw) => r.feature_code.startsWith("PPL");

function merge(byLang: Record<string, Raw | undefined>): GeoLocation | undefined {
  const en = byLang.en ?? Object.values(byLang).find(Boolean);
  if (!en) return undefined;
  const text = (f: (r: Raw) => string | undefined): LText | undefined => {
    const base = f(en);
    if (!base) return undefined;
    const t: LText = { en: base };
    for (const [l, r] of Object.entries(byLang)) { const v = r && f(r); if (v) t[l] = v; }
    return t;
  };
  return GeoLocation.parse({
    id: `gn:${en.id}`, geonameId: en.id, name: text((r) => r.name), countryCode: en.country_code,
    country: text((r) => r.country) ?? { en: en.country_code },
    ...(text((r) => r.admin1) ? { admin1: text((r) => r.admin1) } : {}),
    ...(en.admin1_id ? { admin1Id: en.admin1_id } : {}),
    ...(text((r) => r.admin2) ? { admin2: text((r) => r.admin2) } : {}),
    lat: en.latitude, lon: en.longitude, tz: en.timezone,
    ...(en.population ? { population: en.population } : {}), featureCode: en.feature_code,
  });
}

export function openMeteoGeocoder(fetcher: Fetcher, env: Record<string, string | undefined> = {}): Geocoder {
  const key = env.OPEN_METEO_API_KEY;
  const host = key ? "https://customer-geocoding-api.open-meteo.com" : "https://geocoding-api.open-meteo.com";
  const auth = key ? `&apikey=${encodeURIComponent(key)}` : "";
  const searchRaw = async (q: string, lang: string): Promise<Raw[]> => {
    const j = JSON.parse(await fetcher(`${host}/v1/search?name=${encodeURIComponent(q)}&count=10&language=${lang}&format=json${auth}`)) as { results?: unknown[] };
    return (j.results ?? []).map((r) => Raw.safeParse(r)).filter((p) => p.success).map((p) => p.data!).filter(isPlace);
  };
  const getRaw = async (id: number, lang: string): Promise<Raw | undefined> => {
    const p = Raw.safeParse(JSON.parse(await fetcher(`${host}/v1/get?id=${id}&language=${lang}${auth}`)));
    return p.success ? p.data : undefined;
  };
  return {
    async search(q, lang) {
      const langs = [...new Set(["en", lang])];
      const lists = await Promise.all(langs.map((l) => searchRaw(q, l)));
      const ids = [...new Set(lists.flat().map((r) => r.id))];
      // featured locations carry curated names in every interface language
      return ids.map((id) => FEATURED.find((f) => f.geonameId === id) ?? merge(Object.fromEntries(langs.map((l, i) => [l, lists[i]!.find((r) => r.id === id)])))).filter((x): x is GeoLocation => Boolean(x));
    },
    async get(id) {
      const f = FEATURED.find((x) => x.geonameId === id);
      if (f) return f;
      const [en, el] = await Promise.all([getRaw(id, "en"), getRaw(id, "el").catch(() => undefined)]);
      return en && isPlace(en) ? merge({ en, el }) : undefined;
    },
  };
}

/** Reads the captured responses in tests/fixtures/geocoder-search.json (local fixture mode and tests only). */
export function fixtureGeocoder(read: () => Promise<string>): Geocoder {
  const fetcher: Fetcher = async (url) => {
    const all = JSON.parse(await read()) as Record<string, unknown>;
    const u = new URL(url);
    const key = u.pathname.endsWith("/get") ? `get-${u.searchParams.get("id")}-${u.searchParams.get("language")}` : fold(u.searchParams.get("name") ?? "");
    const hit = all[key];
    if (hit === undefined) return u.pathname.endsWith("/get") ? "{}" : "{}";
    return JSON.stringify(hit);
  };
  return openMeteoGeocoder(fetcher);
}

export const liveGeocoder = (env: Record<string, string | undefined>) => openMeteoGeocoder((url) => fetchText(url, { timeoutMs: 5000, retries: 1, accept: "application/json" }), env);
