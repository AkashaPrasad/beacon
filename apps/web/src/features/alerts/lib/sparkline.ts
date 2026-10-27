/** Tiny sparkline geometry (pure). Values → an SVG polyline path inside `width × height`. */

export interface SparklineGeometry {
  path: string;
  /** Closed area path for the soft fill under the line. */
  area: string;
  last: { x: number; y: number } | null;
  max: number;
  total: number;
}

export function sparkline(values: readonly number[], width: number, height: number, pad = 1.5): SparklineGeometry {
  const clean = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...clean);
  if (clean.length === 0) return { path: '', area: '', last: null, max, total };
  const step = clean.length > 1 ? (width - pad * 2) / (clean.length - 1) : 0;
  const pts = clean.map((v, i) => {
    const x = clean.length > 1 ? pad + i * step : width / 2;
    const y = height - pad - (v / max) * (height - pad * 2);
    return { x: round(x), y: round(y) };
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  const first = pts[0];
  const lastPt = pts[pts.length - 1] ?? null;
  const area =
    first && lastPt ? `${path} L${lastPt.x} ${height - pad} L${first.x} ${height - pad} Z` : '';
  return { path, area, last: lastPt, max, total };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Deterministic weekly counts for a rule when the API has no history yet (fixture/demo). */
export function syntheticWeek(seed: string, scale = 4): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: 7 }, (_, i) => {
    h = Math.imul(h ^ (i + 1), 2654435761);
    return Math.abs(h % (scale + 1));
  });
}
