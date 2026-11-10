"use client";

import { useEffect, useState } from "react";

const cache = new Map<string, Promise<boolean>>();

/** Whether an AI route is switched on (the server has ANTHROPIC_API_KEY). Asked once per page load; false until known. */
export function useAiEnabled(path: "/api/ask-myna" | "/api/read-ipa"): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    let p = cache.get(path);
    if (!p) {
      p = fetch(path, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { enabled: false }))
        .then((j: { enabled?: unknown }) => j.enabled === true)
        .catch(() => false);
      cache.set(path, p);
    }
    p.then((on) => alive && setEnabled(on));
    return () => {
      alive = false;
    };
  }, [path]);
  return enabled;
}

export type AiError = "rate_limited" | "refused" | "offline" | "other";

/** Bilingual line for a failed AI request. */
export const AI_ERROR: Record<AiError, { en: string; th: string }> = {
  rate_limited: { en: "Myna needs a short break. Try again in a minute.", th: "Myna ขอพักสักครู่ ลองใหม่อีกหนึ่งนาที" },
  refused: { en: "Myna can't answer that one. Try asking about the intonation.", th: "Myna ตอบคำถามนี้ไม่ได้ ลองถามเรื่องทำนองเสียงดูนะ" },
  offline: { en: "Can't reach Myna. Check your internet and try again.", th: "ติดต่อ Myna ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" },
  other: { en: "Something went wrong. Try again.", th: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" },
};

export function aiErrorFor(status: number): AiError {
  return status === 429 ? "rate_limited" : status === 422 ? "refused" : "other";
}
