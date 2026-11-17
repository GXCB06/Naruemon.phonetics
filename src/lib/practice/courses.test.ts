import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { allSentences } from "../learn/content.ts";
import { parseManifest, referenceVoices } from "../learn/reference.ts";
import { layoutSentence, targetKeyPoints } from "../intonation/contour.ts";
import {
  COURSES,
  DRILL_PLAN,
  DRAW3_PLAN,
  FIXED_SENTENCES,
  SESSION_PLAN,
  SPEAK3_PLAN,
  buildDrill,
  courseById,
  courseSentences,
  courseStat,
  courseStatus,
  daysSince,
  drillId,
  planFor,
} from "./courses.ts";

const all = allSentences();

/**
 * Sentences used by a session whose Azure clip never passes the tune gate: the app speaks them with the device voice.
 * A `review-` sentence is not listed here: it plays the original lesson's clip (see reference.ts).
 */
const DEVICE_VOICE_ONLY = new Set([
  "falling-2-why-late",
  "class2-02b-kind-computer",
  "class2-03b-where-work",
  "class2-13c-now",
  "class2-14a-bravo",
  "session-a-book",
]);

describe("practice courses", () => {
  it("every course has enough sentences for its plan without leaning on repeats", () => {
    for (const c of COURSES) expect(courseSentences(c.id, all).length, c.id).toBeGreaterThanOrEqual(planFor(c.id).length);
  });

  it("each course holds only the sentences it promises", () => {
    const isFalling = (s: (typeof all)[number]) => s.groups.length === 1 && s.groups[0].pattern === "2-3-1";
    for (const id of ["falling", "session", "draw3a", "draw3b"] as const) for (const s of courseSentences(id, all)) expect(isFalling(s), id).toBe(true);
    for (const s of courseSentences("rising", all)) expect(s.groups.every((g) => g.pattern === "2-3")).toBe(true);
    for (const s of courseSentences("nonfinal", all)) expect(s.groups.some((g) => g.pattern === "2-3-2")).toBe(true);
    for (const s of courseSentences("tags", all)) expect(s.kind.startsWith("Tag question")).toBe(true);
    for (const s of courseSentences("class2", all)) expect(s.id.startsWith("class2-")).toBe(true);
    expect(courseSentences("class2", all)).toHaveLength(25);
    expect(courseSentences("random", all)).toHaveLength(all.length);
  });

  it("lists and rising never share a sentence (a choice question is a list, not a yes/no)", () => {
    const lists = new Set(courseSentences("lists", all).map((s) => s.id));
    for (const s of courseSentences("rising", all)) expect(lists.has(s.id)).toBe(false);
  });

  it("knows every course id and nothing else", () => {
    expect(courseById("falling")?.badge).toBe("2-3-1");
    expect(courseById("nope")).toBeUndefined();
    expect(new Set(COURSES.map((c) => c.id)).size).toBe(COURSES.length);
  });
});

