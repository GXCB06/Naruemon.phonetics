// Words for IPA practice. Their IPA is NOT typed here: tools/build-ipa-practice.ts looks each word up in CMUdict (the
// same pipeline as the lessons) and writes src/lib/ipa/practice.generated.json. Chosen for the sounds Thai learners
// mix up most (th, v/w, final s/z, ʃ/tʃ, short/long vowels, r-coloured vowels, ŋ) and for being everyday words.

export interface PracticeWordSpec {
  word: string;
  /** Thai meaning shown under the word. */
  th: string;
}

export const PRACTICE_WORDS: readonly PracticeWordSpec[] = [
  { word: "book", th: "หนังสือ" },
  { word: "name", th: "ชื่อ" },
  { word: "think", th: "คิด" },
  { word: "thank", th: "ขอบคุณ" },
  { word: "three", th: "สาม" },
  { word: "this", th: "นี่" },
  { word: "mother", th: "แม่" },
  { word: "very", th: "มาก" },
  { word: "vegetable", th: "ผัก" },
  { word: "water", th: "น้ำ" },
  { word: "world", th: "โลก" },
  { word: "bus", th: "รถบัส" },
  { word: "rains", th: "ฝนตก" },
  { word: "zoo", th: "สวนสัตว์" },
  { word: "student", th: "นักเรียน" },
  { word: "table", th: "โต๊ะ" },
  { word: "pleasure", th: "ความยินดี" },
  { word: "ship", th: "เรือ" },
  { word: "cheap", th: "ถูก (ราคา)" },
  { word: "job", th: "งาน" },
  { word: "sing", th: "ร้องเพลง" },
  { word: "light", th: "แสง" },
  { word: "right", th: "ขวา / ถูกต้อง" },
  { word: "fish", th: "ปลา" },
  { word: "cat", th: "แมว" },
  { word: "cup", th: "ถ้วย" },
  { word: "bird", th: "นก" },
  { word: "boat", th: "เรือ (ลำเล็ก)" },
];
