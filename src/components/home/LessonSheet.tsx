"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { PathNode, PathUnit } from "@/lib/course/path.ts";
import { CloseIcon, StarIcon } from "./icons";
import { Bi, useLang } from "./lang";
import { COPY, starsText } from "./copy";

/**
 * Bottom sheet for one unlocked lesson. A native modal <dialog>: the browser gives us the focus trap, Escape to
 * close, the backdrop, and focus returning to the tapped node. It stays mounted; `open` toggles it.
 */
export function LessonSheet({
  node,
  unit,
  open,
  onClose,
}: {
  /** The last lesson that was tapped; kept after closing so the content doesn't vanish mid-animation. */
  node: PathNode | null;
  unit: PathUnit | null;
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const lang = useLang();
  const shown = node && unit ? { node, unit } : null;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const done = shown?.node.state === "done";
  const best = shown?.node.best ?? null;

  return (
    <dialog
      ref={ref}
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // tap on the dimmed backdrop
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 hidden max-h-[85dvh] w-full max-w-none flex-col overflow-y-auto rounded-t-3xl border-2 border-b-0 border-line bg-card p-0 text-ink shadow-2xl open:flex backdrop:bg-black/45 motion-safe:transition-transform motion-safe:duration-200 motion-safe:open:starting:translate-y-full"
    >
      {shown && (
        <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-wide text-muted">
                <span lang="en">Unit {shown.unit.number}</span> · <span lang="th" className="thai">ยูนิต {shown.unit.number}</span>
              </p>
              <h2 id="sheet-title" className="text-2xl font-black leading-tight">
                <Bi text={shown.node.title} />
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={COPY.close[lang]}
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-line text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <CloseIcon />
            </button>
          </div>

          <p className="text-sm">
            <Bi text={shown.unit.blurb} subClassName="text-[0.9em]" />
          </p>

          <div className="flex items-center gap-3 rounded-2xl border-2 border-line bg-bg px-4 py-3">
            <div className="min-w-0 flex-1 text-sm font-extrabold">
              <Bi text={COPY.bestScore} />
            </div>
            {best === null ? (
              <p className="text-right text-sm font-bold text-muted">
                <Bi text={COPY.notTried} className="items-end" />
              </p>
            ) : (
              <div className="flex items-center gap-2">
                {done && (
                  <span className="flex gap-0.5 text-muted" role="img" aria-label={starsText(shown.node.stars, lang)}>
                    {[1, 2, 3].map((n) => (
                      <StarIcon key={n} filled={n <= shown.node.stars} className="size-5" />
                    ))}
                  </span>
                )}
                <span className="text-2xl font-black tabular-nums">{best}</span>
              </div>
            )}
          </div>

          <Link
            href={`/learn/${shown.node.unitId}/${shown.node.lessonId}`}
            onClick={onClose}
            className="btn btn-primary min-h-14 w-full !py-3 text-lg"
          >
            <Bi text={done ? COPY.practiseAgain : COPY.start} className="items-center" subClassName="!text-primary-ink/80" />
          </Link>
        </div>
      )}
    </dialog>
  );
}
