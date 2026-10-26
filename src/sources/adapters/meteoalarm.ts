// Official weather warnings of the Hellenic National Meteorological Service (ΕΜΥ / HNMS), read from the
// MeteoAlarm JSON feed for Greece (CAP alerts). Severity is the source's own awareness level; we never compute one.
import { z } from "zod";
import { makeNotice } from "../../domain/build.ts";
import { cityById } from "../../domain/cities.ts";
import { fold } from "../../domain/greek.ts";
import type { Notice, Text2 } from "../../domain/types.ts";
import type { Adapter } from "../types.ts";

export const HNMS = { el: "ΕΜΥ (μέσω MeteoAlarm)", en: "HNMS (via MeteoAlarm)" };

const Info = z.object({
  language: z.string(),
  headline: z.string(),
  description: z.string().default(""),
  onset: z.string().optional(),
  effective: z.string().optional(),
  expires: z.string(),
  web: z.string().optional(),
  area: z.array(z.object({ areaDesc: z.string(), geocode: z.array(z.object({ value: z.string(), valueName: z.string() })).default([]) })),
  parameter: z.array(z.object({ valueName: z.string(), value: z.string() })).default([]),
});
const Warning = z.object({
  uuid: z.string().optional(),
  alert: z.object({ identifier: z.string(), sent: z.string(), status: z.string(), msgType: z.string(), info: z.array(Info).min(1) }),
});

const HAZARD: Record<string, Text2> = {
  "1": { el: "Άνεμοι", en: "Wind" }, "2": { el: "Χιόνι / παγετός", en: "Snow / ice" }, "3": { el: "Καταιγίδες", en: "Thunderstorms" },
  "4": { el: "Ομίχλη", en: "Fog" }, "5": { el: "Υψηλές θερμοκρασίες", en: "High temperatures" }, "6": { el: "Χαμηλές θερμοκρασίες", en: "Low temperatures" },
  "7": { el: "Παράκτια φαινόμενα", en: "Coastal event" }, "8": { el: "Κίνδυνος πυρκαγιάς", en: "Forest fire risk" }, "9": { el: "Χιονοστιβάδες", en: "Avalanches" },
  "10": { el: "Βροχοπτώσεις", en: "Rain" }, "12": { el: "Πλημμύρες", en: "Flooding" }, "13": { el: "Βροχή-πλημμύρα", en: "Rain and flooding" },
};
const LEVEL: Record<string, { level: "yellow" | "orange" | "red"; el: string; en: string }> = {
  "2": { level: "yellow", el: "Κίτρινη", en: "Yellow" }, "3": { level: "orange", el: "Πορτοκαλί", en: "Orange" }, "4": { level: "red", el: "Κόκκινη", en: "Red" },
};

export const meteoalarmAdapter: Adapter = async (ctx) => {
  const city = cityById(ctx.cityId)!;
  if (!city.emma) return { notices: [], fetched: 0 };
  const raw = JSON.parse(await ctx.get(ctx.source.endpoint!)) as { warnings?: unknown[] };
  if (!Array.isArray(raw.warnings)) throw new Error("no warnings array");
  const notices: Notice[] = [];
  for (const r of raw.warnings) {
    const p = Warning.safeParse(r);
    if (!p.success) { ctx.reject(`warning: ${p.error.issues[0]?.path.join(".")} ${p.error.issues[0]?.message}`); continue; }
    const a = p.data.alert;
    if (a.status !== "Actual" || a.msgType === "Cancel") continue;
    const covers = a.info.some((i) => i.area.some((ar) => ar.geocode.some((g) => g.value === city.emma!.code)));
    if (!covers) continue;
    const el = a.info.find((i) => i.language.startsWith("el")) ?? a.info[0]!;
    const en = a.info.find((i) => i.language.startsWith("en"));
    const param = (name: string) => el.parameter.find((x) => x.valueName === name)?.value.split(";")[0]?.trim();
    const lvl = LEVEL[param("awareness_level") ?? ""];
    const hz = HAZARD[param("awareness_type") ?? ""] ?? { el: "Καιρικά φαινόμενα", en: "Weather" };
    if (!lvl) continue; // green / no awareness level: not a warning
    const onset = el.onset ?? el.effective;
    const url = (el.web && /^https?:\/\//.test(el.web)) ? el.web : "https://www.emy.gr";
    const notes = ["no-per-warning-page"];
    if (fold(el.description).includes("λαρισ")) notes.push("mentions-city");
    notices.push(makeNotice({
      id: `meteoalarm:${a.identifier}`,
      cityId: ctx.cityId,
      category: "weather",
      originalTitle: el.headline,
      headline: { el: `${lvl.el} προειδοποίηση · ${hz.el}`, en: `${lvl.en} warning · ${hz.en}` },
      body: el.description.replace(/\s{2,}/g, " ").trim(),
      ...(en ? { bodyEn: en.description.replace(/\s{2,}/g, " ").trim() } : {}),
      publisher: HNMS,
      sourceUrl: url,
      sources: [{ sourceId: ctx.source.id, publisher: HNMS, url, nativeId: a.identifier, title: el.headline, publishedAt: new Date(a.sent).toISOString() }],
      publishedAt: new Date(a.sent).toISOString(),
      lastVerifiedAt: new Date(ctx.now).toISOString(),
      ...(onset ? { start: { at: new Date(onset).toISOString(), precision: "datetime" as const, from: "source-field" as const } } : {}),
      end: { at: new Date(el.expires).toISOString(), precision: "datetime", from: "source-field" },
      endKind: "validity",
      scope: "region",
      regionLabel: city.emma.name,
      severity: { level: lvl.level, hazard: hz },
      notes,
      fixture: ctx.fixture,
    }));
  }
  return { notices, fetched: raw.warnings.length };
};
