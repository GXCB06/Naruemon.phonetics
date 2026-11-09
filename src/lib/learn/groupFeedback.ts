// Bilingual "Hear it" feedback for the lists and non-final units, where the question is about the thought groups BEFORE the
// last one: do they stay open (rise on every item / come back to mid) or sound finished (drop to low)? Pure.

import type { Bilingual } from "../intonation/types.ts";
import type { ClipVariant, Ending } from "./exercises.ts";

type Wrong = "finished" | "flat";

// "Which clip sounds UNFINISHED?": the learner should pick the textbook clip (the first part comes back to mid, 2-3-2).
const UNFINISHED_RIGHT: Record<Wrong, Bilingual> = {
  finished: {
    en: "Right! The first part rises on its last important word and comes back to MID (level 2), so it sounds unfinished: more is coming. In the other clip it dropped to LOW and sounded finished.",
    th: "ถูกต้อง! ส่วนแรกขึ้นสูงที่คำสำคัญคำสุดท้ายแล้วกลับมาที่ระดับกลาง (2) จึงฟังดูยังไม่จบ ผู้ฟังรู้ว่ายังมีต่อ ส่วนอีกเสียงหนึ่งลงต่ำจึงฟังเหมือนจบแล้ว",
  },
  flat: {
    en: "Right! The first part rises on its last important word, then comes back to MID (level 2), so more is coming. The other clip was flat.",
    th: "ถูกต้อง! ส่วนแรกขึ้นสูงที่คำสำคัญคำสุดท้ายแล้วกลับมาที่ระดับกลาง (2) ผู้ฟังรู้ว่ายังมีต่อ ส่วนอีกเสียงหนึ่งเรียบเกินไป",
  },
};
const UNFINISHED_WRONG: Record<Wrong, Bilingual> = {
  finished: {
    en: "Not quite. This clip drops to LOW (level 1) after the first part, so it sounds finished. The unfinished one comes back only to MID (level 2).",
    th: "ยังไม่ใช่ เสียงนี้ลงต่ำ (ระดับ 1) หลังส่วนแรก จึงฟังเหมือนจบแล้ว เสียงที่ยังไม่จบจะกลับมาแค่ระดับกลาง (2)",
  },
  flat: {
    en: "Not quite. An unfinished part needs a clear rise on its last important word, then back to MID (level 2). This clip was flat.",
    th: "ยังไม่ใช่ ส่วนที่ยังไม่จบต้องขึ้นสูงชัดเจนที่คำสำคัญคำสุดท้ายแล้วกลับมาที่ระดับกลาง (2) เสียงนี้เรียบเกินไป",
  },
};

// "Which clip sounds FINISHED after the first part?": the learner spots the mistake (the clip that drops to low too early).
const FINISHED_RIGHT: Bilingual = {
  en: "Right! That clip drops to LOW (level 1) after the first part, so it sounds finished. That is the mistake to avoid: a part that is not the last one should come back only to level 2.",
  th: "ถูกต้อง! เสียงนี้ลงต่ำ (ระดับ 1) หลังส่วนแรก จึงฟังเหมือนจบแล้ว นี่คือข้อผิดพลาดที่ควรเลี่ยง ส่วนที่ไม่ใช่ส่วนสุดท้ายควรกลับมาแค่ระดับ 2",
};
const FINISHED_WRONG: Bilingual = {
  en: "Not quite. The other clip is the one that drops to LOW (level 1) and sounds finished. This one comes back to MID (level 2), which is right: the sentence is still going.",
  th: "ยังไม่ใช่ อีกเสียงหนึ่งต่างหากที่ลงต่ำ (ระดับ 1) และฟังเหมือนจบแล้ว เสียงนี้กลับมาที่ระดับกลาง (2) ซึ่งถูกต้อง เพราะประโยคยังไม่จบ",
};

// "Which clip rises on every item?": statement lists (the last item falls) and choice questions (the last item rises too).
function lifting(right: boolean, wrong: Wrong, textbook: Ending): Bilingual {
  const falls = textbook === "falling";
  if (right) {
    if (wrong === "flat") {
      return falls
        ? {
            en: "Right! Each item has its own rise, so the listener hears a list with more to come. The last item comes down to finish. The other clip was flat.",
            th: "ถูกต้อง! ทุกรายการขึ้นเสียงของตัวเอง ผู้ฟังจึงรู้ว่ายังมีรายการต่อไป ส่วนรายการสุดท้ายลงเสียงให้จบ อีกเสียงหนึ่งเรียบเกินไป",
          }
        : {
            en: "Right! Each choice has its own rise, the last one too. The other clip was flat.",
            th: "ถูกต้อง! ทุกตัวเลือกขึ้นเสียงของตัวเอง รวมถึงตัวเลือกสุดท้ายด้วย อีกเสียงหนึ่งเรียบเกินไป",
          };
    }
    return falls
      ? {
          en: "Right! Each item goes UP, so the listener hears a list with more to come. Only the last item comes down to finish. The other clip dropped on every item.",
          th: "ถูกต้อง! ทุกรายการขึ้นเสียง ผู้ฟังจึงรู้ว่ายังมีรายการต่อไป มีแค่รายการสุดท้ายที่ลงเสียงให้จบ ส่วนอีกเสียงหนึ่งลงต่ำทุกรายการ",
        }
      : {
          en: "Right! Each choice goes UP, the last one too. The other clip dropped on every item, like separate statements.",
          th: "ถูกต้อง! ทุกตัวเลือกขึ้นเสียง รวมถึงตัวเลือกสุดท้ายด้วย ส่วนอีกเสียงหนึ่งลงต่ำทุกตัวเลือก เหมือนประโยคบอกเล่าแยกกัน",
        };
  }
  if (wrong === "flat") {
    return {
      en: "Not quite. Each item needs its own clear rise. This clip was flat.",
      th: "ยังไม่ใช่ ทุกรายการต้องขึ้นเสียงชัดเจนของตัวเอง เสียงนี้เรียบเกินไป",
    };
  }
  return falls
    ? {
        en: "Not quite. In a list every item goes UP; only the last item of a statement comes down. This clip dropped to low on every item.",
        th: "ยังไม่ใช่ ในลิสต์ทุกรายการต้องขึ้นเสียง มีแค่รายการสุดท้ายของประโยคบอกเล่าที่ลงเสียง เสียงนี้ลงต่ำทุกรายการ",
      }
    : {
        en: "Not quite. Every choice goes UP, even the last one. This clip dropped to low on every item.",
        th: "ยังไม่ใช่ ทุกตัวเลือกต้องขึ้นเสียง แม้แต่ตัวเลือกสุดท้าย เสียงนี้ลงต่ำทุกตัวเลือก",
      };
}

/**
 * The explanation for a "Hear it" exercise of the lists / non-final units.
 * `right`: the learner picked the asked-for clip. `wrongClip`: what the OTHER clip did. `textbook`: how the sentence ends.
 */
export function groupHearDetail(right: boolean, wrongClip: ClipVariant, ask: "unfinished" | "finished" | "lifting", textbook: Ending): Bilingual {
  const wrong: Wrong = wrongClip === "flat" ? "flat" : "finished";
  if (ask === "unfinished") return (right ? UNFINISHED_RIGHT : UNFINISHED_WRONG)[wrong];
  if (ask === "finished") return right ? FINISHED_RIGHT : FINISHED_WRONG;
  return lifting(right, wrong, textbook);
}
