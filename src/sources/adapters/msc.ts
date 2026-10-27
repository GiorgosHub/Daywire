// Canada: Environment and Climate Change Canada alerts from MSC GeoMet's OGC API (collection weather-alerts), asked
// for a small box around the city and kept only when the alert polygon contains the city's point. Colour, impact and
// confidence are MSC's own fields; English and French texts are both MSC's.
import { z } from "zod";
import type { Notice } from "../../domain/types.ts";
import { inGeometry, type Geometry } from "../geo.ts";
import type { Adapter } from "../types.ts";
import { at, colour, live, warning } from "./warning.ts";

export const ECCC = { en: "Environment and Climate Change Canada", fr: "Environnement et Changement climatique Canada" };
export const mscUrl = (lat: number, lon: number) => {
  const d = 0.01;
  return `https://api.weather.gc.ca/collections/weather-alerts/items?f=json&bbox=${(lon - d).toFixed(4)},${(lat - d).toFixed(4)},${(lon + d).toFixed(4)},${(lat + d).toFixed(4)}&limit=50`;
};
const Props = z.object({
  alert_code: z.string().optional(), alert_type: z.string().optional(),
  alert_name_en: z.string(), alert_name_fr: z.string().optional(), alert_short_name_en: z.string().optional(),
  publication_datetime: z.string(), expiration_datetime: z.string(), validity_datetime: z.string().optional(), event_end_datetime: z.string().nullable().optional(),
  alert_text_en: z.string().default(""), alert_text_fr: z.string().optional(),
  risk_colour_en: z.string().optional(), feature_name_en: z.string(), feature_name_fr: z.string().optional(),
  status_en: z.string().optional(), feature_id: z.string().optional(),
});
const Collection = z.object({ features: z.array(z.object({ id: z.union([z.string(), z.number()]).optional(), geometry: z.unknown(), properties: z.unknown() })) });
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const mscAdapter: Adapter = async (ctx) => {
  const { lat, lon } = ctx.location;
  const col = Collection.parse(JSON.parse(await ctx.get(mscUrl(lat, lon))));
  const notices: Notice[] = [];
  for (const f of col.features) {
    const p = Props.safeParse(f.properties);
    if (!p.success) { ctx.reject(`alert: ${p.error.issues[0]?.path.join(".")} ${p.error.issues[0]?.message}`); continue; }
    const a = p.data;
    if (/ended|cancel/i.test(a.status_en ?? "")) continue;
    if (!inGeometry(lon, lat, f.geometry as Geometry)) continue;
    const end = at(a.event_end_datetime ?? a.expiration_datetime);
    if (!live(at(a.expiration_datetime), ctx.now)) continue;
    const id = String(f.id ?? `${a.alert_code}-${a.feature_id}-${a.publication_datetime}`);
    notices.push(warning(ctx, "msc", {
      nativeId: id, language: "en", title: `${sentence(a.alert_name_en)} · ${a.feature_name_en}`,
      headline: { en: sentence(a.alert_name_en), ...(a.alert_name_fr ? { fr: sentence(a.alert_name_fr) } : {}) },
      body: a.alert_text_en, bodyAlt: a.alert_text_fr ? [{ lang: "fr", text: a.alert_text_fr }] : [],
      publisher: ECCC, url: "https://weather.gc.ca", sent: a.publication_datetime,
      end,
      region: { en: a.feature_name_en, ...(a.feature_name_fr ? { fr: a.feature_name_fr } : {}) },
      severity: colour(a.risk_colour_en),
      notes: ["no-per-warning-page"],
    }));
  }
  return { notices, fetched: col.features.length };
};