describe("drills", () => {
  it("runs each course's own plan, with unique ids and a sentence for each", () => {
    for (const c of COURSES) {
      const plan = planFor(c.id);
      const d = buildDrill(c.id, 7, all);
      expect(d.exercises.map((e) => e.type), c.id).toEqual([...plan]);
      expect(new Set(d.exercises.map((e) => e.id)).size, c.id).toBe(plan.length);
      for (const e of d.exercises) expect(d.sentences.some((s) => s.id === e.sentenceId)).toBe(true);
      expect(d.id).toBe(drillId(c.id));
    }
  });

  it("the standard drill is mostly drawing", () => {
    expect(DRILL_PLAN.filter((t) => t === "draw").length).toBeGreaterThanOrEqual(6);
    expect(planFor("falling")).toEqual(DRILL_PLAN);
  });

  it("is the same for the same seed and different for another", () => {
    const a = buildDrill("falling", 1, all).exercises.map((e) => e.sentenceId);
    expect(buildDrill("falling", 1, all).exercises.map((e) => e.sentenceId)).toEqual(a);
    const others = [2, 3, 4, 5, 6].map((s) => buildDrill("falling", s, all).exercises.map((e) => e.sentenceId).join());
    expect(others.some((o) => o !== a.join())).toBe(true);
  });

  it("never repeats a sentence back to back, and uses one sentence per plan item when the course is big enough", () => {
    for (const c of COURSES) {
      const plan = planFor(c.id);
      const ids = buildDrill(c.id, 3, all).exercises.map((e) => e.sentenceId);
      ids.forEach((id, i) => i > 0 && expect(id).not.toBe(ids[i - 1]));
      if (courseSentences(c.id, all).length >= plan.length) expect(new Set(ids).size, c.id).toBe(plan.length);
    }
  });

  it("only uses sentences of its own course", () => {
    const pool = new Set(courseSentences("rising", all).map((s) => s.id));
    for (const s of buildDrill("rising", 9, all).sentences) expect(pool.has(s.id)).toBe(true);
  });

  it("gives an empty drill for an empty pool", () => {
    expect(buildDrill("tags", 1, []).exercises).toEqual([]);
  });

  it("build questions carry a tile bank", () => {
    for (const e of buildDrill("falling", 1, all).exercises) if (e.type === "build") expect(e.bank.length).toBeGreaterThan(3);
  });
});

describe("2-3-1 sessions", () => {
  const oneGroupFalling = (s: (typeof all)[number]) => s.groups.length === 1 && s.groups[0].pattern === "2-3-1";

  it("the mixed session is five drawings, then two speaking exercises", () => {
    const d = buildDrill("session", 11, all);
    expect(d.exercises.map((e) => e.type)).toEqual([...SESSION_PLAN]);
    expect(d.exercises.slice(0, 5).every((e) => e.type === "draw")).toBe(true);
    expect(d.exercises.slice(5).every((e) => e.type === "shadow")).toBe(true);
  });

  it("every session sentence is one thought group in 2-3-1, and the seven are all different", () => {
    const d = buildDrill("session", 11, all);
    const byId = new Map(d.sentences.map((s) => [s.id, s]));
    for (const e of d.exercises) expect(oneGroupFalling(byId.get(e.sentenceId)!)).toBe(true);
    expect(new Set(d.exercises.map((e) => e.sentenceId)).size).toBe(7);
  });

  it("both drawing-only sessions are three 2-3-1 drawings", () => {
    for (const id of ["draw3a", "draw3b"] as const) {
      const d = buildDrill(id, 4, all);
      expect(d.exercises.map((e) => e.type), id).toEqual([...DRAW3_PLAN]);
      for (const s of d.sentences) expect(oneGroupFalling(s), id).toBe(true);
      expect(new Set(d.exercises.map((e) => e.sentenceId)).size, id).toBe(3);
    }
  });

  it("Sets A and B are fixed: the same three sentences in the same order whatever the seed", () => {
    for (const id of ["draw3a", "draw3b"] as const) {
      const fixed = FIXED_SENTENCES[id]!;
      expect(fixed, id).toHaveLength(3);
      for (const seed of [0, 1, 2, 99, 12345]) {
        const d = buildDrill(id, seed, all);
        expect(d.exercises.map((e) => e.sentenceId), `${id} seed ${seed}`).toEqual([...fixed]);
      }
      expect(courseSentences(id, all).map((s) => s.id), id).toEqual([...fixed]);
    }
    // the two drawing sets are different sentences
    expect(FIXED_SENTENCES.draw3a).not.toEqual(FIXED_SENTENCES.draw3b);
  });

  it("the speaking check runs three fixed speaking tasks in a row", () => {
    const fixed = FIXED_SENTENCES.speak3!;
    expect(fixed).toHaveLength(3);
    for (const seed of [0, 1, 2, 99]) {
      const d = buildDrill("speak3", seed, all);
      expect(d.exercises.map((e) => e.type)).toEqual([...SPEAK3_PLAN]);
      expect(d.exercises.every((e) => e.type === "shadow")).toBe(true);
      expect(d.exercises.map((e) => e.sentenceId)).toEqual([...fixed]);
    }
    for (const s of courseSentences("speak3", all)) expect(oneGroupFalling(s)).toBe(true);
  });

  it("the bus sentence peaks on BUS, not on DRIVER", () => {
    const s = all.find((x) => x.id === "session-b-driver")!;
    const layout = layoutSentence(s);
    const top = targetKeyPoints(layout).reduce((a, b) => (b.v > a.v ? b : a));
    const slot = layout.slots.find((sl) => top.t >= sl.start && top.t <= sl.end)!;
    expect(s.groups[0].words[slot.wordIndex].text.toLowerCase()).toBe("bus");
  });

  it("every fixed id still exists and is a one-group 2-3-1 sentence", () => {
    for (const [course, ids] of Object.entries(FIXED_SENTENCES)) {
      expect(courseSentences(course as "draw3b", all).map((s) => s.id), course).toEqual([...ids!]);
      for (const s of courseSentences(course as "draw3b", all)) expect(oneGroupFalling(s), course).toBe(true);
    }
  });

  it("each session keeps its own best score, and its card counts tasks rather than the whole pool", () => {
    const lessons = { [drillId("session")]: { stars: 2, best: 81, completedAt: "2026-11-14T10:00:00.000Z" } };
    expect(courseStat("session", all, lessons)).toMatchObject({ best: 81, stars: 2, size: 7 });
    expect(courseStat("draw3a", all, lessons)).toMatchObject({ best: null, size: 3 });
    expect(courseStat("draw3b", all, lessons)).toMatchObject({ best: null, size: 3 });
    expect(courseStat("speak3", all, lessons)).toMatchObject({ best: null, size: 3 });
    // the pool behind the mixed session is much bigger than any one run
    expect(courseSentences("session", all).length).toBeGreaterThan(7);
  });

  it("every sentence a session can speak has a real clip, or is a documented device-voice fallback", () => {
    // Azure's own tune fails our gate for these, so the app says the words with the device voice (review- copies use the
    // original lesson's clip). Add a clip or list a new sentence here deliberately: silence or a hum is never acceptable.
    if (!existsSync("public/audio/manifest.json")) return;
    const m = parseManifest(JSON.parse(readFileSync("public/audio/manifest.json", "utf8")));
    for (const course of ["session", "draw3a", "draw3b", "speak3"] as const)
      for (const s of courseSentences(course, all)) {
        const playable = referenceVoices(m, s.id).length > 0 || DEVICE_VOICE_ONLY.has(s.id);
        expect(playable, `${course}: ${s.id} "${s.text}"`).toBe(true);
      }
  });
});

