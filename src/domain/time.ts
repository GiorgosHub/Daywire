// Time zone helpers without a library. Announcements give local wall-clock times ("09:00" in Larissa);
// we store instants in UTC and do all day arithmetic in the city's zone (Europe/Athens, with its DST rules).

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export interface Wall { y: number; m: number; d: number; hh: number; mm: number; weekday: number }

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The wall-clock reading of an instant in a zone. */
export function wallAt(ms: number, tz: string): Wall {
  const p: Record<string, string> = {};
  for (const x of partsFormatter(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
  return { y: +p.year!, m: +p.month!, d: +p.day!, hh: +p.hour! % 24, mm: +p.minute!, weekday: WD[p.weekday!] ?? 0 };
}

/** Offset of the zone from UTC at an instant, in minutes (Athens: +120 in winter, +180 in summer). */
export function offsetMinutes(ms: number, tz: string): number {
  const w = wallAt(ms, tz);
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm);
  return Math.round((asUtc - Math.floor(ms / 60000) * 60000) / 60000);
}

/** The instant at which the zone's clocks read y-m-d hh:mm. */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - offsetMinutes(guess, tz) * 60000;
  // second pass settles DST transitions
  t = guess - offsetMinutes(t, tz) * 60000;
  return t;
}

export const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Local calendar date (YYYY-MM-DD) of an instant in a zone. */
export function localDate(ms: number, tz: string): string {
  const w = wallAt(ms, tz);
  return ymd(w.y, w.m, w.d);
}

/** Start (inclusive) and end (exclusive) instants of a local date. */
export function dayBounds(date: string, tz: string): [number, number] {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const start = zonedToUtc(y, m, d, 0, 0, tz);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const end = zonedToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, tz);
  return [start, end];
}

/** Weekday (0 = Sunday) of a calendar date; calendar weekdays do not depend on the zone. */
export function weekdayOf(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const DAY = 86_400_000;
export const HOUR = 3_600_000;
