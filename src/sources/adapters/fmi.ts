// Finland: Finnish Meteorological Institute warnings from FMI's open CAP feed (Atom, English edition published by
// FMI). Each entry is a full CAP 1.2 alert; it applies when one of its area polygons contains the city's point.
// Severity is the CAP severity FMI assigns (Moderate = yellow, Severe = orange, Extreme = red in FMI's profile).
import type { Notice } from "../../domain/types.ts";
import { CAP_RANK, parseCap } from "../cap.ts";
import { inPolygon } from "../geo.ts";
import type { Adapter } from "../types.ts";
import { at, live, warning } from "./warning.ts";

export const FMI = { en: "Finnish Meteorological Institute", fi: "Ilmatieteen laitos" };
export const FMI_FEED = "https://alerts.fmi.fi/cap/feed/atom_en-GB.xml";

export const fmiAdapter: Adapter = async (ctx) => {
  const { lat, lon } = ctx.location;
  const xml = await ctx.get(FMI_FEED);
  if (!/<feed[\s>]/.test(xml)) throw new Error("not an Atom feed");
  const links = [...xml.matchAll(/<entry>[\s\S]*?<link type="application\/cap\+xml" href="([^"]+)"[\s\S]*?<\/entry>/g)].map((m) => m[1]!);
  const alerts = parseCap(xml);
  const notices: Notice[] = [];
  alerts.forEach((a, n) => {
    if (a.status !== "Actual" || a.msgType === "Cancel") return;
    const info = a.infos.find((i) => i.language.startsWith("en")) ?? a.infos[0];
    if (!info) { ctx.reject("alert without info"); return; }
    const area = info.areas.find((ar) => ar.polygons.some((p) => p.length >= 4 && inPolygon(lon, lat, [p])));
    if (!area) return;
    const end = at(info.expires);
    if (!live(end, ctx.now)) return;
    const rank = CAP_RANK[info.severity];
    const url = links[n] && /^https:\/\//.test(links[n]!) ? links[n]! : "https://en.ilmatieteenlaitos.fi/warnings";
    notices.push(warning(ctx, "fmi", {
      nativeId: a.identifier, language: "en", title: info.headline,
      headline: { en: info.event }, body: info.description, publisher: FMI, url, sent: a.sent,
      start: at(info.onset ?? info.effective), end, region: { en: area.areaDesc },
      ...(rank ? { severity: { scheme: "cap" as const, code: info.severity, label: { en: info.severity }, rank } } : {}),
      action: info.instruction,
      notes: ["official-alert-record"],
    }));
  });
  return { notices, fetched: alerts.length };
};
