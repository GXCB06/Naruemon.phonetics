// Reference audio for a sentence. Pure part: file naming and the placeholder "robot voice" samples.
// The browser part (fetching the mp3 and playing through Web Audio) lives in src/components/learn/playReference.ts.
//
// Real reference clips (Azure TTS, task B6) will be saved as /audio/<sentenceId>--f.mp3 (female) and --m.mp3 (male).
// Until they exist the app plays the synthetic voice and labels it as a placeholder.

import type { Sentence } from "../intonation/types.ts";
import { ERROR_STYLES, synthesizeSentence } from "../synth/voice.ts";
import type { ClipVariant } from "./exercises.ts";

export function referenceUrl(sentenceId: string, voice: "f" | "m" = "f"): string {
  return `/audio/${sentenceId}--${voice}.mp3`;
}

/** The synthetic clip for a variant: the textbook tune, or one of the typical mistakes. */
export function placeholderClip(sentence: Sentence, variant: ClipVariant = "falling"): { samples: Float32Array; sampleRate: number } {
  const transform =
    variant === "rising" ? ERROR_STYLES.wrongEnding : variant === "flat" ? ERROR_STYLES.flat : variant === "busy" ? ERROR_STYLES.everyWordTone : undefined;
  // 210 Hz ≈ a female level-2 pitch, close to what the reference mp3 will be.
  return synthesizeSentence(sentence, { baseHz: 210, transform });
}
