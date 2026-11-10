import { describe, expect, it } from "vitest";
import { layoutSentence, targetContour } from "../intonation/contour.ts";
import { analyze } from "../intonation/engine.ts";
import { SENTENCES } from "../intonation/lessons.ts";
import type { Contour, Sentence } from "../intonation/types.ts";
import { skillKey, applyResults, type MasteryMap } from "../mastery/mastery.ts";
import { buildAttempt, buildAttemptRow, buildListenAttempt, skillsFromRow } from "./build.ts";
import { flushQueue, type RemoteDb } from "./flush.ts";
import {
  IPA_QUEUE_KEY,
  MAX_IPA_QUEUE,
  buildIpaAttempt,
  flushIpaQueue,
  loadIpaQueue,
  loadIpaStats,
  saveIpaQueue,
  storeIpaAttempt,
  type IpaRemoteDb,
  type QueuedIpaAttempt,
} from "./ipa.ts";
import { drawGroupsOf, evaluateDrawing, levelsToContour, targetLevels } from "../learn/tuneDraw.ts";
import { DRAW_GRADES_KEY, loadGradeTally } from "../progress/grades.ts";
import {
  MAX_QUEUE,
  QUEUE_KEY,
  MASTERY_KEY,
  enqueue,
  loadMastery,
  loadQueue,
  newAttemptId,
  removeFromQueue,
  saveMastery,
  saveQueue,
  type QueuedAttempt,
} from "./queue.ts";

const NOW = new Date("2026-11-10T10:00:00.000Z");
const single = SENTENCES.find((s) => s.groups.length === 1)!;
const multi = SENTENCES.find((s) => s.groups.length > 1);

function perfect(s: Sentence) {
  return analyze(s, targetContour(layoutSentence(s)), { modality: "draw", timingKnown: true });
}
function flat(s: Sentence) {
  const target: Contour = targetContour(layoutSentence(s));
  return analyze(s, target.map((p) => ({ t: p.t, v: p.v === null ? null : 2 })), { modality: "draw", timingKnown: true });
}

function memoryStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
  };
}

describe("buildAttemptRow", () => {
  it("has the attempts-table shape for a drawing", () => {
    const a = perfect(single);
    const row = buildAttemptRow(single, a, "draw", NOW);
    expect(Object.keys(row).sort()).toEqual(
      ["checks", "created_at", "levels", "modality", "overall", "pattern", "sentence_id", "shape_score"].sort(),
    );
    expect(row).toMatchObject({ sentence_id: single.id, modality: "draw", pattern: single.groups[0].pattern, created_at: NOW.toISOString() });
    expect(row.overall).toBe(Math.round(a.overall));
    expect(Number.isInteger(row.shape_score)).toBe(true);
    expect(row.levels).toEqual(a.syllableLevels);
    expect(row.checks.length).toBe(a.groups[0].checks.length);
    for (const c of row.checks) expect(Object.keys(c).sort()).toEqual(["id", "status"]);
  });

  it("a perfect drawing passes its checks; a flat one fails some", () => {
    expect(buildAttemptRow(single, perfect(single), "draw").checks.every((c) => c.status !== "fail")).toBe(true);
    const bad = buildAttemptRow(single, flat(single), "draw");
    expect(bad.checks.some((c) => c.status === "fail")).toBe(true);
    expect(bad.overall).toBeLessThan(buildAttemptRow(single, perfect(single), "draw").overall);
  });

  it("keeps the modality it is given and holds no audio or stroke data", () => {
    const row = buildAttemptRow(single, perfect(single), "speak");
    expect(row.modality).toBe("speak");
    expect(JSON.stringify(row)).not.toMatch(/audio|samples|wav|stroke/i);
  });

  it("voice without known timing has null levels", () => {
    const a = { ...perfect(single), syllableLevels: null };
    expect(buildAttemptRow(single, a, "speak").levels).toBeNull();
  });

  it("is JSON-safe (it goes to localStorage and to Supabase)", () => {
    const row = buildAttemptRow(single, perfect(single), "draw", NOW);
    expect(JSON.parse(JSON.stringify(row))).toEqual(row);
  });
});

