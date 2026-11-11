import { describe, expect, it } from "vitest";
import { allSentences } from "../learn/content.ts";
import { SPEAK_GROUPS, SPEAK_TOPICS, nextInTopic, pickSurprise, scoreWord, speakKey, topicById, topicSentences, topicStat } from "./topics.ts";

const all = allSentences();
const result = (best: number) => ({ stars: 1, best, completedAt: "2026-11-10T10:00:00.000Z" });

describe("speak topics", () => {
  it("puts every sentence in exactly one topic (Class Exercise 2 repeats its own on top)", () => {
    for (const s of all) {
      const kinds = SPEAK_TOPICS.filter((t) => t.id !== "class2" && t.matches(s));
      expect(kinds.length, `${s.id} (${s.kind})`).toBe(1);
    }
  });

  it("gives every topic sentences, and the groups list each topic once", () => {
    for (const t of SPEAK_TOPICS) expect(topicSentences(t, all).length, t.id).toBeGreaterThan(0);
    const listed = SPEAK_GROUPS.flatMap((g) => g.ids);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(SPEAK_TOPICS.map((t) => t.id).sort());
    expect(topicById("wh")?.badge).toBe("2-3-1");
    expect(topicById("nope")).toBeUndefined();
  });

  it("topic ids are safe in a URL", () => {
    for (const t of SPEAK_TOPICS) expect(t.id).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("speak scores", () => {
  const first = topicSentences(topicById("statements")!, all);

  it("counts what was spoken and averages the best scores", () => {
    const lessons = { [speakKey(first[0].id)]: result(80), [speakKey(first[1].id)]: result(60) };
    expect(topicStat(topicById("statements")!, all, lessons)).toEqual({ count: first.length, done: 2, avg: 70 });
    expect(topicStat(topicById("wh")!, all, lessons)).toMatchObject({ done: 0, avg: null });
  });

  it("surprise picks a sentence never spoken first, the same one for the same seed", () => {
    const spoken = Object.fromEntries(all.slice(1).map((s) => [speakKey(s.id), result(90)]));
    for (const seed of [1, 2, 99]) expect(pickSurprise(all, spoken, seed)?.id).toBe(all[0].id);
    const a = pickSurprise(all, {}, 5);
    expect(pickSurprise(all, {}, 5)?.id).toBe(a?.id);
  });

  it("when everything was spoken, surprise picks the weakest", () => {
    const lessons = Object.fromEntries(all.map((s, i) => [speakKey(s.id), result(i === 7 ? 30 : 90)]));
    expect(pickSurprise(all, lessons, 3)?.id).toBe(all[7].id);
    expect(pickSurprise([], {}, 1)).toBeNull();
  });

  it("walks to the next sentence of a topic and wraps round", () => {
    expect(nextInTopic(first, first[0].id)?.id).toBe(first[1].id);
    expect(nextInTopic(first, first[first.length - 1].id)?.id).toBe(first[0].id);
    expect(nextInTopic([first[0]], first[0].id)).toBeNull();
  });

  it("has a score word for every range", () => {
    expect([90, 60, 20].map((n) => scoreWord(n).en)).toEqual(["Great!", "Almost there", "Keep trying"]);
  });
});
