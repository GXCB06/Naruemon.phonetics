// Test helper: fabricate an AzureAssessment from the timings of `synthesizeSentence` (we know exactly when each
// synthetic syllable starts and how long it lasts). Nothing here talks to Azure; it only mirrors the synth's timeline
// (src/lib/synth/voice.ts: 0.25 s of silence first, then per syllable its duration followed by a gap, the longer
// pause after the last syllable of a thought group).

import type { Sentence } from "../../intonation/types.ts";
import type { AzureAssessment, AzureWord } from "../parse.ts";

export interface FabricateOptions {
  syllableSec?: number;
  stressedSec?: number;
  gapSec?: number;
  pauseSec?: number;
  /** Mirrors the synth's `noPause` (no real pause at the comma): Azure then reports no gap between the groups. */
  noPause?: boolean;
  /** Seconds of leading silence in the audio (synth default 0.25). */
  leadSec?: number;
  /** Subtract this from every time, e.g. the amount `trimSilence` cut off the start before the audio went to Azure. */
  shiftSec?: number;
  /** How many syllables Azure reports for a word (default: ours). The word's time is split evenly between them. */
  syllablesPerWord?: (word: string, ourCount: number) => number;
  /** Drop these words (by their text, lower-case) from Azure's result, as if Azure had not heard them. */
  omit?: string[];
  /** Rename words in Azure's result (lower-case key to replacement), to simulate a recognition difference. */
  rename?: Record<string, string>;
  /** Extra word breaks Azure flags as unexpected (after the Azure word with this text). */
  unexpectedBreakAfter?: string[];
}

export function fabricateAssessment(sentence: Sentence, options: FabricateOptions = {}): AzureAssessment {
  // `??` so that an explicit `undefined` (e.g. forwarded synth options) still means "default".
  const o = {
    ...options,
    syllableSec: options.syllableSec ?? 0.2,
    stressedSec: options.stressedSec ?? 0.27,
    gapSec: options.gapSec ?? 0.04,
    pauseSec: options.pauseSec ?? 0.3,
    leadSec: options.leadSec ?? 0.25,
    shiftSec: options.shiftSec ?? 0,
  };
  let t = o.leadSec;
  const words: AzureWord[] = [];
  const unexpected: number[] = [];

  sentence.groups.forEach((g, gi) => {
    const lastWord = g.words.length - 1;
    g.words.forEach((w, wi) => {
      const syl: { start: number; end: number }[] = [];
      w.syllables.forEach((s, si) => {
        const dur = s.stressed ? o.stressedSec : o.syllableSec;
        syl.push({ start: t, end: t + dur });
        const isGroupEnd = wi === lastWord && si === w.syllables.length - 1 && gi < sentence.groups.length - 1;
        t += dur + (isGroupEnd ? (o.noPause ? 0 : o.pauseSec) : o.gapSec);
      });
      const start = syl[0].start - o.shiftSec;
      const end = syl[syl.length - 1].end - o.shiftSec;
      const key = w.text.toLowerCase().replace(/[^a-z']/g, "");
      if (o.omit?.includes(key)) return;

      const m = o.syllablesPerWord ? o.syllablesPerWord(key, w.syllables.length) : w.syllables.length;
      const azSyllables =
        m === w.syllables.length
          ? syl.map((s, i) => ({ s, i }))
          : Array.from({ length: m }, (_, i) => ({ s: { start: start + o.shiftSec + ((end - start) * i) / m, end: start + o.shiftSec + ((end - start) * (i + 1)) / m }, i }));

      words.push({
        word: o.rename?.[key] ?? key,
        offsetSec: start,
        durationSec: end - start,
        accuracy: 95,
        errorType: "None",
        syllables: azSyllables.map(({ s }, i) => ({
          ipa: m === w.syllables.length ? w.syllables[i].ipa : "",
          grapheme: null,
          offsetSec: s.start - o.shiftSec,
          durationSec: s.end - s.start,
          accuracy: 95,
        })),
        phonemes: [],
      });
      if (o.unexpectedBreakAfter?.includes(key)) unexpected.push(words.length - 1);
    });
  });

  return {
    status: "Success",
    pronScore: 95,
    prosodyScore: 90,
    accuracy: 95,
    fluency: 95,
    completeness: 100,
    words,
    monotone: false,
    breaks: unexpected.map((wordIndex) => ({ wordIndex, type: "unexpected" as const, confidence: 0.9 })),
  };
}
