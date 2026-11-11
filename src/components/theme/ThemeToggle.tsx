"use client";

import { nextTheme, type ThemeChoice } from "@/lib/ui/theme";
import { useLang } from "@/components/home/lang";
import { setTheme, useTheme } from "./useTheme";

const NAME: Record<ThemeChoice, { en: string; th: string }> = {
  light: { en: "Light", th: "สว่าง" },
  dark: { en: "Dark", th: "มืด" },
  auto: { en: "Auto (follows your device)", th: "อัตโนมัติ (ตามอุปกรณ์)" },
};

export function ThemeIcon({ choice, className = "size-5" }: { choice: ThemeChoice; className?: string }) {
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (choice === "light")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
      </svg>
    );
  if (choice === "dark")
    return (
      <svg {...common}>
        <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** A small icon button for the top bar: tap to cycle dark → light → auto. */
export function ThemeToggle() {
  const lang = useLang();
  const theme = useTheme();
  const next = nextTheme(theme);
  const label = lang === "th" ? `ธีม: ${NAME[theme].th}. แตะเพื่อเปลี่ยนเป็น ${NAME[next].th}` : `Theme: ${NAME[theme].en}. Tap to switch to ${NAME[next].en}`;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className="flex size-9 items-center justify-center rounded-xl border-2 border-line bg-card text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <ThemeIcon choice={theme} />
    </button>
  );
}

/** The labelled version for the home page: three clear choices. */
export function ThemePicker() {
  const lang = useLang();
  const theme = useTheme();
  const options: { value: ThemeChoice; en: string; th: string }[] = [
    { value: "light", en: "Light", th: "สว่าง" },
    { value: "dark", en: "Dark", th: "มืด" },
    { value: "auto", en: "Auto", th: "อัตโนมัติ" },
  ];
  return (
    <div role="group" aria-label="Theme · ธีม" className="flex w-full max-w-xs flex-col items-center gap-2">
      <span className="text-sm font-extrabold text-muted">Theme · ธีม</span>
      <div className="flex w-full rounded-2xl border-2 border-line bg-card p-1">
        {options.map((o) => {
          const on = theme === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => setTheme(o.value)}
              className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                on ? "bg-accent text-bg" : "text-muted hover:text-ink"
              }`}
            >
              <ThemeIcon choice={o.value} className="size-4" />
              {lang === "th" ? o.th : o.en}
            </button>
          );
        })}
      </div>
    </div>
  );
}
