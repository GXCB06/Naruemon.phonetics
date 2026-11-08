// Bilingual feedback lines for the lesson player's bottom sheet. Pure.

import { nucleusLabel } from "../intonation/buildLesson.ts";
import { pickTopTip } from "../intonation/tips.ts";
import type { AnalysisResult, Bilingual, Sentence } from "../intonation/types.ts";
import type { ClipVariant } from "./exercises.ts";
import { PASS_SCORE } from "./score.ts";

export interface Feedback {
  passed: boolean;
  /** "Nice!" or "Almost". */
  title: Bilingual;
  /** One short explanation. */
  detail: Bilingual;
}

export const NICE: Bilingual = { en: "Nice!", th: "เยี่ยม!" };
export const ALMOST: Bilingual = { en: "Almost", th: "เกือบแล้ว" };

const HEAR_RIGHT: Record<Exclude<ClipVariant, "falling">, Bilingual> = {
  rising: {
    en: "Right! A falling sentence ends LOW. The other clip went up at the end.",
    th: "ถูกต้อง! ประโยคเสียงตกจะจบด้วยเสียงต่ำ ส่วนอีกเสียงหนึ่งขึ้นสูงตอนท้าย",
  },
  flat: {
    en: "Right! It rises to one peak, then drops. The other clip was flat.",
    th: "ถูกต้อง! เสียงขึ้นสูงที่จุดเดียวแล้วลงต่ำ ส่วนอีกเสียงหนึ่งเรียบเกินไป",
  },
  busy: {
    en: "Right! One peak, then down. The other clip had a bump on every word.",
    th: "ถูกต้อง! มีจุดสูงสุดจุดเดียวแล้วลงต่ำ ส่วนอีกเสียงหนึ่งขึ้นสูงทุกคำ",
  },
};

const HEAR_WRONG: Record<Exclude<ClipVariant, "falling">, Bilingual> = {
  rising: {
    en: "Not quite. The other clip is the falling one: it ends LOW. This one went up at the end.",
    th: "ยังไม่ใช่ เสียงตกคืออีกเสียงหนึ่ง จะจบด้วยเสียงต่ำ ส่วนเสียงนี้ขึ้นสูงตอนท้าย",
  },
  flat: {
    en: "Not quite. The falling tune rises to one clear peak, then drops. This one was flat.",
    th: "ยังไม่ใช่ เสียงตกต้องขึ้นสูงที่จุดเดียวชัดเจนแล้วลงต่ำ เสียงนี้เรียบเกินไป",
  },
  busy: {
    en: "Not quite. The falling tune has only ONE peak. This one had a bump on every word.",
    th: "ยังไม่ใช่ เสียงตกมีจุดสูงสุดเพียงจุดเดียว เสียงนี้ขึ้นสูงทุกคำ",
  },
};

/** Feedback for "Hear it": which clip the learner chose, and what the wrong clip did. */
export function hearFeedback(right: boolean, wrongClip: Exclude<ClipVariant, "falling">): Feedback {
  return { passed: right, title: right ? NICE : ALMOST, detail: (right ? HEAR_RIGHT : HEAR_WRONG)[wrongClip] };
}

/** The syllable the peak goes on, written like "TA-", "NAME" or "-RIVE". */
export function peakLabel(sentence: Sentence): string {
  const g = sentence.groups[0];
  const word = g.words[g.nucleus.word];
  return nucleusLabel(
    word.syllables.map((s) => s.text),
    g.nucleus.syllable,
  );
}

/** Feedback for "Find the peak". */
export function peakFeedback(right: boolean, sentence: Sentence): Feedback {
  const label = peakLabel(sentence);
  return right
    ? {
        passed: true,
        title: NICE,
        detail: {
          en: `Yes! The peak is on ${label}: the stressed syllable of the last content word.`,
          th: `ใช่แล้ว! จุดสูงสุดอยู่ที่ ${label} พยางค์เน้นของคำสำคัญคำสุดท้าย`,
        },
      }
    : {
        passed: false,
        title: ALMOST,
        detail: {
          en: `The peak goes on ${label}: the stressed syllable of the last content word.`,
          th: `จุดสูงสุดอยู่ที่ ${label} พยางค์เน้นของคำสำคัญคำสุดท้าย`,
        },
      };
}

/**
 * Feedback for "Draw it" and "Shadow it": the rule engine's single most important tip (or praise).
 * "Nice!" needs a good score, no failed check, and the two things this course is about (where the peak is and how the
 * sentence ends) not even warned about. That way the green sheet never carries a "your rise is too early" tip.
 */
export function analysisFeedback(result: AnalysisResult): Feedback {
  const tip = pickTopTip(result);
  const core = tip.kind === "tip" && (tip.check.id === "ending" || tip.check.id === "peakPlacement");
  const failed = tip.kind === "tip" && tip.check.status === "fail";
  const passed = result.overall >= PASS_SCORE && !failed && !core;
  return { passed, title: passed ? NICE : ALMOST, detail: tip.kind === "praise" ? tip.message : tip.check.message };
}