describe("buildAttempt skills", () => {
  it("one result per check, with the modality and the group's pattern", () => {
    const { row, skills } = buildAttempt(single, flat(single), "draw", NOW);
    expect(skills).toHaveLength(row.checks.length);
    for (const s of skills) {
      expect(s.modality).toBe("draw");
      expect(s.pattern).toBe(single.groups[0].pattern);
    }
    expect(skills.map((s) => s.skill)).toEqual(row.checks.map((c) => c.id));
  });

  it("multi-group sentences: each group's checks count toward that group's pattern, the row uses the last", () => {
    if (!multi) return; // lesson set has no multi-group sentence yet
    const { row, skills } = buildAttempt(multi, perfect(multi), "draw", NOW);
    expect(row.pattern).toBe(multi.groups[multi.groups.length - 1].pattern);
    const patterns = new Set(skills.map((s) => s.pattern));
    for (const g of multi.groups) expect(patterns.has(g.pattern)).toBe(true);
  });

  it("skillsFromRow derives the same skills for a single-group row", () => {
    const { row, skills } = buildAttempt(single, flat(single), "speak", NOW);
    expect(skillsFromRow(row)).toEqual(skills);
  });
});

describe("buildListenAttempt", () => {
  it("records a pass/fail 'listening' attempt with no levels or shape score", () => {
    const pass = buildListenAttempt(single, true, NOW);
    expect(pass.row).toMatchObject({
      modality: "listen",
      levels: null,
      shape_score: null,
      overall: 100,
      checks: [{ id: "listening", status: "pass" }],
    });
    expect(pass.skills).toEqual([{ pattern: single.groups[0].pattern, skill: "listening", modality: "listen", status: "pass" }]);
    const fail = buildListenAttempt(single, false, NOW);
    expect(fail.row.overall).toBe(0);
    expect(fail.row.checks[0].status).toBe("fail");
  });
});

describe("local queue", () => {
  const item = (n: number): QueuedAttempt => ({ id: `id-${n}`, row: buildListenAttempt(single, true, NOW).row, skills: [] });

  it("is capped at MAX_QUEUE (200), dropping the oldest", () => {
    expect(MAX_QUEUE).toBe(200);
    let q: QueuedAttempt[] = [];
    for (let i = 0; i < 205; i++) q = enqueue(q, item(i));
    expect(q).toHaveLength(200);
    expect(q[0].id).toBe("id-5");
    expect(q[199].id).toBe("id-204");
  });

  it("round-trips through storage and respects the cap on save", () => {
    const s = memoryStore();
    saveQueue([item(1), item(2)], s);
    expect(loadQueue(s).map((q) => q.id)).toEqual(["id-1", "id-2"]);
    saveQueue(Array.from({ length: 250 }, (_, i) => item(i)), s);
    expect(loadQueue(s)).toHaveLength(200);
  });

  it("survives corrupt or hostile storage", () => {
    expect(loadQueue(memoryStore({ [QUEUE_KEY]: "{nope" }))).toEqual([]);
    expect(loadQueue(memoryStore({ [QUEUE_KEY]: '{"a":1}' }))).toEqual([]);
    expect(loadQueue(memoryStore({ [QUEUE_KEY]: '[1,null,{"id":"x"}]' }))).toEqual([]);
    expect(loadMastery(memoryStore({ [MASTERY_KEY]: "[]" }))).toEqual({});
    expect(loadMastery(memoryStore({ [MASTERY_KEY]: "garbage" }))).toEqual({});
    expect(loadMastery(memoryStore({ [MASTERY_KEY]: '{"a|b|c":{"score":"x"}}' }))).toEqual({});
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadQueue(throwing)).toEqual([]);
    expect(() => saveQueue([item(1)], throwing)).not.toThrow();
    expect(() => saveMastery({}, throwing)).not.toThrow();
  });

  it("removeFromQueue drops one id", () => {
    expect(removeFromQueue([item(1), item(2)], "id-1").map((q) => q.id)).toEqual(["id-2"]);
  });

  it("makes UUID-shaped ids that differ", () => {
    const a = newAttemptId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(newAttemptId()).not.toBe(a);
  });

  it("mastery round-trips", () => {
    const s = memoryStore();
    const m: MasteryMap = { [skillKey("2-3-1", "ending", "draw")]: { score: 70, attemptsN: 3, lastSeen: NOW.toISOString() } };
    saveMastery(m, s);
    expect(loadMastery(s)).toEqual(m);
  });
});

