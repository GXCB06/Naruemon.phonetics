// Teleprompter-style timing for the "Say it" screen: when does each word light up while the learner speaks?
// Pure (no DOM, no React) so it runs in Vitest and can be reused by other exercise screens.

import type { Bilingual, PatternId, Sentence } from "./types.ts";

/** A natural, slightly slow reading pace for a learner. */
export const SEC_PER_SYLLABLE = 0.32;
/** Small pause between thought groups. */
export const GROUP_GAP_SEC = 0.28;
/** Short beat before the first word, so the learner can react to "Go". */
export const LEAD_IN_SEC = 0.3;

export interface KaraokeOptions {
  secPerSyllable?: number;
  groupGapSec?: number;
  leadInSec?: number;
}

export interface KaraokeWord {
  groupIndex: number;
  wordIndex: number;
  /** Word as written (with punctuation). */
  text: string;
  syllables: number;
  /** Time the word lights up, seconds since "Go". */
  startSec: number;
  /** Time the word finishes. */
  endSec: number;
  /** True for the nucleus word of its thought group (the rising point). */
  isNucleus: boolean;
}

export interface EndingArrow {
  /** What the voice does after the peak. */
  kind: "fall" | "midback" | "rise";
  arrow: "↘" | "↗";
  caption: Bilingual;
}

export interface KaraokeGroup {
  groupIndex: number;
  pattern: PatternId;
  startSec: number;
  endSec: number;
  /** Index (into `words`) of the nucleus word. */
  nucleusWord: number;
  ending: EndingArrow;
}

export interface KaraokeTimeline {
  words: KaraokeWord[];
  groups: KaraokeGroup[];
  totalSec: number;
}

/** The arrow that follows the peak, per the course patterns (2-3-1 / 3-1 fall, 2-3-2 back to mid, 2-3 up). */
export function endingFor(pattern: PatternId): EndingArrow {
  switch (pattern) {
    case "2-3":
      return { kind: "rise", arrow: "↗", caption: { en: "stay up", th: "ค้างสูง" } };
    case "2-3-2":
      return { kind: "midback", arrow: "↘", caption: { en: "back to mid", th: "กลับมากลาง" } };
    case "2-3-1":
    case "3-1":
      return { kind: "fall", arrow: "↘", caption: { en: "fall to low", th: "ลงต่ำ" } };
  }
}

export function karaokeTimeline(sentence: Sentence, opts: KaraokeOptions = {}): KaraokeTimeline {
  const sps = opts.secPerSyllable ?? SEC_PER_SYLLABLE;
  const gap = opts.groupGapSec ?? GROUP_GAP_SEC;
  let t = opts.leadInSec ?? LEAD_IN_SEC;
  const words: KaraokeWord[] = [];
  const groups: KaraokeGroup[] = [];

  sentence.groups.forEach((g, gi) => {
    const groupStart = t;
    const firstWord = words.length;
    g.words.forEach((w, wi) => {
      const n = Math.max(1, w.syllables.length);
      words.push({
        groupIndex: gi,
        wordIndex: wi,
        text: w.text,
        syllables: n,
        startSec: t,
        endSec: t + n * sps,
        isNucleus: wi === g.nucleus.word,
      });
      t += n * sps;
    });
    groups.push({
      groupIndex: gi,
      pattern: g.pattern,
      startSec: groupStart,
      endSec: t,
      nucleusWord: firstWord + g.nucleus.word,
      ending: endingFor(g.pattern),
    });
    if (gi < sentence.groups.length - 1) t += gap;
  });

  return { words, groups, totalSec: t };
}

export type WordState = "upcoming" | "active" | "done";

export function wordState(word: Pick<KaraokeWord, "startSec" | "endSec">, elapsedSec: number): WordState {
  if (elapsedSec < word.startSec) return "upcoming";
  if (elapsedSec < word.endSec) return "active";
  return "done";
}
