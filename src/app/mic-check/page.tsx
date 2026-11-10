import type { Metadata } from "next";
import Link from "next/link";
import { LangToggle } from "@/components/home/lang";
import { MicCheck } from "@/components/mic/MicCheck";

export const metadata: Metadata = {
  title: "Mic check — Myna",
  description: "Check your microphone level, the background noise in your room, and play back a short test recording.",
};

export default function MicCheckPage() {
  return (
    <>
      <header className="sticky top-0 z-20 border-b-2 border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-xl items-center gap-2 px-4 py-2">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 font-extrabold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span aria-hidden>←</span> Myna
          </Link>
          <div className="ml-auto">
            <LangToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 pb-16 pt-6">
        <MicCheck />
        <Link href="/" className="btn min-h-12 self-center px-6">
          Back to Myna <span className="thai font-semibold text-muted">กลับหน้าหลัก</span>
        </Link>
      </main>
    </>
  );
}
