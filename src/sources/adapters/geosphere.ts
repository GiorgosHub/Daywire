// Austria: GeoSphere Austria (formerly ZAMG) weather warnings for the municipality that contains the city's point
// (getWarningsForCoords). Texts are GeoSphere's German originals; the level is read from the warning's own text
// ("Gelbe …", "Orange …", "Rote …"); start and end come from the warning's Unix timestamps.
import { z } from "zod";
import type { Notice } from "../../domain/types.ts";
import type { Adapter } from "../types.ts";
import { at, colour, live, warning } from "./warning.ts";

export const GEOSPHERE = { en: "GeoSphere Austria", de: "GeoSphere Austria" };
export const geosphereUrl = (lat: number, lon: number) =>
  `https://warnungen.zamg.at/wsapp/api/getWarningsForCoords?lon=${lon.toFixed(4)}&lat=${lat.toFixed(4)}&lang=en`;

const W = z.object({
  warnid: z.number(), chgid: z.number().optional(), warntypid: z.number().optional(),
  text: z.string(), auswirkungen: z.string().default(""), empfehlungen: z.string().default(""), meteotext: z.string().default(""),
  create: z.string().optional(),
  rawinfo: z.object({ start: z.string(), end: z.string() }),
});
const Doc = z.object({
  properties: z.object({
    location: z.object({ properties: z.object({ name: z.string(), gemeindenr: z.number().optional() }) }),
    warnings: z.array(z.object({ properties: z.unknown() })),
  }),
});
const LEVEL: [RegExp, string][] = [[/^gelb/i, "yellow"], [/^orange/i, "orange"], [/^rot/i, "red"]];
const unix = (s: string) => at(new Date(Number(s) * 1000).toISOString());

export const geosphereAdapter: Adapter = async (ctx) => {
  const doc = Doc.parse(JSON.parse(await ctx.get(geosphereUrl(ctx.location.lat, ctx.location.lon))));
  const muni = doc.properties.location.properties.name;
  const notices: Notice[] = [];
  for (const r of doc.properties.warnings) {
    const p = W.safeParse(r.properties);
    if (!p.success) { ctx.reject(`warning: ${p.error.issues[0]?.path.join(".")} ${p.error.issues[0]?.message}`); continue; }
    const w = p.data;
    const end = unix(w.rawinfo.end);
    if (!live(end, ctx.now)) continue;
    const name = w.text.split(/\s+von\s+/i)[0]!.trim();
    const level = LEVEL.find(([re]) => re.test(w.text))?.[1];
    notices.push(warning(ctx, "geosphere", {
      nativeId: `${w.warnid}.${w.chgid ?? 0}`, language: "de", title: w.text,
      headline: { en: name, de: name },
      body: [w.meteotext, w.auswirkungen].filter(Boolean).join("\n\n"),
      publisher: GEOSPHERE, url: "https://warnungen.zamg.at", sent: w.create?.replace(" ", "T").replace(/\+00$/, "Z"),
      start: unix(w.rawinfo.start), end, region: { en: muni },
      severity: colour(level),
      action: w.empfehlungen || undefined,
      notes: ["no-per-warning-page"],
    }));
  }
  return { notices, fetched: doc.properties.warnings.length };
};
