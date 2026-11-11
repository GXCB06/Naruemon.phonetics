"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, parseTheme, THEME_COLORS, THEME_KEY, type ThemeChoice } from "@/lib/ui/theme";

const EVENT = "myna-theme";

function read(): ThemeChoice {
  try {
    return parseTheme(window.localStorage.getItem(THEME_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

/** Put a choice on the page: data-theme on <html> (none = follow the device) and the browser-bar colour. */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  // The status/address bar tint: explicit choice wins over the media-query tags Next renders.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const media = m.getAttribute("media");
    if (m.dataset.mynaMedia === undefined) m.dataset.mynaMedia = media ?? "";
    if (choice === "auto") {
      if (m.dataset.mynaMedia) m.setAttribute("media", m.dataset.mynaMedia);
      else m.removeAttribute("media");
      m.setAttribute("content", m.dataset.mynaMedia.includes("dark") ? THEME_COLORS.dark : THEME_COLORS.light);
    } else {
      m.removeAttribute("media");
      m.setAttribute("content", THEME_COLORS[choice]);
    }
  });
}

export function setTheme(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_KEY, choice); // "auto" is saved too: nothing saved means dark
  } catch {
    // private mode: the choice applies to this visit only
  }
  applyTheme(choice);
  window.dispatchEvent(new Event(EVENT));
}

/** The saved choice (dark on the server and on the first render), kept in step across tabs and components. */
export function useTheme(): ThemeChoice {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener(EVENT, notify);
      window.addEventListener("storage", notify);
      return () => {
        window.removeEventListener(EVENT, notify);
        window.removeEventListener("storage", notify);
      };
    },
    read,
    () => DEFAULT_THEME,
  );
}
