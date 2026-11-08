// Reference audio for a sentence. Pure part: file naming and the placeholder "robot voice" samples.
// The browser part (fetching the mp3 and playing through Web Audio) lives in src/components/learn/playReference.ts.
//
// Real reference clips (Azure TTS, task B6) will be saved as /audio/<sentenceId>--f.mp3 (female) and --m.mp3 (male).
// Until they exist the app plays the synthetic voice and labels it as a placeholder.

import type { Sentence } from "../intonation/types.ts";
import { ERROR_STYLES, synthesizeSentence } from "../synth/voice.ts";
import { endingOf } from "./exercises.ts";
import type { ClipVariant } from "./exercises.ts";
import { isTagSentence, otherReading, tagReading, tagReadingOf } from "./meaning.ts";

export function referenceUrl(sentenceId: string, voice: "f" | "m" = "f"): string {
  return `/audio/${sentenceId}--${voice}.mp3`;
}

/**
 * The synthetic clip for a variant. "falling" and "rising" name how the clip ends: the one that matches the sentence's
 * own pattern is the textbook tune (every thought group as authored, so a rising sentence rises in each group), the
 * other flips the end of every thought group. "flat" and "busy" are the other typical mistakes.
 * No variant means the textbook tune.
 */
export function placeholderClip(sentence: Sentence, variant: ClipVariant = endingOf(sentence)): { samples: Float32Array; sampleRate: number } {
  if (variant !== "flat" && variant !== "busy" && variant !== endingOf(sentence) && isTagSentence(sentence)) {
    // a tag question's "other ending" is the OTHER MEANING: only the tag changes, the statement keeps its 2-3-1
    const other = tagReading(sentence, otherReading(tagReadingOf(sentence)!));
    return synthesizeSentence(other, { baseHz: 210 });
  }
  const transform =
    variant === "flat"
      ? ERROR_STYLES.flat
      : variant === "busy"
        ? ERROR_STYLES.everyWordTone
        : variant === endingOf(sentence)
          ? undefined
          : ERROR_STYLES.wrongEnding;
  // 210 Hz ≈ a female level-2 pitch, close to what the reference mp3 will be.
  return synthesizeSentence(sentence, { baseHz: 210, transform });
}
