"use client";

import type { CSSProperties } from "react";
import { PATH_WIDTH, ROW_HEIGHT, columnHeight, connectorPath, nodeCentre } from "@/lib/course/path.ts";
import type { NodeState, PathNode, PathUnit } from "@/lib/course/path.ts";
import { CheckIcon, LockIcon, PlayIcon, StarIcon } from "./icons";
import { Bi, useLang } from "./lang";
import { COPY, nodeAriaLabel } from "./copy";

const CIRCLE: Record<NodeState, string> = {
  done: "border-accent-deep bg-accent text-bg",
  current: "border-primary-deep bg-primary text-primary-ink",
  available: "border-primary-deep bg-card text-ink",
  locked: "border-line bg-line text-muted",
};

function NodeCircleIcon({ node, index }: { node: PathNode; index: number }) {
  if (node.state === "locked") return <LockIcon className="size-8" />;
  if (node.state === "done") return <CheckIcon className="size-9" />;
  if (node.state === "current") return <PlayIcon className="size-9" />;
  return <span className="text-2xl font-black">{index + 1}</span>;
}

function Stars({ count }: { count: number }) {
  return (
    <span className="flex gap-0.5 text-muted" aria-hidden>
      {[1, 2, 3].map((n) => (
        <StarIcon key={n} filled={n <= count} className="size-4" />
      ))}
    </span>
  );
}

function LessonNode({ node, index, onOpen }: { node: PathNode; index: number; onOpen: (n: PathNode) => void }) {
  const lang = useLang();
  const locked = node.state === "locked";
  const c = nodeCentre(index);
  const style: CSSProperties = { left: `${(c.x / PATH_WIDTH) * 100}%`, top: index * ROW_HEIGHT };

  return (
    <li className="absolute flex w-36 -translate-x-1/2 flex-col items-center" style={style}>
      <div className="flex h-7 items-end pb-1">
        {node.state === "current" && (
          <span className="rounded-full border-2 border-primary-deep bg-primary px-2.5 py-0.5 text-xs font-black text-primary-ink">
            {COPY.startHere[lang]}
          </span>
        )}
      </div>

      <div className="relative">
        {node.state === "current" && (
          <span aria-hidden className="absolute -inset-2 rounded-full border-4 border-primary/60 motion-safe:animate-pulse" />
        )}
        <button
          type="button"
          aria-label={nodeAriaLabel(node, lang)}
          aria-disabled={locked || undefined}
          aria-haspopup={locked ? undefined : "dialog"}
          onClick={locked ? undefined : () => onOpen(node)}
          className={`relative flex size-[76px] items-center justify-center rounded-full border-2 border-b-[6px] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-accent ${CIRCLE[node.state]} ${
            locked ? "cursor-not-allowed" : "cursor-pointer motion-safe:transition-transform active:translate-y-0.5 active:border-b-2"
          }`}
        >
          <NodeCircleIcon node={node} index={index} />
        </button>
        {node.state === "done" && (
          <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border-2 border-line bg-card px-1.5 py-0.5">
            <Stars count={node.stars} />
          </span>
        )}
      </div>

      <div className={`${node.state === "done" ? "mt-4" : "mt-2.5"} text-center text-sm font-extrabold leading-tight ${locked ? "text-muted" : ""}`}>
        {!node.placeholder && <Bi text={node.title} className="items-center" />}
        {locked && (
          <span className={`${node.placeholder ? "" : "mt-1"} block text-xs font-bold text-muted`}>
            <Bi text={COPY.comingSoon} className="items-center" subClassName="font-semibold" />
          </span>
        )}
      </div>
    </li>
  );
}

export function UnitSection({ unit, onOpen }: { unit: PathUnit; onOpen: (n: PathNode) => void }) {
  const headingId = `unit-${unit.id}`;
  const d = connectorPath(unit.nodes.length);

  return (
    <section aria-labelledby={headingId} className="mx-auto w-full max-w-80">
      <div
        className={`mb-3 flex items-center gap-3 rounded-2xl border-2 px-4 py-3 ${
          unit.locked ? "border-line bg-card text-muted" : "border-accent-deep bg-accent text-bg"
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-black uppercase tracking-wide ${unit.locked ? "text-muted" : "text-bg/80"}`}>
            <span lang="en">Unit {unit.number}</span> · <span lang="th" className="thai">ยูนิต {unit.number}</span>
          </p>
          <h2 id={headingId} className="text-lg font-black leading-tight">
            <Bi text={unit.title} subClassName={unit.locked ? "" : "!text-bg/85"} />
          </h2>
        </div>
        {unit.locked ? (
          <LockIcon className="size-6 shrink-0" />
        ) : (
          <span className="shrink-0 rounded-full bg-bg/25 px-2.5 py-1 text-sm font-extrabold" aria-label={`${unit.doneCount} / ${unit.total}`}>
            {unit.doneCount}/{unit.total}
          </span>
        )}
      </div>

      <div className="relative" style={{ height: columnHeight(unit.nodes.length) }}>
        {d && (
          <svg
            viewBox={`0 0 ${PATH_WIDTH} ${columnHeight(unit.nodes.length)}`}
            preserveAspectRatio="none"
            aria-hidden
            focusable={false}
            className="absolute inset-0 size-full"
          >
            <path d={d} fill="none" stroke="var(--target)" strokeOpacity="0.55" strokeWidth="9" strokeLinecap="round" strokeDasharray="1 18" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        <ol className="m-0 list-none p-0">
          {unit.nodes.map((node, i) => (
            <LessonNode key={node.lessonId} node={node} index={i} onOpen={onOpen} />
          ))}
        </ol>
      </div>
    </section>
  );
}
