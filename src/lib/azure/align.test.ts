import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeVoice } from "../audio/analyzeVoice.ts";
import { toLevelContour, trackPitch } from "../audio/pitch.ts";
import { layoutSentence } from "../intonation/contour.ts";
import { analyze } from "../intonation/engine.ts";
import { getSentence, SENTENCES } from "../intonation/lessons.ts";
import type { Sentence } from "../intonation/types.ts";
import { synthesizeSentence, type SynthOptions } from "../synth/voice.ts";
import {
  alignSentence,
  analyzeAligned,
  analyzeVoiceAligned,
  levelFramesSec,
  matchKey,
  matchWords,
  rescore,
  sentenceWords,
  warpToAxis,
} from "./align.ts";
import { fabricateAssessment, type FabricateOptions } from "./__fixtures__/fabricate.ts";
import { parseAzureResult } from "./parse.ts";

const sentence = (id: string): Sentence => {
  const s = getSentence(id);
  if (!s) throw new Error(`no sentence ${id}`);
  return s;
};

/** Pitch levels of a synthetic take, on the untrimmed clock (lead silence 0.25 s), plus a matching fake Azure result. */
function take(s: Sentence, synth: SynthOptions = {}, az: FabricateOptions = {}) {
  const { samples, sampleRate } = synthesizeSentence(s, synth);
  const level = toLevelContour(trackPitch(samples, sampleRate));
  if (!level) throw new Error("no pitch found in the synthetic take");
  const assessment = fabricateAssessment(s, {
    noPause: synth.noPause,
    syllableSec: synth.syllableSec,
    stressedSec: synth.stressedSec,
    gapSec: synth.gapSec,
    pauseSec: synth.pauseSec,
    ...az,
  });
  return { samples, sampleRate, level, assessment };
}

const peak = (r: { groups: { checks: { id: string; status: string; message: { en: string; th: string } }[] }[] }, gi = 0) =>
  r.groups[gi].checks.find((c) => c.id === "peakPlacement")!;

