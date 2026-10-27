// Point-in-area tests for warning areas published as polygons. Coordinates are WGS84 [lon, lat], as in GeoJSON.
// Used to keep only the warnings whose published area contains the city's point; nothing is buffered or guessed.

export type Ring = number[][]; // [[lon, lat], …]
export type Geometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] };

/** Even-odd ray cast. */
export function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if ((yi! > lat) !== (yj! > lat) && lon < ((xj! - xi!) * (lat - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

/** First ring is the outline, the rest are holes. */
export function inPolygon(lon: number, lat: number, rings: Ring[]): boolean {
  if (!rings.length || !inRing(lon, lat, rings[0]!)) return false;
  return !rings.slice(1).some((h) => inRing(lon, lat, h));
}

export function inGeometry(lon: number, lat: number, g: Geometry | null | undefined): boolean {
  if (!g) return false;
  if (g.type === "Polygon") return inPolygon(lon, lat, g.coordinates);
  if (g.type === "MultiPolygon") return g.coordinates.some((p) => inPolygon(lon, lat, p));
  return false;
}

/** CAP 1.2 polygon text: "lat,lon lat,lon …" (note the order) → a GeoJSON ring. */
export function capPolygon(text: string): Ring {
  return text.trim().split(/\s+/).map((pair) => { const [la, lo] = pair.split(",").map(Number); return [lo!, la!]; })
    .filter(([lo, la]) => Number.isFinite(lo) && Number.isFinite(la));
}

// ——— TopoJSON (quantized, delta-encoded arcs), as published by Italy's Civil Protection ———
export interface Topology {
  type: "Topology";
  transform?: { scale: [number, number]; translate: [number, number] };
  arcs: number[][][];
  objects: Record<string, { type: string; geometries: TopoGeometry[] }>;
}
export interface TopoGeometry { type: string; arcs?: unknown; properties?: Record<string, unknown> }

export function topoDecoder(t: Topology): (g: TopoGeometry) => Geometry | null {
  const cache = new Map<number, Ring>();
  const arc = (i: number): Ring => {
    const k = i < 0 ? ~i : i;
    let pts = cache.get(k);
    if (!pts) {
      const raw = t.arcs[k];
      if (!raw) throw new Error(`arc ${k} missing`);
      let x = 0, y = 0;
      pts = raw.map((p) => {
        if (!t.transform) return [p[0]!, p[1]!];
        x += p[0]!; y += p[1]!;
        return [x * t.transform.scale[0] + t.transform.translate[0], y * t.transform.scale[1] + t.transform.translate[1]];
      });
      cache.set(k, pts);
    }
    return i < 0 ? [...pts].reverse() : pts;
  };
  const ring = (ids: number[]): Ring => {
    const out: Ring = [];
    ids.forEach((id, n) => { const a = arc(id); out.push(...(n ? a.slice(1) : a)); });
    return out;
  };
  return (g) => {
    if (g.type === "Polygon") return { type: "Polygon", coordinates: (g.arcs as number[][]).map(ring) };
    if (g.type === "MultiPolygon") return { type: "MultiPolygon", coordinates: (g.arcs as number[][][]).map((p) => p.map(ring)) };
    return null;
  };
}
