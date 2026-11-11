import { describe, expect, it } from "vitest";
import { nextTheme, parseTheme, THEME_COLORS, THEME_KEY, THEME_SCRIPT } from "./theme.ts";

describe("theme choice", () => {
  it("is dark unless the learner saved something else", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("auto")).toBe("auto");
    for (const junk of [null, undefined, "", "Dark", "sepia", 1]) expect(parseTheme(junk)).toBe("dark");
  });

  it("cycles dark → light → follow-device → dark", () => {
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("auto");
    expect(nextTheme("auto")).toBe("dark");
  });

  it("the pre-paint script keeps dark when nothing is saved", () => {
    const run = (saved: string | null) => {
      const attrs: Record<string, string> = { "data-theme": "dark" };
      const document = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v), removeAttribute: (k: string) => delete attrs[k] } };
      const localStorage = { getItem: () => saved };
      new Function("document", "localStorage", THEME_SCRIPT)(document, localStorage);
      return attrs["data-theme"];
    };
    expect(run(null)).toBe("dark");
    expect(run("dark")).toBe("dark");
    expect(run("light")).toBe("light");
    expect(run("auto")).toBeUndefined();
  });

  it("has a page colour per theme and a pre-paint script that reads the saved key", () => {
    expect(THEME_COLORS.light).toMatch(/^#[0-9a-f]{6}$/i);
    expect(THEME_COLORS.dark).toMatch(/^#[0-9a-f]{6}$/i);
    expect(THEME_SCRIPT).toContain(`localStorage.getItem("${THEME_KEY}")`);
    expect(THEME_SCRIPT).toContain("data-theme");
    expect(() => new Function(THEME_SCRIPT)).not.toThrow(); // valid JavaScript
  });
});
