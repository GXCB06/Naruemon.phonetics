import { GRID_STEP } from "./contour.ts";
import type { Contour } from "./types.ts";

/** Chart geometry shared by the drawing canvas and the result chart (SVG user units). */
export const CHART = { width: 1000, height: 300, padTop: 24, padBottom: 24 };

/** y coordinate of a (continuous) pitch level. Level 4 at the top, level 1 at the bottom. */
export function levelToY(level: number): number {
  const { height, padTop, padBottom } = CHART;
  const span = height - padTop - padBottom;
  return padTop + ((4.5 - level) / 4) * span;
}

export function yToLevel(y: number): number {
  const { height, padTop, padBottom } = CHART;
  const span = height - padTop - padBottom;
  return 4.5 - ((y - padTop) / span) * 4;
}

export interface StrokePoint {
  x: number; // chart units 0..CHART.width
  y: number; // chart units
}

/**
 * Turn one or more pen strokes into a contour on the sentence's 0..1 time axis.
 * Inside a stroke the line is continuous (points are sorted left-to-right and interpolated).
 * Where no stroke covers a point in time — e.g. the pen was lifted at a comma — the value is null.
 * Where strokes overlap, their values are averaged.
 */
export function strokesToContour(strokes: StrokePoint[][], opts: { snap?: boolean } = {}): Contour {
  const perStroke = strokes
    .map((s) =>
      s
        .map((p) => ({ t: p.x / CHART.width, v: clampLevel(yToLevel(p.y)) }))
        .filter((p) => p.t >= 0 && p.t <= 1)
        .sort((a, b) => a.t - b.t),
    )
    .filter((s) => s.length >= 2);
  const out: Contour = [];
  for (let t = 0; t <= 1 + 1e-9; t += GRID_STEP) {
    let sum = 0;
    let n = 0;
    for (const pts of perStroke) {
      if (t < pts[0].t || t > pts[pts.length - 1].t) continue;
      let i = 0;
      while (i < pts.length - 2 && pts[i + 1].t < t) i++;
      const a = pts[i];
      const b = pts[i + 1];
      const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      sum += a.v + f * (b.v - a.v);
      n++;
    }
    let v: number | null = n ? sum / n : null;
    if (v !== null && opts.snap) v = Math.round(v);
    out.push({ t: Math.round(t * 1e6) / 1e6, v });
  }
  return out;
}

function clampLevel(v: number): number {
  return Math.min(4.4, Math.max(0.6, v));
}
