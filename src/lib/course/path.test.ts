import { describe, expect, it } from "vitest";
import type { Progress } from "../progress/store.ts";
import { PATH_WIDTH, buildPath, clampStars, columnHeight, connectorPath, nodeCentre, nodeOffset } from "./path.ts";
import { UNITS } from "./units.ts";
import type { UnitMeta } from "./units.ts";

const result = (stars: number, best = 80) => ({ stars, best, completedAt: "2026-11-10T10:00:00.000Z" });
const states = (r: Progress["lessons"]) => buildPath(r).units[0].nodes.map((n) => n.state);
describe("buildPath", () => {
  it("with no progress: first lesson is current, the rest of the open units available, the other units locked", () => {
    const path = buildPath({});
    expect(states({})).toEqual(["current", "available", "available"]);
    expect(path.units[1].nodes.map((n) => n.state)).toEqual(["available", "available"]); // rising is open too
    expect(path.next).toEqual({ unitId: "falling", lessonId: "falling-1" });
    for (const u of path.units.slice(2)) {
      expect(u.locked).toBe(true);
      expect(u.nodes.every((n) => n.state === "locked")).toBe(true);
    }
  });

  it("a finished lesson is done with its stars and best score; the next one becomes current", () => {
    const path = buildPath({ "falling-1": result(2, 83) });
    const [a, b, c] = path.units[0].nodes;
    expect([a.state, b.state, c.state]).toEqual(["done", "current", "available"]);
    expect(a.stars).toBe(2);
    expect(a.best).toBe(83);
    expect(path.next?.lessonId).toBe("falling-2");
    expect(path.units[0].doneCount).toBe(1);
    expect(path.units[0].total).toBe(3);
  });

  it("current is the first NOT-done lesson even if a later one was finished", () => {
    expect(states({ "falling-2": result(3, 95) })).toEqual(["current", "done", "available"]);
  });

  it("a 0-star result isn't done, but keeps the best score for the sheet", () => {
    const path = buildPath({ "falling-1": result(0, 40) });
    const a = path.units[0].nodes[0];
    expect(a.state).toBe("current");
    expect(a.stars).toBe(0);
    expect(a.best).toBe(40);
  });

  it("when every open lesson is done there is no next", () => {
    const all = { "falling-1": result(3), "falling-2": result(1), "falling-3": result(2), "rising-1": result(3), "rising-2": result(2) };
    const path = buildPath(all);
    expect(path.next).toBeNull();
    expect(states(all)).toEqual(["done", "done", "done"]);
    expect(path.units[1].nodes.map((n) => n.state)).toEqual(["done", "done"]);
  });

  it("finishing the falling unit makes rising the next one to play", () => {
    const path = buildPath({ "falling-1": result(3), "falling-2": result(1), "falling-3": result(2) });
    expect(path.next).toEqual({ unitId: "rising", lessonId: "rising-1" });
    expect(path.units[1].nodes[0].state).toBe("current");
    expect(path.units[1].total).toBe(2);
  });

  it("locked units get one placeholder node (unit title) and no totals", () => {
    const lists = buildPath({}).units[2];
    expect(lists.id).toBe("lists");
    expect(lists.nodes).toHaveLength(1);
    expect(lists.nodes[0].placeholder).toBe(true);
    expect(lists.nodes[0].title).toEqual(lists.title);
    expect(lists.total).toBe(0);
    expect(lists.number).toBe(3);
  });

  it("progress for lessons in a locked unit is ignored", () => {
    const units: UnitMeta[] = [{ ...UNITS[1], locked: true, lessons: [{ id: "rising-1", title: { en: "x", th: "x" } }] }];
    const n = buildPath({ "rising-1": result(3) }, units).units[0].nodes[0];
    expect(n.state).toBe("locked");
    expect(n.stars).toBe(0);
  });

  it("moves on to the next open unit when the first is finished", () => {
    const units: UnitMeta[] = [
      { ...UNITS[0], lessons: [UNITS[0].lessons[0]] },
      { ...UNITS[1], locked: false, lessons: [{ id: "rising-1", title: { en: "Yes/no", th: "Yes/no" } }] },
    ];
    const path = buildPath({ "falling-1": result(2) }, units);
    expect(path.next).toEqual({ unitId: "rising", lessonId: "rising-1" });
    expect(path.units[1].nodes[0].state).toBe("current");
  });

  it("survives junk in stored results", () => {
    const junk = { "falling-1": { stars: "3", best: Number.NaN, completedAt: "" } } as unknown as Progress["lessons"];
    const a = buildPath(junk).units[0].nodes[0];
    expect(a.state).toBe("current");
    expect(a.best).toBeNull();
    expect(buildPath({ constructor: result(3) } as Progress["lessons"]).units[0].nodes[0].state).toBe("current");
  });

  it("clampStars bounds to 0–3", () => {
    expect([clampStars(-1), clampStars(1.4), clampStars(7), clampStars(undefined), clampStars(Number.NaN)]).toEqual([0, 1, 3, 0, 0]);
  });
});

describe("geometry", () => {
  it("centres the first node and keeps every circle inside the column", () => {
    expect(nodeOffset(0)).toBe(0);
    for (let i = 0; i < 20; i++) {
      const { x } = nodeCentre(i);
      expect(x - 38).toBeGreaterThanOrEqual(0);
      expect(x + 38).toBeLessThanOrEqual(PATH_WIDTH);
    }
  });

  it("builds one curve per gap and nothing for a single node", () => {
    expect(connectorPath(1)).toBe("");
    expect(connectorPath(0)).toBe("");
    const d = connectorPath(3);
    expect(d.startsWith("M 160 66")).toBe(true);
    expect(d.match(/C/g)).toHaveLength(2);
  });

  it("column height grows with the node count", () => {
    expect(columnHeight(0)).toBe(0);
    expect(columnHeight(3)).toBe(3 * 150);
  });
});
