"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { levelsFromStroke, stepPath, type DrawGroup, type Levels, type SlotRef, type StrokePoint } from "@/lib/learn/tuneDraw";

/**
 * The sentence IS the drawing surface (like the textbook): the learner draws the tune over the words with a Pencil or a
 * finger, and each syllable snaps to a level (or a glide). Pencil first: once a Pencil is seen, fingers stop drawing
 * (palm rejection); a quick two-finger tap undoes.
 */

export interface TuneMarks {
  /** Show the textbook line in green. */
  reveal: boolean;
  /** Reading-order index of the syllable to flag red. */
  wrong?: number | null;
  /** Syllables to highlight green (the peaks). */
  good?: number[];
  /** The syllable that keeps a Good from being a Perfect (dashed underline). */
  near?: number | null;
}

export type PenEvent = { kind: "start" } | { kind: "move"; fx: number; fy: number } | { kind: "end"; used: boolean };

interface Cell extends SlotRef {
  x0: number;
  x1: number;
  c0: number;
  c1: number;
}
interface Line {
  y: Record<1 | 2 | 3 | 4, number>;
  slots: Cell[];
}
interface Geo {
  fs: number;
  w: number;
  h: number;
  lines: Line[];
}
interface DrawnStroke {
  line: number;
  pts: StrokePoint[];
}

const clampV = (v: number) => Math.max(0.6, Math.min(4.4, v));

function xToU(L: Line, x: number): number {
  const S = L.slots;
  if (x <= S[0].c0) return S[0].i + (x - S[0].c0) / (S[0].c1 - S[0].c0);
  for (const s of S) if (x <= s.c1) return s.i + Math.max(0, x - s.c0) / (s.c1 - s.c0);
  const s = S[S.length - 1];
  return s.i + (x - s.c0) / (s.c1 - s.c0);
}
function uToX(L: Line, u: number): number {
  const S = L.slots;
  const s = S.find((t) => u < t.i + 1) ?? S[S.length - 1];
  return s.c0 + (u - s.i) * (s.c1 - s.c0);
}
function yToV(L: Line, y: number): number {
  const Y = L.y;
  if (y >= Y[2]) return 2 - (y - Y[2]) / (Y[1] - Y[2]);
  if (y >= Y[3]) return 2 + (Y[2] - y) / (Y[2] - Y[3]);
  return 3 + (Y[3] - y) / (Y[3] - Y[4]);
}
function vToY(L: Line, v: number): number {
  const Y = L.y;
  if (v <= 2) return Y[2] + (2 - v) * (Y[1] - Y[2]);
  if (v <= 3) return Y[2] - (v - 2) * (Y[2] - Y[3]);
  return Y[3] - (v - 3) * (Y[3] - Y[4]);
}
function rawPath(L: Line, pts: readonly StrokePoint[]): string {
  if (!pts.length) return "";
  return "M" + pts.map((p) => `${uToX(L, p.u).toFixed(1)} ${vToY(L, p.v).toFixed(1)}`).join(" L");
}

