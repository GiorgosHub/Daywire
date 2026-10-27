// Germany: Deutscher Wetterdienst warnings for the municipality (Gemeinde) that contains the city's point, from DWD's
// open GeoServer (WFS layer dwd:Warnungen_Gemeinden, filtered server-side with CONTAINS(THE_GEOM, POINT(lat lon))).
// Severity is the CAP severity DWD assigns (Minor, Moderate, Severe, Extreme); texts are DWD's German originals.
import { z } from "zod";
import type { Notice } from "../../domain/types.ts";
import { CAP_RANK } from "../cap.ts";
import type { Adapter } from "../types.ts";
import { at, live, warning } from "./warning.ts";

export const DWD = { en: "Deutscher Wetterdienst (DWD)", de: "Deutscher Wetterdienst" };
const SEVERITY_DE: Record<string, string> = { Minor: "Wetterwarnung", Moderate: "Markante Wetterwarnung", Severe: "Unwetterwarnung", Extreme: "Extreme Unwetterwarnung" };
const Props = z.object({
  IDENTIFIER: z.string(), AREADESC: z.string(), SENT: z.string(), STATUS: z.string(), MSGTYPE: z.string(),
  LANGUAGE: z.string().default("de-DE"), CATEGORY: z.string().default("Met"), EVENT: z.string(), SEVERITY: z.string(),
  EFFECTIVE: z.string().optional(), ONSET: z.string().nullable().optional(), EXPIRES: z.string().nullable().optional(),
  HEADLINE: z.string(), DESCRIPTION: z.string().default(""), INSTRUCTION: z.string().nullable().optional(),
  WEB: z.string().optional(),
});
const Collection = z.object({ features: z.array(z.object({ properties: z.unknown() })) });

export const dwdUrl = (lat: number, lon: number) =>
  `https://maps.dwd.de/geoserver/dwd/ows?service=WFS&version=2.0.0&request=GetFeature&typeName=dwd:Warnungen_Gemeinden&outputFormat=application/json&CQL_FILTER=CONTAINS(THE_GEOM,POINT(${lat.toFixed(4)}%20${lon.toFixed(4)}))`;

export const dwdAdapter: Adapter = async (ctx) => {
  const col = Collection.parse(JSON.parse(await ctx.get(dwdUrl(ctx.location.lat, ctx.location.lon))));
  const notices: Notice[] = [];
  const seen = new Set<string>();
  for (const f of col.features) {
    const p = Props.safeParse(f.properties);
    if (!p.success) { ctx.reject(`warning: ${p.error.issues[0]?.path.join(".")} ${p.error.issues[0]?.message}`); continue; }
    const a = p.data;
    if (a.STATUS !== "Actual" || a.MSGTYPE === "Cancel" || seen.has(a.IDENTIFIER)) continue;
    seen.add(a.IDENTIFIER);
    const end = at(a.EXPIRES);
    if (!live(end, ctx.now)) continue;
    const rank = CAP_RANK[a.SEVERITY];
    const url = a.WEB && /^https:\/\//.test(a.WEB) ? a.WEB : "https://dwd.de/warnungen";
    notices.push(warning(ctx, "dwd", {
      nativeId: a.IDENTIFIER, language: a.LANGUAGE.slice(0, 2).toLowerCase(), title: a.HEADLINE,
      headline: { en: a.EVENT.charAt(0) + a.EVENT.slice(1).toLowerCase(), de: a.EVENT.charAt(0) + a.EVENT.slice(1).toLowerCase() },
      body: a.DESCRIPTION, publisher: DWD, url, sent: a.SENT,
      start: at(a.ONSET ?? a.EFFECTIVE), end,
      region: { en: a.AREADESC },
      ...(rank ? { severity: { scheme: "cap" as const, code: a.SEVERITY, label: { en: a.SEVERITY, de: SEVERITY_DE[a.SEVERITY] ?? a.SEVERITY }, rank } } : {}),
      action: a.INSTRUCTION ?? undefined,
      notes: ["no-per-warning-page"],
    }));
  }
  return { notices, fetched: col.features.length };
};
