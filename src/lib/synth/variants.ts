// Real-voice versions of every practice clip. Pure: no network, no DOM.
//
// "Which one is the falling tune?" used to play a synthetic hum. Now the same sentence is spoken by a real neural voice
// once per tune (falling, rising, flat, "finished"), made by tools/make-variants.ts and checked with our own pitch pipeline.
// This file builds the sentence a variant stands for (so the SSML builder and the gate can reuse the course machinery), the
// gate for the flat variant, and the manifest the app reads.

import { trackPitch } from "../audio/pitch.ts";
import { levelsForPattern } from "../intonation/buildLesson.ts";
import type { PatternId, Sentence, ThoughtGroup } from "../intonation/types.ts";
import type { ClipVariant } from "../learn/exercises.ts";

export { EMPTY_VARIANTS, REAL_VARIANTS, VARIANT_MANIFEST_URL, hasRealVariants, parseVariantManifest, variantUrl, type VariantManifest } from "./variantManifest.ts";
import { REAL_VARIANTS } from "./variantManifest.ts";

/** How a sentence ends when said the textbook way (same rule as `endingOf` in learn/exercises.ts). */
function textbookEnding(s: Sentence): "falling" | "rising" {
  return s.groups[s.groups.length - 1].pattern === "2-3" ? "rising" : "falling";
}

function syllableCount(g: ThoughtGroup): number {
  return g.words.reduce((n, w) => n + w.syllables.length, 0);
}

/** The group with a different pattern: same words and nucleus, the levels of the new pattern. */
function withPattern(g: ThoughtGroup, pattern: PatternId): ThoughtGroup {
  const nucleus = g.words.slice(0, g.nucleus.word).reduce((n, w) => n + w.syllables.length, 0) + g.nucleus.syllable;
  const levels = levelsForPattern(pattern, syllableCount(g), nucleus);
  let k = 0;
  return { ...g, pattern, words: g.words.map((w) => ({ ...w, syllables: w.syllables.map((s) => ({ ...s, levels: levels[k++] })) })) };
}

function flatGroup(g: ThoughtGroup): ThoughtGroup {
  return { ...g, words: g.words.map((w) => ({ ...w, syllables: w.syllables.map((s) => ({ ...s, levels: [2] })) })) };
}

/**
 * The sentence a clip variant stands for, so the course's own SSML builder and rule engine can make and check it:
 *  - falling / rising: the sentence's own tune when that IS its textbook ending, otherwise its last group re-tuned
 *    (a yes/no question said falling, a statement said rising)
 *  - finished: every group falls to low (2-3-1), the typical mistake where a part should stay open
 *  - flat: every syllable at level 2 (no peak; it has its own gate, `flatGate`)
 * Null for "busy" (no real clip is made for it).
 */
export function variantSentence(sentence: Sentence, variant: ClipVariant): Sentence | null {
  const last = sentence.groups.length - 1;
  switch (variant) {
    case "falling":
    case "rising": {
      if (textbookEnding(sentence) === variant) return sentence;
      const pattern: PatternId = variant === "falling" ? "2-3-1" : "2-3";
      return { ...sentence, groups: sentence.groups.map((g, i) => (i === last ? withPattern(g, pattern) : g)) };
    }
    case "finished":
      return { ...sentence, groups: sentence.groups.map((g) => (g.pattern === "2-3-1" || g.pattern === "3-1" ? g : withPattern(g, "2-3-1"))) };
    case "flat":
      return { ...sentence, groups: sentence.groups.map(flatGroup) };
    case "busy":
      return null;
  }
}

/** Which variants are worth making for a sentence ("finished" only differs from "falling" when some group is open). */
export function variantsToMake(sentence: Sentence): ClipVariant[] {
  const hasOpen = sentence.groups.length > 1 && sentence.groups.some((g) => g.pattern === "2-3-2" || g.pattern === "2-3");
  return REAL_VARIANTS.filter((v) => v !== "finished" || hasOpen);
}

// ---------------------------------------------------------------------------
// The flat gate
// ---------------------------------------------------------------------------

export interface FlatGate {
  pass: boolean;
  /** Spread of the voiced pitch (10th to 90th percentile), in semitones. */
  rangeSt: number | null;
  /** Pitch at the end of the clip minus the middle, in semitones. */
  endSt: number | null;
  reasons: string[];
}

/** A flat clip may wander a little (all speech does) but must have no clear peak and no clear rise or fall at the end. */
export const FLAT_LIMITS = { rangeSt: 4.5, endSt: 2.2 };

const st = (hz: number, ref: number) => 12 * Math.log2(hz / ref);
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

export function flatGate(samples: Float32Array, sampleRate: number): FlatGate {
  const hz = trackPitch(samples, sampleRate)
    .filter((f) => f.hz !== null)
    .map((f) => f.hz as number);
  if (hz.length < 12) return { pass: false, rangeSt: null, endSt: null, reasons: ["no pitch found"] };
  const sorted = [...hz].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const rangeSt = st(q(0.9), q(0.1));
  const tail = median(hz.slice(Math.floor(hz.length * 0.8)));
  const body = median(hz.slice(Math.floor(hz.length * 0.25), Math.floor(hz.length * 0.75)));
  const endSt = st(tail, body);
  const reasons: string[] = [];
  if (rangeSt > FLAT_LIMITS.rangeSt) reasons.push(`pitch range ${rangeSt.toFixed(1)} st is too wide for a flat clip`);
  if (Math.abs(endSt) > FLAT_LIMITS.endSt) reasons.push(`the end ${endSt > 0 ? "rises" : "falls"} ${Math.abs(endSt).toFixed(1)} st`);
  return { pass: reasons.length === 0, rangeSt, endSt, reasons };
}
