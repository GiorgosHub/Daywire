// Sunrise, sunset and the sun's altitude for a place, from the standard sunrise equation (about ±2 minutes, which is
// plenty for shading the day line). Used by "today's wire" and to set the hero's light; never shown as a fact
// beyond "daylight".
const RAD = Math.PI / 180;
const J2000 = 2451545;
const toJulian = (ms: number) => ms / 86400000 + 2440587.5;
const fromJulian = (j: number) => (j - 2440587.5) * 86400000;

interface SolarDay { transit: number; decl: number; omega0: number | null; polar?: "day" | "night" }

function solarDay(ymdNoonUtcMs: number, lat: number, lon: number): SolarDay {
  const n = Math.round(toJulian(ymdNoonUtcMs) - J2000 + 0.0008);
  const jStar = n - lon / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const transit = J2000 + jStar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const decl = Math.asin(Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD));
  const cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(decl)) / (Math.cos(lat * RAD) * Math.cos(decl));
  if (cosW > 1) return { transit, decl, omega0: null, polar: "night" };
  if (cosW < -1) return { transit, decl, omega0: null, polar: "day" };
  return { transit, decl, omega0: Math.acos(cosW) / RAD };
}

/** Sunrise and sunset (UTC ms) for a local calendar date "YYYY-MM-DD". Polar day/night have no rise or set. */
export function sunTimes(localDate: string, lat: number, lon: number): { rise?: number; set?: number; polar?: "day" | "night" } {
  const noon = Date.parse(`${localDate}T12:00:00Z`);
  const d = solarDay(noon, lat, lon);
  if (d.omega0 === null) return { polar: d.polar! };
  return { rise: fromJulian(d.transit - d.omega0 / 360), set: fromJulian(d.transit + d.omega0 / 360) };
}

/** The sun's altitude in degrees at an instant (negative below the horizon). */
export function sunAltitude(ms: number, lat: number, lon: number): number {
  const d = solarDay(ms, lat, lon);
  const H = (toJulian(ms) - d.transit) * 360 * RAD;
  return Math.asin(Math.sin(lat * RAD) * Math.sin(d.decl) + Math.cos(lat * RAD) * Math.cos(d.decl) * Math.cos(H)) / RAD;
}
