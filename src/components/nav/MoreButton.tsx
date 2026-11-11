"use client";

import { useState } from "react";
import { useLang } from "@/components/home/lang";
import { MoreSheet } from "./TabBar";

/** The menu button in the top bar: profile and sign-in, how Myna works, mic check, language, sound and theme. */
export function MoreButton() {
  const [open, setOpen] = useState(false);
  const lang = useLang();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={lang === "th" ? "เมนูเพิ่มเติม" : "More menu"}
        className="flex size-9 items-center justify-center rounded-xl border-2 border-line bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
          <circle cx="12" cy="12" r="11" fill="var(--u3)" />
          <circle cx="7.5" cy="12" r="1.7" fill="#fff" />
          <circle cx="12" cy="12" r="1.7" fill="#fff" />
          <circle cx="16.5" cy="12" r="1.7" fill="#fff" />
        </svg>
      </button>
      <MoreSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
