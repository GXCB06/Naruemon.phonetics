// Pure logic for the home path: which state each lesson node is in, which lesson is "next",
// and the zig-zag geometry. No DOM, no React (the home components render what this returns).

import type { Progress } from "../progress/store.ts";
import { UNITS } from "./units.ts";
import type { Bilingual, UnitMeta } from "./units.ts";

/**
 * - locked: the unit isn't open yet
 * - available: open, can be played any time
 * - current: the one "Start here" lesson (first not-yet-done lesson of the first open unit that has one)
 * - done: finished with at least one star
 *
 * The progress store only records finished lessons, so there is no partial "in progress" state: the current
 * lesson is the in-progress one.
 */
export type NodeState = "locked" | "available" | "current" | "done";

export interface PathNode {
  unitId: string;
  lessonId: string;
  title: Bilingual;
  state: NodeState;
  /** 0–3. Only meaningful for `done` (a lesson with a 0-star result counts as not done yet). */
  stars: number;
  /** Best score 0–100 if the lesson has ever been finished, else null. */
  best: number | null;
  /** A locked unit that has no lessons yet gets one stand-in node so the path still shows it. */
  placeholder: boolean;
}

export interface PathUnit {
  id: string;
  /** 1-based position on the path. */
  number: number;
  title: Bilingual;
  blurb: Bilingual;
  locked: boolean;
  nodes: PathNode[];
  doneCount: number;
  /** Real lessons (placeholders don't count). */
  total: number;
}

export interface CoursePath {
  units: PathUnit[];
  /** The "Start here" lesson, or null when every open lesson is done. */
  next: { unitId: string; lessonId: string } | null;
}

type Results = Progress["lessons"];

export function clampStars(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0;
  return Math.min(3, Math.max(0, v));
}

function stored(results: Results, lessonId: string) {
  return Object.hasOwn(results, lessonId) ? results[lessonId] : undefined;
}

export function buildPath(results: Results, units: UnitMeta[] = UNITS): CoursePath {
  let next: CoursePath["next"] = null;

  const pathUnits = units.map((unit, i): PathUnit => {
    const lessons = unit.lessons.length > 0 ? unit.lessons : [{ id: `${unit.id}-soon`, title: unit.title }];
    const placeholder = unit.lessons.length === 0;

    const nodes = lessons.map((lesson): PathNode => {
      const r = unit.locked || placeholder ? undefined : stored(results, lesson.id);
      const stars = clampStars(r?.stars);
      const done = !unit.locked && !placeholder && stars >= 1;
      let state: NodeState = unit.locked || placeholder ? "locked" : done ? "done" : "available";
      if (state === "available" && next === null) {
        next = { unitId: unit.id, lessonId: lesson.id };
        state = "current";
      }
      const best = r && typeof r.best === "number" && Number.isFinite(r.best) ? Math.min(100, Math.max(0, Math.round(r.best))) : null;
      return { unitId: unit.id, lessonId: lesson.id, title: lesson.title, state, stars: done ? stars : 0, best, placeholder };
    });

    return {
      id: unit.id,
      number: i + 1,
      title: unit.title,
      blurb: unit.blurb,
      locked: unit.locked,
      nodes,
      doneCount: nodes.filter((n) => n.state === "done").length,
      total: placeholder ? 0 : nodes.length,
    };
  });

  return { units: pathUnits, next };
}

// ---- Zig-zag geometry (all in px inside a PATH_WIDTH-wide column) ----

export const PATH_WIDTH = 320;
/** Distance between consecutive node rows. */
export const ROW_HEIGHT = 150;
/** Distance from the top of a row to the vertical centre of its circle (room for the "Start here" pill). */
export const CIRCLE_CENTRE_Y = 66;

const OFFSETS = [0, 56, 80, 56, 0, -56, -80, -56];

/** Horizontal offset of node `i` from the column centre: a gentle wave, the first node centred. */
export function nodeOffset(i: number): number {
  return OFFSETS[((i % OFFSETS.length) + OFFSETS.length) % OFFSETS.length];
}

export function nodeCentre(i: number): { x: number; y: number } {
  return { x: PATH_WIDTH / 2 + nodeOffset(i), y: i * ROW_HEIGHT + CIRCLE_CENTRE_Y };
}

export function columnHeight(count: number): number {
  return Math.max(0, count) * ROW_HEIGHT;
}

/** SVG path joining the circle centres of `count` nodes with smooth S-curves; "" for fewer than two. */
export function connectorPath(count: number): string {
  if (count < 2) return "";
  const first = nodeCentre(0);
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i < count; i++) {
    const a = nodeCentre(i - 1);
    const b = nodeCentre(i);
    const mid = (a.y + b.y) / 2;
    d += ` C ${a.x} ${mid} ${b.x} ${mid} ${b.x} ${b.y}`;
  }
  return d;
}
