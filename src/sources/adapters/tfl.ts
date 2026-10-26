// London: line status from the TfL Unified API (Tube, Elizabeth line, DLR, Overground, Tram).
// TfL's terms ask applications to register for a key, so this source is off unless TFL_APP_KEY is set.
// Only lines with a problem become notices; "Good Service" lines are not news.
import { z } from "zod";
import { makeNotice } from "../../domain/build.ts";
import type { Notice } from "../../domain/types.ts";
import type { Adapter } from "../types.ts";

export const TFL = { en: "Transport for London" };
export const TFL_STATUS_PAGE = "https://tfl.gov.uk/tube-dlr-overground/status/";
export const TFL_MODES = "tube,elizabeth-line,dlr,overground,tram";

const Status = z.object({
  statusSeverity: z.number().int(),
  statusSeverityDescription: z.string(),
  reason: z.string().optional(),
  validityPeriods: z.array(z.object({ fromDate: z.string(), toDate: z.string(), isNow: z.boolean().optional() })).default([]),
});
const Line = z.object({ id: z.string().regex(/^[a-z0-9-]+$/), name: z.string(), modeName: z.string(), lineStatuses: z.array(Status) });

/**
 * TfL severities: 10 Good Service, 18 No Issues, 19 Information, 20 Service Closed are not disruptions.
 * Rank (ordering and priority only): 1–6 (suspended, closures, severe delays) → 3; 7–9 (reduced service,
 * bus service, minor delays) → 2; anything else reported with a reason → 1.
 */
const NOT_A_DISRUPTION = new Set([10, 18, 19, 20]);
const rankOf = (sev: number) => (sev <= 6 ? 3 : sev <= 9 ? 2 : 1);

export const tflAdapter: Adapter = async (ctx) => {
  const key = ctx.env.TFL_APP_KEY;
  if (!key) throw new Error("TFL_APP_KEY is not set");
  const url = `https://api.tfl.gov.uk/Line/Mode/${TFL_MODES}/Status?app_key=${encodeURIComponent(key)}`;
  const raw: unknown = JSON.parse(await ctx.get(url));
  if (!Array.isArray(raw)) throw new Error("expected an array of lines");
  const notices: Notice[] = [];
  for (const r of raw) {
    const p = Line.safeParse(r);
    if (!p.success) { ctx.reject(`line: ${p.error.issues[0]?.path.join(".")} ${p.error.issues[0]?.message}`); continue; }
    const line = p.data;
    const bad = line.lineStatuses.filter((s) => !NOT_A_DISRUPTION.has(s.statusSeverity));
    if (!bad.length) continue;
    const worst = bad.reduce((a, b) => (b.statusSeverity < a.statusSeverity ? b : a));
    const descs = [...new Set(bad.sort((a, b) => a.statusSeverity - b.statusSeverity).map((s) => s.statusSeverityDescription))];
    const reason = [...new Set(bad.map((s) => s.reason?.trim()).filter(Boolean))].join("\n\n");
    const from = bad.flatMap((s) => s.validityPeriods.map((v) => Date.parse(v.fromDate))).filter(Number.isFinite).sort((a, b) => a - b)[0];
    const title = `${line.name}: ${descs.join(", ")}`;
    notices.push(makeNotice({
      id: `tfl:${line.id}`,
      locationId: ctx.location.id,
      tz: ctx.location.tz,
      language: "en",
      category: "transport",
      originalTitle: title,
      headline: { en: title },
      body: reason || descs.join(", "),
      publisher: TFL,
      sourceUrl: TFL_STATUS_PAGE,
      sources: [{ sourceId: ctx.source.id, publisher: TFL, url: TFL_STATUS_PAGE, nativeId: line.id, title }],
      lastVerifiedAt: new Date(ctx.now).toISOString(),
      // TfL's validity "to" is the end of the service day, not a forecast of when the problem clears: not used.
      ...(from !== undefined ? { start: { at: new Date(from).toISOString(), precision: "datetime" as const, from: "source-field" as const } } : {}),
      currentWhileListed: true,
      scope: "city",
      areas: [{ label: `${line.name} (${line.modeName})` }],
      severity: { scheme: "tfl", code: String(worst.statusSeverity), label: { en: worst.statusSeverityDescription }, rank: rankOf(worst.statusSeverity) },
      notes: ["live-status"],
      fixture: ctx.fixture,
    }));
  }
  return { notices, fetched: raw.length };
};
