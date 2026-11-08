// Tag questions: the same words mean different things with different tunes. Pure logic for the Tags unit and the
// "Meaning match" exercise (hear one clip, say what the speaker means). No DOM, no React.
//
//   SURE     "Harry is coming, isn't he?"  2-3-1 then the tag FALLS 3-1  -> I know it, I want you to agree
//   NOT SURE "Harry is coming, isn't he?"  2-3-1 then the tag RISES 2-3  -> I don't know, I'm really asking

import { levelsForFallingTag, levelsForRisingGroup } from "../intonation/buildLesson.ts";
import type { Bilingual, Sentence, ThoughtGroup } from "../intonation/types.ts";
import type { ClipVariant, Ending } from "./exercises.ts";
import { ALMOST, NICE } from "./feedback.ts";
import type { Feedback } from "./feedback.ts";

export type TagReading = "sure" | "unsure";

/** A tag question is a 2-3-1 statement followed by a tag group that falls (3-1, sure) or rises (2-3, not sure). */
export function tagReadingOf(sentence: Sentence): TagReading | null {
  const [first, tag] = sentence.groups;
  if (sentence.groups.length !== 2 || first.pattern !== "2-3-1") return null;
  if (tag.pattern === "3-1") return "sure";
  if (tag.pattern === "2-3") return "unsure";
  return null;
}

export function isTagSentence(sentence: Sentence): boolean {
  return tagReadingOf(sentence) !== null;
}

/** How a clip of this reading ENDS (what "Hear it" calls falling / rising). */
export function endingOfReading(reading: TagReading): Ending {
  return reading === "sure" ? "falling" : "rising";
}

export function otherReading(reading: TagReading): TagReading {
  return reading === "sure" ? "unsure" : "sure";
}

/** Flat index of the nucleus syllable inside a thought group. */
function nucleusIndex(g: ThoughtGroup): number {
  return g.words.slice(0, g.nucleus.word).reduce((n, w) => n + w.syllables.length, 0) + g.nucleus.syllable;
}

/**
 * The same sentence said with the OTHER meaning (or the same one): the statement is untouched, only the tag group gets the
 * pitch levels of the other reading. Used for the placeholder voice, so a "wrong" clip changes the tag and nothing else.
 */
export function tagReading(sentence: Sentence, reading: TagReading): Sentence {
  if (tagReadingOf(sentence) === null) throw new Error(`${sentence.id} is not a tag question`);
  const last = sentence.groups.length - 1;
  const tag = sentence.groups[last];
  const total = tag.words.reduce((n, w) => n + w.syllables.length, 0);
  const idx = nucleusIndex(tag);
  const levels = reading === "sure" ? levelsForFallingTag(total, idx) : levelsForRisingGroup(total, idx);
  let flat = 0;
  const groups = sentence.groups.map((g, gi): ThoughtGroup => {
    if (gi !== last) return g;
    return {
      ...g,
      pattern: reading === "sure" ? "3-1" : "2-3",
      words: g.words.map((w) => ({ ...w, syllables: w.syllables.map((s) => ({ ...s, levels: levels[flat++] })) })),
    };
  });
  return { ...sentence, groups };
}

// ───────────────────────────── Meaning match ─────────────────────────────

export interface MeaningChoice {
  reading: TagReading;
  label: Bilingual;
  /** What the tag does. */
  tune: Bilingual;
}

/** The two answers, in the order shown. */
export const MEANING_CHOICES: readonly [MeaningChoice, MeaningChoice] = [
  {
    reading: "sure",
    label: { en: "I'm sure", th: "ฉันมั่นใจ" },
    tune: { en: "falling tag ↘ (3-1)", th: "tag ตก ↘ (3-1)" },
  },
  {
    reading: "unsure",
    label: { en: "I'm asking", th: "ฉันกำลังถาม" },
    tune: { en: "rising tag ↗ (2-3)", th: "tag ขึ้น ↗ (2-3)" },
  },
];

export const MEANING_QUESTION: Bilingual = {
  en: "What does the speaker mean?",
  th: "ผู้พูดหมายความว่าอย่างไร?",
};

export const MEANING_HINT: Bilingual = {
  en: "Listen to the tag at the end: does it fall or rise?",
  th: "ฟัง tag ตอนท้ายประโยค ตกหรือขึ้น?",
};

/** A short scene for each tags-3 sentence (neutral: it fits both readings, the clip decides). */
const SITUATIONS: Record<string, Bilingual> = {
  "tags-3-harry": {
    en: "Ben and Anna are planning a party. Anna talks about their friend Harry.",
    th: "เบนกับแอนนากำลังวางแผนจัดปาร์ตี้ แอนนาพูดถึงแฮร์รีเพื่อนของเขา",
  },
  "tags-3-late": {
    en: "Two classmates are waiting outside the classroom. One of them talks about a friend.",
    th: "เพื่อนร่วมชั้นสองคนรออยู่หน้าห้องเรียน คนหนึ่งพูดถึงเพื่อนอีกคน",
  },
  "tags-3-nice-day": {
    en: "Two neighbours meet at the bus stop in the morning.",
    th: "เพื่อนบ้านสองคนเจอกันที่ป้ายรถเมล์ตอนเช้า",
  },
  "tags-3-swim": {
    en: "Two friends stand beside a swimming pool.",
    th: "เพื่อนสองคนยืนอยู่ริมสระว่ายน้ำ",
  },
  "tags-3-hungry": {
    en: "Friends are deciding whether to order lunch.",
    th: "เพื่อน ๆ กำลังตัดสินใจว่าจะสั่งอาหารกลางวันไหม",
  },
  "tags-3-susan": {
    en: "Two students talk about their group project.",
    th: "นักเรียนสองคนคุยกันเรื่องงานกลุ่ม",
  },
};

