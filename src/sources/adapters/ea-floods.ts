// England: current flood alerts and warnings from the Environment Agency real-time flood-monitoring API, for flood
// areas within 10 km of the location. The feed lists only what is in force; level 4 means "no longer in force".
// The API's times carry no zone; we read them as UK local time and say so on each date.
import { z } from "zod";
import { makeNotice } from "../../domain/build.ts";
import { zonedToUtc } from "../../domain/time.ts";
import type { Notice, TimePoint } from "../../domain/types.ts";
import type { Adapter } from "../types.ts";

export const EA = { en: "Environment Agency" };
const EA_TZ = "Europe/London";
export const EA_RADIUS_KM = 10;

const Item = z.object({
  floodAreaID: z.string().regex(/^[A-Za-z0-9]+$/),
  description: z.string(),
  message: z.string().default(""),
  severity: z.string(),
  severityLevel: z.number().int().min(1).max(4),
  timeRaised: z.string(),
  timeMessageChanged: z.string().optional(),
  timeSeverityChanged: z.string().optional(),
  floodArea: z.object({ county: z.string().optional(), riverOrSea: z.string().optional() }).optional(),
});

/** EA severity levels: 1 severe flood warning, 2 flood warning, 3 flood alert, 4 no longer in force. */
const RANK: Record<number, number> = { 1: 4, 2: 3, 3: 2, 4: 1 };

function noTz(s: string | undefined): TimePoint | undefined {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s) : null;
  if (!m) return undefined;
  const ms = zonedToUtc(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, EA_TZ);
  return { at: new Date(ms).toISOString(), precision: "datetime", from: "source-field-no-tz" };
}

export const eaFloodsAdapter: Adapter = async (ctx) => {
  const { lat, lon } = ctx.location;
  const raw = JSON.parse(await ctx.get(`https://environment.data.gov.uk/flood-monitoring/id/floods?lat=${lat.toFixed(5)}&long=${lon.toFixed(5)}&dist=${EA_RADIUS_KM}`)) as { items?: unknown[] };
  if (!Array.isArray(raw.items)) throw new Error("no items array");
  const notices: Notice[] = [];
  for (const r of raw.items) {
    const p = Item.safeParse(r);
    if (!p.success) { ctx.reject(`flood item: ${p.error.issues[0]?.path.join(".")} ${p.error.issues[0]?.message}`); continue; }
    const it = p.data;
    const url = `https://check-for-flooding.service.gov.uk/target-area/${it.floodAreaID}`;
    const raised = noTz(it.timeRaised);
    const changed = noTz(it.timeMessageChanged);
    const over = it.severityLevel === 4;
    const title = `${it.severity}: ${it.description}`;
    notices.push(makeNotice({
      id: `ea-flood:${it.floodAreaID}`,
      locationId: ctx.location.id,
      tz: ctx.location.tz,
      language: "en",
      category: "weather",
      originalTitle: title,
      headline: { en: title },
      body: it.message.replace(/[ \t]+\n/g, "\n").trim(),
      publisher: EA,
      sourceUrl: url,
      sources: [{ sourceId: ctx.source.id, publisher: EA, url, nativeId: it.floodAreaID, title, ...(raised ? { publishedAt: raised.at } : {}), ...(changed ? { updatedAt: changed.at } : {}) }],
      ...(raised ? { publishedAt: raised.at } : {}),
      ...(changed && raised && changed.at !== raised.at ? { updatedAt: changed.at } : {}),
      lastVerifiedAt: new Date(ctx.now).toISOString(),
      ...(raised ? { start: raised } : {}),
      // level 4 is the source saying it ended; it gives the time the severity changed
      ...(over ? { end: noTz(it.timeSeverityChanged) ?? changed ?? raised!, endKind: "validity" as const } : {}),
      currentWhileListed: !over,
      scope: "area",
      areas: [{ label: it.description }],
      ...(it.floodArea?.county ? { regionLabel: { en: it.floodArea.county } } : {}),
      severity: { scheme: "ea-flood", code: String(it.severityLevel), label: { en: it.severity }, rank: RANK[it.severityLevel]!, hazard: { en: "Flooding", el: "Πλημμύρες" } },
      notes: ["no-tz-source-times", `within-${EA_RADIUS_KM}km`],
      fixture: ctx.fixture,
    }));
  }
  return { notices, fetched: raw.items.length };
};
