// Core types shared by the rule engine, the drawing quiz and the voice pipeline.
// Pitch "levels" follow the course material: 1 low, 2 mid, 3 high, 4 extra high.
// Contours store levels as continuous numbers (e.g. 2.6) so both voice and drawings fit.

export type PatternId =
  | "2-3-1" // falling: statements, commands, wh-questions, exclamations
  | "2-3-2" // non-final: earlier clauses, intro phrases, conditionals
  | "2-3" // rising: yes/no questions, direct address, lists, unsure tags
  | "3-1"; // tag question when the speaker is sure

export interface Syllable {
  /** Spelling chunk shown on screen, e.g. "pre" + "tty". */
  text: string;
  /** IPA for this syllable without stress mark, e.g. "prɪ". */
  ipa: string;
  /** Lexically stressed syllable (gets ˈ in IPA). */
  stressed?: boolean;
  /** Target pitch level(s). Two values mean a glide inside the syllable, e.g. [3, 1]. */
  levels: number[];
}

export interface Word {
  text: string;
  syllables: Syllable[];
}

export interface ThoughtGroup {
  pattern: PatternId;
  words: Word[];
  /** Where the rising point (nucleus) is: the stressed syllable of the last content word. */
  nucleus: { word: number; syllable: number };
}

export interface Sentence {
  id: string;
  text: string;
  /** Short label, e.g. "Statement" or "Tag question (sure)". */
  kind: string;
  /** One-line hint of why this pattern applies. */
  note: { en: string; th: string };
  groups: ThoughtGroup[];
}

export interface ContourPoint {
  /** Normalised time 0..1 across the whole sentence. */
  t: number;
  /** Continuous pitch level (1..4 scale), or null when unvoiced / no ink. */
  v: number | null;
}

export type Contour = ContourPoint[];

/** Where each syllable sits on the shared 0..1 time axis (used by drawings, targets and charts). */
export interface SyllableSlot {
  groupIndex: number;
  wordIndex: number;
  syllableIndex: number;
  start: number;
  end: number;
  isNucleus: boolean;
  syllable: Syllable;
}

export interface Layout {
  slots: SyllableSlot[];
  groupSpans: { start: number; end: number }[];
}

export type CheckId = "start" | "singlePeak" | "peakPlacement" | "ending" | "range" | "break";
export type CheckStatus = "pass" | "warn" | "fail" | "skip";

export interface Bilingual {
  en: string;
  th: string;
}

export interface Check {
  id: CheckId;
  status: CheckStatus;
  message: Bilingual;
}

export interface GroupFeatures {
  startLevel: number;
  endLevel: number;
  /** How low the voice got in the closing stretch (the lowest half of the last 12%): a trailing-off tail does not hide it. */
  endLow: number;
  maxLevel: number;
  minLevel: number;
  /** p90 - p10 of the levels; 1 level = 4 semitones. */
  range: number;
  /** End direction measured over the last part of the group. */
  endSlope: number;
  /** Prominent interior peaks (each a separate "rise"). */
  interiorPeaks: number;
  /** Time (0..1, sentence axis) where the main rise crosses its halfway point, if any. */
  risePointT: number | null;
  /** Time of the highest point. */
  maxT: number;
}

export interface GroupResult {
  groupIndex: number;
  pattern: PatternId;
  checks: Check[];
  /** 0–100 similarity of the whole shape to the target line (DTW). */
  shapeScore: number;
  features: GroupFeatures;
}

export type Modality = "speak" | "draw";

export interface AnalysisResult {
  modality: Modality;
  groups: GroupResult[];
  /** Sentence-level checks, e.g. a missing pause between thought groups. */
  sentenceChecks: Check[];
  /** 0–100 overall score. */
  overall: number;
  /** Rounded [start, end] level per syllable when timing is known (drawing; voice from Phase 0b). */
  syllableLevels: number[][] | null;
  /** The learner's contour re-timed onto the sentence layout, ready to draw over the target. */
  aligned: Contour;
}
