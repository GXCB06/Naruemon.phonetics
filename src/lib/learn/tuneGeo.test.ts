import { describe, expect, it } from "vitest";
import { MIN_LEVEL_GAP, MIN_ROW_GAP, rowMetrics } from "./tuneGeo.ts";

describe("drawing row geometry", () => {
  const sizes = [20, 24, 28, 34, 48, 60, 72];

  it("keeps the levels in order, 4 above 3 above 2 above 1", () => {
    for (const fs of sizes) {
      const { y } = rowMetrics(fs);
      expect(y[4]).toBeLessThan(y[3]);
      expect(y[3]).toBeLessThan(y[2]);
      expect(y[2]).toBeLessThan(y[1]);
    }
  });

  it("never lets neighbouring levels get closer than the minimum, even on a small phone font", () => {
    for (const fs of sizes) {
      const { y } = rowMetrics(fs);
      expect(y[1] - y[2]).toBeGreaterThanOrEqual(MIN_LEVEL_GAP - 1e-6);
      expect(y[2] - y[3]).toBeGreaterThanOrEqual(MIN_LEVEL_GAP - 1e-6);
      expect(y[3] - y[4]).toBeGreaterThanOrEqual(MIN_LEVEL_GAP - 1e-6);
    }
  });

  it("leaves at least the minimum row gap between one row's level 1 and the next row's level 4", () => {
    for (const fs of sizes) {
      const m = rowMetrics(fs);
      // distance from baseline to the bottom of its box = 0.17 fs + padBottom; to the top = 0.83 fs + padTop
      const below = 0.17 * fs + m.padBottom - m.y[1];
      const above = 0.83 * fs + m.padTop + m.y[4];
      expect(below + above).toBeGreaterThanOrEqual(MIN_ROW_GAP - 0.5);
      expect(below).toBeGreaterThan(0);
      expect(above).toBeGreaterThan(0);
    }
  });

  it("grows with the font size, so a big iPad font keeps the textbook look", () => {
    expect(rowMetrics(72).y[2] - rowMetrics(72).y[3]).toBeGreaterThan(rowMetrics(34).y[2] - rowMetrics(34).y[3]);
  });
});
