// Localization: message catalogs per language (English is the reference catalog every other one must match, so a
// missing string is a type error), plus date, time and number formatting in a given IANA time zone.
// Add a language: create xx.ts typed `Messages`, register it in LANGS. Formatting follows the language's locale.
import { pick } from "../../domain/ltext.ts";
import type { LText, TimePoint } from "../../domain/types.ts";
import { el } from "./el.ts";
import { en, type Messages } from "./en.ts";

export const LANGS = {
  el: { label: "Ελληνικά", locale: "el-GR", messages: el },
  en: { label: "English", locale: "en-GB", messages: en },
} satisfies Record<string, { label: string; locale: string; messages: Messages }>;
export type Lang = keyof typeof LANGS;
export const isLang = (x: unknown): x is Lang => typeof x === "string" && x in LANGS;

let lang: Lang = "el";
export const getLang = () => lang;
export function setLang(l: Lang): void {
  lang = l;
  document.documentElement.lang = l;
}
/** The active catalog. */
export const M = (): Messages => LANGS[lang].messages;
/** Data-level text (source names, place names) in the active language, falling back to English. */
export const tx = (t: LText | undefined) => pick(t, lang);
export const locale = () => LANGS[lang].locale;

export const viewerTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } };

const cache = new Map<string, Intl.DateTimeFormat>();
function f(tz: string, o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = `${locale()}|${tz}|${JSON.stringify(o)}`;
  let x = cache.get(k);
  if (!x) { x = new Intl.DateTimeFormat(locale(), { timeZone: tz, ...o }); cache.set(k, x); }
  return x;
}

/** "Mon 26 Oct" in the given zone. */
export function dayLabel(ms: number, tz: string): string {
  return f(tz, { weekday: "short", day: "numeric", month: "short" }).format(ms).replace(/\./g, "").replace(",", "");
}
/** "14:05", plus the zone's short name when it differs from the viewer's own zone ("14:05 GMT"). */
export function clock(ms: number, tz: string): string {
  const t = f(tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
  return tz === viewerTz() ? t : `${t} ${zoneName(ms, tz)}`;
}
export function zoneName(ms: number, tz: string): string {
  return f(tz, { timeZoneName: "short" }).formatToParts(ms).find((p) => p.type === "timeZoneName")?.value ?? tz;
}
export function dayClock(ms: number, tz: string): string {
  return `${dayLabel(ms, tz)}, ${clock(ms, tz)}`;
}
export function localDay(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}
export const num = (n: number) => new Intl.NumberFormat(locale()).format(n);

function tpMs(tp: TimePoint): number {
  return tp.precision === "datetime" ? Date.parse(tp.at) : Date.parse(tp.at + "T12:00:00Z");
}

/** Human time range for a notice in its zone. Date-only points never get a made-up time. */
export function rangeLabel(start: TimePoint | undefined, end: TimePoint | undefined, tz: string): string | undefined {
  const m = M();
  const pt = (p: TimePoint) => (p.precision === "date" ? dayLabel(tpMs(p), "UTC") : dayClock(tpMs(p), tz));
  if (!start && !end) return undefined;
  if (start && !end) return m.from(pt(start));
  if (!start && end) return m.until(pt(end));
  const s = start!, e = end!;
  const sd = s.precision === "date" ? s.at : localDay(tpMs(s), tz);
  const ed = e.precision === "date" ? e.at : localDay(tpMs(e), tz);
  if (s.precision === "date" && e.precision === "date") return sd === ed ? m.allDay(dayLabel(tpMs(s), "UTC")) : `${dayLabel(tpMs(s), "UTC")} – ${dayLabel(tpMs(e), "UTC")}`;
  if (sd === ed && s.precision === "datetime" && e.precision === "datetime") {
    const a = f(tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(tpMs(s));
    return `${dayLabel(tpMs(s), tz)} · ${a}–${clock(tpMs(e), tz)}`;
  }
  return `${pt(s)} → ${pt(e)}`;
}

/** "in 3 hours", "20 minutes ago" */
export function relative(ms: number, now: number): string {
  const d = ms - now, a = Math.abs(d);
  const min = Math.round(a / 60000), hr = Math.round(a / 3600000), day = Math.round(a / 86400000);
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
  if (min < 1) return M().justNow;
  if (min < 60) return rtf.format(Math.sign(d) * min, "minute");
  if (hr < 36) return rtf.format(Math.sign(d) * hr, "hour");
  return rtf.format(Math.sign(d) * day, "day");
}

/** Plural selection per the language's rules. */
export function plural(n: number, forms: { one: string; other: string }): string {
  return new Intl.PluralRules(locale()).select(n) === "one" ? forms.one : forms.other;
}
