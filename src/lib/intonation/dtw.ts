/**
 * Banded dynamic time warping between two 1-D series.
 * Returns the mean absolute difference along the best warping path, so the result is in the
 * same unit as the inputs (pitch levels). A band stops the path from warping wildly.
 */
export function dtwMeanCost(a: number[], b: number[], band = 0.2): number {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return Infinity;
  const w = Math.max(Math.abs(n - m), Math.ceil(band * Math.max(n, m)));
  const INF = Number.POSITIVE_INFINITY;
  // cost[i][j] = accumulated cost; len[i][j] = path length (to turn the sum into a mean)
  const cost: Float64Array[] = [];
  const len: Int32Array[] = [];
  for (let i = 0; i <= n; i++) {
    cost.push(new Float64Array(m + 1).fill(INF));
    len.push(new Int32Array(m + 1));
  }
  cost[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    // Map i onto b's index range so the band follows the diagonal even when n ≠ m.
    const centre = Math.round((i * m) / n);
    const jFrom = Math.max(1, centre - w);
    const jTo = Math.min(m, centre + w);
    for (let j = jFrom; j <= jTo; j++) {
      const d = Math.abs(a[i - 1] - b[j - 1]);
      let best = cost[i - 1][j - 1];
      let bestLen = len[i - 1][j - 1];
      if (cost[i - 1][j] < best) {
        best = cost[i - 1][j];
        bestLen = len[i - 1][j];
      }
      if (cost[i][j - 1] < best) {
        best = cost[i][j - 1];
        bestLen = len[i][j - 1];
      }
      cost[i][j] = best + d;
      len[i][j] = bestLen + 1;
    }
  }
  return cost[n][m] / Math.max(1, len[n][m]);
}
