"use client";

import { getStroke } from "perfect-freehand";
import { useMemo, useRef, useState } from "react";
import { analyze } from "@/lib/intonation/engine";
import { CHART, strokesToContour, type StrokePoint } from "@/lib/intonation/drawing";
import type { AnalysisResult, Contour, Layout, Sentence } from "@/lib/intonation/types";
import { ContourChart, LABEL_H } from "./ContourChart";
import { ResultPanel } from "./ResultPanel";

function freehandPath(points: StrokePoint[]): string {
  const outline = getStroke(
    points.map((p) => [p.x, p.y]),
    { size: 12, thinning: 0.4, smoothing: 0.6, streamline: 0.5 },
  );
  if (!outline.length) return "";
  return (
    outline.reduce((d, [x, y], i) => d + (i === 0 ? `M${x.toFixed(1)} ${y.toFixed(1)}` : ` L${x.toFixed(1)} ${y.toFixed(1)}`), "") +
    " Z"
  );
}

/** Drawing quiz: drag a line over the sentence, then score it with the same rule engine as the voice. */
export function DrawingPad({
  sentence,
  layout,
  target,
  onResult,
}: {
  sentence: Sentence;
  layout: Layout;
  target: Contour;
  onResult?: (r: AnalysisResult) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [strokes, setStrokes] = useState<StrokePoint[][]>([]);
  // A ref, not state: pointermove can fire before React re-renders after pointerdown.
  const drawingRef = useRef(false);
  const [snap, setSnap] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const toChart = (e: React.PointerEvent): StrokePoint | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = pt.matrixTransform(m.inverse());
    return { x: Math.max(0, Math.min(CHART.width, p.x)), y: Math.max(0, Math.min(CHART.height, p.y)) };
  };

  const learnerContour = useMemo(() => strokesToContour(strokes, { snap }), [strokes, snap]);

  const check = () => {
    const r = analyze(sentence, learnerContour, { modality: "draw", timingKnown: true });
    setResult(r);
    setShowAnswer(true);
    onResult?.(r);
  };

  const clear = () => {
    setStrokes([]);
    setResult(null);
    setShowAnswer(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">
        Drag your finger or mouse across the chart to draw the tune. Lift the pen at the <b>|</b> between thought groups.
        <span className="thai block text-sm">ลากนิ้วหรือเมาส์บนกราฟเพื่อวาดทำนองเสียง ยกปากกาตรงเครื่องหมาย | ระหว่างกลุ่มคำ</span>
      </p>
      <div className="card overflow-hidden p-2">
        <ContourChart
          layout={layout}
          lines={[
            ...(showAnswer ? [{ contour: target, color: "var(--target)", dashed: true, width: 4 }] : []),
            ...(snap && strokes.length ? [{ contour: learnerContour, color: "var(--accent)", width: 3 }] : []),
          ]}
          className="w-full touch-none select-none"
          svgProps={{
            ref: svgRef,
            style: { cursor: "crosshair", touchAction: "none" },
            onPointerDown: (e) => {
              const p = toChart(e);
              if (!p || p.y > CHART.height) return;
              (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
              drawingRef.current = true;
              setResult(null);
              setShowAnswer(false);
              setStrokes((s) => [...s, [p]]);
            },
            onPointerMove: (e) => {
              if (!drawingRef.current) return;
              const p = toChart(e);
              if (!p) return;
              setStrokes((s) => {
                const copy = s.slice();
                copy[copy.length - 1] = [...copy[copy.length - 1], p];
                return copy;
              });
            },
            onPointerUp: () => (drawingRef.current = false),
            onPointerCancel: () => (drawingRef.current = false),
          }}
        >
          <g>
            {strokes.map((s, i) => (
              <path key={i} d={freehandPath(s)} fill="var(--ink)" opacity={snap ? 0.25 : 0.9} />
            ))}
          </g>
          {/* invisible hit area under the labels so drawing doesn't start there */}
          <rect x={0} y={CHART.height} width={CHART.width} height={LABEL_H} fill="transparent" pointerEvents="none" />
        </ContourChart>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" onClick={check} disabled={!strokes.length}>
          Check
        </button>
        <button className="btn" onClick={clear} disabled={!strokes.length}>
          Clear
        </button>
        <button className="btn" onClick={() => setShowAnswer((v) => !v)}>
          {showAnswer ? "Hide answer" : "Show answer"}
        </button>
        <label className="ml-auto flex cursor-pointer items-center gap-2 font-bold">
          <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
          Snap to levels
        </label>
      </div>
      {result && (
        <div className="card p-4 sm:p-5">
          <ResultPanel result={result} />
          {result.syllableLevels && (
            <p className="mt-4 text-sm text-muted">
              Levels per syllable:{" "}
              <span className="font-mono">
                {result.syllableLevels.map((l) => (l[0] === l[1] ? `${l[0]}` : `${l[0]}→${l[1]}`)).join(" · ")}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
