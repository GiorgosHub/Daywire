// Norway: MET Norway's weather warnings (MetAlerts 2.0, GeoJSON), asked for the city's point and kept only when the
// published warning area contains that point. The Norwegian text is primary; MET Norway's own English version
// (lang=en) is attached as an alternative. Level and type are MET Norway's ("2; yellow; Moderate", "1; Wind").
import { z } from "zod";
import type { LText, Notice } from "../../domain/types.ts";
import { inGeometry, type Geometry } from "../geo.ts";
import type { Adapter } from "../types.ts";
import { at, colour, live, warning } from "./warning.ts";

export const METNO = { en: "MET Norway", el: "MET Norway (Νορβηγία)" };
const Props = z.object({
  id: z.string(), title: z.string(), status: z.string(), type: z.string(), event: z.string(),
  awareness_level: z.string(), awareness_type: z.string(), area: z.string(),
  description: z.string().default(""), instruction: z.string().default(""), consequences: z.string().default(""),
  eventAwarenessName: z.string().default(""), web: z.string().optional(),
  resources: z.array(z.object({ uri: z.string(), mimeType: z.string().optional() })).default([]),
});
const Feature = z.object({
  geometry: z.object({ type: z.enum(["Polygon", "MultiPolygon"]), coordinates: z.array(z.any()) }).nullable(),
  properties: z.unknown(),
  when: z.object({ interval: z.tuple([z.string(), z.string()]) }).optional(),
});
const Collection = z.object({ features: z.array(z.unknown()) });

const hazardOf = (t: string): LText | undefined => { const name = t.split(";")[1]?.trim(); return name ? { en: name } : undefined; };

export const metnoAdapter: Adapter = async (ctx) => {
  const { lat, lon } = ctx.location;
  const base = `https://api.met.no/weatherapi/metalerts/2.0/current.json?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
  const [no, en] = await Promise.all([ctx.get(base), ctx.get(`${base}&lang=en`)]);
  const nb = Collection.parse(JSON.parse(no)).features;
  const english = new Map<string, z.infer<typeof Props>>();
  for (const f of Collection.parse(JSON.parse(en)).features) {
    const p = Props.safeParse((f as { properties?: unknown }).properties);
    if (p.success) english.set(p.data.id, p.data);
  }
  const notices: Notice[] = [];
  for (const raw of nb) {
    const f = Feature.safeParse(raw);
    const p = Props.safeParse(f.success ? f.data.properties : null);
    if (!f.success || !p.success) { ctx.reject("feature: unexpected shape"); continue; }
    const a = p.data;
    if (a.status !== "Actual" || a.type === "Cancel") continue;
    if (!inGeometry(lon, lat, f.data.geometry as Geometry | null)) continue;
    const level = a.awareness_level.split(";")[1]?.trim();
    const e = english.get(a.id);
    const [from, to] = f.data.when?.interval ?? [];
    const end = at(to);
    if (!live(end, ctx.now)) continue;
    const enName = e?.eventAwarenessName || e?.title.split(",")[0] || a.event;
    // the warning's own CAP record, as linked by MET Norway; the phenomenon page otherwise
    const url = a.resources.find((r) => /^https:\/\//.test(r.uri))?.uri ?? (a.web && /^https:\/\//.test(a.web) ? a.web : "https://www.met.no");
    notices.push(warning(ctx, "metno", {
      nativeId: a.id, language: "nb", title: a.title,
      headline: { en: enName, nb: a.eventAwarenessName || a.title.split(",")[0]! },
      body: [a.description, a.consequences].filter(Boolean).join("\n\n"),
      bodyAlt: e ? [{ lang: "en", text: [e.description, e.consequences].filter(Boolean).join("\n\n") }] : [],
      publisher: METNO, url, start: at(from), end,
      region: { en: e?.area ?? a.area, nb: a.area },
      severity: colour(level, e ? hazardOf(e.awareness_type) : hazardOf(a.awareness_type)),
      action: a.instruction || undefined,
      notes: ["official-alert-record"],
    }));
  }
  return { notices, fetched: nb.length };
};
