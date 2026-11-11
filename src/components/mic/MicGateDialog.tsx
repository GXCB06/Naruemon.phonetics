"use client";

import { useEffect, useRef, useState } from "react";
import { Bi } from "@/components/home/lang";
import type { MicProfile } from "@/lib/audio/micProfile";
import type { GateReason } from "@/lib/audio/micProfile";
import { MicCheck } from "./MicCheck";

const WHY: Record<GateReason, { en: string; th: string }> = {
  never: {
    en: "First time speaking on this device? A 10-second check makes sure Myna can hear you well, so your score is fair.",
    th: "ครั้งแรกที่พูดบนเครื่องนี้? เช็กไมค์ 10 วินาทีเพื่อให้ Myna ได้ยินชัด และคะแนนของคุณยุติธรรม",
  },
  failed: {
    en: "Last time Myna could barely hear you. Let's check the microphone again.",
    th: "ครั้งก่อน Myna แทบไม่ได้ยินเสียงคุณ มาเช็กไมค์อีกครั้งกัน",
  },
  changed: {
    en: "This looks like a different microphone. A quick check keeps your scores fair.",
    th: "นี่ดูเหมือนเป็นไมค์คนละตัว เช็กสั้น ๆ เพื่อให้คะแนนยุติธรรม",
  },
  stale: {
    en: "It has been a while since the last mic check. Let's make sure it still works well.",
    th: "ผ่านมานานแล้วตั้งแต่เช็กไมค์ครั้งล่าสุด มาดูว่ายังใช้ดีอยู่ไหม",
  },
};

/**
 * Asked before someone speaks (the first time on a device, after a bad check, or on a different microphone): the mic check
 * in a dialog, then "Continue" or "Skip for now". Both buttons call `onContinue` from inside the tap, so the recording that
 * follows can open the microphone (iOS needs that). The check is mounted only while open, so closing it releases the mic.
 */
export function MicGateDialog({
  open,
  reason,
  onContinue,
}: {
  open: boolean;
  reason: GateReason;
  /** Close the dialog and start recording. `checked` is the profile when the check finished, null when skipped. */
  onContinue: (checked: MicProfile | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [done, setDone] = useState<MicProfile | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const good = done && done.verdict !== "fail";
  const leave = (checked: MicProfile | null) => {
    setDone(null); // the next time the dialog opens, no result is shown
    onContinue(checked);
  };

  return (
    <dialog
      ref={ref}
      aria-label="Mic check · เช็กไมค์"
      onCancel={(e) => {
        e.preventDefault(); // Escape: same as Skip, but through the buttons so the mic opens inside a tap
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 hidden max-h-[92dvh] w-full max-w-none flex-col overflow-y-auto rounded-t-3xl border-2 border-b-0 border-line bg-card p-0 text-ink shadow-2xl open:flex backdrop:bg-black/50 sm:mx-auto sm:max-w-xl"
    >
      {open && (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
          <p className="rounded-2xl bg-accent-soft p-3 text-sm font-bold text-accent">
            <Bi text={WHY[reason]} />
          </p>
          <MicCheck compact onDone={setDone} />
          <div className="flex flex-col gap-2 border-t-2 border-line pt-4">
            {good && (
              <button type="button" className="btn btn-good min-h-14 text-lg" onClick={() => leave(done)}>
                <Bi text={{ en: "CONTINUE TO SPEAK", th: "ไปพูดต่อ" }} className="items-center leading-tight" subClassName="text-white/80" />
              </button>
            )}
            <button
              type="button"
              className="rounded-xl px-3 py-2 text-sm font-extrabold uppercase tracking-wide text-muted hover:bg-line"
              onClick={() => leave(null)}
            >
              <Bi text={{ en: "Skip for now", th: "ข้ามไปก่อน" }} className="items-center" />
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
