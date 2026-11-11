// The Speak tab: sentences grouped by tune into topics (one card each), the key a spoken score is saved under, and
// "Surprise me". Pure and deterministic (a seed picks the surprise).

import type { Bilingual, Sentence } from "../intonation/types.ts";
import { seededShuffle } from "../learn/build.ts";
import type { LessonResult } from "../progress/store.ts";

export interface SpeakTopic {
  id: string;
  title: Bilingual;
  /** The tune shown big on the card. */
  badge: string;
  blurb: Bilingual;
  /** 1–5: the unit colour of the card (globals.css --u1 … --u5). */
  color: number;
  matches: (s: Sentence) => boolean;
}

const kind = (...labels: string[]) => (s: Sentence) => labels.includes(s.kind);

/** The topics, grouped for display by `SPEAK_GROUPS`. Every sentence is in exactly one kind topic; Class Exercise 2 repeats its own. */
export const SPEAK_TOPICS: readonly SpeakTopic[] = [
  { id: "statements", title: { en: "Statements", th: "ประโยคบอกเล่า" }, badge: "2-3-1", blurb: { en: "Peak on the last important word, then fall.", th: "ขึ้นสูงที่คำสำคัญคำสุดท้ายแล้วตก" }, color: 1, matches: kind("Statement") },
  { id: "wh", title: { en: "Wh-questions", th: "คำถาม Wh-" }, badge: "2-3-1", blurb: { en: "Who, what, where: these fall too.", th: "ใคร อะไร ที่ไหน: ตกเหมือนกัน" }, color: 1, matches: kind("Wh-question") },
  { id: "commands", title: { en: "Commands & exclamations", th: "คำสั่งและประโยคอุทาน" }, badge: "2-3-1", blurb: { en: "Strong and finished.", th: "หนักแน่นและจบความ" }, color: 1, matches: kind("Command", "Exclamation") },
  { id: "yesno", title: { en: "Yes/no questions", th: "คำถาม Yes/No" }, badge: "2-3", blurb: { en: "Rise and stay up.", th: "ขึ้นแล้วค้างไว้" }, color: 2, matches: kind("Yes/no question") },
  { id: "names", title: { en: "Names & interjections", th: "การเรียกชื่อและคำอุทาน" }, badge: "2-3", blurb: { en: "Calling someone: the name rises.", th: "เรียกใคร: ชื่อขึ้นเสียง" }, color: 2, matches: kind("Direct address", "Interjection") },
  { id: "lists", title: { en: "Lists", th: "รายการ" }, badge: "2-3 | 2-3-1", blurb: { en: "Rise on each item, fall on the last.", th: "ขึ้นทุกรายการ ตกที่รายการสุดท้าย" }, color: 4, matches: kind("List") },
  { id: "choices", title: { en: "Choices", th: "ตัวเลือก" }, badge: "2-3 | 2-3", blurb: { en: "Every choice rises, the last one too.", th: "ทุกตัวเลือกขึ้น รวมตัวสุดท้าย" }, color: 4, matches: kind("Choice question") },
  { id: "nonfinal", title: { en: "Not finished yet", th: "ยังพูดไม่จบ" }, badge: "2-3-2", blurb: { en: "Come back to 2: more is coming.", th: "กลับมาที่ 2: ยังมีต่อ" }, color: 3, matches: kind("Non-final thought group") },
  { id: "tags-sure", title: { en: "Tag questions: sure", th: "Tag question: มั่นใจ" }, badge: "3-1", blurb: { en: "The tag falls: you know the answer.", th: "tag ตก: คุณรู้คำตอบ" }, color: 5, matches: kind("Tag question (sure)") },
  { id: "tags-unsure", title: { en: "Tag questions: asking", th: "Tag question: ถามจริง" }, badge: "2-3", blurb: { en: "The tag rises: you really ask.", th: "tag ขึ้น: ถามจริง ๆ" }, color: 5, matches: kind("Tag question (not sure)") },
  { id: "class2", title: { en: "Class Exercise 2", th: "แบบฝึกหัดในห้อง 2" }, badge: "14", blurb: { en: "The sheet from class, to say aloud.", th: "ใบงานจากในห้อง ให้พูดออกเสียง" }, color: 2, matches: (s) => s.id.startsWith("class2-") },
];

export const SPEAK_GROUPS: readonly { title: Bilingual; ids: readonly string[] }[] = [
  { title: { en: "Falling 2-3-1", th: "เสียงตก 2-3-1" }, ids: ["statements", "wh", "commands"] },
  { title: { en: "Rising 2-3", th: "เสียงขึ้น 2-3" }, ids: ["yesno", "names"] },
  { title: { en: "Lists and choices", th: "รายการและตัวเลือก" }, ids: ["lists", "choices"] },
  { title: { en: "Not finished, and tags", th: "ยังไม่จบ และ tag" }, ids: ["nonfinal", "tags-sure", "tags-unsure"] },
  { title: { en: "From class", th: "จากในห้องเรียน" }, ids: ["class2"] },
];

export function topicById(id: string): SpeakTopic | undefined {
  return SPEAK_TOPICS.find((t) => t.id === id);
}

export function topicSentences(topic: SpeakTopic, all: readonly Sentence[]): Sentence[] {
  return all.filter(topic.matches);
}

/** The key a spoken sentence's best score is saved under (in progress.lessons). */
export function speakKey(sentenceId: string): string {
  return `speak:${sentenceId}`;
}

export interface TopicStat {
  count: number;
  /** Sentences spoken at least once. */
  done: number;
  /** The average of the best scores of the spoken ones, or null when none. */
  avg: number | null;
}

export function topicStat(topic: SpeakTopic, all: readonly Sentence[], lessons: Record<string, LessonResult>): TopicStat {
  const sentences = topicSentences(topic, all);
  const bests = sentences.flatMap((s) => (Object.hasOwn(lessons, speakKey(s.id)) ? [lessons[speakKey(s.id)].best] : []));
  return { count: sentences.length, done: bests.length, avg: bests.length ? Math.round(bests.reduce((a, b) => a + b, 0) / bests.length) : null };
}

/**
 * "Surprise me": a sentence from the whole course. Sentences never spoken come first; once all have been spoken, the ones
 * with the lowest best score. The seed only breaks ties, so the same seed gives the same sentence.
 */
export function pickSurprise(all: readonly Sentence[], lessons: Record<string, LessonResult>, seed: number): Sentence | null {
  if (all.length === 0) return null;
  const best = (s: Sentence) => (Object.hasOwn(lessons, speakKey(s.id)) ? lessons[speakKey(s.id)].best : -1);
  const order = seededShuffle(all, seed >>> 0);
  const lowest = Math.min(...order.map(best));
  return order.find((s) => best(s) === lowest) ?? order[0];
}

/** The sentence after `id` in a topic (wrapping round), or null when the topic has only that sentence. */
export function nextInTopic(sentences: readonly Sentence[], id: string): Sentence | null {
  if (sentences.length < 2) return null;
  const i = sentences.findIndex((s) => s.id === id);
  return sentences[(i + 1) % sentences.length];
}

/** A short score word for a take: used on the result screen and the sentence list. */
export function scoreWord(score: number): Bilingual {
  return score >= 80 ? { en: "Great!", th: "ยอดเยี่ยม!" } : score >= 55 ? { en: "Almost there", th: "เกือบแล้ว" } : { en: "Keep trying", th: "ลองต่อนะ" };
}
