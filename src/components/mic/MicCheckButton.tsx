"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "@/components/home/icons";
import { useText } from "@/components/home/lang";
import { MicCheck } from "./MicCheck";

/**
 * "Check my mic" for places that must not lose their state (the Shadow It exercise inside a lesson): opens the mic
 * check in a modal <dialog> instead of navigating to /mic-check. The check is mounted only while open, so closing it
 * always releases the microphone.
 */
export function MicCheckButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const t = useText();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button type="button" className={`btn min-h-11 text-sm ${className}`} onClick={() => setOpen(true)}>
        <span aria-hidden>🎙️</span> Check my mic <span className="thai font-semibold">เช็กไมค์</span>
      </button>
      <dialog
        ref={ref}
        aria-label={t({ en: "Mic check", th: "เช็กไมค์" })}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false); // tap on the dimmed backdrop
        }}
        className="fixed inset-x-0 bottom-0 top-auto m-0 hidden max-h-[90dvh] w-full max-w-none flex-col overflow-y-auto rounded-t-3xl border-2 border-b-0 border-line bg-card p-0 text-ink shadow-2xl open:flex backdrop:bg-black/45 sm:mx-auto sm:max-w-xl"
      >
        {open && (
          <div className="mx-auto flex w-full max-w-xl flex-col gap-2 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t({ en: "Close", th: "ปิด" })}
              className="flex size-11 shrink-0 items-center justify-center self-end rounded-xl border-2 border-line text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <CloseIcon />
            </button>
            <MicCheck compact />
          </div>
        )}
      </dialog>
    </>
  );
}