/** An in-memory database that enforces unique (user, client_id) like migration 0002. */
function fakeDb(opts: { user?: string | null; failInsertTimes?: number; failMastery?: boolean } = {}) {
  const attempts: { userId: string; item: QueuedAttempt }[] = [];
  let mastery: Record<string, MasteryMap> = {};
  let insertFailures = opts.failInsertTimes ?? 0;
  const user = opts.user === undefined ? "u1" : opts.user;
  const db: RemoteDb = {
    async userId() {
      return user;
    },
    async insertAttempt(userId, item) {
      if (insertFailures > 0) {
        insertFailures -= 1;
        throw new Error("network");
      }
      if (attempts.some((a) => a.userId === userId && a.item.id === item.id)) return false;
      attempts.push({ userId, item });
      return true;
    },
    async loadMastery(userId) {
      return { ...(mastery[userId] ?? {}) };
    },
    async upsertMastery(userId, entries) {
      if (opts.failMastery) throw new Error("mastery down");
      mastery = { ...mastery, [userId]: { ...(mastery[userId] ?? {}), ...entries } };
    },
  };
  return { db, attempts, mastery: () => mastery };
}

function queued(n: number, passed = true): QueuedAttempt {
  const b = buildListenAttempt(single, passed, new Date(NOW.getTime() + n * 1000));
  return { id: `id-${n}`, row: b.row, skills: b.skills };
}

describe("flushQueue", () => {
  it("does nothing when nobody is signed in and keeps the queue", async () => {
    const s = memoryStore();
    saveQueue([queued(1), queued(2)], s);
    const { db, attempts } = fakeDb({ user: null });
    expect(await flushQueue(db, s)).toBe(0);
    expect(attempts).toHaveLength(0);
    expect(loadQueue(s)).toHaveLength(2);
  });

  it("inserts every queued attempt oldest first, empties the queue and writes mastery", async () => {
    const s = memoryStore();
    saveQueue([queued(1), queued(2, false), queued(3)], s);
    const { db, attempts, mastery } = fakeDb();
    expect(await flushQueue(db, s)).toBe(3);
    expect(attempts.map((a) => a.item.id)).toEqual(["id-1", "id-2", "id-3"]);
    expect(loadQueue(s)).toEqual([]);
    const key = skillKey(single.groups[0].pattern, "listening", "listen");
    expect(mastery().u1[key].attemptsN).toBe(3);
    // pass, fail, pass with alpha 0.3: 100 -> 70 -> 79
    expect(mastery().u1[key].score).toBeCloseTo(79, 0);
  });

  it("a retried flush does not double-insert or double-count mastery", async () => {
    const s = memoryStore();
    const first = queued(1);
    saveQueue([first], s);
    const { db, attempts, mastery } = fakeDb();
    await flushQueue(db, s);
    // simulate "the response was lost, the item is still queued": put it back and flush again
    saveQueue([first], s);
    await flushQueue(db, s);
    expect(attempts).toHaveLength(1);
    expect(loadQueue(s)).toEqual([]);
    expect(mastery().u1[skillKey(single.groups[0].pattern, "listening", "listen")].attemptsN).toBe(1);
  });

  it("keeps a failed attempt and the ones after it, then succeeds on the next flush", async () => {
    const s = memoryStore();
    saveQueue([queued(1), queued(2), queued(3)], s);
    const { db, attempts } = fakeDb({ failInsertTimes: 1 });
    expect(await flushQueue(db, s)).toBe(0);
    expect(loadQueue(s)).toHaveLength(3);
    expect(await flushQueue(db, s)).toBe(3);
    expect(attempts.map((a) => a.item.id)).toEqual(["id-1", "id-2", "id-3"]);
  });

  it("a mastery failure still counts the attempt as sent (it must not be inserted again)", async () => {
    const s = memoryStore();
    saveQueue([queued(1)], s);
    const { db, attempts } = fakeDb({ failMastery: true });
    expect(await flushQueue(db, s)).toBe(1);
    expect(attempts).toHaveLength(1);
    expect(loadQueue(s)).toEqual([]);
  });

  it("never throws, even if the database throws everywhere", async () => {
    const s = memoryStore();
    saveQueue([queued(1)], s);
    const db: RemoteDb = {
      userId: async () => {
        throw new Error("boom");
      },
      insertAttempt: async () => {
        throw new Error("boom");
      },
      loadMastery: async () => {
        throw new Error("boom");
      },
      upsertMastery: async () => {
        throw new Error("boom");
      },
    };
    await expect(flushQueue(db, s)).resolves.toBe(0);
    expect(loadQueue(s)).toHaveLength(1);
  });

  it("builds mastery on top of what the database already has", async () => {
    const s = memoryStore();
    const key = skillKey(single.groups[0].pattern, "listening", "listen");
    const existing = applyResults({}, [{ pattern: single.groups[0].pattern, skill: "listening", modality: "listen", status: "pass" }]);
    const f = fakeDb();
    await f.db.upsertMastery("u1", existing);
    saveQueue([queued(1, false)], s);
    await flushQueue(f.db, s);
    expect(f.mastery().u1[key]).toMatchObject({ attemptsN: 2, score: 70 });
  });
});

