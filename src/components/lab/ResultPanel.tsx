import { PATTERN_LABEL } from "@/lib/intonation/lessons";
import type { AnalysisResult, Check } from "@/lib/intonation/types";

const ICON: Record<Check["status"], string> = { pass: "✓", warn: "!", fail: "✗", skip: "–" };
const TONE: Record<Check["status"], string> = {
  pass: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  fail: "bg-bad-soft text-bad",
  skip: "bg-line text-muted",
};
const NAME: Record<Check["id"], string> = {
  start: "Start",
  singlePeak: "One peak",
  peakPlacement: "Peak position",
  ending: "Ending",
  range: "Pitch range",
  break: "Pause",
};

function CheckRow({ c }: { c: Check }) {
  return (
    <li className="flex gap-3">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black ${TONE[c.status]}`}
        aria-label={c.status}
      >
        {ICON[c.status]}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-extrabold uppercase tracking-wide text-muted">{NAME[c.id]}</div>
        <div className="font-semibold">{c.message.en}</div>
        <div className="thai text-sm text-muted">{c.message.th}</div>
      </div>
    </li>
  );
}

export function ResultPanel({ result }: { result: AnalysisResult }) {
  const tone = result.overall >= 80 ? "text-good" : result.overall >= 55 ? "text-warn" : "text-bad";
  const headline =
    result.overall >= 80 ? "Great intonation!" : result.overall >= 55 ? "Almost there" : "Let's try that again";
  const headlineTh = result.overall >= 80 ? "ทำนองเสียงดีมาก!" : result.overall >= 55 ? "เกือบแล้ว" : "ลองอีกครั้งนะ";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className={`text-5xl font-black tabular-nums ${tone}`}>{result.overall}</div>
        <div>
          <div className="text-xl font-black">{headline}</div>
          <div className="thai text-muted">{headlineTh}</div>
        </div>
      </div>
      {result.sentenceChecks.length > 0 && (
        <ul className="flex flex-col gap-3">
          {result.sentenceChecks.map((c, i) => (
            <CheckRow key={i} c={c} />
          ))}
        </ul>
      )}
      {result.groups.map((g) => (
        <div key={g.groupIndex} className="rounded-2xl border-2 border-line p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="font-black">
              {result.groups.length > 1 ? `Part ${g.groupIndex + 1}: ` : ""}
              {PATTERN_LABEL[g.pattern].en}
            </span>
            <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-extrabold text-accent">
              Shape match {g.shapeScore}%
            </span>
          </div>
          <ul className="flex flex-col gap-3">
            {g.checks.map((c, i) => (
              <CheckRow key={i} c={c} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
