"use client";

/** Big 3-2-1 with a calm privacy line. Reduced-motion users get the number change only (no pop animation). */
export function Countdown({ count }: { count: number }) {
  return (
    <div className="flex flex-col items-center gap-2 py-2 text-center" role="status" aria-live="polite">
      <div
        key={count}
        className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-5xl font-black text-primary-ink motion-safe:animate-[countdown-pop_0.35s_ease-out]"
      >
        {count}
      </div>
      <p className="text-sm font-bold text-accent">
        Only you can hear this
        <span className="thai block font-semibold">มีแค่คุณที่ได้ยินเสียงนี้</span>
      </p>
    </div>
  );
}
