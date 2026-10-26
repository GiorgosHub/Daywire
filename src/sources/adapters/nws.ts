// United States: active alerts from the National Weather Service API for the location's point
// (GET https://api.weather.gov/alerts/active?point=lat,lon). Severity is the CAP severity NWS assigns.
import { z } from "zod";
import { makeNotice } from "../../domain/build.ts";
import type { Category, Notice } from "../../domain/types.ts";
import type { Adapter } from "../types.ts";

const Props = z.object({
  id: z.string(),
  "@id": z.string().url(),
  areaDesc: z.string(),
  sent: z.string(),
  effective: z.string().optional(),
  onset: z.string().nullable().optional(),
  expires: z.string(),
  ends: z.string().nullable().optional(),
  status: z.string(),
  messageType: z.string(),
  category: z.string(),
  severity: z.string(),
  event: z.string(),
  senderName: z.string(),
  headline: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  instruction: z.string().nullable().optional(),
});
const Collection = z.object({ features: z.array(z.object({ properties: z.unknown() })) });

const CAP_RANK: Record<string, number> = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1 };
const CAP_CATEGORY: Record<string, Category> = { Met: "weather", Env: "weather", Transport: "transport", Infra: "services" };

const tidy = (s: string) => s.replace(/\r/g, "").replace(/([^\n])\n(?!\n|\* |- )/g, "$1 ").trim();

export const nwsAdapter: Adapter = async (ctx) => {
  const { lat, lon } = ctx.location;
  const url = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
  const col = Collection.parse(JSON.parse(await ctx.get(url, { accept: "application/geo+json" })));
  const notices: Notice[] = [];
  for (const f of col.features) {
    const p = Props.safeParse(f.properties);
    if (!p.success) { ctx.reject(`alert: ${p.error.issues[0]?.path.join(".")} ${p.error.issues[0]?.message}`); continue; }
    const a = p.data;
    if (a.status !== "Actual" || a.messageType === "Cancel") continue;
    const publisher = { en: a.senderName };
    const rank = CAP_RANK[a.severity];
    const start = a.onset ?? a.effective;
    const end = a.ends ?? a.expires;
    notices.push(makeNotice({
      id: `nws:${a.id}`,
      locationId: ctx.location.id,
      tz: ctx.location.tz,
      language: "en",
      category: CAP_CATEGORY[a.category] ?? "emergency",
      originalTitle: a.headline ?? a.event,
      headline: { en: a.event },
      body: tidy(a.description ?? ""),
      publisher,
      sourceUrl: a["@id"],
      sources: [{ sourceId: ctx.source.id, publisher, url: a["@id"], nativeId: a.id, title: a.headline ?? a.event, publishedAt: new Date(a.sent).toISOString() }],
      publishedAt: new Date(a.sent).toISOString(),
      lastVerifiedAt: new Date(ctx.now).toISOString(),
      ...(start ? { start: { at: new Date(start).toISOString(), precision: "datetime" as const, from: "source-field" as const } } : {}),
      end: { at: new Date(end).toISOString(), precision: "datetime", from: "source-field" },
      endKind: "validity",
      currentWhileListed: true,
      scope: "region",
      regionLabel: { en: a.areaDesc },
      ...(rank ? { severity: { scheme: "cap" as const, code: a.severity, label: { en: a.severity }, rank } } : {}),
      ...(a.instruction ? { action: tidy(a.instruction) } : {}),
      notes: ["official-alert-record"],
      fixture: ctx.fixture,
    }));
  }
  return { notices, fetched: col.features.length };
};
