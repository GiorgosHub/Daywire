// Official weather warnings from national meteorological services, read from MeteoAlarm's public JSON (CAP) feeds.
// A location is matched to a MeteoAlarm warning region (EMMA id) through its GeoNames first-level region. We only
// list regions whose correspondence is one-to-one and was checked against the feed; others are not covered.
// Severity is the service's own awareness level; we never compute one.
import { z } from "zod";
import { makeNotice } from "../../domain/build.ts";
import { fold } from "../../domain/greek.ts";
import type { LText, Notice } from "../../domain/types.ts";
import type { Adapter } from "../types.ts";

export interface CountryFeed {
  slug: string; // feeds-greece
  service: LText; // the national service that issues the warnings
  serviceUrl: string;
  /** GeoNames admin1 id → EMMA region id. */
  regions: Record<number, string>;
}

export const METEOALARM_COUNTRIES: Record<string, CountryFeed> = {
  GR: {
    slug: "feeds-greece",
    service: { en: "HNMS (via MeteoAlarm)", el: "ΕΜΥ (μέσω MeteoAlarm)" },
    serviceUrl: "https://www.emy.gr",
    // checked 2026-10-26: GeoNames admin1 (Open-Meteo geocoder) ↔ EMMA area names in the Greek feed
    regions: {
      6697809: "GR001", // Thessaly ↔ Thessalia
      6692632: "GR011", // Attica ↔ Attiki
      6697801: "GR007", // Central Macedonia ↔ Central Makedonia
      6697804: "GR008", // Epirus ↔ Epirus
      6697802: "GR016", // Crete ↔ Kriti
      6697806: "GR014", // North Aegean ↔ North East Aegean Islands
    },
  },
};