export function TuneCanvas({
  groups,
  locked,
  marks,
  onChange,
  onPen,
}: {
  groups: readonly DrawGroup[];
  locked: boolean;
  marks: TuneMarks;
  /** Every change of the per-syllable levels (null = not drawn). */
  onChange: (assigned: (Levels | null)[]) => void;
  /** Pen activity, e.g. for a mascot whose eyes follow the pen. */
  onPen?: (e: PenEvent) => void;
}) {
  const total = useMemo(() => groups.reduce((n, g) => n + g.syl.length, 0), [groups]);
  const [assigned, setAssigned] = useState<(Levels | null)[]>(() => Array(total).fill(null));
  const [strokes, setStrokes] = useState<DrawnStroke[]>([]);
  const [history, setHistory] = useState<{ assigned: (Levels | null)[]; strokes: DrawnStroke[] }[]>([]);
  const [snap, setSnap] = useState(true);
  const [guides, setGuides] = useState(false);
  const [width, setWidth] = useState(0);
  const [layout, setLayout] = useState<{ fs: number; perGroup: boolean } | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [ghost, setGhost] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const livePath = useRef<SVGPathElement>(null);
  const live = useRef<{ id: number; type: string; line: number; pts: StrokePoint[]; pressure: number } | null>(null);
  const penSeen = useRef(false);
  const touches = useRef(new Map<number, { t: number; x: number; y: number }>());
  const gesture = useRef<{ start: number; moved: boolean } | null>(null);
  const guideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const onChangeRef = useRef(onChange);
  const onPenRef = useRef(onPen);
  useEffect(() => {
    onChangeRef.current = onChange;
    onPenRef.current = onPen;
  });

  // 1+2. width of the stage, and the font size that fits it: one line if it fits at a readable size, otherwise one line
  // per thought group. The sentence never widens the page: it is fitted to the width instead.
  useEffect(() => {
    const el = stageRef.current;
    const linesEl = linesRef.current;
    if (!el || !linesEl) return;
    const fitTo = (width: number) => {
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx || !width) return null;
      ctx.font = `700 100px ${getComputedStyle(linesEl).fontFamily}`;
      const lineText = (gs: readonly DrawGroup[]) =>
        gs.map((g) => g.syl.map((s, si) => (si > 0 && s.word !== g.syl[si - 1].word ? " " : "") + s.text).join("")).join(" | ");
      const widthOf = (gs: readonly DrawGroup[]) => ctx.measureText(lineText(gs)).width * 1.02 + (gs.length - 1) * 70;
      const fsFor = (w100: number) => Math.min(72, Math.floor((100 * width * 0.92) / w100));
      let perGroup = false;
      let fs = fsFor(widthOf(groups));
      if (fs < 34 && groups.length > 1) {
        perGroup = true;
        fs = fsFor(Math.max(...groups.map((g) => widthOf([g]))));
      }
      return { fs: Math.max(20, fs), perGroup };
    };
    // the observer also fires once right away
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setWidth(w);
      setLayout(fitTo(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [groups]);

  // 3. measure every syllable and the four level lines
  const measure = useCallback(() => {
    const stage = stageRef.current;
    const linesEl = linesRef.current;
    if (!stage || !linesEl || !layout) return;
    const fs = layout.fs;
    let capRatio = 0.7;
    try {
      const c = document.createElement("canvas").getContext("2d");
      if (c) {
        c.font = `700 100px ${getComputedStyle(linesEl).fontFamily}`;
        const m = c.measureText("H");
        if (m.actualBoundingBoxAscent) capRatio = m.actualBoundingBoxAscent / 100;
      }
    } catch {
      // keep the default
    }
    const sr = stage.getBoundingClientRect();
    const lineEls = [...linesEl.querySelectorAll<HTMLElement>("[data-line]")];
    const lines: Line[] = lineEls.map((ln) => {
      const b = ln.querySelector("[data-base]")!.getBoundingClientRect();
      const baseline = b.top - sr.top;
      const cap = capRatio * fs;
      // textbook notation: 1 slightly below the word, 2 right below it, 3 slightly above it, 4 well above
      return { y: { 1: baseline + 0.42 * fs, 2: baseline + 0.15 * fs, 3: baseline - cap - 0.16 * fs, 4: baseline - cap - 0.5 * fs }, slots: [] };
    });
    linesEl.querySelectorAll<HTMLElement>("[data-i]").forEach((sp) => {
      const r = sp.getBoundingClientRect();
      const li = Number(sp.closest<HTMLElement>("[data-line]")!.dataset.line);
      lines[li].slots.push({ i: Number(sp.dataset.i), g: Number(sp.dataset.g), x0: r.left - sr.left, x1: r.right - sr.left, c0: 0, c1: 0 });
    });
    for (const L of lines) {
      L.slots.sort((a, b) => a.i - b.i);
      L.slots.forEach((s, k) => {
        const prev = L.slots[k - 1];
        const next = L.slots[k + 1];
        // each syllable owns the space to the middle of the gaps around it, but never far across a | (so a short word
        // like "I" right after | keeps its middle where the pen starts)
        if (!prev) s.c0 = s.x0 - 0.35 * fs;
        else {
          const mid = (prev.x1 + s.x0) / 2;
          s.c0 = prev.g !== s.g ? Math.max(mid, s.x0 - 0.35 * fs) : mid;
        }
        if (!next) s.c1 = s.x1 + 0.35 * fs;
        else {
          const mid = (s.x1 + next.x0) / 2;
          s.c1 = next.g !== s.g ? Math.min(mid, s.x1 + 0.35 * fs) : mid;
        }
      });
    }
    setGeo({ fs, w: stage.clientWidth, h: stage.clientHeight, lines });
  }, [layout]);

  useLayoutEffect(() => {
    measure();
  }, [measure, width]);
  useEffect(() => {
    // web fonts can arrive after the first measure
    if (typeof document === "undefined" || !document.fonts) return;
    let alive = true;
    document.fonts.ready.then(() => alive && measure());
    return () => {
      alive = false;
    };
  }, [measure]);

  // keep iOS Safari from scrolling or zooming while drawing
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      if (!locked) e.preventDefault();
    };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, [locked]);

  const commit = useCallback((next: (Levels | null)[], nextStrokes: DrawnStroke[]) => {
    setHistory((h) => [...h, { assigned, strokes }]);
    setAssigned(next);
    setStrokes(nextStrokes);
    onChangeRef.current(next);
  }, [assigned, strokes]);

  const undo = useCallback(() => {
    if (locked || !history.length) return;
    const last = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setAssigned(last.assigned);
    setStrokes(last.strokes);
    onChangeRef.current(last.assigned);
  }, [locked, history]);
  const clear = () => {
    if (locked || !strokes.length) return;
    commit(Array(total).fill(null), []);
  };

  const showGuides = (on: boolean) => {
    clearTimeout(guideTimer.current);
    if (on) setGuides(true);
    else guideTimer.current = setTimeout(() => setGuides(false), 650);
  };

  const local = (e: { clientX: number; clientY: number }) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const lineAt = (y: number) => {
    let best = 0;
    let bd = Infinity;
    geo!.lines.forEach((L, i) => {
      const d = Math.abs(y - (L.y[1] + L.y[4]) / 2);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  const strokeW = geo ? Math.max(3, geo.fs * 0.075) : 4;

  const addPoint = (e: React.PointerEvent) => {
    const st = live.current;
    if (!st || !geo) return;
    const L = geo.lines[st.line];
    const native = e.nativeEvent;
    const evs = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    for (const ev of evs.length ? evs : [native]) {
      const p = local(ev);
      st.pts.push({ u: xToU(L, p.x), v: clampV(yToV(L, p.y)) });
      st.pressure = Math.max(st.pressure, ev.pressure || 0.5);
    }
    livePath.current?.setAttribute("d", rawPath(L, st.pts));
    livePath.current?.setAttribute("stroke-width", String(strokeW * (0.75 + 0.5 * (st.pressure || 0.5))));
    const p = local(native);
    onPenRef.current?.({ kind: "move", fx: p.x / (geo.w || 1), fy: (p.y - (L.y[1] + L.y[4]) / 2) / (geo.fs || 1) });
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (locked || !geo) return;
    if (e.pointerType === "touch") {
      touches.current.set(e.pointerId, { t: performance.now(), x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        const first = [...touches.current.values()][0];
        if (performance.now() - first.t < 350) gesture.current = { start: performance.now(), moved: false };
        if (live.current?.type === "touch") {
          live.current = null;
          livePath.current?.setAttribute("d", "");
        }
        return;
      }
      if (penSeen.current) return; // palm rejection: with a Pencil in use, fingers don't draw
    }
    if (e.pointerType === "pen") penSeen.current = true;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    live.current = { id: e.pointerId, type: e.pointerType, line: lineAt(p.y), pts: [], pressure: 0 };
    showGuides(true);
    onPenRef.current?.({ kind: "start" });
    addPoint(e);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "touch" && touches.current.has(e.pointerId) && gesture.current) {
      const t = touches.current.get(e.pointerId)!;
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > 14) gesture.current.moved = true;
    }
    if (live.current && e.pointerId === live.current.id) addPoint(e);
    else if (!locked && (e.pointerType === "pen" || e.pointerType === "mouse") && e.buttons === 0) showGuides(true);
  };
  const onPointerEnd = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "touch") {
      touches.current.delete(e.pointerId);
      if (gesture.current && touches.current.size === 0) {
        if (!gesture.current.moved && performance.now() - gesture.current.start < 450) undo();
        gesture.current = null;
      }
    }
    const st = live.current;
    if (!st || e.pointerId !== st.id || !geo) {
      if (e.pointerType !== "touch") showGuides(false);
      return;
    }
    live.current = null;
    const raw = livePath.current?.getAttribute("d") ?? "";
    livePath.current?.setAttribute("d", "");
    const pts = st.pts.slice().sort((a, b) => a.u - b.u);
    const { next, touched } = levelsFromStroke(pts, geo.lines[st.line].slots, assigned);
    if (touched) {
      commit(next, [...strokes, { line: st.line, pts }]);
      if (snap) setGhost(raw); // the loose stroke fades while the step line appears
    }
    onPenRef.current?.({ kind: "end", used: touched });
    showGuides(false);
  };

  useEffect(() => {
    if (!ghost) return;
    const t = setTimeout(() => setGhost(null), 280);
    return () => clearTimeout(t);
  }, [ghost]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undo]);

  // ---- rendering ----
  const lineGroups = layout?.perGroup ? groups.map((_, gi) => [gi]) : [groups.map((_, gi) => gi)];
  const offsets = useMemo(() => {
    const o: number[] = [];
    let n = 0;
    for (const g of groups) {
      o.push(n);
      n += g.syl.length;
    }
    return o;
  }, [groups]);
  const targets = useMemo(() => groups.flatMap((g) => g.syl.map((s) => s.target)), [groups]);
  const goodSet = new Set(marks.good ?? []);

  return (
    <div className="flex flex-col gap-2">
      <div ref={stageRef} className="tune-stage relative w-full min-w-0 select-none" style={{ WebkitTouchCallout: "none" }}>
        <div ref={linesRef} className="tune-lines flex flex-col items-center" style={{ fontSize: layout ? `${layout.fs}px` : "32px" }} aria-hidden>
          {lineGroups.map((gIdx, li) => (
            <div key={li} data-line={li} className="tune-ln">
              <span data-base className="tune-base" />
              {gIdx.map((gi, k) => (
                <span key={gi}>
                  {k > 0 && <span className="tune-sep">|</span>}
                  {groups[gi].syl.map((s, si) => {
                    const i = offsets[gi] + si;
                    const cls = [
                      "tune-syl",
                      marks.wrong === i ? "wrong" : "",
                      goodSet.has(i) ? "good" : "",
                      marks.near === i ? "near" : "",
                    ].join(" ");
                    return (
                      <span key={si}>
                        {si > 0 && s.word !== groups[gi].syl[si - 1].word ? " " : ""}
                        <span className={cls} data-i={i} data-g={gi}>
                          {s.text}
                        </span>
                      </span>
                    );
                  })}
                </span>
              ))}
            </div>
          ))}
        </div>
        <svg
          className={`tune-ink absolute inset-0 h-full w-full overflow-visible ${locked ? "" : "cursor-crosshair"}`}
          style={{ touchAction: locked ? "auto" : "none" }}
          viewBox={geo ? `0 0 ${geo.w} ${geo.h}` : undefined}
          role="img"
          aria-label="Drawing area over the sentence"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={() => {
            if (!live.current) showGuides(false);
          }}
        >
          {geo && (
            <>
              <g className={`tune-guides ${guides ? "on" : ""}`}>
                {geo.lines.map((L, li) => {
                  if (!L.slots.length) return null;
                  const xa = L.slots[0].c0 - 0.2 * geo.fs;
                  const xb = L.slots[L.slots.length - 1].c1 + 0.2 * geo.fs;
                  return ([1, 2, 3, 4] as const).map((lv) => (
                    <g key={`${li}-${lv}`}>
                      <line x1={xa} x2={xb} y1={L.y[lv]} y2={L.y[lv]} />
                      <text x={Math.max(10, xa - 6)} y={L.y[lv] + 4} textAnchor="end">
                        {lv}
                      </text>
                    </g>
                  ));
                })}
              </g>
              <g>
                {snap
                  ? geo.lines.map((L, li) => {
                      const d = stepPath(L.slots, assigned, (v) => vToY(L, v), 0.22 * geo.fs);
                      return d ? <path key={li} d={d} className="tune-step" strokeWidth={strokeW} /> : null;
                    })
                  : strokes.map((st, k) => <path key={k} d={rawPath(geo.lines[st.line], st.pts)} className="tune-raw" strokeWidth={strokeW * 0.9} />)}
              </g>
              {marks.reveal && (
                <g>
                  {geo.lines.map((L, li) => {
                    const d = stepPath(L.slots, targets, (v) => vToY(L, v), 0.22 * geo.fs);
                    return d ? <path key={li} d={d} className="tune-target" strokeWidth={strokeW * 0.85} pathLength={1} /> : null;
                  })}
                </g>
              )}
              <g>
                {ghost && <path d={ghost} className="tune-raw tune-ghost" strokeWidth={strokeW} />}
                <path ref={livePath} className="tune-raw" />
              </g>
            </>
          )}
        </svg>
      </div>
      {!locked && (
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="btn px-3 py-2 text-sm" onClick={undo} disabled={!history.length} aria-label="Undo">
            ↶ <span className="max-sm:sr-only">Undo</span>
          </button>
          <button type="button" className="btn px-3 py-2 text-sm" onClick={clear} disabled={!strokes.length} aria-label="Clear">
            ✕ <span className="max-sm:sr-only">Clear</span>
          </button>
          <button
            type="button"
            className={`btn px-3 py-2 text-sm ${snap ? "border-good bg-good-soft text-good" : ""}`}
            aria-pressed={snap}
            onClick={() => setSnap((s) => !s)}
            title="Snap the line to the textbook steps"
          >
            ⎍ <span className="max-sm:sr-only">Snap to steps</span>
          </button>
        </div>
      )}
    </div>
  );
}
