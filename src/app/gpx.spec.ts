import { ELE_RAMP, colorSegments, looksLikeGpx, parseGpx, rampColor } from './gpx';

function gpx(points: [number, number, number | null][], kind: 'trk' | 'rte' = 'trk'): string {
  const pt = (p: [number, number, number | null]) =>
    kind === 'trk'
      ? `<trkpt lat="${p[0]}" lon="${p[1]}">${p[2] === null ? '' : `<ele>${p[2]}</ele>`}</trkpt>`
      : `<rtept lat="${p[0]}" lon="${p[1]}">${p[2] === null ? '' : `<ele>${p[2]}</ele>`}</rtept>`;
  const body = points.map(pt).join('');
  return `<?xml version="1.0"?><gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">${
    kind === 'trk' ? `<trk><trkseg>${body}</trkseg></trk>` : `<rte>${body}</rte>`
  }</gpx>`;
}

// ~111 m pro 0,001° Breite; Anstieg 0 -> 100 m auf ca. 1,1 km
const climb: [number, number, number][] = Array.from({ length: 11 }, (_, i) => [52 + i * 0.001, 13, i * 10]);

describe('parseGpx', () => {
  it('liest Strecke und Höhenmeter', () => {
    const r = parseGpx(gpx(climb));
    expect(r.points.length).toBe(11);
    expect(r.distance).toBeGreaterThan(1090);
    expect(r.distance).toBeLessThan(1130);
    expect(r.ascent).toBeGreaterThan(60);
    expect(r.descent).toBe(0);
    expect(r.minEle).toBeLessThan(r.maxEle!);
  });

  it('liest auch Routen (rte) und Dateien ohne Höhe', () => {
    const r = parseGpx(gpx(climb.map(([a, b]) => [a, b, null] as [number, number, null]), 'rte'));
    expect(r.points.length).toBe(11);
    expect(r.minEle).toBeNull();
    expect(r.ascent).toBe(0);
  });

  it('wirft bei defekten oder leeren Dateien', () => {
    expect(() => parseGpx('<gpx><trk>')).toThrow();
    expect(() => parseGpx('<gpx xmlns="http://www.topografix.com/GPX/1/1"></gpx>')).toThrow();
  });

  it('erkennt GPX am Inhalt', () => {
    expect(looksLikeGpx(gpx(climb))).toBe(true);
    expect(looksLikeGpx('{"type":"FeatureCollection"}')).toBe(false);
  });
});

describe('colorSegments', () => {
  it('färbt nach Höhe von tief nach hoch', () => {
    const segs = colorSegments(parseGpx(gpx(climb)), 'ele');
    expect(segs.length).toBe(10);
    expect(segs[0].color).not.toBe(segs[9].color);
  });

  it('begrenzt die Segmentzahl', () => {
    const many: [number, number, number][] = Array.from({ length: 10000 }, (_, i) => [52 + i * 0.00001, 13, i % 50]);
    expect(colorSegments(parseGpx(gpx(many)), 'ele', 500).length).toBeLessThanOrEqual(501);
  });

  it('färbt Steigung: bergauf anders als bergab', () => {
    const up = colorSegments(parseGpx(gpx(climb)), 'slope')[5].color;
    const down = colorSegments(parseGpx(gpx([...climb].reverse().map(([a, b, e], i) => [52 + i * 0.001, b, e] as [number, number, number]))), 'slope')[5].color;
    expect(up).not.toBe(down);
  });

  it('nutzt Rampenenden exakt', () => {
    expect(rampColor(ELE_RAMP, 0)).toBe(ELE_RAMP[0][1]);
    expect(rampColor(ELE_RAMP, 1)).toBe(ELE_RAMP[ELE_RAMP.length - 1][1]);
  });
});
