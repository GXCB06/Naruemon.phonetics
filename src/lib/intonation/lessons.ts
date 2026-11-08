import { normalizeWord } from "../ipa/words.ts";
import type { WordIpa } from "../ipa/words.ts";
import ipaTable from "./ipa.generated.json" with { type: "json" };
import type { Sentence, Syllable, ThoughtGroup, Word } from "./types.ts";

// Phase 0a test sentences, taken from the course material (Sentence Intonation, pp. 74–80, and the Intonation slides).
// Rule used for every group: the rising point is on the stressed syllable of the LAST content (strong-form) word.
//
// IPA is US English, written per syllable; stress marks are added when displayed. It is NOT hand-typed: it comes from
// ipa.generated.json (CMUdict -> own syllabifier -> ARPAbet-to-IPA map; run `npm run build:ipa`, see tools/build-ipa.ts).
// Only the spelling chunks and the target `levels` are written by hand. `stressed` is the dictionary's primary stress
// for words of 2+ syllables; a one-syllable word counts as stressed only when it carries the nucleus of its group
// (sentence stress, not lexical stress: "take" and "What" stay unstressed).
//
// Differences from the previous hand-typed IPA (everything else was reproduced exactly):
//   - "pretty": prɪ.ti -> pɹɪ.ti (the old string used r where every other word uses ɹ; now one symbol set).
//   - "Harry" (hæ.ɹi) and "your" (jɚ) match through documented OVERRIDES in src/lib/ipa/overrides.ts, because CMUdict has
//     HH EH1 R IY0 and the strong form Y AO1 R.

type SyllableSpec = readonly [spelling: string, levels: number[]];

const WORDS = ipaTable.words as Record<string, WordIpa>;

/** A word from its spelling chunks (one per syllable) and target levels; IPA and stress come from the generated table. */
function w(text: string, parts: readonly SyllableSpec[]): Word {
  const key = normalizeWord(text);
  const entry = WORDS[key];
  if (!entry) throw new Error(`No generated IPA for "${key}". Run \`npm run build:ipa\`.`);
  if (entry.syllables.length !== parts.length) {
    throw new Error(`"${key}" has ${entry.syllables.length} syllable(s) in CMUdict but ${parts.length} spelling chunk(s).`);
  }
  const syllables: Syllable[] = parts.map(([spelling, levels], i) => {
    const s: Syllable = { text: spelling, ipa: entry.syllables[i].ipa, levels };
    if (parts.length > 1 && entry.syllables[i].stress === 1) s.stressed = true;
    return s;
  });
  return { text, syllables };
}

/** The nucleus syllable carries sentence stress even in a one-syllable word. */
function markNucleusStress(group: ThoughtGroup): void {
  group.words[group.nucleus.word].syllables[group.nucleus.syllable].stressed = true;
}

