import type { PathNode } from "@/lib/course/path.ts";
import type { Bilingual } from "@/lib/course/units.ts";
import type { Lang } from "./lang";

export const COPY = {
  startHere: { en: "Start here", th: "เริ่มที่นี่" },
  comingSoon: { en: "Coming soon", th: "เร็วๆ นี้" },
  start: { en: "Start", th: "เริ่ม" },
  practiseAgain: { en: "Practise again", th: "ฝึกอีกครั้ง" },
  bestScore: { en: "Best score", th: "คะแนนสูงสุด" },
  notTried: { en: "Not tried yet", th: "ยังไม่เคยลอง" },
  close: { en: "Close", th: "ปิด" },
  lab: { en: "Practice lab", th: "ห้องฝึก" },
  signIn: { en: "Sign in to sync", th: "เข้าสู่ระบบเพื่อซิงก์" },
  allDone: { en: "All open lessons finished. New units are on the way!", th: "เรียนครบทุกบทที่เปิดแล้ว ยูนิตใหม่กำลังมา!" },
  path: { en: "Your learning path", th: "เส้นทางการเรียนของคุณ" },
} satisfies Record<string, Bilingual>;

export function starsText(stars: number, lang: Lang): string {
  return lang === "th" ? `${stars} จาก 3 ดาว` : `${stars} of 3 stars`;
}

export function nodeAriaLabel(node: PathNode, lang: Lang): string {
  const title = node.title[lang];
  switch (node.state) {
    case "locked":
      return lang === "th" ? `${title} ล็อกอยู่ ${COPY.comingSoon.th}` : `${title}, locked. ${COPY.comingSoon.en}`;
    case "done":
      return lang === "th" ? `${title} เสร็จแล้ว ${starsText(node.stars, lang)}` : `${title}, done, ${starsText(node.stars, lang)}`;
    case "current":
      return lang === "th" ? `${title} ${COPY.startHere.th}` : `${title}. ${COPY.startHere.en}`;
    default:
      return title;
  }
}