const GENERIC_SITUATION: Bilingual = { en: "Someone says this to a friend.", th: "มีคนพูดประโยคนี้กับเพื่อน" };

export function situationFor(sentence: Sentence): Bilingual {
  return Object.hasOwn(SITUATIONS, sentence.id) ? SITUATIONS[sentence.id] : GENERIC_SITUATION;
}

/** The meaning of a reading, in one sentence each (shown in the bottom sheet and reused by the other feedback). */
export const MEANING_OF: Record<TagReading, Bilingual> = {
  sure: {
    en: "The tag FALLS (3-1): the speaker is sure and wants you to agree, like a statement.",
    th: "tag ตก (3-1) ผู้พูดมั่นใจและอยากให้คุณเห็นด้วย เหมือนประโยคบอกเล่า",
  },
  unsure: {
    en: "The tag RISES (2-3): the speaker is not sure and is really asking you for the answer.",
    th: "tag ขึ้น (2-3) ผู้พูดไม่แน่ใจและถามหาคำตอบจริง ๆ",
  },
};

/** What the other meaning would have sounded like. */
const WOULD_BE: Record<TagReading, Bilingual> = {
  sure: {
    en: "A falling tag would mean \"I know it, right?\"",
    th: "ถ้า tag ตกจะหมายถึง \"ฉันรู้อยู่แล้ว ใช่ไหม\"",
  },
  unsure: {
    en: "A rising tag would mean a real question: \"I'm not sure, is that true?\"",
    th: "ถ้า tag ขึ้นจะเป็นคำถามจริง ๆ \"ฉันไม่แน่ใจ จริงไหม\"",
  },
};

/** Feedback for Meaning match. `reading`: what the clip really meant. `right`: the learner chose that meaning. */
export function meaningFeedback(right: boolean, reading: TagReading): Feedback {
  const opener: Bilingual = right
    ? { en: "Right! ", th: "ถูกต้อง! " }
    : { en: "Not quite. ", th: "ยังไม่ใช่ " };
  const meaning = MEANING_OF[reading];
  const would = WOULD_BE[otherReading(reading)];
  return {
    passed: right,
    title: right ? NICE : ALMOST,
    detail: {
      en: `${opener.en}${meaning.en} ${would.en}`,
      th: `${opener.th}${meaning.th} ${would.th}`,
    },
  };
}

// ───────────────────────────── Hear it, for tags ─────────────────────────────

/** "Which clip sounds sure?" / "...like a real question?": Hear it on a tag question. `ask` is the ending to find. */
export function tagHearQuestion(ask: Ending): Bilingual {
  return ask === "falling"
    ? { en: "Which clip sounds SURE?", th: "เสียงไหนฟังดูมั่นใจ?" }
    : { en: "Which clip sounds like a real question?", th: "เสียงไหนฟังเหมือนถามจริง ๆ?" };
}

export function tagHearHint(ask: Ending): Bilingual {
  return ask === "falling"
    ? {
        en: "When you are sure, the tag falls (3-1). You just want agreement.",
        th: "เมื่อมั่นใจ tag จะตก (3-1) คุณแค่อยากให้อีกฝ่ายเห็นด้วย",
      }
    : {
        en: "When you are not sure, the tag rises (2-3), like a real question.",
        th: "เมื่อไม่แน่ใจ tag จะขึ้น (2-3) เหมือนคำถามจริง ๆ",
      };
}

const CLIP_WAS: Record<ClipVariant, Bilingual> = {
  falling: { en: "its tag went down", th: "tag ลงต่ำ" },
  rising: { en: "its tag went up", th: "tag ขึ้นสูง" },
  flat: { en: "it was flat", th: "เสียงเรียบเกินไป" },
  busy: { en: "it had a bump on every word", th: "ขึ้นสูงทุกคำ" },
};

/**
 * Feedback for Hear it on a tag question. `ask`: the ending the learner had to find. `otherClip`: what the clip that was NOT
 * the answer did (shown to the learner as "the other clip" when right, "this clip" when wrong).
 */
export function tagHearFeedback(right: boolean, ask: Ending, otherClip: ClipVariant): Feedback {
  const reading: TagReading = ask === "falling" ? "sure" : "unsure";
  const was = CLIP_WAS[otherClip];
  const detail: Bilingual = right
    ? {
        en: `Right! ${MEANING_OF[reading].en} The other clip: ${was.en}.`,
        th: `ถูกต้อง! ${MEANING_OF[reading].th} อีกเสียงหนึ่ง: ${was.th}`,
      }
    : {
        en: `Not quite. ${MEANING_OF[reading].en} The clip you picked: ${was.en}.`,
        th: `ยังไม่ใช่ ${MEANING_OF[reading].th} เสียงที่คุณเลือก: ${was.th}`,
      };
  return { passed: right, title: right ? NICE : ALMOST, detail };
}
