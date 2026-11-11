// Light / dark / follow-the-device theme choice. Pure: no DOM, no React (the browser side is src/components/theme/*).

export type ThemeChoice = "light" | "dark" | "auto";

export const THEME_KEY = "myna.theme";

/** Page colours (the --bg token of each theme), used for the browser/status bar tint. */
export const THEME_COLORS = { light: "#fffbf2", dark: "#15131f" } as const;

/** Dark until the learner picks something else (first visit, new sign-up, cleared storage). */
export const DEFAULT_THEME: ThemeChoice = "dark";

/** What was saved on this device. Nothing (or anything unexpected) means the default, dark. */
export function parseTheme(value: unknown): ThemeChoice {
  return value === "light" || value === "dark" || value === "auto" ? value : DEFAULT_THEME;
}

/** The button that cycles: dark → light → follow device → dark. */
export function nextTheme(t: ThemeChoice): ThemeChoice {
  return t === "dark" ? "light" : t === "light" ? "auto" : "dark";
}

/** Runs in <head> before the first paint, so a saved choice never flashes the other theme. Must stay tiny and dependency-free. */
// <html> is rendered with data-theme="dark"; this switches it to a saved "light", or removes it for "auto".
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}"),r=document.documentElement;if(t==="light")r.setAttribute("data-theme","light");else if(t==="auto")r.removeAttribute("data-theme")}catch(e){}`;
