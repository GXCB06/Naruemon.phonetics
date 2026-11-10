import { describe, expect, it } from "vitest";
import type { Sentence } from "../intonation/types.ts";
import { loadLesson } from "../learn/content.ts";
import { analyzeReference, gateReference, ttsAssessment, type TtsWord } from "./referenceGate.ts";
import { buildSsml, contourAttr, groupContour, groupText, levelToPercent, spokenText, wordProsody } from "./ssml.ts";
import { ERROR_STYLES, synthesizeSentence, type SynthOptions } from "./voice.ts";

const sentence = (unit: string, lesson: string, id: string): Sentence =>
  loadLesson(unit, lesson)!.sentences.find((s) => s.id === id)!;
const bookTable = () => sentence("falling", "falling-1", "falling-1-book-table");
const harrySure = () => sentence("tags", "tags-1", "tags-1-harry");
const harryAsking = () => sentence("tags", "tags-2", "tags-2-harry");

describe("levelToPercent", () => {
  it("maps level 2 to 0% and one level to 4 semitones", () => {
    expect(levelToPercent(2)).toBe(0);
    expect(levelToPercent(3)).toBeCloseTo(26, 0); // 2^(4/12) - 1
    expect(levelToPercent(1)).toBeCloseTo(-20.6, 0);
  });
  it("gain stretches both ways, fallGain only below level 2", () => {
    expect(levelToPercent(3, 1.5)).toBeGreaterThan(levelToPercent(3));
    expect(levelToPercent(3, 1, 2)).toBeCloseTo(levelToPercent(3), 6);
    expect(levelToPercent(1, 1, 2)).toBeLessThan(levelToPercent(1));
  });
});

describe("groupContour", () => {
  it("is a sparse line from 0% to 100% that peaks on the nucleus and ends low (2-3-1)", () => {
    const pts = groupContour(bookTable().groups[0]);
    expect(pts[0]).toEqual({ t: 0, pct: 0 });
    expect(pts.at(-1)!.t).toBe(100);
    expect(pts.at(-1)!.pct).toBeLessThan(-15);
    expect(pts.length).toBeLessThanOrEqual(5); // Azure ignores contours with many points
    for (let i = 1; i < pts.length; i++) expect(pts[i].t).toBeGreaterThan(pts[i - 1].t);
    const peak = pts.reduce((a, b) => (b.pct > a.pct ? b : a));
    expect(peak.pct).toBeCloseTo(26, 0);
    expect(peak.t).toBeGreaterThan(60); // "TA-ble" is the last word
  });

  it("dense mode has two points per held syllable", () => {
    const g = bookTable().groups[0];
    expect(groupContour(g, { points: "dense" }).length).toBeGreaterThan(groupContour(g).length);
  });

  it("starts the sure tag high (3-1) and the asking tag at mid, rising (2-3)", () => {
    const sure = groupContour(harrySure().groups[1]);
    const asking = groupContour(harryAsking().groups[1]);
    expect(sure[0].pct).toBeGreaterThan(20);
    expect(sure.at(-1)!.pct).toBeLessThan(0);
    expect(asking[0].pct).toBe(0);
    expect(asking.at(-1)!.pct).toBeGreaterThan(20);
  });
});

describe("contourAttr / wordProsody", () => {
  it("writes Azure's contour syntax with signs", () => {
    expect(contourAttr([{ t: 0, pct: 0 }, { t: 40, pct: 26 }, { t: 100, pct: -21 }])).toBe("(0%,+0%) (40%,+26%) (100%,-21%)");
  });
  it("leaves level-2 words alone and shapes the nucleus word", () => {
    const words = bookTable().groups[0].words;
    expect(wordProsody(words[0], "The")).toBe("The");
    const table = wordProsody(words.at(-1)!, "table.");
    expect(table).toMatch(/^<prosody contour="\(0%,\+26%\) .*\(100%,-\d+%\)">table\.<\/prosody>$/);
  });
});

