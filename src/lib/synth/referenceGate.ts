// Quality gate for reference clips (task B6): a clip may only be used as the model tune when our own analysis says it has
// the sentence's pattern. Pure: give it the result of `analyzeVoice` (the same path the lab uses for a learner's voice).

import { analyzeVoice, type VoiceAnalysis } from "../audio/analyzeVoice.ts";
import { toLevelContour, trackPitch } from "../audio/pitch.ts";
import { analyzeAligned } from "../azure/align.ts";
import type { AzureAssessment } from "../azure/parse.ts";
import type { AnalysisResult, CheckId, Sentence } from "../intonation/types.ts";

export interface GateResult {
  pass: boolean;
  /** Why it failed (empty when it passed), e.g. "group 2 ending: fail (It went UP at the end…)". */
  reasons: string[];
  /** Warnings that don't block the clip, for the report. */
  warnings: string[];
  overall: number | null;
}

/** Checks that must pass outright: the ending is the whole point of a reference clip. */
const MUST_PASS: readonly CheckId[] = ["ending"];
/** Checks that must not fail: one clear peak, on the nucleus when timing is known, and a real pitch range. */
const MUST_NOT_FAIL: readonly CheckId[] = ["singlePeak", "peakPlacement", "range"];

export function gateReference(result: AnalysisResult | null): GateResult {
  if (!result) return { pass: false, reasons: ["no pitch found"], warnings: [], overall: null };
  const reasons: string[] = [];
  const warnings: string[] = [];
  result.groups.forEach((g, gi) => {
    for (const c of g.checks) {
      const where = `group ${gi + 1} (${g.pattern}) ${c.id}: ${c.status}`;
      if ((MUST_PASS.includes(c.id) && c.status !== "pass") || (MUST_NOT_FAIL.includes(c.id) && c.status === "fail")) {
        reasons.push(`${where} (${c.message.en})`);
      } else if (c.status === "warn" || c.status === "fail") {
        warnings.push(where);
      }
    }
  });
  for (const c of result.sentenceChecks) if (c.status !== "pass") warnings.push(`sentence ${c.id}: ${c.status}`);
  return { pass: reasons.length === 0, reasons, warnings, overall: result.overall };
}

// ---------------------------------------------------------------------------
// Analysis of a TTS clip with the word timings Azure TTS reports, so the peak position is checked too
// ---------------------------------------------------------------------------

/** A word boundary from Azure TTS (SpeechSynthesizer.wordBoundary): seconds from the start of the clip. */
export interface TtsWord {
  text: string;
  offsetSec: number;
  durationSec: number;
}

/**
 * Azure TTS word boundaries in the shape of a pronunciation assessment, so `analyzeAligned` (task B3) can map the clip's
 * pitch onto our syllables. TTS gives no syllables; align.ts then splits each word's time in proportion.
 */
export function ttsAssessment(words: readonly TtsWord[]): AzureAssessment {
  return {
    status: "Success",
    pronScore: null,
    prosodyScore: null,
    accuracy: null,
    fluency: null,
    completeness: null,
    monotone: false,
    breaks: [],
    words: words
      .filter((w) => /[\p{L}\p{N}]/u.test(w.text))
      .map((w) => ({
        word: w.text,
        offsetSec: w.offsetSec,
        durationSec: w.durationSec,
        accuracy: null,
        errorType: "None",
        syllables: [],
        phonemes: [],
      })),
  };
}

/**
 * Our verdict on a reference clip: the lab's voice path (`analyzeVoice`: trim, quality, pitch, levels, rule engine), then,
 * when TTS word timings are given, the same pitch re-analysed with real syllable timing (`analyzeAligned`) so
 * `peakPlacement` runs. The pitch for the aligned pass is tracked on the untrimmed clip so its clock matches the timings.
 */
export function analyzeReference(
  samples: Float32Array,
  sampleRate: number,
  sentence: Sentence,
  words?: readonly TtsWord[],
): { result: AnalysisResult | null; aligned: boolean; quality: VoiceAnalysis["quality"] } {
  const voice = analyzeVoice(samples, sampleRate, sentence);
  if (!words || words.length === 0) return { result: voice.result, aligned: false, quality: voice.quality };
  const level = toLevelContour(trackPitch(samples, sampleRate));
  if (!level) return { result: null, aligned: false, quality: voice.quality };
  const result = analyzeAligned(level, ttsAssessment(words), sentence);
  return { result, aligned: result.mode === "aligned", quality: voice.quality };
}
