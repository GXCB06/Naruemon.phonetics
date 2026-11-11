"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Bi, LangToggle, useLang } from "@/components/home/lang";
import { setSfxEnabled, sfxEnabled, subscribeSfx } from "@/components/learn/chime";
import { ThemePicker } from "@/components/theme/ThemeToggle";
import { useOnboarded } from "@/components/onboarding/seen";

// The app's bottom tab bar: every main place one tap away (Learn, IPA, Speak lab, Progress, More), like a phone app.
// Hidden inside a lesson, during onboarding, and while a practice round marks the page immersive (<Immersive />).

const HIDE_ON = [/^\/learn\//, /^\/welcome/, /^\/practice\/.+/];

type Tab = { href: string; label: { en: string; th: string }; icon: ReactNode; match: (p: string) => boolean };

const icon = (children: ReactNode) => (
  <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
    {children}
  </svg>
);

const TABS: Tab[] = [
  {
    href: "/",
    label: { en: "Learn", th: "เรียน" },
    match: (p) => p === "/",
    icon: icon(
      <>
        <path d="M5 15 16 5l11 10" fill="none" stroke="var(--u4)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 14v12.5h16V14L16 7z" fill="var(--u2)" />
        <rect x="13" y="18" width="6" height="8.5" rx="1.5" fill="var(--u4-deep)" />
        <circle cx="16" cy="13.2" r="2" fill="#fff" />
      </>,
    ),
  },
  {
    href: "/practice",
    label: { en: "Practice", th: "ฝึกฝน" },
    match: (p) => p.startsWith("/practice") || p.startsWith("/ipa"),
    icon: icon(
      <>
        <circle cx="16" cy="16" r="12.5" fill="var(--u3)" />
        <circle cx="16" cy="16" r="8" fill="#fff" fillOpacity="0.25" />
        <circle cx="16" cy="16" r="3.6" fill="#fff" />
        <path d="M16 3.5V8M16 24v4.5M3.5 16H8M24 16h4.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      </>,
    ),
  },
  {
    href: "/lab",
    label: { en: "Speak", th: "ฝึกพูด" },
    match: (p) => p.startsWith("/lab"),
    icon: icon(
      <>
        <rect x="11" y="3.5" width="10" height="16" rx="5" fill="var(--u1)" />
        <path d="M7 15a9 9 0 0 0 18 0M16 24v4.5M11.5 28.5h9" fill="none" stroke="var(--u1-deep)" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M14 8.5h4M14 12h4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
      </>,
    ),
  },
  {
    href: "/read",
    label: { en: "Read", th: "อ่าน" },
    match: (p) => p.startsWith("/read"),
    icon: icon(
      <>
        <path d="M16 8.5C13 6 8.5 5.5 4.5 6.5V24c4-1 8.5-.5 11.5 2z" fill="var(--u4)" />
        <path d="M16 8.5c3-2.5 7.5-3 11.5-2V24c-4-1-8.5-.5-11.5 2z" fill="var(--u2)" />
        <path d="M8 11.5c2-.4 4 0 6 .9M8 15.5c2-.4 4 0 6 .9M18 12.4c2-.9 4-1.3 6-.9M18 16.4c2-.9 4-1.3 6-.9" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
      </>,
    ),
  },
  {
    href: "/progress",
    label: { en: "Progress", th: "สถิติ" },
    match: (p) => p.startsWith("/progress"),
    icon: icon(
      <>
        <rect x="5" y="16" width="6" height="11" rx="2" fill="var(--u5)" />
        <rect x="13" y="10" width="6" height="17" rx="2" fill="var(--u2)" />
        <rect x="21" y="4.5" width="6" height="22.5" rx="2" fill="var(--u1)" />
      </>,
    ),
  },
];

/** Put inside a full-screen practice round to hide the tab bar while it is on screen. */
export function Immersive() {
  useEffect(() => {
    document.body.dataset.immersive = "";
    return () => {
      delete document.body.dataset.immersive;
    };
  }, []);
  return null;
}

export function TabBar() {
  const pathname = usePathname() ?? "/";
  const lang = useLang();
  const onboarded = useOnboarded();
  if (HIDE_ON.some((r) => r.test(pathname)) || (pathname === "/" && !onboarded)) return null;

  const item = (active: boolean, content: ReactNode) => (
    <span
      className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-1 py-1 ${
        active ? "border-accent bg-accent-soft text-accent" : "border-transparent text-muted hover:bg-line/60"
      }`}
    >
      {content}
    </span>
  );

  return (
    <>
      <div className="tabbar-spacer" aria-hidden />
      <nav
        aria-label={lang === "th" ? "เมนูหลัก" : "Main"}
        className="tabbar fixed inset-x-0 bottom-0 z-20 border-t-2 border-line bg-bg/95 backdrop-blur"
      >
        <ul className="mx-auto flex w-full max-w-xl items-stretch gap-1 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5">
          {TABS.map((t) => {
            const active = t.match(pathname);
            return (
              <li key={t.href} className="flex flex-1">
                <Link href={t.href} aria-current={active ? "page" : undefined} className="flex flex-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  {item(
                    active,
                    <>
                      {t.icon}
                      <span lang={lang} className={`text-[0.7rem] font-extrabold leading-tight ${lang === "th" ? "thai" : ""}`}>
                        {t.label[lang]}
                      </span>
                    </>,
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const lang = useLang();
  const sound = useSyncExternalStore(subscribeSfx, sfxEnabled, () => true);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const links: { href: string; label: { en: string; th: string }; emoji: string }[] = [
    { href: "/me", label: { en: "Profile & sign in", th: "โปรไฟล์และเข้าสู่ระบบ" }, emoji: "👤" },
    { href: "/ipa", label: { en: "IPA practice", th: "ฝึกถอดเสียง IPA" }, emoji: "ə" },
    { href: "/welcome", label: { en: "How Melobi works", th: "Melobi ใช้งานยังไง" }, emoji: "📖" },
    { href: "/mic-check", label: { en: "Mic check", th: "เช็กไมค์" }, emoji: "🎙️" },
  ];

  return (
    <dialog
      ref={ref}
      aria-label={lang === "th" ? "เพิ่มเติม" : "More"}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="fixed inset-x-0 bottom-0 top-auto m-0 hidden max-h-[85dvh] w-full max-w-none flex-col overflow-y-auto rounded-t-3xl border-2 border-b-0 border-line bg-card p-0 text-ink shadow-2xl open:flex backdrop:bg-black/45 sm:mx-auto sm:max-w-lg"
    >
      <div className="flex flex-col gap-3 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black">
            <Bi text={{ en: "More", th: "เพิ่มเติม" }} />
          </h2>
          <button type="button" onClick={onClose} aria-label={lang === "th" ? "ปิด" : "Close"} className="flex size-10 items-center justify-center rounded-full text-2xl font-black text-muted hover:bg-line">
            ✕
          </button>
        </div>
        <ul className="flex flex-col gap-2">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} onClick={onClose} className="pick flex min-h-14 items-center gap-3 px-4 py-2">
                <span className="text-2xl" aria-hidden>
                  {l.emoji}
                </span>
                <Bi text={l.label} className="min-w-0 flex-1 font-extrabold" />
                <span aria-hidden className="text-xl text-muted">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 rounded-2xl border-2 border-line p-4">
          <div className="flex items-center justify-between gap-3">
            <Bi text={{ en: "Language", th: "ภาษา" }} className="font-extrabold" />
            <LangToggle />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Bi text={{ en: "Sound effects", th: "เสียงเอฟเฟกต์" }} className="font-extrabold" />
            <button
              type="button"
              role="switch"
              aria-label="Sound effects"
              aria-checked={sound}
              onClick={() => setSfxEnabled(!sound)}
              className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${sound ? "bg-accent" : "bg-line"}`}
            >
              <span className={`absolute top-1 size-6 rounded-full bg-white shadow transition-[left] ${sound ? "left-7" : "left-1"}`} />
            </button>
          </div>
          <ThemePicker />
        </div>
      </div>
    </dialog>
  );
}
