// Sweden: SMHI's impact-based weather warnings and messages (IBWW API, version 1). A warning applies when its
// published area polygon contains the city's point. Coastal warnings drawn as a line (sea level) apply to the
// counties SMHI lists as affected, matched against the city's county name. Levels are SMHI's own (Yellow, Orange,
// Red); "Message" level items are official messages without a warning level (e.g. risk of water shortage).
import { z } from "zod";
import { fold } from "../../domain/greek.ts";
import type { LText, Notice } from "../../domain/types.ts";
import { inGeometry, type Geometry } from "../geo.ts";
import type { Adapter } from "../types.ts";
import { at, colour, live, warning } from "./warning.ts";

export const SMHI = { en: "SMHI", sv: "SMHI" };
export const SMHI_URL = "https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json";
const L = z.object({ sv: z.string().optional(), en: z.string().optional() }).passthrough();
const Area = z.object({
  id: z.number(), approximateStart: z.string().optional(), approximateEnd: z.string().optional(), published: z.string().optional(),
  areaName: L, warningLevel: z.object({ code: z.string(), sv: z.string().optional(), en: z.string().optional() }),
  eventDescription: L.optional(), affectedAreas: z.array(L).default([]),
  descriptions: z.array(z.object({ title: L, text: L })).default([]),
  area: z.unknown(),
});
const Event = z.object({ id: z.number(), event: L.extend({ code: z.string() }), warningAreas: z.array(z.unknown()) });

function geometries(a: unknown): Geometry[] {
  const o = a as { type?: string; geometry?: Geometry; features?: { geometry?: Geometry }[] } | null;
  if (!o) return [];
  if (o.type === "Feature" && o.geometry) return [o.geometry];
  if (o.type === "FeatureCollection") return (o.features ?? []).map((f) => f.geometry).filter(Boolean) as Geometry[];
  return [];
}
const county = (s: string | undefined) => fold((s ?? "").replace(/\b(county|län|lan)\b/gi, "")).trim();
const text = (l: z.infer<typeof L> | undefined, k: "sv" | "en") => (l?.[k] as string | undefined) ?? "";

export const smhiAdapter: Adapter = async (ctx) => {
  const { lat, lon, admin1 } = ctx.location;
  const raw = JSON.parse(await ctx.get(SMHI_URL)) as unknown;
  if (!Array.isArray(raw)) throw new Error("expected an array of warnings");
  const here = county(admin1?.en);
  const notices: Notice[] = [];
  for (const r of raw) {
    const e = Event.safeParse(r);
    if (!e.success) { ctx.reject("event: unexpected shape"); continue; }
    for (const wa of e.data.warningAreas) {
      const p = Area.safeParse(wa);
      if (!p.success) { ctx.reject(`area: ${p.error.issues[0]?.path.join(".")} ${p.error.issues[0]?.message}`); continue; }
      const w = p.data;
      const geoms = geometries(w.area).filter((g) => g.type === "Polygon" || g.type === "MultiPolygon");
      const inside = geoms.some((g) => inGeometry(lon, lat, g));
      const byCounty = !geoms.length && here.length > 2 && w.affectedAreas.some((c) => county(text(c, "en") || text(c, "sv")) === here);
      if (!inside && !byCounty) continue;
      const end = at(w.approximateEnd);
      if (!live(end, ctx.now)) continue;
      const desc = (k: "sv" | "en") => w.descriptions.map((d) => [text(d.title, k), text(d.text, k)].filter(Boolean).join(": ")).filter(Boolean).join("\n\n");
      const ev: LText = { en: text(e.data.event, "en") || text(e.data.event, "sv"), sv: text(e.data.event, "sv") };
      const level = w.warningLevel.code.toLowerCase();
      notices.push(warning(ctx, "smhi", {
        nativeId: String(w.id), language: "sv", title: [text(w.eventDescription, "sv") || ev.sv, text(w.areaName, "sv")].filter(Boolean).join(" · "),
        headline: ev, body: desc("sv"), bodyAlt: desc("en") ? [{ lang: "en", text: desc("en") }] : [],
        publisher: SMHI, url: "https://www.smhi.se", sent: w.published,
        start: at(w.approximateStart), end,
        region: { en: text(w.areaName, "en") || text(w.areaName, "sv"), sv: text(w.areaName, "sv") },
        severity: colour(level),
        category: e.data.event.code === "WATER_SHORTAGE" ? "water" : "weather",
        notes: ["no-per-warning-page", ...(byCounty ? ["matched-by-county"] : [])],
      }));
    }
  }
  return { notices, fetched: raw.length };
};
