import { gpx as gpxToGeoJson } from '@tmcw/togeojson';

export interface TrackPoint {
  lat: number;
  lon: number;
  ele: number | null;
  /** kumulierte Strecke in Metern */
  dist: number;
}

export interface ParsedRoute {
  points: TrackPoint[];
  distance: number;
  ascent: number;
  descent: number;
  minEle: number | null;
  maxEle: number | null;
}

export type ColorMode = 'ele' | 'slope';

export function looksLikeGpx(text: string): boolean {
  return /<gpx[\s>]/i.test(text.slice(0, 2000)) || /<gpx[\s>]/i.test(text);
}

function haversine(a: TrackPoint, b: { lat: number; lon: number }): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function parseGpx(text: string): ParsedRoute {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Ungültige GPX-Datei');

  const geo = gpxToGeoJson(doc);
  const lines: number[][][] = [];
  for (const f of geo.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'LineString') lines.push(g.coordinates);
    else if (g.type === 'MultiLineString') lines.push(...g.coordinates);
  }
  if (!lines.length) throw new Error('Die Datei enthält keinen Track und keine Route');

  const points: TrackPoint[] = [];
  let dist = 0;
  for (const c of lines.flat()) {
    const p: TrackPoint = {
      lon: c[0],
      lat: c[1],
      ele: Number.isFinite(c[2]) ? c[2] : null,
      dist: 0,
    };
    const prev = points[points.length - 1];
    if (prev) dist += haversine(prev, p);
    p.dist = dist;
    points.push(p);
  }

  const hasEle = points.every((p) => p.ele !== null);
  const smooth = hasEle ? smoothElevation(points) : [];
  let ascent = 0;
  let descent = 0;
  for (let i = 1; i < smooth.length; i++) {
    const d = smooth[i] - smooth[i - 1];
    if (d > 0) ascent += d;
    else descent -= d;
  }
  return {
    points,
    distance: dist,
    ascent: Math.round(ascent),
    descent: Math.round(descent),
    minEle: hasEle ? Math.min(...smooth) : null,
    maxEle: hasEle ? Math.max(...smooth) : null,
  };
}

/** Gleitender Mittelwert über ca. 40 m, damit GPS-Rauschen die Höhenmeter nicht aufbläht. */
function smoothElevation(points: TrackPoint[], window = 40): number[] {
  const out: number[] = new Array(points.length);
  let lo = 0;
  let hi = 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    while (hi < points.length && points[hi].dist - points[i].dist <= window / 2) sum += points[hi++].ele!;
    while (points[i].dist - points[lo].dist > window / 2) sum -= points[lo++].ele!;
    out[i] = sum / (hi - lo);
  }
  return out;
}

// ---- Farbcodierung -------------------------------------------------------

type Stop = [number, string];

export const ELE_RAMP: Stop[] = [
  [0, '#2d6a9f'],
  [0.35, '#3fae8a'],
  [0.65, '#f1c93b'],
  [1, '#e4572e'],
];
export const SLOPE_RAMP: Stop[] = [
  [0, '#2b6cb0'],
  [0.5, '#f4d35e'],
  [1, '#d7263d'],
];
/** Steigung in %, die den Enden der Skala entspricht */
export const SLOPE_RANGE = 10;

function hex(c: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
}

export function rampColor(ramp: Stop[], t: number): string {
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < ramp.length; i++) {
    if (t <= ramp[i][0]) {
      const [t0, c0] = ramp[i - 1];
      const [t1, c1] = ramp[i];
      const f = (t - t0) / (t1 - t0);
      const a = hex(c0);
      const b = hex(c1);
      return '#' + a.map((v, k) => Math.round(v + (b[k] - v) * f).toString(16).padStart(2, '0')).join('');
    }
  }
  return ramp[ramp.length - 1][1];
}

export function rampCss(ramp: Stop[]): string {
  return `linear-gradient(90deg, ${ramp.map(([t, c]) => `${c} ${t * 100}%`).join(', ')})`;
}

export interface Segment {
  from: [number, number];
  to: [number, number];
  color: string;
}

/** Zerlegt die Route in farbige Segmente (max. ~maxSegments, damit die Karte flüssig bleibt). */
export function colorSegments(route: ParsedRoute, mode: ColorMode, maxSegments = 2500): Segment[] {
  const pts = route.points;
  if (pts.length < 2) return [];
  const step = Math.max(1, Math.ceil((pts.length - 1) / maxSegments));
  const idx: number[] = [];
  for (let i = 0; i < pts.length - 1; i += step) idx.push(i);
  idx.push(pts.length - 1);

  const hasEle = route.minEle !== null && route.maxEle !== null;
  const span = hasEle ? Math.max(1, route.maxEle! - route.minEle!) : 1;
  const sm = hasEle ? smoothElevation(pts) : [];

  const slopeAt = (i: number): number => {
    const w = 150;
    let a = i;
    let b = i;
    while (a > 0 && pts[i].dist - pts[a].dist < w / 2) a--;
    while (b < pts.length - 1 && pts[b].dist - pts[i].dist < w / 2) b++;
    const d = pts[b].dist - pts[a].dist;
    return d > 0 ? ((sm[b] - sm[a]) / d) * 100 : 0;
  };

  const segs: Segment[] = [];
  for (let k = 1; k < idx.length; k++) {
    const a = pts[idx[k - 1]];
    const b = pts[idx[k]];
    let color = '#0e6b7a';
    if (hasEle) {
      const mid = Math.round((idx[k - 1] + idx[k]) / 2);
      color =
        mode === 'ele'
          ? rampColor(ELE_RAMP, (sm[mid] - route.minEle!) / span)
          : rampColor(SLOPE_RAMP, (slopeAt(mid) + SLOPE_RANGE) / (2 * SLOPE_RANGE));
    }
    segs.push({ from: [a.lat, a.lon], to: [b.lat, b.lon], color });
  }
  return segs;
}
