import { analyze } from "../intonation/engine.ts";
import type { AnalysisResult, Sentence } from "../intonation/types.ts";
import { speakerBaseline } from "./baseline.ts";
import { normalizeTake } from "./gain.ts";
import { toLevelContour, trackSpeech, type LevelContour } from "./pitch.ts";
import { assessQuality, trimSilence, type QualityReport } from "./quality.ts";
import { resampleAudio } from "./resample.ts";
import { encodeWav } from "./wav.ts";

export interface VoiceAnalysis {
  result: AnalysisResult | null;
  level: LevelContour | null;
  quality: QualityReport;
  /** Make-up gain applied to a quiet take before pitch analysis, in dB (0 = none). See gain.ts. */
  gainDb: number;
  /** Trimmed take with the make-up gain applied, for playback. */
  playback: Uint8Array;
  /** 16 kHz mono 16-bit WAV — the format Azure Pronunciation Assessment expects (Phase 0b). */
  wav16k: Uint8Array;
  sampleRate: number;
  durationSec: number;
}

/** Full Phase 0a voice path: trim → quality check (on the raw take) → make-up gain → pitch → levels → rule engine. */
export function analyzeVoice(raw: Float32Array, sampleRate: number, sentence: Sentence): VoiceAnalysis {
  const trimmed = trimSilence(raw, sampleRate);
  // measure the take as it arrived, so "your mic is quiet" stays honest, then score what we can actually hear
  const quality = assessQuality(trimmed, sampleRate);
  const { samples, gainDb } = normalizeTake(trimmed, sampleRate);
  const frames = trackSpeech(samples, sampleRate);
  // level 2 = the learner's voice in the parts of the sentence that should be level 2, not the median of the whole tune
  const level = toLevelContour(frames, speakerBaseline(frames, sentence));
  const result = level
    ? analyze(sentence, level.contour, { modality: "speak", timingKnown: false, durationSec: level.durationSec })
    : null;
  return {
    result,
    level,
    quality,
    gainDb,
    playback: encodeWav(samples, sampleRate),
    wav16k: encodeWav(resampleAudio(samples, sampleRate, 16000), 16000),
    sampleRate,
    durationSec: samples.length / sampleRate,
  };
}
