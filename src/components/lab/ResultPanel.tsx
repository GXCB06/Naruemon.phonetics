import { PATTERN_LABEL } from "@/lib/intonation/lessons";
import { pickTopTip, type TopTip } from "@/lib/intonation/tips";
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

/** The one thing to work on next: big icon, English line, Thai line. */
function TipCard({ tip, multiGroup }: { tip: TopTip; multiGroup: boolean }) {
  const praise = tip.kind === "praise";
  const status: Check["status"] = praise ? "pass" : tip.check.status;
  const message = praise ? tip.message : tip.check.message;
  const label = praise
    ? "Nice work"
    : `${NAME[tip.check.id]}${multiGroup && tip.groupIndex !== null ? ` · Part ${tip.groupIndex + 1}` : ""}`;
  return (
    <section
      aria-label="Top tip"
      className={`flex gap-3 rounded-2xl border-2 border-current p-4 ${TONE[status]}`}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-xl font-black"
        aria-label={praise ? "pass" : status}
      >
        {ICON[status]}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-extrabold uppercase tracking-wide">{praise ? "Great!" : `Top tip · ${label}`}</div>
        <div className="text-lg font-black leading-snug text-ink">{message.en}</div>
        <div className="thai mt-1 text-base text-ink/80">{message.th}</div>
      </div>
    </section>
  );
}

export function ResultPanel({ result }: { result: AnalysisResult }) {
  const tip = pickTopTip(result);
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
      <TipCard tip={tip} multiGroup={result.groups.length > 1} />
      <details className="group rounded-2xl border-2 border-line">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 font-extrabold [&::-webkit-details-marker]:hidden">
          <span>
            See details <span className="thai font-semibold text-muted">/ ดูรายละเอียด</span>
          </span>
          <span aria-hidden className="text-muted transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="flex flex-col gap-4 border-t-2 border-line p-4">
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
      </details>
    </div>
  );
}
