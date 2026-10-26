// Interface language (Greek by default) and date formatting in the city's time zone.
import type { Text2, TimePoint } from "../domain/types.ts";

export type Lang = "el" | "en";
let lang: Lang = "el";
export const getLang = () => lang;
export function setLang(l: Lang) {
  lang = l;
  document.documentElement.lang = l;
}

/** Pick the string for the current language. */
export const t = (el: string, en: string) => (lang === "el" ? el : en);
export const tx = (x: Text2) => (lang === "el" ? x.el : x.en);

const TZ = "Europe/Athens";
const loc = () => (lang === "el" ? "el-GR" : "en-GB");
const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(loc(), { timeZone: TZ, ...o });

/** "Δευ 26 Οκτ" */
export function dayLabel(ms: number): string {
  return f({ weekday: "short", day: "numeric", month: "short" }).format(ms).replace(/\./g, "").replace(",", "");
}
/** "14:05" */
export function clock(ms: number): string {
  return f({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
}
/** "Δευ 26 Οκτ, 14:05" */
export function dayClock(ms: number): string {
  return `${dayLabel(ms)}, ${clock(ms)}`;
}
export function localDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

function tpMs(tp: TimePoint): number {
  return tp.precision === "datetime" ? Date.parse(tp.at) : Date.parse(tp.at + "T12:00:00Z");
}

/** Human time range for a notice. Date-only points never get a made-up time. */
export function rangeLabel(start?: TimePoint, end?: TimePoint): string | undefined {
  if (!start && !end) return undefined;
  if (start && !end) return start.precision === "date" ? t(`Από ${dayLabel(tpMs(start))}`, `From ${dayLabel(tpMs(start))}`) : t(`Από ${dayClock(tpMs(start))}`, `From ${dayClock(tpMs(start))}`);
  if (!start && end) return t(`Έως ${end.precision === "date" ? dayLabel(tpMs(end)) : dayClock(tpMs(end))}`, `Until ${end.precision === "date" ? dayLabel(tpMs(end)) : dayClock(tpMs(end))}`);
  const s = start!, e = end!;
  const sameDay = (s.precision === "date" ? s.at : localDay(tpMs(s))) === (e.precision === "date" ? e.at : localDay(tpMs(e)));
  if (s.precision === "date" && e.precision === "date") return sameDay ? t(`${dayLabel(tpMs(s))} · όλη την ημέρα`, `${dayLabel(tpMs(s))} · all day`) : `${dayLabel(tpMs(s))} – ${dayLabel(tpMs(e))}`;
  if (sameDay) return `${dayLabel(tpMs(s))} · ${s.precision === "datetime" ? clock(tpMs(s)) : ""}–${e.precision === "datetime" ? clock(tpMs(e)) : ""}`;
  return `${s.precision === "datetime" ? dayClock(tpMs(s)) : dayLabel(tpMs(s))} → ${e.precision === "datetime" ? dayClock(tpMs(e)) : dayLabel(tpMs(e))}`;
}

/** "σε 3 ώρες", "πριν από 20 λεπτά" */
export function relative(ms: number, now: number): string {
  const d = ms - now, a = Math.abs(d);
  const min = Math.round(a / 60000), hr = Math.round(a / 3600000), day = Math.round(a / 86400000);
  const rtf = new Intl.RelativeTimeFormat(loc(), { numeric: "auto" });
  if (min < 1) return t("μόλις τώρα", "just now");
  if (min < 60) return rtf.format(Math.sign(d) * min, "minute");
  if (hr < 36) return rtf.format(Math.sign(d) * hr, "hour");
  return rtf.format(Math.sign(d) * day, "day");
}
