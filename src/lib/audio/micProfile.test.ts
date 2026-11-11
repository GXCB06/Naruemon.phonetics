import { describe, expect, it } from "vitest";
import { MIC_CHECK_MAX_AGE_DAYS, micGate, parseMicProfile, takeBlocksGrade, takeChips, type MicProfile } from "./micProfile.ts";
import type { QualityReport } from "./quality.ts";

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const profile = (over: Partial<MicProfile> = {}): MicProfile => ({ label: "MacBook Mic", checkedAt: NOW - DAY, noiseDb: -58, verdict: "good", ...over });
const quality = (over: Partial<QualityReport> = {}): QualityReport => ({ peak: 0.5, clippedRatio: 0, speechDb: -22, noiseDb: -60, snrDb: 38, issues: [], ...over });

describe("mic profile", () => {
  it("reads a saved profile and treats anything odd as never checked", () => {
    expect(parseMicProfile(JSON.stringify(profile()))).toEqual(profile());
    for (const bad of [null, "", "{bad", "[]", "null", JSON.stringify({ label: 1 }), JSON.stringify({ ...profile(), verdict: "great" }), JSON.stringify({ ...profile(), checkedAt: "x" })])
      expect(parseMicProfile(bad as string | null)).toBeNull();
    expect(parseMicProfile(JSON.stringify({ ...profile(), noiseDb: "loud" }))?.noiseDb).toBeNull();
  });
});

describe("when to ask for a mic check", () => {
  it("asks the first time, and again after a failed check", () => {
    expect(micGate(null, null, NOW)).toEqual({ need: true, reason: "never" });
    expect(micGate(profile({ verdict: "fail" }), "MacBook Mic", NOW)).toEqual({ need: true, reason: "failed" });
  });

  it("does not ask again for the same microphone, even after a warning", () => {
    expect(micGate(profile(), "MacBook Mic", NOW).need).toBe(false);
    expect(micGate(profile({ verdict: "warn" }), "MacBook Mic", NOW).need).toBe(false);
    expect(micGate(profile(), null, NOW).need).toBe(false); // the mic is not open yet: nothing to compare
  });

  it("asks when a different microphone is in use", () => {
    expect(micGate(profile(), "AirPods Pro", NOW)).toEqual({ need: true, reason: "changed" });
    expect(micGate(profile({ label: "" }), "AirPods Pro", NOW).need).toBe(false); // the first check could not name its mic
  });

  it("asks when the check is old", () => {
    expect(micGate(profile({ checkedAt: NOW - (MIC_CHECK_MAX_AGE_DAYS - 1) * DAY }), "MacBook Mic", NOW).need).toBe(false);
    expect(micGate(profile({ checkedAt: NOW - (MIC_CHECK_MAX_AGE_DAYS + 1) * DAY }), "MacBook Mic", NOW)).toEqual({ need: true, reason: "stale" });
  });
});

describe("one recording", () => {
  it("shows three good chips for a clean take", () => {
    const chips = takeChips(quality());
    expect(chips.map((c) => c.key)).toEqual(["volume", "noise", "clipping"]);
    expect(chips.every((c) => c.level === "good")).toBe(true);
    expect(takeBlocksGrade(quality())).toBe(false);
  });

  it("flags a quiet take as a fail and blocks grading", () => {
    const q = quality({ speechDb: -50, issues: [{ level: "fail", en: "Too quiet", th: "เบา" }] });
    expect(takeChips(q)[0]).toMatchObject({ key: "volume", level: "fail" });
    expect(takeBlocksGrade(q)).toBe(true);
  });

  it("warns about a noisy room or clipping but still grades", () => {
    const noisy = quality({ noiseDb: -40, snrDb: 12, issues: [{ level: "warn", en: "Noisy", th: "รบกวน" }] });
    expect(takeChips(noisy)[1].level).toBe("warn");
    expect(takeBlocksGrade(noisy)).toBe(false);
    const clipped = quality({ clippedRatio: 0.01, issues: [{ level: "warn", en: "Loud", th: "ดัง" }] });
    expect(takeChips(clipped)[2]).toMatchObject({ key: "clipping", level: "warn" });
    expect(takeBlocksGrade(clipped)).toBe(false);
  });
});
