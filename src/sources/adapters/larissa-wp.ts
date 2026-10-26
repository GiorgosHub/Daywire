// Δήμος Λαρισαίων: posts from the municipality's public WordPress REST API.
// Category 5 ("Ανακοινώσεις") is kept in full; category 35 ("Δελτία Τύπου") only when a service-impact rule
// matches the title, so ordinary press releases never reach the feed.
import { z } from "zod";
import { excerpt, makeNotice } from "../../domain/build.ts";
import { cityById } from "../../domain/cities.ts";
import { classifyMunicipal } from "../../domain/classify.ts";
import { actionSentence, addArea, envelope, extractWater, findDates, namedStreets, serviceDate, timePoint } from "../../domain/extract.ts";
import { MONTH_PATTERN, WEEKDAY_PATTERN, monthFromGreek } from "../../domain/greek.ts";
import type { AreaRef, Notice, Segment } from "../../domain/types.ts";
import { decodeEntities, htmlToText } from "../html.ts";
import type { Adapter } from "../types.ts";

export const MUNICIPALITY = { el: "Δήμος Λαρισαίων", en: "Municipality of Larissa" };
const ANNOUNCEMENTS = 5;

const WpPost = z.object({
  id: z.number(),
  date_gmt: z.string(),
  modified_gmt: z.string(),
  link: z.string().url(),
  categories: z.array(z.number()),
  title: z.object({ rendered: z.string() }),
  content: z.object({ rendered: z.string() }),
});

export const larissaWpAdapter: Adapter = async (ctx) => {
  const raw: unknown = JSON.parse(await ctx.get(ctx.source.endpoint!));
  if (!Array.isArray(raw)) throw new Error("expected an array of posts");
  const city = cityById(ctx.cityId)!;
  const notices: Notice[] = [];
  for (const r of raw) {
    const p = WpPost.safeParse(r);
    if (!p.success) { ctx.reject(`post ${(r as { id?: unknown })?.id ?? "?"}: ${p.error.issues[0]?.message}`); continue; }
    const post = p.data;
    if (!post.link.startsWith("https://www.larissa.gov.gr/")) { ctx.reject(`post ${post.id}: unexpected link`); continue; }
    const title = decodeEntities(post.title.rendered).replace(/\s+/g, " ").trim();
    const text = htmlToText(post.content.rendered);
    const category = classifyMunicipal(title, text, post.categories.includes(ANNOUNCEMENTS));
    if (!category) continue;

    const publishedMs = Date.parse(post.date_gmt + "Z");
    const modifiedMs = Date.parse(post.modified_gmt + "Z");
    const publishedAt = new Date(publishedMs).toISOString();
    const updatedAt = modifiedMs - publishedMs > 10 * 60_000 ? new Date(modifiedMs).toISOString() : undefined;
    const notes: string[] = [];
    let segments: Segment[] = [];
    const areas: AreaRef[] = [];

    if (category === "water") {
      const w = extractWater(text, publishedMs, ctx.cityId);
      segments = w.segments;
      notes.push(...w.notes, "republication");
      // the title ends with "(Πέμπτη 24/09/2026 – Λάρισα και Γιάννουλη)": the places in the title
      const t = /\(([^()]*?)\s[–-]\s([^()]+)\)\s*$/u.exec(title);
      for (const s of segments) for (const a of s.areas) addArea(areas, a.label, city);
      if (t) for (const label of t[2]!.split(/\s+και\s+|,\s*/u)) addArea(areas, label, city);
    } else if (category === "roads") {
      const streets = namedStreets(title + "\n" + text);
      const dates = findDates(text, publishedMs, city.tz);
      const until = new RegExp(`(?:έως|μέχρι)\\s+(?:και\\s+)?(?:την\\s+|το\\s+)?(?:${WEEKDAY_PATTERN}\\s*,?\\s+)?(\\d{1,2})\\s+(${MONTH_PATTERN})`, "u").exec(text);
      const endDate = until ? dates.find((d) => d.d === Number(until[1]) && d.m === monthFromGreek(until[2]!)) : undefined;
      const startDate = dates.find((d) => d !== endDate);
      segments = [{ areas: [], streets, ...(startDate ? { start: timePoint(startDate, undefined, city.tz) } : {}), ...(endDate ? { end: timePoint(endDate, undefined, city.tz) } : {}) }];
    } else if (category !== "announcement") {
      const d = serviceDate(text, publishedMs, city.tz);
      if (d) segments = [{ areas: [], streets: [], start: timePoint(d, undefined, city.tz), end: timePoint(d, undefined, city.tz) }];
    }

    const env = envelope(segments);
    const streets = segments.flatMap((s) => s.streets);
    const scope: Notice["scope"] = areas.length || streets.length ? "area" : category === "services" ? "city" : "unspecified";
    const action = actionSentence(text);
    notices.push(makeNotice({
      id: `larissa-wp:${post.id}`,
      cityId: ctx.cityId,
      category,
      originalTitle: title,
      body: excerpt(text),
      publisher: MUNICIPALITY,
      sourceUrl: post.link,
      sources: [{ sourceId: ctx.source.id, publisher: MUNICIPALITY, url: post.link, nativeId: String(post.id), title, publishedAt, ...(updatedAt ? { updatedAt } : {}) }],
      publishedAt,
      ...(updatedAt ? { updatedAt } : {}),
      lastVerifiedAt: new Date(ctx.now).toISOString(),
      ...env,
      ...(env.end ? { endKind: "event" as const } : {}),
      scope,
      areas,
      segments,
      ...(action ? { action } : {}),
      notes,
      fixture: ctx.fixture,
    }));
  }
  return { notices, fetched: raw.length };
};