describe("course cards", () => {
  const lessons = { [drillId("falling")]: { stars: 2, best: 82, completedAt: "2026-11-09T10:00:00.000Z" }, [drillId("rising")]: { stars: 0, best: 40, completedAt: "2026-11-01T10:00:00.000Z" } };

  it("reads best score, stars and the last day for a practised course, nothing for a new one", () => {
    expect(courseStat("falling", all, lessons)).toMatchObject({ best: 82, stars: 2, lastAt: "2026-11-09T10:00:00.000Z" });
    expect(courseStat("tags", all, lessons)).toMatchObject({ best: null, stars: 0, lastAt: null });
    expect(courseStat("tags", all, lessons).size).toBeGreaterThan(0);
  });

  it("labels courses: new, needs work under 70, good, mastered from 90", () => {
    const stat = (best: number | null) => ({ best, stars: 0, lastAt: null, size: 5 });
    expect([null, 40, 69, 70, 89, 90, 100].map((b) => courseStatus(stat(b)))).toEqual(["new", "needs-work", "needs-work", "good", "good", "mastered", "mastered"]);
  });

  it("counts whole days, never negative, and reads bad dates as none", () => {
    const now = new Date(2026, 10, 11, 9, 0, 0);
    expect(daysSince("2026-11-11T08:00:00", now)).toBe(0);
    expect(daysSince("2026-11-09T23:00:00", now)).toBe(2);
    expect(daysSince("2027-01-01T00:00:00", now)).toBe(0);
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince("nonsense", now)).toBeNull();
  });
});
