// Reference audio for a sentence. Pure part: file naming and the placeholder "robot voice" samples.
// The browser part (fetching the mp3 and playing through Web Audio) lives in src/components/learn/playReference.ts.
//
// Real reference clips (Azure TTS, task B6, made by tools/make-tts.ts) are /audio/<sentenceId>--f.mp3 (female) and
// --m.mp3 (male). /audio/manifest.json lists which exist: only clips that passed their own pattern in our analysis are
// there. A sentence without a clip plays the synthetic voice, labelled as a placeholder.

import { levelsForGroup } from "../intonation/buildLesson.ts";
import type { Sentence } from "../intonation/types.ts";
import { ERROR_STYLES, synthesizeSentence } from "../synth/voice.ts";
import { endingOf } from "./exercises.ts";
import type { ClipVariant } from "./exercises.ts";
import { isTagSentence, otherReading, tagReading, tagReadingOf } from "./meaning.ts";

export type ReferenceVoice = "f" | "m";

export function referenceUrl(sentenceId: string, voice: ReferenceVoice = "f"): string {
  return `/audio/${sentenceId}--${voice}.mp3`;
}

export const MANIFEST_URL = "/audio/manifest.json";

/** Which reference clips exist, by sentence id. */
export interface ReferenceManifest {
  clips: Record<string, ReferenceVoice[]>;
}

export const EMPTY_MANIFEST: ReferenceManifest = { clips: {} };

/** Read manifest.json leniently: anything malformed counts as "no clip" (the app then plays the placeholder voice). */
export function parseManifest(data: unknown): ReferenceManifest {
  const clips: Record<string, ReferenceVoice[]> = {};
  const raw = data !== null && typeof data === "object" ? (data as { clips?: unknown }).clips : undefined;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { clips };
  for (const [id, voices] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(voices)) continue;
    const ok = voices.filter((v): v is ReferenceVoice => v === "f" || v === "m");
    if (ok.length) clips[id] = [...new Set(ok)];
  }
  return { clips };
}

/** The voices that have a clip for this sentence. */
export function referenceVoices(manifest: ReferenceManifest, sentenceId: string): ReferenceVoice[] {
  return Object.hasOwn(manifest.clips, sentenceId) ? manifest.clips[sentenceId] : [];
}

/**
 * The voice to play for a sentence: `preferred` when it has a clip, otherwise the other voice, otherwise null (placeholder).
 * `fairWith` lists sentences whose clip must exist in the SAME voice too (e.g. the other reading of a tag question), so a
 * real voice never sits next to the robot voice in a way that gives the answer away.
 */
export function pickReferenceVoice(
  manifest: ReferenceManifest,
  sentenceId: string,
  preferred: ReferenceVoice = "f",
  fairWith: readonly string[] = [],
): ReferenceVoice | null {
  const order: ReferenceVoice[] = preferred === "f" ? ["f", "m"] : ["m", "f"];
  return order.find((v) => [sentenceId, ...fairWith].every((id) => referenceVoices(manifest, id).includes(v))) ?? null;
}

/** Other sentences with the same words but a different tune (the two readings of a tag question). */
export function sameTextIds(sentence: Sentence, all: readonly Sentence[]): string[] {
  const tune = (s: Sentence) => s.groups.map((g) => g.pattern).join(" ");
  const ids = all.filter((s) => s.id !== sentence.id && s.text === sentence.text && tune(s) !== tune(sentence)).map((s) => s.id);
  return [...new Set(ids)];
}

/**
 * The same sentence with EVERY thought group falling (2-3-1) on its own nucleus: the parts that should stay open (non-final
 * 2-3-2 parts, list items) now drop to low and sound finished. Groups that already fall are unchanged.
 */
export function allFalling(sentence: Sentence): Sentence {
  return {
    ...sentence,
    groups: sentence.groups.map((g) => {
      const total = g.words.reduce((n, w) => n + w.syllables.length, 0);
      const nucleus = g.words.slice(0, g.nucleus.word).reduce((n, w) => n + w.syllables.length, 0) + g.nucleus.syllable;
      const levels = levelsForGroup(total, nucleus);
      let flat = 0;
      return {
        ...g,
        pattern: "2-3-1" as const,
        words: g.words.map((w) => ({ ...w, syllables: w.syllables.map((s) => ({ ...s, levels: levels[flat++] })) })),
      };
    }),
  };
}

/**
 * The synthetic clip for a variant. "falling" and "rising" name how the clip ends: the one that matches the sentence's
 * own pattern is the textbook tune (every thought group as authored, so a rising sentence rises in each group), the
 * other flips the end of every thought group. "flat" and "busy" are the other typical mistakes.
 * No variant means the textbook tune.
 */
export function placeholderClip(sentence: Sentence, variant: ClipVariant = endingOf(sentence)): { samples: Float32Array; sampleRate: number } {
  if (variant === "finished") return synthesizeSentence(allFalling(sentence), { baseHz: 210 });
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
