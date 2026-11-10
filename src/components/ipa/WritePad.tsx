"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

interface Pt {
  x: number;
  y: number;
  p: number;
}

export interface WritePadHandle {
  /** The writing as a PNG (black ink on white, cropped to the ink), base64 without the data: prefix; null when empty. */
  toPng: () => string | null;
}

/** Draw strokes onto a 2D context at a scale (shared by the screen and the exported image). */
function paint(ctx: CanvasRenderingContext2D, all: Pt[][], color: string, scale: number, dx = 0, dy = 0) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of all) {
    if (s.length === 1) {
      ctx.beginPath();
      ctx.arc((s[0].x + dx) * scale, (s[0].y + dy) * scale, 2.6 * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 1; i < s.length; i++) {
      ctx.lineWidth = (2.2 + 3.2 * (s[i].p || 0.5)) * scale;
      ctx.beginPath();
      ctx.moveTo((s[i - 1].x + dx) * scale, (s[i - 1].y + dy) * scale);
      ctx.lineTo((s[i].x + dx) * scale, (s[i].y + dy) * scale);
      ctx.stroke();
    }
  }
}

/**
 * A handwriting pad for IPA practice (iPad + Pencil recommended). Pencil first: once a Pencil is seen, fingers stop
 * drawing (palm rejection). The writing stays on this device; nothing is uploaded.
 */
export function WritePad({
  disabled,
  onPen,
  onInk,
  padRef,
}: {
  disabled: boolean;
  onPen?: (fx: number | null) => void;
  /** Whether anything is written (after every stroke, undo and clear). */
  onInk?: (hasInk: boolean) => void;
  padRef?: React.Ref<WritePadHandle>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Pt[][]>([]);
  const live = useRef<{ id: number; pts: Pt[] } | null>(null);
  const penSeen = useRef(false);
  const onInkRef = useRef(onInk);
  useEffect(() => {
    onInkRef.current = onInk;
  });
  useEffect(() => {
    onInkRef.current?.(strokes.length > 0);
  }, [strokes]);

  useImperativeHandle(
    padRef,
    () => ({
      toPng: () => {
        if (!strokes.length) return null;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const s of strokes)
          for (const p of s) {
            x0 = Math.min(x0, p.x);
            y0 = Math.min(y0, p.y);
            x1 = Math.max(x1, p.x);
            y1 = Math.max(y1, p.y);
          }
        const m = 24;
        const scale = 2;
        const c = document.createElement("canvas");
        c.width = Math.round(Math.max(80, x1 - x0 + 2 * m) * scale);
        c.height = Math.round(Math.max(60, y1 - y0 + 2 * m) * scale);
        const ctx = c.getContext("2d");
        if (!ctx) return null;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        paint(ctx, strokes, "#000", scale, m - x0, m - y0);
        return c.toDataURL("image/png").split(",")[1] ?? null;
      },
    }),
    [strokes],
  );

  const redraw = useCallback((all: Pt[][]) => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    paint(ctx, all, getComputedStyle(c).color || "#1e1b2e", window.devicePixelRatio || 1);
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ro = new ResizeObserver(() => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      redraw(strokes);
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, [redraw, strokes]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    c.addEventListener("touchmove", stop, { passive: false });
    return () => c.removeEventListener("touchmove", stop);
  }, []);

  const pt = (e: { clientX: number; clientY: number; pressure: number }): Pt => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pressure || 0.5 };
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative rounded-2xl border-2 border-dashed border-line bg-bg">
        <canvas
          ref={canvas}
          className="block h-48 w-full touch-none rounded-2xl text-ink sm:h-56"
          aria-label="Writing area: write the IPA with your Pencil or finger"
          onPointerDown={(e) => {
            if (disabled) return;
            if (e.pointerType === "pen") penSeen.current = true;
            if (e.pointerType === "touch" && penSeen.current) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            live.current = { id: e.pointerId, pts: [pt(e)] };
          }}
          onPointerMove={(e) => {
            const st = live.current;
            if (!st || st.id !== e.pointerId) return;
            const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
            for (const ev of evs.length ? evs : [e.nativeEvent]) st.pts.push(pt(ev));
            redraw([...strokes, st.pts]);
            onPen?.((e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.clientWidth);
          }}
          onPointerUp={(e) => {
            const st = live.current;
            if (!st || st.id !== e.pointerId) return;
            live.current = null;
            setStrokes((s) => [...s, st.pts]);
            onPen?.(null);
          }}
          onPointerCancel={() => {
            live.current = null;
            redraw(strokes);
            onPen?.(null);
          }}
        />
        <div className="pointer-events-none absolute inset-x-[6%] top-2/3 border-t-2 border-dashed border-line" aria-hidden />
        {!strokes.length && (
          <p className="pointer-events-none absolute inset-0 grid place-items-center px-4 text-center text-sm font-bold text-muted">
            <span>
              Write the IPA here to practise (no slashes needed)
              <span className="thai block font-medium">ฝึกเขียน IPA ตรงนี้ (ไม่ต้องใส่ / /)</span>
            </span>
          </p>
        )}
      </div>
      <div className="flex justify-center gap-2">
        <button type="button" className="btn px-3 py-2 text-sm" disabled={disabled || !strokes.length} onClick={() => setStrokes((s) => s.slice(0, -1))}>
          ↶ Undo
        </button>
        <button type="button" className="btn px-3 py-2 text-sm" disabled={disabled || !strokes.length} onClick={() => setStrokes([])}>
          ✕ Clear
        </button>
      </div>
    </div>
  );
}
