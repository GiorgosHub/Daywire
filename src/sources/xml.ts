// Minimal RSS 2.0 reader for the feeds we use. Not a general XML parser: it reads <item> children only.
import { decodeEntities } from "./html.ts";

export interface RssItem { title: string; link: string; guid: string; description: string; pubDate: string; category: string }

function field(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  if (!m) return "";
  const v = m[1]!.trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(v);
  return cdata ? cdata[1]! : decodeEntities(v);
}

export function parseRss(xml: string): RssItem[] {
  if (!/<rss[\s>]/i.test(xml)) throw new Error("not an RSS document");
  const items: RssItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const x = m[1]!;
    items.push({ title: field(x, "title"), link: field(x, "link"), guid: field(x, "guid"), description: field(x, "description"), pubDate: field(x, "pubDate"), category: field(x, "category") });
  }
  return items;
}
