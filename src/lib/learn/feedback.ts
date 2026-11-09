// Bilingual feedback lines for the lesson player's bottom sheet. Pure.

import { nucleusLabel } from "../intonation/buildLesson.ts";
import { pickTopTip } from "../intonation/tips.ts";
import type { AnalysisResult, Bilingual, Sentence } from "../intonation/types.ts";
import type { ClipVariant, Ending, HearAsk } from "./exercises.ts";
import { groupHearDetail } from "./groupFeedback.ts";
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

const HEAR_RIGHT: Record<"rising" | "flat" | "busy", Bilingual> = {
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

const HEAR_WRONG: Record<"rising" | "flat" | "busy", Bilingual> = {
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

// "Which one is the RISING tune?" on a yes/no question, a name or an interjection. The wrong clip ended low or was flat.
const HEAR_RISING_RIGHT: Record<"falling" | "flat", Bilingual> = {
  falling: {
    en: "Right! A rising sentence ends HIGH and stays up. The other clip went down at the end.",
    th: "ถูกต้อง! ประโยคเสียงขึ้นจะจบด้วยเสียงสูงและค้างไว้ ส่วนอีกเสียงหนึ่งลงต่ำตอนท้าย",
  },
  flat: {
    en: "Right! It rises on the last important word and stays up. The other clip was flat.",
    th: "ถูกต้อง! เสียงขึ้นที่คำสำคัญคำสุดท้ายแล้วค้างไว้ ส่วนอีกเสียงหนึ่งเรียบเกินไป",
  },
};
const HEAR_RISING_WRONG: Record<"falling" | "flat", Bilingual> = {
  falling: {
    en: "Not quite. The rising one stays HIGH at the end. This clip went down, like a statement.",
    th: "ยังไม่ใช่ เสียงขึ้นต้องค้างสูงตอนท้าย เสียงนี้ลงต่ำเหมือนประโยคบอกเล่า",
  },
  flat: {
    en: "Not quite. The rising tune goes up on the last important word and stays up. This one was flat.",
    th: "ยังไม่ใช่ เสียงขึ้นต้องขึ้นที่คำสำคัญคำสุดท้ายแล้วค้างไว้ เสียงนี้เรียบเกินไป",
  },
};

// "Which one is the FALLING tune?" on a sentence that should RISE: the learner spots the mistake.
const HEAR_MISTAKE_RIGHT: Record<Ending, Bilingual> = {
  falling: {
    en: "Right! That clip ends LOW. A yes/no question or a name should go UP, so a falling tune is the one to avoid.",
    th: "ถูกต้อง! เสียงนี้จบด้วยเสียงต่ำ คำถาม Yes/No หรือการเรียกชื่อต้องขึ้นเสียง จึงไม่ควรลงต่ำ",
  },
  rising: {
    en: "Right! That clip ends UP. This sentence should FALL, so a rising tune is the one to avoid.",
    th: "ถูกต้อง! เสียงนี้จบด้วยเสียงสูง ประโยคนี้ต้องลงเสียงต่ำ จึงไม่ควรขึ้นสูง",
  },
};
const HEAR_MISTAKE_WRONG: Record<Ending, Bilingual> = {
  falling: {
    en: "Not quite. The other clip is the falling one: it ends LOW. This one ends HIGH, which is right for a question.",
    th: "ยังไม่ใช่ เสียงตกคืออีกเสียงหนึ่ง จะจบด้วยเสียงต่ำ ส่วนเสียงนี้จบสูง ซึ่งถูกต้องสำหรับคำถาม",
  },
  rising: {
    en: "Not quite. The other clip is the rising one: it ends HIGH. This one ends LOW, which is right for this sentence.",
    th: "ยังไม่ใช่ เสียงขึ้นคืออีกเสียงหนึ่ง จะจบด้วยเสียงสูง ส่วนเสียงนี้จบต่ำ ซึ่งถูกต้องสำหรับประโยคนี้",
  },
};

/**
 * Feedback for "Hear it". `right`: the learner picked the asked-for clip. `wrongClip`: what the OTHER clip did.
 * `ask`: the tune the learner was asked to find (default falling). `textbook`: how the sentence really ends (default
 * `ask` when it is an ending); they differ when a rising sentence is asked "which one falls?". The asks "unfinished",
 * "finished" and "lifting" belong to the non-final and list units (see groupFeedback.ts).
 */
export function hearFeedback(right: boolean, wrongClip: ClipVariant, ask: HearAsk = "falling", textbook?: Ending): Feedback {
  let detail: Bilingual;
  if (ask === "unfinished" || ask === "finished" || ask === "lifting") {
    detail = groupHearDetail(right, wrongClip, ask, textbook ?? "falling");
    return { passed: right, title: right ? NICE : ALMOST, detail };
  }
  textbook ??= ask;
  if (ask !== textbook) {
    detail = (right ? HEAR_MISTAKE_RIGHT : HEAR_MISTAKE_WRONG)[ask];
  } else if (ask === "rising") {
    const k = wrongClip === "falling" ? "falling" : "flat";
    detail = (right ? HEAR_RISING_RIGHT : HEAR_RISING_WRONG)[k];
  } else {
    const k = wrongClip === "flat" || wrongClip === "busy" ? wrongClip : "rising";
    detail = (right ? HEAR_RIGHT : HEAR_WRONG)[k];
  }
  return { passed: right, title: right ? NICE : ALMOST, detail };
}

/** The syllable the peak goes on in a thought group (the first by default), written like "TA-", "NAME" or "-RIVE". */
export function peakLabel(sentence: Sentence, groupIndex = 0): string {
  const g = sentence.groups[groupIndex];
  const word = g.words[g.nucleus.word];
  return nucleusLabel(
    word.syllables.map((s) => s.text),
    g.nucleus.syllable,
  );
}

/** One label per thought group, in order. */
export function peakLabels(sentence: Sentence): string[] {
  return sentence.groups.map((_, i) => peakLabel(sentence, i));
}

/** "NAME", "JOHN and -STAND", "A, B and C". */
function joinLabels(labels: string[]): string {
  return labels.length <= 1 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}
function joinLabelsTh(labels: string[]): string {
  return labels.length <= 1 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} และ ${labels[labels.length - 1]}`;
}

/** Feedback for "Find the peak". Several thought groups: the learner must have found the peak of every group. */
export function peakFeedback(right: boolean, sentence: Sentence): Feedback {
  const labels = peakLabels(sentence);
  const label = joinLabels(labels);
  const labelTh = joinLabelsTh(labels);
  const many = labels.length > 1;
  const rising = sentence.groups.every((g) => g.pattern === "2-3");
  if (!rising && !many) {
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
  // Rising groups: the rise STARTS on the stressed syllable of the last content word, then the voice stays up.
  const en = many
    ? `The rises start on ${label}: the stressed syllable of the last content word in each thought group. Then the voice stays up.`
    : `The rise starts on ${label}: the stressed syllable of the last content word. Then the voice stays up.`;
  const th = many
    ? `เสียงเริ่มขึ้นที่ ${labelTh} พยางค์เน้นของคำสำคัญคำสุดท้ายในแต่ละกลุ่มคำ แล้วค้างเสียงสูงไว้`
    : `เสียงเริ่มขึ้นที่ ${labelTh} พยางค์เน้นของคำสำคัญคำสุดท้าย แล้วค้างเสียงสูงไว้`;
  if (!rising) {
    // several groups of mixed patterns: the plain statement of where the peaks go
    return {
      passed: right,
      title: right ? NICE : ALMOST,
      detail: {
        en: `${right ? "Yes! " : ""}The peaks are on ${label}: the stressed syllable of the last content word in each thought group.`,
        th: `${right ? "ใช่แล้ว! " : ""}จุดสูงสุดอยู่ที่ ${labelTh} พยางค์เน้นของคำสำคัญคำสุดท้ายในแต่ละกลุ่มคำ`,
      },
    };
  }
  return { passed: right, title: right ? NICE : ALMOST, detail: { en: `${right ? "Yes! " : ""}${en}`, th: `${right ? "ใช่แล้ว! " : ""}${th}` } };
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