describe("Draw it grade on the attempt", () => {
  // Exactly what DrawIt does on CHECK: textbook levels → verdict (grade) + analysis from the drawn levels.
  function drawn(sentence: Sentence) {
    const groups = drawGroupsOf(sentence);
    const assigned = targetLevels(groups);
    const verdict = evaluateDrawing(groups, assigned);
    const analysis = analyze(sentence, levelsToContour(sentence, assigned), { modality: "draw", timingKnown: true });
    return { grade: verdict.grade, analysis };
  }

  it("a textbook drawing is Perfect and the grade is saved on the draw row", () => {
    const d = drawn(single);
    expect(d.grade).toBe("perfect");
    const built = buildAttempt(single, d.analysis, "draw", NOW, d.grade);
    expect(built.row.draw_grade).toBe("perfect");
    expect(built.skills.length).toBeGreaterThan(0); // mastery still gets the per-check results
    expect(built.skills.every((x) => x.modality === "draw")).toBe(true);
    expect(JSON.parse(JSON.stringify(built.row))).toEqual(built.row);
  });

  it("speak rows and draw rows without a grade carry no draw_grade key (the table shape is unchanged)", () => {
    expect("draw_grade" in buildAttempt(single, perfect(single), "speak", NOW, "perfect").row).toBe(false);
    expect("draw_grade" in buildAttempt(single, perfect(single), "draw", NOW).row).toBe(false);
    expect("draw_grade" in buildAttempt(single, perfect(single), "draw", NOW, "bogus" as never).row).toBe(false);
    expect("draw_grade" in buildListenAttempt(single, true, NOW).row).toBe(false);
  });

  it("skillsFromRow ignores draw_grade (mastery is unchanged by it)", () => {
    const withGrade = buildAttempt(single, perfect(single), "draw", NOW, "good").row;
    const without = buildAttempt(single, perfect(single), "draw", NOW).row;
    expect(skillsFromRow(withGrade)).toEqual(skillsFromRow(without));
  });

  it("the draw grade tally key does not clash with the queue or mastery", () => {
    expect(new Set([DRAW_GRADES_KEY, QUEUE_KEY, MASTERY_KEY, IPA_QUEUE_KEY]).size).toBe(4);
    expect(loadGradeTally(memoryStore())).toEqual({});
  });
});

