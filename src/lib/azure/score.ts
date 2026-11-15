// One call that scores a recorded take with Azure and re-runs the intonation engine with Azure's timing.
//
// Browser only: it asks /api/speech-token for a short-lived token, then sends the 16 kHz WAV that `analyzeVoice` already
// made. Nothing is stored here and nothing throws at the caller: every failure becomes a state the UI can draw. The
// Speech SDK is loaded on demand, so it stays out of the first-load bundle (see assess.ts).
//
// The pronunciation score is also the bridge to the `pronunciation` skill in mastery and to the attempts table's
// `azure_accuracy` / `azure_prosody` / `phoneme_errors` columns.

import type { VoiceAnalysis } from "../audio/analyzeVoice.ts";
import type { CheckStatus, Sentence } from "../intonation/types.ts";
import { BAND_GOOD, BAND_OK, normalizeIpa } from "./ipa.ts";
import { analyzeVoiceAligned, type AlignedAnalysis } from "./align.ts";
import type { AzureAssessment } from "./parse.ts";

/** One sound Azure heard clearly wrong. Small enough to store as JSON in `attempts.phoneme_errors`. */
export interface PhonemeError {
  /** Expected IPA, normalised to the lesson symbol set. */
  ipa: string;
  accuracy: number | null;
  /** The word the sound came from, for the "which word?" line in the UI. */
  word: string;
}

/** What one pronunciation check says, independent of the SDK and the network. */
export interface PronunciationScore {
  /** Azure's accuracy score 0–100, or null when it sent none. */
  accuracy: number | null;
  /** Azure's prosody score 0–100 (en-US only), or null. */
  prosody: number | null;
  /** Azure's overall pronunciation score 0–100, or null. */
  overall: number | null;
  /** pass / warn / fail for the mastery layer, or skip when Azure gave no usable score. */
  status: CheckStatus;
  /** The sounds that need work, weakest first (at most MAX_PHONEME_ERRORS). */
  phonemeErrors: PhonemeError[];
}

export const MAX_PHONEME_ERRORS = 12;

/** pass at 80+, warn at 60+, fail below. Same bands the IPA layer draws (see ipa.ts). */
export function statusForScore(score: number | null): CheckStatus {
  if (score === null || !Number.isFinite(score)) return "skip";
  return score >= BAND_GOOD ? "pass" : score >= BAND_OK ? "warn" : "fail";
}

/** Turn Azure's assessment into the small score we keep. Pure. */
export function pronunciationFrom(assessment: AzureAssessment): PronunciationScore {
  const accuracy = assessment.accuracy;
  const overall = assessment.pronScore;
  // The mastery verdict uses Azure's overall pronunciation score (a single weak final consonant can leave accuracy
  // high); fall back to accuracy when a response carries no PronScore.
  const verdict = overall ?? accuracy;
  const seen = new Set<string>();
  const phonemeErrors: PhonemeError[] = [];
  for (const word of assessment.words) {
    for (const p of word.phonemes) {
      if (p.accuracy === null || p.accuracy >= BAND_OK) continue;
      const ipa = normalizeIpa(p.ipa);
      if (!ipa || seen.has(ipa)) continue;
      seen.add(ipa);
      phonemeErrors.push({ ipa, accuracy: p.accuracy, word: word.word });
    }
  }
  phonemeErrors.sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100));
  return {
    accuracy,
    prosody: assessment.prosodyScore,
    overall,
    status: statusForScore(verdict),
    phonemeErrors: phonemeErrors.slice(0, MAX_PHONEME_ERRORS),
  };
}

export type AzureCheckState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; assessment: AzureAssessment; aligned: AlignedAnalysis | null; pronunciation: PronunciationScore }
  | { kind: "unconfigured" }
  | { kind: "rate" }
  | { kind: "error" };

/**
 * Score `voice` against `sentence.text` with Azure and align the take with Azure's word timing. Never throws.
 * `unconfigured` means the server has no AZURE_SPEECH_KEY (the rest of the app still works); `rate` means the learner
 * tapped too often; `error` is any other failure (no speech heard, network, bad audio).
 */
export async function scoreWithAzure(voice: VoiceAnalysis, sentence: Sentence): Promise<AzureCheckState> {
  try {
    const res = await fetch("/api/speech-token", { method: "POST" });
    if (res.status === 501) return { kind: "unconfigured" };
    if (res.status === 429) return { kind: "rate" };
    if (!res.ok) return { kind: "error" };
    const { token, region } = (await res.json()) as { token?: unknown; region?: unknown };
    if (typeof token !== "string" || typeof region !== "string") return { kind: "error" };

    const { assessPronunciation, AzureAssessError } = await import("./assess");
    try {
      const assessment = await assessPronunciation({
        wav16k: voice.wav16k,
        referenceText: sentence.text,
        token,
        region,
      });
      if (assessment.status !== "Success" || assessment.words.length === 0) return { kind: "error" };
      return {
        kind: "ok",
        assessment,
        aligned: analyzeVoiceAligned(voice, assessment, sentence),
        pronunciation: pronunciationFrom(assessment),
      };
    } catch (e) {
      void (e instanceof AzureAssessError);
      return { kind: "error" };
    }
  } catch {
    return { kind: "error" };
  }
}
