// Course map: units and lesson ids. This is the CONTRACT between the home path (reads it) and the lesson player
// (loads lesson content by `lessonId` from content/units/<unitId>/<lessonId>.json).
// Owner: the home-path session. The lesson-player session must not edit this file.

export interface Bilingual {
  en: string;
  th: string;
}

export interface LessonMeta {
  id: string;
  title: Bilingual;
}

export interface UnitMeta {
  id: string;
  title: Bilingual;
  blurb: Bilingual;
  /** Locked units are shown on the path but can't be opened yet. */
  locked: boolean;
  lessons: LessonMeta[];
}

export const UNITS: UnitMeta[] = [
  {
    id: "falling",
    title: { en: "Falling 2-3-1", th: "เสียงตก 2-3-1" },
    blurb: {
      en: "Statements, commands and wh-questions fall to low at the end.",
      th: "ประโยคบอกเล่า คำสั่ง และคำถาม Wh- ลงเสียงต่ำตอนท้าย",
    },
    locked: false,
    lessons: [
      { id: "falling-1", title: { en: "Statements", th: "ประโยคบอกเล่า" } },
      { id: "falling-2", title: { en: "Wh-questions", th: "คำถาม Wh-" } },
      { id: "falling-3", title: { en: "Commands and exclamations", th: "คำสั่งและประโยคอุทาน" } },
    ],
  },
  {
    id: "rising",
    title: { en: "Rising 2-3", th: "เสียงขึ้น 2-3" },
    blurb: { en: "Yes/no questions, names, interjections.", th: "คำถาม Yes/No การเรียกชื่อ คำอุทาน" },
    locked: false,
    lessons: [
      { id: "rising-1", title: { en: "Yes/no questions", th: "คำถาม Yes/No" } },
      { id: "rising-2", title: { en: "Names and interjections", th: "การเรียกชื่อและคำอุทาน" } },
    ],
  },
  {
    id: "lists",
    title: { en: "Lists and choices", th: "รายการและตัวเลือก" },
    blurb: { en: "Rise on each item, fall on the last.", th: "ขึ้นเสียงทุกรายการ ตกที่รายการสุดท้าย" },
    locked: false,
    lessons: [
      { id: "lists-1", title: { en: "Statement lists", th: "รายการในประโยคบอกเล่า" } },
      { id: "lists-2", title: { en: "Choices", th: "ประโยคที่มีตัวเลือก" } },
    ],
  },
  {
    id: "nonfinal",
    title: { en: "Non-final 2-3-2", th: "ยังไม่จบ 2-3-2" },
    blurb: { en: "Clauses that aren't finished yet.", th: "อนุประโยคที่ยังพูดไม่จบ" },
    locked: false,
    lessons: [
      { id: "nonfinal-1", title: { en: "Introductory phrases and conditionals", th: "วลีนำและประโยคเงื่อนไข" } },
      { id: "nonfinal-2", title: { en: "Compound and complex sentences", th: "ประโยคความรวมและประโยคความซ้อน" } },
    ],
  },
  {
    id: "tags",
    title: { en: "Tag questions", th: "Tag question" },
    blurb: {
      en: "Same words, two meanings: sure falls, not sure rises.",
      th: "คำเดียวกัน สองความหมาย: มั่นใจ = ตก ไม่แน่ใจ = ขึ้น",
    },
    locked: false,
    lessons: [
      { id: "tags-1", title: { en: "Sure: the tag falls", th: "มั่นใจ: tag ตก" } },
      { id: "tags-2", title: { en: "Not sure: the tag rises", th: "ไม่แน่ใจ: tag ขึ้น" } },
      { id: "tags-3", title: { en: "Which do you mean?", th: "คุณหมายถึงแบบไหน?" } },
    ],
  },
  { id: "review", title: { en: "Mixed review", th: "ทบทวนรวม" }, blurb: { en: "All patterns together.", th: "ทุกรูปแบบรวมกัน" }, locked: true, lessons: [] },
];

export function getUnit(unitId: string): UnitMeta | undefined {
  return UNITS.find((u) => u.id === unitId);
}

export function getLessonMeta(unitId: string, lessonId: string): LessonMeta | undefined {
  return getUnit(unitId)?.lessons.find((l) => l.id === lessonId);
}

/** The lesson after `lessonId` in the same unit, or undefined at the end of the unit. */
export function nextLessonId(unitId: string, lessonId: string): string | undefined {
  const lessons = getUnit(unitId)?.lessons ?? [];
  const i = lessons.findIndex((l) => l.id === lessonId);
  return i >= 0 ? lessons[i + 1]?.id : undefined;
}
