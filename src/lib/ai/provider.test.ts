import { afterEach, describe, expect, it, vi } from "vitest";
import { aiJson, aiProvider } from "./aiServer.ts";

describe("AI provider choice", () => {
  afterEach(() => vi.unstubAllEnvs());
  const env = (vars: Record<string, string>) => {
    for (const k of ["AI_PROVIDER", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]) vi.stubEnv(k, vars[k] ?? "");
  };

  it("is off without any key", () => {
    env({});
    expect(aiProvider()).toBeNull();
  });

  it("uses whichever key exists, Claude first", () => {
    env({ GEMINI_API_KEY: "g" });
    expect(aiProvider()).toBe("gemini");
    env({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" });
    expect(aiProvider()).toBe("claude");
  });

  it("follows AI_PROVIDER, and stays off when that provider has no key", () => {
    env({ AI_PROVIDER: "gemini", ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" });
    expect(aiProvider()).toBe("gemini");
    env({ AI_PROVIDER: "Claude", GEMINI_API_KEY: "g" });
    expect(aiProvider()).toBeNull();
  });

  it("answers not_configured instead of calling anyone when off", async () => {
    env({});
    expect(await aiJson({ turns: [{ role: "user", content: "hi" }], schema: {}, effort: "low", maxTokens: 10 })).toEqual({ ok: false, reason: "not_configured" });
  });
});