describe("buildSsml", () => {
  it("wraps one voice, puts a break between thought groups and keeps the words", () => {
    const ssml = buildSsml(harrySure(), "en-US-JennyNeural");
    expect(ssml.startsWith('<speak version="1.0"')).toBe(true);
    expect(ssml).toContain('<voice name="en-US-JennyNeural">');
    expect(ssml.match(/<break /g)).toHaveLength(1);
    expect(spokenText(ssml)).toBe("Harry is coming, isn&apos;t he?".replace("&apos;", "x"));
  });

  it("pattern punctuation makes the sure tag a statement and keeps the asking tag a question", () => {
    expect(groupText(harrySure().groups[1], true, "pattern")).toBe("isn't he.");
    expect(groupText(harryAsking().groups[1], true, "pattern")).toBe("isn't he?");
    expect(groupText(harrySure().groups[0], false, "pattern")).toBe("Harry is coming.");
    expect(groupText(harrySure().groups[0], false, "original")).toBe("Harry is coming,");
  });

  it("prePct lowers the run-up to the nucleus word as one element", () => {
    const ssml = buildSsml(bookTable(), "v", { prePct: -12 });
    expect(ssml).toContain('<prosody pitch="-12%">The book is on my</prosody> <prosody contour=');
    expect(spokenText(ssml)).toBe("The book is on my table.");
    // a nucleus on the first word has no run-up
    const speak = sentence("falling", "falling-3", "falling-3-speak-loudly");
    const n = speak.groups[0].nucleus.word;
    expect(buildSsml(speak, "v", { prePct: -12 }).includes('pitch="-12%"')).toBe(n > 0);
  });

  it("escapes XML and supports every shape", () => {
    const s = { ...bookTable(), groups: [{ ...bookTable().groups[0], words: [...bookTable().groups[0].words] }] };
    s.groups[0].words[0] = { ...s.groups[0].words[0], text: "Tom&Jerry" };
    for (const shape of ["word", "group", "none"] as const) {
      const ssml = buildSsml(s, "v", { shape, rate: "-10%" });
      expect(ssml).toContain("Tom&amp;Jerry");
      expect(ssml).toContain('<prosody rate="-10%">');
      expect(ssml.includes("contour=")).toBe(shape !== "none");
    }
  });
});

/** The word timings the synthetic voice produces (same constants as synthesizeSentence's defaults). */
function synthWords(s: Sentence, o: Required<Pick<SynthOptions, "syllableSec" | "stressedSec" | "gapSec" | "pauseSec">>): TtsWord[] {
  let t = 0.25;
  const out: TtsWord[] = [];
  s.groups.forEach((g, gi) => {
    g.words.forEach((w, wi) => {
      const start = t;
      let end = t;
      w.syllables.forEach((y, yi) => {
        end = t + (y.stressed ? o.stressedSec : o.syllableSec);
        const groupEnd = wi === g.words.length - 1 && yi === w.syllables.length - 1 && gi < s.groups.length - 1;
        t = end + (groupEnd ? o.pauseSec : o.gapSec);
      });
      out.push({ text: w.text.replace(/[.,!?;]+$/, ""), offsetSec: start, durationSec: end - start });
    });
  });
  return out;
}
const TIMING = { syllableSec: 0.2, stressedSec: 0.27, gapSec: 0.04, pauseSec: 0.3 };

describe("reference gate", () => {
  it("turns TTS word boundaries into an assessment (punctuation-only boundaries dropped)", () => {
    const a = ttsAssessment([
      { text: "Hi", offsetSec: 0.1, durationSec: 0.2 },
      { text: ",", offsetSec: 0.3, durationSec: 0 },
    ]);
    expect(a.words.map((w) => w.word)).toEqual(["Hi"]);
    expect(a.words[0].errorType).toBe("None");
  });

  it("passes the textbook tune and fails a wrong ending", () => {
    for (const s of [bookTable(), harrySure()]) {
      const good = synthesizeSentence(s, { baseHz: 210 });
      expect(gateReference(analyzeReference(good.samples, good.sampleRate, s).result).pass).toBe(true);
      const bad = synthesizeSentence(s, { baseHz: 210, transform: ERROR_STYLES.wrongEnding });
      const gate = gateReference(analyzeReference(bad.samples, bad.sampleRate, s).result);
      expect(gate.pass).toBe(false);
      expect(gate.reasons.some((r) => r.includes("ending"))).toBe(true);
    }
  });

  it("with word timings, checks the peak position too", () => {
    const s = bookTable();
    const words = synthWords(s, TIMING);
    const good = synthesizeSentence(s, { baseHz: 210 });
    const ok = analyzeReference(good.samples, good.sampleRate, s, words);
    expect(ok.aligned).toBe(true);
    const placed = ok.result!.groups[0].checks.find((c) => c.id === "peakPlacement")!;
    expect(placed.status).toBe("pass");
    expect(gateReference(ok.result).pass).toBe(true);

    // peak on BOOK (first content word) instead of TA-ble: the ending still falls, but the peak is in the wrong place
    let k = 0;
    const early = synthesizeSentence(s, {
      baseHz: 210,
      transform: (levels) => {
        const i = k++;
        return i === 1 ? [3] : i === 2 ? [2.6] : i === 5 ? [2] : levels;
      },
    });
    const late = analyzeReference(early.samples, early.sampleRate, s, words);
    const gate = gateReference(late.result);
    expect(gate.pass).toBe(false);
    expect(gate.reasons.join(" ")).toMatch(/peakPlacement/);
    // without timings the same clip slips through: that is why the tool asks Azure for word boundaries
    expect(gateReference(analyzeReference(early.samples, early.sampleRate, s).result).reasons.join(" ")).not.toMatch(/peakPlacement/);
  });

  it("fails when there is no pitch at all", () => {
    expect(gateReference(null)).toMatchObject({ pass: false, reasons: ["no pitch found"] });
  });
});
