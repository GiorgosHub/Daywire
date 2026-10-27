// Italy: the national hydrogeological and hydraulic alert bulletin (Bollettino di criticità nazionale/allerta) of the
// Civil Protection Department, as published daily (normally by 16:00) in DPC's public GitHub repository, CC BY 4.0.
// Each bulletin is a TopoJSON map of the alert zones with levels for today and tomorrow, for three risks: hydraulic,
// hydrogeological and thunderstorms. The zone is the one whose published outline contains the city's point. Levels
// are DPC's own words (ALLERTA GIALLA / ARANCIONE / ROSSA); "NESSUNA ALLERTA" is not a notice. Flood and landslide
// risk only: this is not a general weather warning service.
import { dayBounds, localDate, zonedToUtc, DAY } from "../../domain/time.ts";
import type { Notice } from "../../domain/types.ts";
import { inGeometry, topoDecoder, type Topology } from "../geo.ts";
import type { Adapter } from "../types.ts";
import { colour, warning } from "./warning.ts";

export const DPC = { en: "Italian Civil Protection Department", it: "Dipartimento della Protezione Civile" };
const REPO = "pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica";
export const DPC_LIST = `https://api.github.com/repos/${REPO}/git/trees/master:files/topojson`;
const RAW = (f: string) => `https://raw.githubusercontent.com/${REPO}/master/files/topojson/${f}`;
const PAGE = (f: string) => `https://github.com/${REPO}/blob/master/files/topojson/${f}`;
const TZ = "Europe/Rome";

const RISKS: [string, { en: string; it: string }][] = [
  ["Per rischio idrogeologico", { en: "Hydrogeological risk (landslides, flash floods)", it: "Rischio idrogeologico" }],
  ["Per rischio idraulico", { en: "Hydraulic risk (river flooding)", it: "Rischio idraulico" }],
  ["Per rischio temporali", { en: "Thunderstorm risk", it: "Rischio temporali" }],
];
const LEVEL: [RegExp, string, string][] = [[/ALLERTA ROSSA/, "red", "Allerta rossa"], [/ALLERTA ARANCIONE/, "orange", "Allerta arancione"], [/ALLERTA GIALLA/, "yellow", "Allerta gialla"]];

const ymd = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

export const dpcAdapter: Adapter = async (ctx) => {
  const { lat, lon } = ctx.location;
  // which bulletin files cover today and tomorrow (Rome time)
  const today = localDate(ctx.now, TZ);
  const files: { name: string; day: string }[] = [];
  if (ctx.fixture) {
    files.push({ name: "fixture", day: "" });
  } else {
    const headers: Record<string, string> = { accept: "application/vnd.github+json" };
    if (ctx.env.GITHUB_TOKEN) headers.authorization = `Bearer ${ctx.env.GITHUB_TOKEN}`;
    const list = JSON.parse(await ctx.get(DPC_LIST, headers)) as { tree?: { path: string }[] };
    if (!Array.isArray(list.tree)) throw new Error("no file list");
    const names = list.tree.map((t) => t.path).filter((p) => /^\d{8}_\d{4}_(today|tomorrow)\.json$/.test(p)).sort();
    const latest = (kind: string, date: string) => names.filter((n) => n.startsWith(date.replace(/-/g, "")) && n.endsWith(`_${kind}.json`)).pop();
    const tomorrow = localDate(ctx.now + DAY, TZ), yesterday = localDate(ctx.now - DAY, TZ);
    const t = latest("today", today);
    if (t) { files.push({ name: t, day: today }); const tm = latest("tomorrow", today); if (tm) files.push({ name: tm, day: tomorrow }); }
    else { const y = latest("tomorrow", yesterday); if (y) files.push({ name: y, day: today }); }
    if (!files.length) throw new Error(`no bulletin published for ${yesterday} or ${today} yet`);
  }

  const notices: Notice[] = [];
  let fetched = 0;
  for (const f of files) {
    const topo = JSON.parse(await ctx.get(f.name === "fixture" ? "fixture" : RAW(f.name))) as Topology;
    const obj = Object.entries(topo.objects ?? {})[0];
    if (topo.type !== "Topology" || !obj) throw new Error("not a TopoJSON bulletin");
    const [objName, coll] = obj;
    const m = /^(\d{8})_(\d{4})_(today|tomorrow)$/.exec(objName);
    // issue time, from the file name (Rome time)
    const issued = m ? new Date(zonedToUtc(+m[1]!.slice(0, 4), +m[1]!.slice(4, 6), +m[1]!.slice(6, 8), +m[2]!.slice(0, 2), +m[2]!.slice(2), TZ)).toISOString() : undefined;
    const day = f.day || (m ? (m[3] === "today" ? ymd(m[1]!) : localDate(Date.parse(`${ymd(m[1]!)}T12:00:00Z`) + DAY, TZ)) : today);
    const fileName = f.name === "fixture" ? `${objName}.json` : f.name;
    const decode = topoDecoder(topo);
    fetched += coll.geometries.length;
    const zone = coll.geometries.find((g) => inGeometry(lon, lat, decode(g)));
    if (!zone) continue;
    const props = zone.properties as Record<string, string | string[]>;
    const zoneName = String(props["Nome zona"] ?? "");
    const [startMs, endMs] = dayBounds(day, TZ);
    for (const [key, label] of RISKS) {
      const value = String(props[key] ?? "");
      const lvl = LEVEL.find(([re]) => re.test(value));
      if (!lvl) continue;
      notices.push(warning(ctx, "dpc", {
        nativeId: `${fileName}:${zoneName}:${key}`, language: "it",
        title: `${lvl[2]} · ${label.it} · ${zoneName} · ${day}`,
        headline: { en: label.en, it: label.it },
        body: `${label.it}: ${value}. Zona di allerta: ${zoneName}.`,
        publisher: DPC, url: PAGE(fileName),
        ...(issued ? { sent: issued } : {}),
        start: { at: new Date(Math.max(startMs, 0)).toISOString(), precision: "datetime", from: "source-field" },
        end: { at: new Date(endMs).toISOString(), precision: "datetime", from: "source-field" },
        region: { en: zoneName, it: zoneName },
        severity: colour(lvl[1], { en: label.en, it: label.it }),
        notes: ["official-alert-record", "regional-bulletin"],
      }));
    }
  }
  return { notices, fetched };
};