export const SENTENCES: Sentence[] = [
  {
    id: "fall-pretty-woman",
    text: "She is a pretty woman.",
    kind: "Statement",
    note: {
      en: "Statements fall: 2-3-1. The rise is on WO- (last content word), then drop to 1.",
      th: "ประโยคบอกเล่าใช้เสียงตก 2-3-1 ขึ้นสูงที่ WO- (คำสำคัญคำสุดท้าย) แล้วลงต่ำ",
    },
    groups: [
      {
        pattern: "2-3-1",
        nucleus: { word: 4, syllable: 0 },
        words: [
          w("She", [["She", [2]]]),
          w("is", [["is", [2]]]),
          w("a", [["a", [2]]]),
          w("pretty", [["pre", [2]], ["tty", [2]]]),
          w("woman.", [["wo", [3]], ["man", [1]]]),
        ],
      },
    ],
  },
  {
    id: "fall-what-name",
    text: "What is your name?",
    kind: "Wh-question",
    note: {
      en: "Wh-questions FALL (2-3-1), they don't rise. The glide happens inside NAME.",
      th: "คำถาม Wh- ใช้เสียงตก 2-3-1 ไม่ใช่เสียงขึ้น เสียงขึ้นแล้วตกภายในคำ NAME",
    },
    groups: [
      {
        pattern: "2-3-1",
        nucleus: { word: 3, syllable: 0 },
        words: [
          w("What", [["What", [2]]]),
          w("is", [["is", [2]]]),
          w("your", [["your", [2]]]),
          w("name?", [["name", [3, 1]]]),
        ],
      },
    ],
  },
  {
    id: "rise-student",
    text: "Are you a student?",
    kind: "Yes/no question",
    note: {
      en: "Yes/no questions RISE (2-3). Rise on STU- and stay up to the end.",
      th: "คำถาม Yes/No ใช้เสียงขึ้น 2-3 ขึ้นที่ STU- และค้างเสียงสูงไว้จนจบ",
    },
    groups: [
      {
        pattern: "2-3",
        nucleus: { word: 3, syllable: 0 },
        words: [
          w("Are", [["Are", [2]]]),
          w("you", [["you", [2]]]),
          w("a", [["a", [2]]]),
          w("student?", [["stu", [3]], ["dent", [3, 3.4]]]),
        ],
      },
    ],
  },
  {
    id: "nonfinal-rains-bus",
    text: "If it rains, I will take the bus.",
    kind: "Conditional sentence",
    note: {
      en: "First clause is non-final (2-3-2): come back to 2, not 1. The last clause falls (2-3-1).",
      th: "ประโยคแรกยังไม่จบ ใช้ 2-3-2 (กลับมาระดับ 2 ไม่ลงถึง 1) ส่วนประโยคสุดท้ายใช้เสียงตก 2-3-1",
    },
    groups: [
      {
        pattern: "2-3-2",
        nucleus: { word: 2, syllable: 0 },
        words: [
          w("If", [["If", [2]]]),
          w("it", [["it", [2]]]),
          w("rains,", [["rains", [3, 2]]]),
        ],
      },
      {
        pattern: "2-3-1",
        nucleus: { word: 4, syllable: 0 },
        words: [
          w("I", [["I", [2]]]),
          w("will", [["will", [2]]]),
          w("take", [["take", [2]]]),
          w("the", [["the", [2]]]),
          w("bus.", [["bus", [3, 1]]]),
        ],
      },
    ],
  },
  {
    id: "tag-sure",
    text: "Harry is coming, isn't he?",
    kind: "Tag question (sure)",
    note: {
      en: "You KNOW the answer: 2-3-1, then the tag falls 3-1.",
      th: "ถ้ามั่นใจคำตอบ: ส่วนแรก 2-3-1 แล้ว tag ตก 3-1",
    },
    groups: [
      {
        pattern: "2-3-1",
        nucleus: { word: 2, syllable: 0 },
        words: [
          w("Harry", [["Ha", [2]], ["rry", [2]]]),
          w("is", [["is", [2]]]),
          w("coming,", [["com", [3]], ["ing", [1]]]),
        ],
      },
      {
        pattern: "3-1",
        nucleus: { word: 0, syllable: 0 },
        words: [
          w("isn't", [["is", [3]], ["n't", [1]]]),
          w("he?", [["he", [1]]]),
        ],
      },
    ],
  },
  {
    id: "tag-unsure",
    text: "Harry is coming, isn't he?",
    kind: "Tag question (not sure)",
    note: {
      en: "You DON'T know the answer: 2-3-1, then the tag rises 2-3, like a real question.",
      th: "ถ้าไม่แน่ใจคำตอบ: ส่วนแรก 2-3-1 แล้ว tag ขึ้น 2-3 เหมือนถามจริง",
    },
    groups: [
      {
        pattern: "2-3-1",
        nucleus: { word: 2, syllable: 0 },
        words: [
          w("Harry", [["Ha", [2]], ["rry", [2]]]),
          w("is", [["is", [2]]]),
          w("coming,", [["com", [3]], ["ing", [1]]]),
        ],
      },
      {
        pattern: "2-3",
        nucleus: { word: 0, syllable: 0 },
        words: [
          w("isn't", [["is", [2, 3]], ["n't", [3]]]),
          w("he?", [["he", [3, 3.4]]]),
        ],
      },
    ],
  },
];

for (const sentence of SENTENCES) sentence.groups.forEach(markNucleusStress);

export function getSentence(id: string): Sentence | undefined {
  return SENTENCES.find((s) => s.id === id);
}

export const PATTERN_LABEL: Record<string, { en: string; th: string }> = {
  "2-3-1": { en: "Falling 2-3-1", th: "เสียงตก 2-3-1" },
  "2-3-2": { en: "Non-final 2-3-2", th: "ยังไม่จบ 2-3-2" },
  "2-3": { en: "Rising 2-3", th: "เสียงขึ้น 2-3" },
  "3-1": { en: "Falling tag 3-1", th: "tag ตก 3-1" },
};
