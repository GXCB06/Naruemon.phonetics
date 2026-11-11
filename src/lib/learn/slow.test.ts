import { describe, expect, it } from "vitest";
import { SLOW_CLIP_RATE, clipRate, speechRate } from "./slow.ts";

describe("slow switch", () => {
  it("plays clips at full speed, or a bit slower when Slow is on", () => {
    expect(clipRate(false)).toBe(1);
    expect(clipRate(true)).toBe(SLOW_CLIP_RATE);
    expect(SLOW_CLIP_RATE).toBeGreaterThan(0.5);
    expect(SLOW_CLIP_RATE).toBeLessThan(1);
  });

  it("slows the device voice for sentences and for words, never above its normal rate", () => {
    for (const kind of ["sentence", "word"] as const) expect(speechRate(kind, true)).toBeLessThan(speechRate(kind, false));
  });
});
