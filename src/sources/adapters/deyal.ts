// ΔΕΥΑΛ (Larissa water utility): planned interruptions from its Joomla K2 RSS feed.
import { excerpt, makeNotice } from "../../domain/build.ts";
import { actionSentence, addArea, envelope, extractWater } from "../../domain/extract.ts";
import type { Notice } from "../../domain/types.ts";
import { htmlToText } from "../html.ts";
import { parseRss } from "../xml.ts";
import type { Adapter } from "../types.ts";

export const DEYAL_PUBLISHER = { en: "DEYAL (Larissa water utility)", el: "ΔΕΥΑΛ" };

export const deyalAdapter: Adapter = async (ctx) => {
  const xml = await ctx.get(ctx.source.endpoint!);
  const items = parseRss(xml);
  const city = { geonameId: ctx.location.geonameId, tz: ctx.location.tz };
  const notices: Notice[] = [];
  for (const it of items) {
    const url = it.link || it.guid;
    const nativeId = /item\/(\d+)/.exec(url)?.[1] ?? url;
    const publishedMs = Date.parse(it.pubDate);
    if (!url.startsWith("https://deyal.gr/") || !Number.isFinite(publishedMs)) { ctx.reject(`item ${nativeId}: missing link or date`); continue; }
    // the K2 feed wraps an image and the intro text; keep the text only
    const intro = /K2FeedIntroText">([\s\S]*)<\/div>\s*$/.exec(it.description)?.[1] ?? it.description;
    const text = htmlToText(intro).replace(/^ΑΝΑΚΟΙΝΩΣΗ ΔΙΑΚΟΠΗΣ ΝΕΡΟΥ\n?/u, "");
    const { segments, notes } = extractWater(text, publishedMs, city);
    const areas = segments.flatMap((s) => s.areas).reduce<Notice["areas"]>((acc, a) => (addArea(acc, a.label, city), acc), []);
    const env = envelope(segments);
    const publishedAt = new Date(publishedMs).toISOString();
    notices.push(makeNotice({
      id: `deyal-water:${nativeId}`,
      locationId: ctx.location.id,
      tz: ctx.location.tz,
      language: "el",
      category: "water",
      originalTitle: it.title,
      body: excerpt(text.replace(/\n?Ο Αντιπρόεδρος[\s\S]*$/u, "")),
      publisher: DEYAL_PUBLISHER,
      sourceUrl: url,
      sources: [{ sourceId: ctx.source.id, publisher: DEYAL_PUBLISHER, url, nativeId, title: it.title, publishedAt }],
      publishedAt,
      lastVerifiedAt: new Date(ctx.now).toISOString(),
      ...env,
      ...(env.end ? { endKind: "event" as const } : {}),
      scope: areas.length || segments.some((s) => s.streets.length) ? "area" : "unspecified",
      areas,
      segments,
      ...(actionSentence(text) ? { action: actionSentence(text)! } : {}),
      notes,
      fixture: ctx.fixture,
    }));
  }
  return { notices, fetched: items.length };
};
