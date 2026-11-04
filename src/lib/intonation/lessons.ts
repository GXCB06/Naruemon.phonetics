import type { Sentence } from "./types.ts";

// Phase 0a test sentences, taken from the course material (Sentence Intonation, pp. 74–80, and the Intonation slides).
// Rule used for every group: the rising point is on the stressed syllable of the LAST content (strong-form) word.
// IPA is US English, written per syllable; stress marks are added when displayed.

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
          { text: "She", syllables: [{ text: "She", ipa: "ʃi", levels: [2] }] },
          { text: "is", syllables: [{ text: "is", ipa: "ɪz", levels: [2] }] },
          { text: "a", syllables: [{ text: "a", ipa: "ə", levels: [2] }] },
          {
            text: "pretty",
            syllables: [
              { text: "pre", ipa: "prɪ", stressed: true, levels: [2] },
              { text: "tty", ipa: "ti", levels: [2] },
            ],
          },
          {
            text: "woman.",
            syllables: [
              { text: "wo", ipa: "wʊ", stressed: true, levels: [3] },
              { text: "man", ipa: "mən", levels: [1] },
            ],
          },
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
          { text: "What", syllables: [{ text: "What", ipa: "wʌt", levels: [2] }] },
          { text: "is", syllables: [{ text: "is", ipa: "ɪz", levels: [2] }] },
          { text: "your", syllables: [{ text: "your", ipa: "jɚ", levels: [2] }] },
          { text: "name?", syllables: [{ text: "name", ipa: "neɪm", stressed: true, levels: [3, 1] }] },
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
          { text: "Are", syllables: [{ text: "Are", ipa: "ɑɹ", levels: [2] }] },
          { text: "you", syllables: [{ text: "you", ipa: "ju", levels: [2] }] },
          { text: "a", syllables: [{ text: "a", ipa: "ə", levels: [2] }] },
          {
            text: "student?",
            syllables: [
              { text: "stu", ipa: "stu", stressed: true, levels: [3] },
              { text: "dent", ipa: "dənt", levels: [3, 3.4] },
            ],
          },
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
          { text: "If", syllables: [{ text: "If", ipa: "ɪf", levels: [2] }] },
          { text: "it", syllables: [{ text: "it", ipa: "ɪt", levels: [2] }] },
          { text: "rains,", syllables: [{ text: "rains", ipa: "ɹeɪnz", stressed: true, levels: [3, 2] }] },
        ],
      },
      {
        pattern: "2-3-1",
        nucleus: { word: 4, syllable: 0 },
        words: [
          { text: "I", syllables: [{ text: "I", ipa: "aɪ", levels: [2] }] },
          { text: "will", syllables: [{ text: "will", ipa: "wɪl", levels: [2] }] },
          { text: "take", syllables: [{ text: "take", ipa: "teɪk", levels: [2] }] },
          { text: "the", syllables: [{ text: "the", ipa: "ðə", levels: [2] }] },
          { text: "bus.", syllables: [{ text: "bus", ipa: "bʌs", stressed: true, levels: [3, 1] }] },
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
          {
            text: "Harry",
            syllables: [
              { text: "Ha", ipa: "hæ", stressed: true, levels: [2] },
              { text: "rry", ipa: "ɹi", levels: [2] },
            ],
          },
          { text: "is", syllables: [{ text: "is", ipa: "ɪz", levels: [2] }] },
          {
            text: "coming,",
            syllables: [
              { text: "com", ipa: "kʌ", stressed: true, levels: [3] },
              { text: "ing", ipa: "mɪŋ", levels: [1] },
            ],
          },
        ],
      },
      {
        pattern: "3-1",
        nucleus: { word: 0, syllable: 0 },
        words: [
          {
            text: "isn't",
            syllables: [
              { text: "is", ipa: "ɪ", stressed: true, levels: [3] },
              { text: "n't", ipa: "zənt", levels: [1] },
            ],
          },
          { text: "he?", syllables: [{ text: "he", ipa: "hi", levels: [1] }] },
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
          {
            text: "Harry",
            syllables: [
              { text: "Ha", ipa: "hæ", stressed: true, levels: [2] },
              { text: "rry", ipa: "ɹi", levels: [2] },
            ],
          },
          { text: "is", syllables: [{ text: "is", ipa: "ɪz", levels: [2] }] },
          {
            text: "coming,",
            syllables: [
              { text: "com", ipa: "kʌ", stressed: true, levels: [3] },
              { text: "ing", ipa: "mɪŋ", levels: [1] },
            ],
          },
        ],
      },
      {
        pattern: "2-3",
        nucleus: { word: 0, syllable: 0 },
        words: [
          {
            text: "isn't",
            syllables: [
              { text: "is", ipa: "ɪ", stressed: true, levels: [2, 3] },
              { text: "n't", ipa: "zənt", levels: [3] },
            ],
          },
          { text: "he?", syllables: [{ text: "he", ipa: "hi", levels: [3, 3.4] }] },
        ],
      },
    ],
  },
];

export function getSentence(id: string): Sentence | undefined {
  return SENTENCES.find((s) => s.id === id);
}

export const PATTERN_LABEL: Record<string, { en: string; th: string }> = {
  "2-3-1": { en: "Falling 2-3-1", th: "เสียงตก 2-3-1" },
  "2-3-2": { en: "Non-final 2-3-2", th: "ยังไม่จบ 2-3-2" },
  "2-3": { en: "Rising 2-3", th: "เสียงขึ้น 2-3" },
  "3-1": { en: "Falling tag 3-1", th: "tag ตก 3-1" },
};
