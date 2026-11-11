// "Match the pairs": what each clip does, and the feedback once every pair is found. Pure.

import type { Bilingual } from "../intonation/types.ts";
import type { ClipVariant } from "./exercises.ts";

/** How each match clip sounds, said by its ending. */
export const MATCH_LABEL: Partial<Record<ClipVariant, { label: Bilingual; arrow: string }>> = {
  falling: { label: { en: "Ends low", th: "จบเสียงต่ำ" }, arrow: "↘" },
  rising: { label: { en: "Ends high", th: "จบเสียงสูง" }, arrow: "↗" },
  flat: { label: { en: "Flat, no peak", th: "เรียบ ไม่มีจุดสูง" }, arrow: "→" },
};

/** Score for a finished board: every wrong try costs 25 points; two or more wrong tries is not a pass. */
export function matchScore(mistakes: number): { score: number; passed: boolean } {
  return { score: Math.max(25, 100 - 25 * mistakes), passed: mistakes <= 1 };
}

export function matchFeedback(mistakes: number): { passed: boolean; title: Bilingual; detail: Bilingual } {
  const { passed } = matchScore(mistakes);
  if (mistakes === 0)
    return {
      passed,
      title: { en: "Nice!", th: "เยี่ยม!" },
      detail: { en: "All three on the first try. You can hear where a tune ends.", th: "ถูกหมดตั้งแต่ครั้งแรก ฟังออกว่าทำนองจบแบบไหน" },
    };
  if (passed)
    return {
      passed,
      title: { en: "Good!", th: "ดีมาก!" },
      detail: { en: "One slip, then all matched. Listen to the very END of each clip.", th: "พลาดไปหนึ่งครั้ง แต่จับคู่ครบ ฟังตอนท้ายสุดของแต่ละเสียง" },
    };
  return {
    passed,
    title: { en: "Keep listening", th: "ฟังอีกนิดนะ" },
    detail: {
      en: `${mistakes} wrong tries. Listen to the last word: does the voice drop low, stay high, or never move?`,
      th: `ผิด ${mistakes} ครั้ง ลองฟังคำสุดท้าย เสียงลงต่ำ ค้างสูง หรือไม่ขยับเลย?`,
    },
  };
}
