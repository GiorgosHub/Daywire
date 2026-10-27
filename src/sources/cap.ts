// A small reader for CAP 1.2 alerts (OASIS Common Alerting Protocol) embedded in Atom feeds or served as files.
// Not a general XML parser: it reads the CAP elements we use, with or without a namespace prefix, and keeps every
// value exactly as published (entities decoded). Areas keep their polygons so callers can test the city's point.
import { capPolygon, type Ring } from "./geo.ts";
import { decodeEntities } from "./html.ts";

export interface CapArea { areaDesc: string; polygons: Ring[]; geocodes: { valueName: string; value: string }[] }
export interface CapInfo {
  language: string; category: string; event: string; urgency: string; severity: string; certainty: string;
  onset?: string; effective?: string; expires?: string; senderName?: string;
  headline: string; description: string; instruction?: string; web?: string;
  parameters: { valueName: string; value: string }[]; areas: CapArea[];
}
export interface CapAlert { identifier: string; sender: string; sent: string; status: string; msgType: string; scope: string; infos: CapInfo[] }

const P = "(?:[A-Za-z0-9_]+:)?"; // optional namespace prefix

function all(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${P}${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${P}${tag}>`, "g"))].map((m) => m[1]!);
}
function one(xml: string, tag: string): string | undefined {
  const v = all(xml, tag)[0];
  if (v === undefined) return undefined;
  const t = v.trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(t);
  return cdata ? cdata[1]! : decodeEntities(t);
}
const pairs = (xml: string, tag: string) =>
  all(xml, tag).map((x) => ({ valueName: one(x, "valueName") ?? "", value: one(x, "value") ?? "" }));

/** Strip nested <area>/<parameter> blocks before reading an <info>'s own fields, so `description` is never an area's. */
function own(xml: string): string {
  return xml.replace(new RegExp(`<${P}area(?:\\s[^>]*)?>[\\s\\S]*?</${P}area>`, "g"), "");
}

export function parseCap(xml: string): CapAlert[] {
  return all(xml, "alert").map((a) => {
    const head = a.replace(new RegExp(`<${P}info(?:\\s[^>]*)?>[\\s\\S]*?</${P}info>`, "g"), "");
    const infos = all(a, "info").map((i): CapInfo => {
      const f = own(i);
      const opt = (k: string) => { const v = one(f, k); return v ? v : undefined; };
      return {
        language: one(f, "language") ?? "en", category: one(f, "category") ?? "", event: one(f, "event") ?? "",
        urgency: one(f, "urgency") ?? "", severity: one(f, "severity") ?? "", certainty: one(f, "certainty") ?? "",
        onset: opt("onset"), effective: opt("effective"), expires: opt("expires"), senderName: opt("senderName"),
        headline: one(f, "headline") ?? "", description: one(f, "description") ?? "", instruction: opt("instruction"), web: opt("web"),
        parameters: pairs(f, "parameter"),
        areas: all(i, "area").map((ar) => ({ areaDesc: one(ar, "areaDesc") ?? "", polygons: all(ar, "polygon").map((p) => capPolygon(decodeEntities(p))), geocodes: pairs(ar, "geocode") })),
      };
    });
    return {
      identifier: one(head, "identifier") ?? "", sender: one(head, "sender") ?? "", sent: one(head, "sent") ?? "",
      status: one(head, "status") ?? "", msgType: one(head, "msgType") ?? "", scope: one(head, "scope") ?? "", infos,
    };
  });
}

/** CAP severity → rank, as for NWS (docs/data-model.md). */
export const CAP_RANK: Record<string, number> = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1 };
