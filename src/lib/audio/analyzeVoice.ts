import { analyze } from "../intonation/engine.ts";
import type { AnalysisResult, Sentence } from "../intonation/types.ts";
import { toLevelContour, trackSpeech, type LevelContour } from "./pitch.ts";
import { assessQuality, trimSilence, type QualityReport } from "./quality.ts";
import { resampleAudio } from "./resample.ts";
import { encodeWav } from "./wav.ts";

export interface VoiceAnalysis {
  result: AnalysisResult | null;
  level: LevelContour | null;
  quality: QualityReport;
  /** Trimmed take at the original rate, for playback. */
  playback: Uint8Array;
  /** 16 kHz mono 16-bit WAV — the format Azure Pronunciation Assessment expects (Phase 0b). */
  wav16k: Uint8Array;
  sampleRate: number;
  durationSec: number;
}

/** Full Phase 0a voice path: trim → quality check → pitch → levels → rule engine. */
export function analyzeVoice(raw: Float32Array, sampleRate: number, sentence: Sentence): VoiceAnalysis {
  const samples = trimSilence(raw, sampleRate);
  const quality = assessQuality(samples, sampleRate);
  const level = toLevelContour(trackSpeech(samples, sampleRate));
  const result = level
    ? analyze(sentence, level.contour, { modality: "speak", timingKnown: false, durationSec: level.durationSec })
    : null;
  return {
    result,
    level,
    quality,
    playback: encodeWav(samples, sampleRate),
    wav16k: encodeWav(resampleAudio(samples, sampleRate, 16000), 16000),
    sampleRate,
    durationSec: samples.length / sampleRate,
  };
}