describe("matchKey / matchWords", () => {
  it("normalises case, punctuation and contractions", () => {
    expect(matchKey("Isn't,")).toBe("isnt");
    expect(matchKey("isn’t")).toBe("isnt");
    expect(matchKey("woman.")).toBe("woman");
    expect(matchKey("He?")).toBe("he");
  });

  it("matches in order, skipping Azure's insertions and keeping omissions as matches", () => {
    const s = sentence("fall-pretty-woman");
    const words = sentenceWords(s, layoutSentence(s));
    const a = fabricateAssessment(s);
    a.words.splice(2, 0, { ...a.words[0], word: "uh", errorType: "Insertion" });
    a.words[4] = { ...a.words[4], errorType: "Omission" }; // "woman" after the insertion shifted by one
    expect(matchWords(words, a)).toEqual([0, 1, 3, 4, 5]);
  });

  it("leaves a word unmatched when Azure heard something else", () => {
    const s = sentence("fall-pretty-woman");
    const words = sentenceWords(s, layoutSentence(s));
    const a = fabricateAssessment(s, { rename: { woman: "human" } });
    expect(matchWords(words, a)).toEqual([0, 1, 2, 3, -1]);
  });

  it("handles the contraction in the tag question", () => {
    const s = sentence("tag-sure");
    const words = sentenceWords(s, layoutSentence(s));
    const a = fabricateAssessment(s, { rename: { "isn't": "isnt" } });
    expect(matchWords(words, a)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("time warp", () => {
  it("maps each syllable's seconds onto its slot, linearly", () => {
    const s = sentence("fall-pretty-woman");
    const layout = layoutSentence(s);
    const aln = alignSentence(s, layout, fabricateAssessment(s));
    const anchors = aln.groupAnchors[0]!;
    expect(anchors).toHaveLength(layout.slots.length);
    for (const a of anchors) {
      const slot = layout.slots[a.slotIndex];
      expect(warpToAxis(anchors, (a.startSec + a.endSec) / 2)).toBeCloseTo((slot.start + slot.end) / 2, 9);
      expect(warpToAxis(anchors, a.startSec)).toBeCloseTo(slot.start, 9);
    }
    // outside the spoken range there is nothing to map
    expect(warpToAxis(anchors, 0)).toBeNull();
    expect(warpToAxis(anchors, 99)).toBeNull();
  });

  it("collapses gaps inside a thought group and spreads the pause between groups over the layout gap", () => {
    const s = sentence("nonfinal-rains-bus");
    const layout = layoutSentence(s);
    const aln = alignSentence(s, layout, fabricateAssessment(s));
    const anchors = aln.groupAnchors.flatMap((a) => a!);
    // between "If" and "it" (0.04 s consonant gap, same group): both ends land on the same axis value
    const [a0, a1] = anchors;
    expect(warpToAxis(anchors, (a0.endSec + a1.startSec) / 2)).toBeCloseTo(a1.axisStart, 9);
    // in the middle of the 0.3 s pause between the groups: halfway across the layout gap
    const lastOfFirst = anchors.find((a) => a.groupIndex === 0 && a.slotIndex === 2)!;
    const firstOfSecond = anchors.find((a) => a.groupIndex === 1)!;
    const mid = (lastOfFirst.endSec + firstOfSecond.startSec) / 2;
    expect(warpToAxis(anchors, mid)).toBeCloseTo((lastOfFirst.axisEnd + firstOfSecond.axisStart) / 2, 9);
  });

  it("puts pitch frames back at real seconds", () => {
    const { level } = take(sentence("fall-what-name"));
    const frames = levelFramesSec(level);
    expect(frames[0].time).toBeCloseTo(level.startSec, 9);
    expect(frames[frames.length - 1].time).toBeCloseTo(level.startSec + level.durationSec, 9);
    expect(level.startSec).toBeGreaterThan(0.2); // after the 0.25 s of silence
  });
});

describe("analyzeAligned: peak position now runs for voice", () => {
  it("a correct reading of every lesson sentence passes peakPlacement in every group", () => {
    for (const s of SENTENCES) {
      const { level, assessment } = take(s);
      const r = analyzeAligned(level, assessment, s);
      expect(r.mode, s.id).toBe("aligned");
      expect(r.warnings, s.id).toEqual([]);
      r.groups.forEach((_, gi) => expect(peak(r, gi).status, `${s.id} group ${gi}: ${peak(r, gi).message.en}`).toBe("pass"));
      expect(r.overall, s.id).toBeGreaterThanOrEqual(80);
      expect(r.syllableLevels).not.toBeNull();
    }
  });

  it("a rise on the wrong word fails peakPlacement and names the syllable it landed on", () => {
    const s = sentence("fall-pretty-woman"); // She(0) is(1) a(2) pre(3) tty(4) WO(5) man(6)
    const wrong = (levels: number[], info: { group: number; index: number }) =>
      info.index === 1 ? [3.2] : info.index === 5 ? [2] : info.index === 6 ? [1] : levels;
    const { level, assessment } = take(s, { transform: wrong });
    const r = analyzeAligned(level, assessment, s);
    const c = peak(r);
    expect(c.status).toBe("fail");
    expect(c.message.en).toMatch(/IS \(too early\)/);
    expect(c.message.en).toContain("WO");
    expect(c.message.th).toContain("IS");
  });

  it("a rise one word too late is reported too late", () => {
    const s = sentence("fall-pretty-woman");
    const late = (levels: number[], info: { group: number; index: number }) =>
      info.index === 5 ? [2] : info.index === 6 ? [3.2] : levels;
    const { level, assessment } = take(s, { transform: late });
    const c = peak(analyzeAligned(level, assessment, s));
    expect(c.status).not.toBe("pass");
    expect(c.message.en).toMatch(/MAN \(too late\)/);
  });

  it("still passes when Azure's syllable count differs from ours (time shared in proportion)", () => {
    const s = sentence("fall-pretty-woman");
    for (const syllablesPerWord of [() => 1, (_w: string, n: number) => n + 1]) {
      const { level, assessment } = take(s, {}, { syllablesPerWord });
      const r = analyzeAligned(level, assessment, s);
      expect(r.mode).toBe("aligned");
      expect(r.warnings.filter((w) => w.code === "syllable-count").length).toBeGreaterThan(0);
      expect(peak(r).status).toBe("pass");
    }
  });

  it("uses Azure's own syllable boundaries when the counts agree, and shares a word's time otherwise", () => {
    const s = sentence("fall-pretty-woman");
    const layout = layoutSentence(s);
    const exact = alignSentence(s, layout, fabricateAssessment(s)).groupAnchors[0]!;
    const merged = alignSentence(s, layout, fabricateAssessment(s, { syllablesPerWord: () => 1 })).groupAnchors[0]!;
    // "woman" = slots 5,6; stressed "wo" is 0.27 s, "man" 0.2 s
    const [wo, man] = [exact[5], exact[6]];
    const [mwo, mman] = [merged[5], merged[6]];
    expect(mwo.startSec).toBeCloseTo(wo.startSec, 9);
    expect(mman.endSec).toBeCloseTo(man.endSec, 9);
    expect(mwo.endSec).toBeCloseTo(mman.startSec, 9); // contiguous inside the word
    const share = (mwo.endSec - mwo.startSec) / (mman.endSec - mwo.startSec);
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.65); // roughly the true 0.27 / 0.47 = 0.57
  });

  it("falls back to the stretch for a group with an unmatched word, and says so", () => {
    const s = sentence("nonfinal-rains-bus");
    const { level, assessment } = take(s, {}, { rename: { bus: "boss" } });
    const r = analyzeAligned(level, assessment, s);
    expect(r.mode).toBe("partial");
    expect(r.alignedGroups).toEqual([true, false]);
    expect(r.warnings.map((w) => w.code)).toEqual(["unmatched-word", "fallback-group"]);
    // the pause between the groups is still measurable: "rains" and "I" were both matched
    expect(r.sentenceChecks.filter((c) => c.id === "break").map((c) => c.status)).toEqual(["pass"]);
    expect(peak(r, 0).status).toBe("pass");
    expect(peak(r, 1).status).toBe("skip");
    // the fallback group is still graded (ending, range...) like in Phase 0a
    expect(r.groups[1].checks.find((c) => c.id === "ending")!.status).toBe("pass");
    expect(r.aligned.length).toBeGreaterThan(0);
  });

  it("reports an unmeasurable pause when a word next to the group boundary is unmatched", () => {
    const s = sentence("nonfinal-rains-bus");
    const { level, assessment } = take(s, {}, { rename: { i: "eye" } });
    const r = analyzeAligned(level, assessment, s);
    expect(r.warnings.map((w) => w.code)).toContain("unmeasured-break");
    expect(r.sentenceChecks.filter((c) => c.id === "break")).toEqual([]);
    expect(r.alignedGroups).toEqual([true, false]);
  });

  it("returns the Phase 0a result when nothing matches", () => {
    const s = sentence("fall-pretty-woman");
    const { level, assessment } = take(s);
    assessment.words = assessment.words.map((w) => ({ ...w, word: "xyz" }));
    const r = analyzeAligned(level, assessment, s);
    expect(r.mode).toBe("stretched");
    expect(r.warnings.map((w) => w.code)).toContain("no-match");
    expect(peak(r).status).toBe("skip");
    const plain = analyze(s, level.contour, { modality: "speak", timingKnown: false, durationSec: level.durationSec });
    expect(r.overall).toBe(plain.overall);
  });

  it("treats a word Azure marked as omitted as unmatched", () => {
    const s = sentence("fall-pretty-woman");
    const { level, assessment } = take(s);
    assessment.words[2] = { ...assessment.words[2], errorType: "Omission", offsetSec: 0, durationSec: 0 };
    const r = analyzeAligned(level, assessment, s);
    expect(r.warnings.map((w) => w.code)).toContain("omitted-word");
    expect(r.mode).toBe("stretched"); // the only group lost a word
  });

  it("treats a word without timing as unmatched", () => {
    const s = sentence("fall-what-name");
    const { level, assessment } = take(s);
    assessment.words[1] = { ...assessment.words[1], durationSec: 0 };
    expect(analyzeAligned(level, assessment, s).warnings.map((w) => w.code)).toContain("no-timing");
  });
});

describe("pauses between thought groups come from Azure's gaps", () => {
  const s = sentence("nonfinal-rains-bus");

  it("passes when Azure shows a real pause at the comma, and reports its length", () => {
    const { level, assessment } = take(s);
    const r = analyzeAligned(level, assessment, s);
    const b = r.sentenceChecks.filter((c) => c.id === "break");
    expect(b).toHaveLength(1);
    expect(b[0].status).toBe("pass");
    expect(b[0].message.en).toContain("300 ms");
    expect(b[0].message.th).toContain("300");
  });

  it("warns when there is no gap between the groups", () => {
    const { level, assessment } = take(s, { noPause: true });
    const b = analyzeAligned(level, assessment, s).sentenceChecks.filter((c) => c.id === "break");
    expect(b).toHaveLength(1);
    expect(b[0].status).toBe("warn");
    expect(b[0].message.en).toContain("0 ms");
  });

  it("warns on Azure's 'unexpected break' flag in the middle of a thought group, but not at the group boundary", () => {
    const { level, assessment } = take(s, {}, { unexpectedBreakAfter: ["it", "rains"] });
    const b = analyzeAligned(level, assessment, s).sentenceChecks.filter((c) => c.id === "break");
    expect(b.map((c) => c.status)).toEqual(["pass", "warn"]); // "rains" ends the group: ignored; "it" is inside it
    expect(b[1].message.en).toContain("“it”");
  });

  it("a one-group sentence has no break check", () => {
    const one = sentence("fall-what-name");
    const { level, assessment } = take(one);
    expect(analyzeAligned(level, assessment, one).sentenceChecks).toEqual([]);
  });

  it("the overall score counts the break check", () => {
    const withPause = take(s);
    const without = take(s, { noPause: true });
    const a = analyzeAligned(withPause.level, withPause.assessment, s);
    const b = analyzeAligned(without.level, without.assessment, s);
    expect(b.overall).toBeLessThan(a.overall);
  });
});

describe("rescore stays in step with engine.ts", () => {
  it("gives the engine's own overall when there are no extra checks", () => {
    for (const s of SENTENCES) {
      for (const transform of [undefined, (l: number[]) => l.map((x) => 2 + (x - 2) * 0.2)]) {
        const { level, assessment } = take(s, { transform });
        const r = analyzeAligned(level, assessment, s);
        const raw = analyze(s, r.aligned, { modality: "speak", timingKnown: true });
        expect(rescore(raw.groups, raw.sentenceChecks), s.id).toBe(raw.overall);
      }
    }
  });
});

describe("through analyzeVoice (trimmed audio, as the lab uses it)", () => {
  it("peakPlacement runs once Azure's timestamps are on the trimmed clock", () => {
    const s = sentence("fall-pretty-woman");
    const { samples, sampleRate } = synthesizeSentence(s);
    // trimSilence keeps 0.2 s of padding before the first 20 ms frame that has sound
    const first = samples.findIndex((x) => Math.abs(x) > 0.01);
    const frame = Math.round(0.02 * sampleRate);
    const cut = Math.max(0, Math.floor(first / frame) * frame - Math.round(0.2 * sampleRate));
    const voice = analyzeVoice(samples, sampleRate, s);
    expect(voice.result!.groups[0].checks.find((c) => c.id === "peakPlacement")!.status).toBe("skip");
    const assessment = fabricateAssessment(s, { shiftSec: cut / sampleRate });
    const r = analyzeVoiceAligned(voice, assessment, s)!;
    expect(r.mode).toBe("aligned");
    expect(peak(r).status).toBe("pass");
  });

  it("returns null when the take has no pitch", () => {
    const s = sentence("fall-what-name");
    const voice = analyzeVoice(new Float32Array(48000), 48000, s);
    expect(analyzeVoiceAligned(voice, fabricateAssessment(s), s)).toBeNull();
  });
});

describe("recorded fixtures", () => {
  const fixture = (name: string) =>
    parseAzureResult(JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8")));
  const iNeedAPen: Sentence = {
    id: "fixture-pen",
    text: "I need a pen.",
    kind: "Statement",
    note: { en: "", th: "" },
    groups: [
      {
        pattern: "2-3-1",
        nucleus: { word: 3, syllable: 0 },
        words: [
          { text: "I", syllables: [{ text: "I", ipa: "aɪ", levels: [2] }] },
          { text: "need", syllables: [{ text: "need", ipa: "nid", levels: [2] }] },
          { text: "a", syllables: [{ text: "a", ipa: "ə", levels: [2] }] },
          { text: "pen.", syllables: [{ text: "pen", ipa: "pɛn", stressed: true, levels: [3, 1] }] },
        ],
      },
    ],
  };

  it("both fixtures still parse and align word for word with their sentence", () => {
    for (const name of ["good-i-need-a-pen.json", "monotone-missed-n.json"]) {
      const a = fixture(name);
      expect(a.words).toHaveLength(4);
      const aln = alignSentence(iNeedAPen, layoutSentence(iNeedAPen), a);
      expect(aln.warnings).toEqual([]);
      expect(aln.timings.map((t) => t?.azureIndex)).toEqual([0, 1, 2, 3]);
      const anchors = aln.groupAnchors[0]!;
      expect(anchors[3].startSec).toBeCloseTo(a.words[3].offsetSec, 9);
      expect(anchors[3].endSec).toBeCloseTo(a.words[3].offsetSec + a.words[3].durationSec, 9);
    }
  });
});
