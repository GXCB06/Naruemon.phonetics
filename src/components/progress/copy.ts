import type { Bilingual } from "@/lib/course/units.ts";

// Every user-facing string on the My Progress screen, English and Thai.

export const COPY = {
  title: { en: "My Progress", th: "ความก้าวหน้าของฉัน" } satisfies Bilingual,
  back: { en: "Back to the path", th: "กลับไปเส้นทาง" } satisfies Bilingual,
  loading: { en: "Loading your progress…", th: "กำลังโหลดความก้าวหน้า…" } satisfies Bilingual,

  empty: {
    title: { en: "Nothing here yet", th: "ยังไม่มีข้อมูล" } satisfies Bilingual,
    body: {
      en: "Do your first lesson and Myna will show where you are strong and what to practise next.",
      th: "ลองเรียนบทแรก แล้ว Myna จะบอกว่าคุณเก่งเรื่องไหนและควรฝึกอะไรต่อ",
    } satisfies Bilingual,
    start: { en: "Start a lesson", th: "เริ่มเรียน" } satisfies Bilingual,
  },

  heat: {
    title: { en: "Skill map", th: "แผนที่ทักษะ" } satisfies Bilingual,
    intro: {
      en: "Each box is a score from 0 to 100. A box shows a score after 5 attempts.",
      th: "แต่ละช่องคือคะแนน 0-100 และจะแสดงคะแนนเมื่อลองครบ 5 ครั้ง",
    } satisfies Bilingual,
    region: { en: "Skill map table, scrolls sideways", th: "ตารางแผนที่ทักษะ เลื่อนไปทางข้างได้" } satisfies Bilingual,
    caption: {
      en: "Skill scores by pattern and skill, split into speaking, drawing and listening",
      th: "คะแนนทักษะแยกตามรูปแบบและทักษะ แบ่งเป็นการพูด การวาด และการฟัง",
    } satisfies Bilingual,
    pattern: { en: "Pattern", th: "รูปแบบ" } satisfies Bilingual,
    scroll: { en: "Swipe sideways to see every skill", th: "เลื่อนไปทางข้างเพื่อดูทุกทักษะ" } satisfies Bilingual,
    legend: { en: "Key", th: "สัญลักษณ์" } satisfies Bilingual,
    outOf: { en: "out of 100", th: "เต็ม 100" } satisfies Bilingual,
    attempts: { en: "attempts", th: "ครั้ง" } satisfies Bilingual,
  },

  improve: {
    title: { en: "Top things to improve", th: "สิ่งที่ควรฝึกก่อน" } satisfies Bilingual,
    practice: { en: "Practice this", th: "ฝึกเรื่องนี้" } satisfies Bilingual,
    none: {
      en: "Keep practising. Tips appear once a skill has 5 attempts.",
      th: "ฝึกต่อไปเรื่อยๆ เมื่อทักษะใดมีครบ 5 ครั้ง จะมีคำแนะนำขึ้นที่นี่",
    } satisfies Bilingual,
    allStrong: {
      en: "Nothing is weak right now. Nice work!",
      th: "ตอนนี้ไม่มีเรื่องที่อ่อนเลย เยี่ยมมาก!",
    } satisfies Bilingual,
    score: { en: "Score", th: "คะแนน" } satisfies Bilingual,
  },

  insight: {
    title: { en: "Drawing vs speaking", th: "วาด เทียบกับ พูด" } satisfies Bilingual,
    intro: {
      en: "If you can draw a pattern but not say it, train your voice. If you say it well but cannot draw it, learn the rule.",
      th: "ถ้าวาดรูปแบบได้แต่พูดยังไม่ได้ ให้ฝึกเสียง ถ้าพูดได้ดีแต่วาดไม่ได้ ให้เรียนกฎ",
    } satisfies Bilingual,
    drawing: { en: "Drawing", th: "วาด" } satisfies Bilingual,
    speaking: { en: "Speaking", th: "พูด" } satisfies Bilingual,
    notYet: {
      en: "Draw it and say it 5 times each to compare.",
      th: "วาดและพูดอย่างละ 5 ครั้งเพื่อเปรียบเทียบ",
    } satisfies Bilingual,
  },

  grades: {
    title: { en: "Draw it grades", th: "ผลการวาดทำนองเสียง" } satisfies Bilingual,
    intro: {
      en: "Perfect = the book's tune. Good = the rules are right. Miss = a rule is broken.",
      th: "สมบูรณ์แบบ = ตรงกับในหนังสือ ดี = ถูกตามกฎ พลาด = ผิดกฎบางข้อ",
    } satisfies Bilingual,
    perfect: { en: "Perfect", th: "สมบูรณ์แบบ" } satisfies Bilingual,
    good: { en: "Good", th: "ดี" } satisfies Bilingual,
    miss: { en: "Miss", th: "พลาด" } satisfies Bilingual,
    drawings: { en: "drawings", th: "ครั้ง" } satisfies Bilingual,
    rate: { en: "Perfect or Good", th: "สมบูรณ์แบบหรือดี" } satisfies Bilingual,
  },

  ipa: {
    title: { en: "IPA sounds", th: "เสียง IPA" } satisfies Bilingual,
    words: { en: "words practised", th: "คำที่ฝึกแล้ว" } satisfies Bilingual,
    different: { en: "different words", th: "คำไม่ซ้ำ" } satisfies Bilingual,
    rate: { en: "Perfect or Good", th: "สมบูรณ์แบบหรือดี" } satisfies Bilingual,
    weakTitle: { en: "Sounds to work on", th: "เสียงที่ควรฝึก" } satisfies Bilingual,
    right: { en: "right", th: "ถูก" } satisfies Bilingual,
    noWeak: {
      en: "No sound stands out as hard yet. Keep practising!",
      th: "ยังไม่มีเสียงไหนที่พลาดบ่อย ฝึกต่อไปนะ!",
    } satisfies Bilingual,
    practise: { en: "Practise these", th: "ฝึกเสียงเหล่านี้" } satisfies Bilingual,
    practiseMore: { en: "Practise IPA", th: "ฝึก IPA" } satisfies Bilingual,
  },

  trend: {
    title: { en: "Your trend", th: "แนวโน้มของคุณ" } satisfies Bilingual,
    last14: { en: "Average score per day, last 14 days", th: "คะแนนเฉลี่ยต่อวัน 14 วันล่าสุด" } satisfies Bilingual,
    none: {
      en: "Draw or say a few sentences and your daily score shows up here.",
      th: "วาดหรือพูดสักไม่กี่ประโยค แล้วคะแนนรายวันจะขึ้นที่นี่",
    } satisfies Bilingual,
    attemptsIn14: { en: "attempts in 14 days", th: "ครั้งใน 14 วัน" } satisfies Bilingual,
    average: { en: "average", th: "เฉลี่ย" } satisfies Bilingual,
    firstLatest: { en: "First vs latest attempt", th: "ครั้งแรก เทียบกับ ครั้งล่าสุด" } satisfies Bilingual,
    firstLatestNone: {
      en: "Try a pattern at least twice to compare your first and latest scores.",
      th: "ลองรูปแบบเดียวกันอย่างน้อย 2 ครั้ง เพื่อเทียบคะแนนครั้งแรกกับครั้งล่าสุด",
    } satisfies Bilingual,
    first: { en: "first", th: "แรก" } satisfies Bilingual,
    latest: { en: "latest", th: "ล่าสุด" } satisfies Bilingual,
    note: {
      en: "Drawing and speaking only. Listening quizzes are right or wrong, so they are not in this score.",
      th: "นับเฉพาะการวาดและการพูด แบบฝึกฟังตอบถูกหรือผิด จึงไม่รวมในคะแนนนี้",
    } satisfies Bilingual,
  },
} as const;
