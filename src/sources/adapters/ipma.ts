// Portugal: IPMA's weather warnings (open-data warnings_www.json), per warning area. Mainland cities are matched to
// their district by the district's name (IPMA names each mainland area after its district capital). Azores cities
// use the nearest island-group area listed by IPMA; Madeira is split into coast and mountain areas that IPMA lists
// only by capital, so only Funchal (south coast) and Porto Santo are matched there. Elsewhere: not covered.
// Green means no warning. IPMA's times carry no zone; we read them in the city's zone and say so.
import { z } from "zod";
import { fold } from "../../domain/greek.ts";
import type { Notice } from "../../domain/types.ts";
import type { GeoLocation } from "../../domain/types.ts";
import type { Adapter } from "../types.ts";
import { atLocal, colour, live, warning } from "./warning.ts";

export const IPMA = { en: "IPMA (Portuguese Institute for Sea and Atmosphere)", pt: "IPMA" };
export const IPMA_WARNINGS = "https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json";

// IPMA's own list (https://api.ipma.pt/open-data/distrits-islands.json, captured 2026-10-27): area code per capital.
const MAINLAND: Record<string, string> = {
  aveiro: "AVR", beja: "BJA", braga: "BRG", braganca: "BGC", "castelo branco": "CBO", coimbra: "CBR", evora: "EVR", faro: "FAR",
  guarda: "GDA", leiria: "LRA", lisboa: "LSB", portalegre: "PTG", porto: "PTO", santarem: "STM", setubal: "STB",
  "viana do castelo": "VCT", "vila real": "VRL", viseu: "VIS",
};
const ALIAS: Record<string, string> = { lisbon: "lisboa", oporto: "porto", "lisbon district": "lisboa" };
// island capitals from the same list: [lat, lon, area]
const AZORES: [number, number, string][] = [
  [36.9563, -25.1409, "AOR"], [37.7415, -25.6677, "AOR"], [38.67, -27.22, "ACE"], [39.08, -28.0, "ACE"], [38.6842, -28.2133, "ACE"],
  [38.5325, -28.5237, "ACE"], [38.5363, -28.6315, "ACE"], [39.45, -31.13, "AOC"], [39.67, -31.12, "AOC"],
];
const MADEIRA: [number, number, string][] = [[32.6485, -16.9084, "MCS"], [33.07, -16.34, "MPS"]];
const AREA_NAME: Record<string, string> = {
  AVR: "Aveiro", BJA: "Beja", BRG: "Braga", BGC: "Bragança", CBO: "Castelo Branco", CBR: "Coimbra", EVR: "Évora", FAR: "Faro",
  GDA: "Guarda", LRA: "Leiria", LSB: "Lisboa", PTG: "Portalegre", PTO: "Porto", STM: "Santarém", STB: "Setúbal",
  VCT: "Viana do Castelo", VRL: "Vila Real", VIS: "Viseu", MCS: "Madeira (south coast)", MPS: "Porto Santo",
  AOR: "Azores (eastern group)", ACE: "Azores (central group)", AOC: "Azores (western group)",
};

function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLon - aLon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const clean = (s: string | undefined) => fold((s ?? "").replace(/\b(district|distrito)\b/gi, "")).trim();

/** The IPMA warning area for a Portuguese city, or undefined when we can't say for sure. */
export function ipmaArea(loc: GeoLocation): string | undefined {
  if (loc.countryCode !== "PT") return undefined;
  const nearest = (list: [number, number, string][], maxKm: number) => {
    const best = list.map(([la, lo, a]) => ({ a, d: km(loc.lat, loc.lon, la, lo) })).sort((x, y) => x.d - y.d)[0];
    return best && best.d <= maxKm ? best.a : undefined;
  };
  if (loc.lon < -24) return nearest(AZORES, 120);
  if (loc.lat < 34) return nearest(MADEIRA, 12);
  for (const n of [loc.admin1?.en, loc.admin1?.pt, loc.admin2?.en]) {
    const k = clean(n); const hit = MAINLAND[ALIAS[k] ?? k];
    if (hit) return hit;
  }
  return undefined;
}

const W = z.object({ text: z.string().default(""), awarenessTypeName: z.string(), idAreaAviso: z.string(), startTime: z.string(), endTime: z.string(), awarenessLevelID: z.string() });

export const ipmaAdapter: Adapter = async (ctx) => {
  const area = ipmaArea(ctx.location);
  if (!area) return { notices: [], fetched: 0 };
  const raw = JSON.parse(await ctx.get(IPMA_WARNINGS)) as unknown;
  if (!Array.isArray(raw)) throw new Error("expected an array of warnings");
  const notices: Notice[] = [];
  for (const r of raw) {
    const p = W.safeParse(r);
    if (!p.success) { ctx.reject(`warning: ${p.error.issues[0]?.path.join(".")} ${p.error.issues[0]?.message}`); continue; }
    const w = p.data;
    if (w.idAreaAviso !== area) continue;
    const sev = colour(w.awarenessLevelID, { en: w.awarenessTypeName, pt: w.awarenessTypeName });
    if (!sev) continue; // green: no warning
    const end = atLocal(w.endTime, ctx.location.tz);
    if (!live(end, ctx.now)) continue;
    notices.push(warning(ctx, "ipma", {
      nativeId: `${w.idAreaAviso}:${w.awarenessTypeName}:${w.startTime}`, language: "pt",
      title: `Aviso ${w.awarenessLevelID} · ${w.awarenessTypeName}`,
      headline: { en: w.awarenessTypeName, pt: w.awarenessTypeName }, body: w.text,
      publisher: IPMA, url: "https://www.ipma.pt", start: atLocal(w.startTime, ctx.location.tz), end,
      region: { en: AREA_NAME[area] ?? area }, severity: sev, notes: ["no-per-warning-page"],
    }));
  }
  return { notices, fetched: raw.length };
};