describe("IPA practice results", () => {
  const input = { word: "think", mode: "build" as const, grade: "miss" as const, answer: ["θ", "ɪ", "ŋ", "k"], got: ["t", "ɪ", "ŋ", "k"] };

  it("builds an ipa_attempts row: symbols only, JSON-safe, copies its arrays", () => {
    const row = buildIpaAttempt(input, NOW);
    expect(row).toEqual({ ...input, created_at: NOW.toISOString() });
    expect(row.got).not.toBe(input.got);
    expect(Object.keys(row).sort()).toEqual(["answer", "created_at", "got", "grade", "mode", "word"]);
  });

  it("storing a word updates this device's stats and queues it for Supabase", () => {
    const s = memoryStore();
    storeIpaAttempt(buildIpaAttempt(input, NOW), s);
    storeIpaAttempt(buildIpaAttempt({ ...input, grade: "perfect", got: input.answer }, NOW), s);
    const stats = loadIpaStats(s);
    expect(stats.attempts).toBe(2);
    expect(stats.grades).toEqual({ perfect: 1, good: 0, miss: 1 });
    expect(stats.symbols["θ"]).toEqual({ n: 2, wrong: 1 });
    expect(stats.confusions["θ>t"]).toBe(1);
    const q = loadIpaQueue(s);
    expect(q).toHaveLength(2);
    expect(q[0].id).not.toBe(q[1].id);
  });

  it("the queue is capped; corrupt storage reads as empty", () => {
    const s = memoryStore();
    const many: QueuedIpaAttempt[] = Array.from({ length: MAX_IPA_QUEUE + 5 }, (_, i) => ({ id: "i" + i, row: buildIpaAttempt(input, NOW) }));
    saveIpaQueue(many, s);
    expect(loadIpaQueue(s)).toHaveLength(MAX_IPA_QUEUE);
    expect(loadIpaQueue(s)[0].id).toBe("i5");
    expect(loadIpaQueue(memoryStore({ [IPA_QUEUE_KEY]: "{nope" }))).toEqual([]);
  });

  function fakeIpaDb(opts: { user?: string | null; failTimes?: number } = {}) {
    const rows: { userId: string; item: QueuedIpaAttempt }[] = [];
    let fails = opts.failTimes ?? 0;
    const db: IpaRemoteDb = {
      userId: async () => (opts.user === undefined ? "u1" : opts.user),
      insertIpaAttempt: async (userId, item) => {
        if (fails > 0) {
          fails -= 1;
          throw new Error("offline");
        }
        if (rows.some((r) => r.userId === userId && r.item.id === item.id)) return false;
        rows.push({ userId, item });
        return true;
      },
    };
    return { db, rows };
  }

  it("flushes oldest first when signed in, keeps everything when signed out", async () => {
    const s = memoryStore();
    storeIpaAttempt(buildIpaAttempt(input, NOW), s);
    storeIpaAttempt(buildIpaAttempt({ ...input, word: "thank" }, NOW), s);
    const out = fakeIpaDb({ user: null });
    expect(await flushIpaQueue(out.db, s)).toBe(0);
    expect(loadIpaQueue(s)).toHaveLength(2);
    const ok = fakeIpaDb();
    expect(await flushIpaQueue(ok.db, s)).toBe(2);
    expect(ok.rows.map((r) => r.item.row.word)).toEqual(["think", "thank"]);
    expect(loadIpaQueue(s)).toEqual([]);
    expect(loadIpaStats(s).attempts).toBe(2); // flushing never touches the device's stats
  });

  it("stops at a failure (e.g. migration 0003 not run yet), keeps the rest and never throws", async () => {
    const s = memoryStore();
    storeIpaAttempt(buildIpaAttempt(input, NOW), s);
    storeIpaAttempt(buildIpaAttempt({ ...input, word: "thank" }, NOW), s);
    const f = fakeIpaDb({ failTimes: 1 });
    await expect(flushIpaQueue(f.db, s)).resolves.toBe(0);
    expect(loadIpaQueue(s)).toHaveLength(2);
    expect(await flushIpaQueue(f.db, s)).toBe(2);
  });

  it("a retried flush does not insert the same word twice", async () => {
    const s = memoryStore();
    storeIpaAttempt(buildIpaAttempt(input, NOW), s);
    const first = loadIpaQueue(s);
    const f = fakeIpaDb();
    await flushIpaQueue(f.db, s);
    saveIpaQueue(first, s);
    await flushIpaQueue(f.db, s);
    expect(f.rows).toHaveLength(1);
    expect(loadIpaQueue(s)).toEqual([]);
  });
});
