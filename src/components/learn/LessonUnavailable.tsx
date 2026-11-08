import Link from "next/link";

type Reason = "notfound" | "locked" | "soon";

const COPY: Record<Reason, { icon: string; en: string; th: string; detailEn: string; detailTh: string }> = {
  notfound: {
    icon: "🧭",
    en: "We couldn't find that lesson",
    th: "ไม่พบบทเรียนนี้",
    detailEn: "The link may be old or mistyped. Pick a lesson from the path.",
    detailTh: "ลิงก์อาจเก่าหรือพิมพ์ผิด เลือกบทเรียนจากเส้นทางได้เลย",
  },
  locked: {
    icon: "🔒",
    en: "This unit isn't open yet",
    th: "หน่วยนี้ยังไม่เปิด",
    detailEn: "Finish the earlier units first, or check back soon.",
    detailTh: "เรียนหน่วยก่อนหน้าให้จบก่อน หรือกลับมาใหม่เร็ว ๆ นี้",
  },
  soon: {
    icon: "🛠️",
    en: "This lesson is coming soon",
    th: "บทเรียนนี้กำลังจะมา",
    detailEn: "We're still writing it. Try another lesson in the meantime.",
    detailTh: "กำลังเขียนอยู่ ลองบทเรียนอื่นไปก่อนนะ",
  },
};

/** Friendly "nothing here" screen for an unknown, locked or not-yet-written lesson. No hooks: works in server components. */
export function LessonUnavailable({ reason }: { reason: Reason }) {
  const c = COPY[reason];
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <div className="text-6xl" aria-hidden>
        {c.icon}
      </div>
      <h1 className="text-3xl font-black tracking-tight">
        {c.en}
        <span className="thai block text-xl font-bold text-muted">{c.th}</span>
      </h1>
      <p className="text-muted">
        {c.detailEn}
        <span className="thai block text-sm">{c.detailTh}</span>
      </p>
      <Link href="/" className="btn btn-primary text-lg">
        Back to the path <span className="thai text-base font-semibold">กลับไปหน้าหลัก</span>
      </Link>
    </main>
  );
}
