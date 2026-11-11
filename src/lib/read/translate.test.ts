import { describe, expect, it } from "vitest";
import { TRANSLATE_LIMITS, parseTranslateRequest, parseTranslation } from "./translate.ts";

describe("translate request", () => {
  it("accepts a list of sentences and tidies their spaces", () => {
    expect(parseTranslateRequest({ sentences: ["Hello   there.", " How are you? "] })).toEqual({ ok: true, sentences: ["Hello there.", "How are you?"] });
  });

  it("rejects the wrong shapes and limits", () => {
    for (const bad of [null, {}, { sentences: [] }, { sentences: "Hi" }, { sentences: [1] }, { sentences: [""] }, { sentences: ["x".repeat(TRANSLATE_LIMITS.sentenceChars + 1)] }]) {
      expect(parseTranslateRequest(bad).ok).toBe(false);
    }
    expect(parseTranslateRequest({ sentences: Array(TRANSLATE_LIMITS.sentences + 1).fill("Hi.") }).ok).toBe(false);
    // 6 x 299 characters = 1794 > 1500
    expect(parseTranslateRequest({ sentences: Array(6).fill("y".repeat(299)) }).ok).toBe(false);
  });
});

describe("translation answer", () => {
  it("returns one Thai line per sentence", () => {
    expect(parseTranslation(JSON.stringify({ th: ["สวัสดี", "สบายดีไหม"] }), 2)).toEqual(["สวัสดี", "สบายดีไหม"]);
  });

  it("drops polite particles the speaker's gender would decide", () => {
    expect(parseTranslation(JSON.stringify({ th: ["สวัสดี ครับ"] }), 1)).toEqual(["สวัสดี"]);
  });

  it("is unusable when the count is wrong, a line is empty or the JSON is bad", () => {
    expect(parseTranslation(JSON.stringify({ th: ["ก"] }), 2)).toBeNull();
    expect(parseTranslation(JSON.stringify({ th: ["ก", ""] }), 2)).toBeNull();
    expect(parseTranslation(JSON.stringify({ th: ["ก", 5] }), 2)).toBeNull();
    expect(parseTranslation("not json", 1)).toBeNull();
    expect(parseTranslation("{}", 1)).toBeNull();
  });
});