const Info = z.object({
  language: z.string(),
  event: z.string().default(""),
  headline: z.string(),
  description: z.string().default(""),
  instruction: z.string().optional(),
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

const HAZARD: Record<string, LText> = {
  "1": { en: "Wind", el: "Άνεμοι" }, "2": { en: "Snow / ice", el: "Χιόνι / παγετός" }, "3": { en: "Thunderstorms", el: "Καταιγίδες" },
  "4": { en: "Fog", el: "Ομίχλη" }, "5": { en: "High temperatures", el: "Υψηλές θερμοκρασίες" }, "6": { en: "Low temperatures", el: "Χαμηλές θερμοκρασίες" },
  "7": { en: "Coastal event", el: "Παράκτια φαινόμενα" }, "8": { en: "Forest fire risk", el: "Κίνδυνος πυρκαγιάς" }, "9": { en: "Avalanches", el: "Χιονοστιβάδες" },
  "10": { en: "Rain", el: "Βροχοπτώσεις" }, "12": { en: "Flooding", el: "Πλημμύρες" }, "13": { en: "Rain and flooding", el: "Βροχή-πλημμύρα" },
};
/** MeteoAlarm awareness levels: 2 yellow, 3 orange, 4 red (1 green = no warning). Rank = level. */
const LEVEL: Record<string, { code: string; rank: number }> = { "2": { code: "yellow", rank: 2 }, "3": { code: "orange", rank: 3 }, "4": { code: "red", rank: 4 } };

const lang2 = (l: string) => l.slice(0, 2).toLowerCase();

export function emmaFor(countryCode: string, admin1Id: number | undefined): { feed: CountryFeed; emma: string } | undefined {
  const feed = METEOALARM_COUNTRIES[countryCode];
  const emma = feed && admin1Id !== undefined ? feed.regions[admin1Id] : undefined;
  return feed && emma ? { feed, emma } : undefined;
}

export const meteoalarmAdapter: Adapter = async (ctx) => {
  const loc = ctx.location;
  const m = emmaFor(loc.countryCode, loc.admin1Id);
  if (!m) return { notices: [], fetched: 0 };
  const raw = JSON.parse(await ctx.get(`https://feeds.meteoalarm.org/api/v1/warnings/${m.feed.slug}`)) as { warnings?: unknown[] };
  if (!Array.isArray(raw.warnings)) throw new Error("no warnings array");
  const stems = Object.values(loc.name).map((n) => fold(n)).filter((n) => n.length >= 4).map((n) => (n.length >= 5 ? n.slice(0, -1) : n));
  const notices: Notice[] = [];
  for (const r of raw.warnings) {
    const p = Warning.safeParse(r);
    if (!p.success) { ctx.reject(`warning: ${p.error.issues[0]?.path.join(".")} ${p.error.issues[0]?.message}`); continue; }
    const a = p.data.alert;
    if (a.status !== "Actual" || a.msgType === "Cancel") continue;
    if (!a.info.some((i) => i.area.some((ar) => ar.geocode.some((g) => g.value === m.emma)))) continue;
    // primary text: the national language (first non-English info); others are the service's own versions
    const primary = a.info.find((i) => lang2(i.language) !== "en") ?? a.info[0]!;
    const others = a.info.filter((i) => i !== primary);
    const param = (name: string) => primary.parameter.find((x) => x.valueName === name)?.value.split(";")[0]?.trim();
    const lvl = LEVEL[param("awareness_level") ?? ""];
    if (!lvl) continue; // green / no awareness level: not a warning
    const hz = HAZARD[param("awareness_type") ?? ""];
    const eventBy: LText = { en: others.find((i) => lang2(i.language) === "en")?.event || primary.event };
    for (const i of a.info) if (i.event) eventBy[lang2(i.language)] = i.event;
    const headline: LText = { en: hz ? `${eventBy.en} · ${hz.en}` : eventBy.en };
    for (const [l, ev] of Object.entries(eventBy)) headline[l] = hz ? `${ev} · ${hz[l] ?? hz.en}` : ev;
    const onset = primary.onset ?? primary.effective;
    const url = primary.web && /^https?:\/\//.test(primary.web) ? primary.web : m.feed.serviceUrl;
    const notes = ["no-per-warning-page"];
    if (stems.some((s) => [primary, ...others].some((i) => fold(i.description).includes(s)))) notes.push("mentions-city");
    const regionLabel: LText = { en: a.info.find((i) => lang2(i.language) === "en")?.area[0]?.areaDesc.replace(/&amp;/g, "&") ?? primary.area[0]!.areaDesc };
    for (const i of a.info) regionLabel[lang2(i.language)] = i.area[0]?.areaDesc.replace(/&amp;/g, "&") ?? regionLabel.en;
    notices.push(makeNotice({
      id: `meteoalarm:${a.identifier}`,
      locationId: loc.id,
      tz: loc.tz,
      language: lang2(primary.language),
      category: "weather",
      originalTitle: primary.headline,
      headline,
      body: primary.description.replace(/\s{2,}/g, " ").trim(),
      bodyAlt: others.map((i) => ({ lang: lang2(i.language), text: i.description.replace(/\s{2,}/g, " ").trim() })),
      publisher: m.feed.service,
      sourceUrl: url,
      sources: [{ sourceId: ctx.source.id, publisher: m.feed.service, url, nativeId: a.identifier, title: primary.headline, publishedAt: new Date(a.sent).toISOString() }],
      publishedAt: new Date(a.sent).toISOString(),
      lastVerifiedAt: new Date(ctx.now).toISOString(),
      ...(onset ? { start: { at: new Date(onset).toISOString(), precision: "datetime" as const, from: "source-field" as const } } : {}),
      end: { at: new Date(primary.expires).toISOString(), precision: "datetime", from: "source-field" },
      endKind: "validity",
      scope: "region",
      regionLabel,
      severity: { scheme: "meteoalarm", code: lvl.code, label: eventBy, rank: lvl.rank, ...(hz ? { hazard: hz } : {}) },
      notes,
      fixture: ctx.fixture,
    }));
  }
  return { notices, fetched: raw.warnings.length };
};
