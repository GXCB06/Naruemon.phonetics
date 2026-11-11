// Vertical geometry of one drawing row (src/components/learn/TuneCanvas.tsx). Pure.
//
// Why this exists: the level lines used to be spaced by the font size alone, so on a phone (small font) levels 1 and 2 were
// only about 6 px apart, less than a fingertip, and the rows sat too close to tell apart. Now every gap has a floor in real
// pixels, and the space between rows is set so that two rows never touch.

export interface RowMetrics {
  /** Level lines, in px from the baseline of the words (negative = above the words). */
  y: Record<1 | 2 | 3 | 4, number>;
  /** Padding above and below the words in each row, so the level band fits inside its row. */
  padTop: number;
  padBottom: number;
  /** Empty space between the bottom of one row's band (level 1) and the top of the next (level 4). */
  rowGap: number;
}

/** Smallest distance between neighbouring level lines. A fingertip is wider than this, but a Pencil tip or a thumb can hit it. */
export const MIN_LEVEL_GAP = 26;
/** Smallest empty space between two rows. */
export const MIN_ROW_GAP = 30;
/** Where the baseline sits in a line box of height 1em: about 83% from the top (Nunito, line-height 1). */
const BASELINE_FROM_TOP = 0.83;

/** `capRatio`: cap height as a fraction of the font size (0.7 for Nunito). */
export function rowMetrics(fs: number, capRatio = 0.7): RowMetrics {
  const y2 = 0.15 * fs;
  // textbook notation: 3 slightly above the word's capital height; at small sizes keep 2→3 a clear step too
  const y3 = Math.min(-(capRatio * fs + 0.16 * fs), y2 - 1.35 * MIN_LEVEL_GAP);
  const y1 = y2 + Math.max(0.27 * fs, MIN_LEVEL_GAP);
  const y4 = y3 - Math.max(0.34 * fs, MIN_LEVEL_GAP);
  const rowGap = Math.max(0.5 * fs, MIN_ROW_GAP);
  // space needed above the baseline for level 4 (and below it for level 1), plus half the row gap on each side
  const padTop = Math.max(0, -y4 + rowGap / 2 - BASELINE_FROM_TOP * fs);
  const padBottom = Math.max(0, y1 + rowGap / 2 - (1 - BASELINE_FROM_TOP) * fs);
  return { y: { 1: y1, 2: y2, 3: y3, 4: y4 }, padTop, padBottom, rowGap };
}
