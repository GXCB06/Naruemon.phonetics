"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bi } from "@/components/home/lang";
import { MynaBot, type BotMood } from "@/components/mascot/MynaBot";
import {
  assessNoiseFloor,
  meterLevel,
  micDeviceWarnings,
  rmsDb,
  smoothMeterDb,
  testTakeVerdict,
  type MicMessage,
  type NoiseFloorReport,
} from "@/lib/audio/quality";
import { MicError, MicRecorder, type MicErrorKind } from "@/lib/audio/recorder";
import { encodeWav } from "@/lib/audio/wav";
import type { Bilingual } from "@/lib/course/units";

/** Let the mic settle before measuring the room (some devices pop or ramp up at the start). */
const SETTLE_SEC = 0.3;
const NOISE_SEC = 2;
const TEST_SEC = 3;
/** Meter zones (dBFS): below QUIET we "can't hear you", above LOUD the voice may clip. */
const VOICE_DB = -38;
const LOUD_DB = -4;

type Phase = "idle" | "starting" | "noise" | "ready" | "testing" | "done" | "error";

const T = {
  title: { en: "Mic check", th: "เช็กไมค์" },
  intro: {
    en: "Let's make sure Myna can hear you well. It takes about 10 seconds. Nothing is saved.",
    th: "มาเช็กกันว่า Myna ได้ยินเสียงคุณชัดไหม ใช้เวลาประมาณ 10 วินาที และไม่มีการบันทึกเก็บไว้",
  },
  start: { en: "Start mic check", th: "เริ่มเช็กไมค์" },
  starting: { en: "Asking for the microphone…", th: "กำลังขอใช้ไมค์…" },
  shh: { en: "Shh… stay quiet for 2 seconds", th: "เงียบไว้ 2 วินาทีนะ…" },
  shhSub: { en: "Measuring the background noise in your room.", th: "กำลังวัดเสียงรบกวนในห้องของคุณ" },
  room: { en: "Your room", th: "ห้องของคุณ" },
  meter: { en: "Mic level", th: "ระดับเสียงไมค์" },
  sayHi: {
    en: "Now say something. The bar should jump into the green part.",
    th: "ลองพูดอะไรก็ได้ แถบควรขยับเข้าไปในช่วงสีเขียว",
  },
  record: { en: "Record a 3-second test", th: "อัดเสียงทดสอบ 3 วินาที" },
  recordHint: {
    en: "Say: “Hello, my name is …, and I'm practising English.”",
    th: "พูดว่า “Hello, my name is …, and I'm practising English.”",
  },
  recording: { en: "Recording… keep talking", th: "กำลังอัด… พูดต่อไปเลย" },
  play: { en: "Play it back", th: "ฟังเสียงที่อัด" },
  playHint: { en: "Does it sound clear, like you?", th: "ฟังแล้วชัดและเหมือนเสียงคุณไหม?" },
  again: { en: "Check again", th: "เช็กอีกครั้ง" },
  device: { en: "Microphone", th: "ไมค์" },
  reload: { en: "Reload the page", th: "โหลดหน้าใหม่" },
  tryAgain: { en: "Try again", th: "ลองอีกครั้ง" },
  quietLabel: { en: "too quiet", th: "เบาไป" },
  goodLabel: { en: "good", th: "ดี" },
  loudLabel: { en: "too loud", th: "ดังไป" },
} satisfies Record<string, Bilingual>;

const MIC_ERRORS: Record<MicErrorKind, Bilingual> = {
  denied: {
    en: "The microphone is blocked. Allow the microphone for this site, then reload. On iPad: tap “aA” in the address bar → Website Settings → Microphone → Allow (or Settings → Apps → Safari → Microphone).",
    th: "ไมค์ถูกบล็อกอยู่ ให้อนุญาตไมค์สำหรับเว็บนี้แล้วโหลดหน้าใหม่ บน iPad: แตะ “aA” ที่แถบที่อยู่ → การตั้งค่าเว็บไซต์ → ไมโครโฟน → อนุญาต (หรือ การตั้งค่า → แอป → Safari → ไมโครโฟน)",
  },
  notFound: {
    en: "No microphone found. Plug one in or check your device settings.",
    th: "ไม่พบไมค์ ลองเสียบไมค์หรือตรวจการตั้งค่าเครื่อง",
  },
  busy: {
    en: "The microphone is busy or stuck. Close other apps using it (calls, video chat), then reload.",
    th: "ไมค์ถูกใช้อยู่หรือค้าง ปิดแอปอื่นที่ใช้ไมค์ (โทร วิดีโอคอล) แล้วโหลดหน้าใหม่",
  },
  unsupported: {
    en: "This browser can't record audio. Open Myna in Safari or Chrome (it needs HTTPS).",
    th: "เบราว์เซอร์นี้อัดเสียงไม่ได้ ลองเปิด Myna ใน Safari หรือ Chrome (ต้องเป็น HTTPS)",
  },
  unknown: {
    en: "Couldn't start the microphone. Try reloading the page.",
    th: "เปิดไมค์ไม่ได้ ลองโหลดหน้าใหม่",
  },
};

/**
 * Mic check: ask for the mic inside the tap, show a live level meter, measure the room's noise floor while the learner
 * stays quiet, warn about Bluetooth / narrowband inputs, then record a 3-second test and play it back.
 * Audio rules: MicRecorder (native-rate AudioContext, AEC/NS/AGC off). Nothing is uploaded or stored.
 */
export function MicCheck({ compact = false }: { compact?: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorKind, setErrorKind] = useState<MicErrorKind | null>(null);
  const [meterDb, setMeterDb] = useState(-120);
  const [progress, setProgress] = useState(0);
  const [room, setRoom] = useState<NoiseFloorReport | null>(null);
  const [device, setDevice] = useState<{ label: string; warnings: MicMessage[]; rate: number } | null>(null);
  const [verdict, setVerdict] = useState<MicMessage | null>(null);
  const [take, setTake] = useState<Uint8Array | null>(null);

  const recRef = useRef<MicRecorder | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const seenRef = useRef(0);
  const meterRef = useRef(-120);
  const noiseChunks = useRef<Float32Array[]>([]);
  const testStartRef = useRef(0);
  const roomRef = useRef<NoiseFloorReport | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const finishRef = useRef<() => void>(() => undefined);

  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const takeUrl = useMemo(() => (take ? URL.createObjectURL(new Blob([take as BlobPart], { type: "audio/wav" })) : null), [take]);
  useEffect(() => () => void (takeUrl && URL.revokeObjectURL(takeUrl)), [takeUrl]);

  // Leaving the page (or closing the dialog) must release the microphone.
  useEffect(
    () => () => {
      const rec = recRef.current;
      recRef.current = null;
      phaseRef.current = "idle";
      void rec?.stop().catch(() => undefined);
    },
    [],
  );

  const finishTest = async () => {
    const rec = recRef.current;
    if (!rec || phaseRef.current !== "testing") return;
    recRef.current = null;
    go("done");
    const raw = await rec.stop();
    const sr = rec.sampleRate;
    const clip = raw.subarray(testStartRef.current, testStartRef.current + Math.round(TEST_SEC * sr));
    const { summary } = testTakeVerdict(clip, sr, roomRef.current?.noiseDb);
    setVerdict(summary);
    setTake(encodeWav(clip, sr));
    setMeterDb(-120);
  };
  useEffect(() => {
    finishRef.current = () => void finishTest(); // the recorder callback (created once, in start) calls the latest one
  });

  const onChunk = (chunk: Float32Array, sr: number) => {
    const dt = chunk.length / sr;
    seenRef.current += chunk.length;
    meterRef.current = smoothMeterDb(meterRef.current, rmsDb(chunk), dt);
    setMeterDb(meterRef.current);
    const p = phaseRef.current;
    const t = seenRef.current / sr;
    if (p === "noise") {
      if (t < SETTLE_SEC) return;
      noiseChunks.current.push(chunk.slice());
      const measured = t - SETTLE_SEC;
      setProgress(Math.min(1, measured / NOISE_SEC));
      if (measured >= NOISE_SEC) {
        const all = new Float32Array(noiseChunks.current.reduce((n, c) => n + c.length, 0));
        let o = 0;
        for (const c of noiseChunks.current) {
          all.set(c, o);
          o += c.length;
        }
        noiseChunks.current = [];
        const report = assessNoiseFloor(all, sr);
        roomRef.current = report;
        setRoom(report);
        go("ready");
      }
    } else if (p === "testing") {
      const elapsed = (seenRef.current - testStartRef.current) / sr;
      setProgress(Math.min(1, elapsed / TEST_SEC));
      if (elapsed >= TEST_SEC) finishRef.current();
    }
  };

  // Must run inside the tap: MicRecorder creates/resumes the AudioContext and asks for the mic here (iOS).
  const start = async () => {
    const old = recRef.current;
    recRef.current = null;
    await old?.stop().catch(() => undefined);
    setErrorKind(null);
    setRoom(null);
    setVerdict(null);
    setTake(null);
    setDevice(null);
    setProgress(0);
    seenRef.current = 0;
    meterRef.current = -120;
    noiseChunks.current = [];
    roomRef.current = null;
    go("starting");
    const rec = new MicRecorder();
    recRef.current = rec;
    try {
      await rec.start({ onChunk });
      if (recRef.current !== rec) {
        await rec.stop().catch(() => undefined);
        return;
      }
      const info = rec.inputInfo;
      setDevice({
        label: info.label,
        rate: info.trackRate ?? rec.sampleRate,
        warnings: micDeviceWarnings({ label: info.label, contextRate: rec.sampleRate, trackRate: info.trackRate, rawAudio: rec.rawAudio }),
      });
      seenRef.current = 0;
      go("noise");
    } catch (e) {
      recRef.current = null;
      setErrorKind(e instanceof MicError ? e.kind : "unknown");
      go("error");
    }
  };

  const startTest = () => {
    if (!recRef.current || phaseRef.current !== "ready") return;
    testStartRef.current = seenRef.current;
    setProgress(0);
    go("testing");
  };

  const playBack = () => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = 0;
    void a.play().catch(() => undefined);
  };

  const live = phase === "noise" || phase === "ready" || phase === "testing";
  const mood: BotMood =
    phase === "error"
      ? "sad"
      : phase === "noise"
        ? "sleepy"
        : phase === "testing"
          ? "listening"
          : phase === "starting"
            ? "thinking"
            : phase === "done"
              ? verdict?.level === "ok"
                ? "happy"
                : verdict?.level === "fail"
                  ? "sad"
                  : "surprised"
              : phase === "ready"
                ? meterDb > VOICE_DB
                  ? "listening"
                  : "watch"
                : "idle";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <MynaBot mood={mood} className={compact ? "size-16" : "size-20 sm:size-24"} />
        <div className="min-w-0">
          {compact ? (
            <h2 className="text-xl font-black">
              <Bi text={T.title} />
            </h2>
          ) : (
            <h1 className="text-3xl font-black tracking-tight">
              <Bi text={T.title} />
            </h1>
          )}
          {phase === "idle" && (
            <p className="mt-1 text-sm font-semibold text-muted">
              <Bi text={T.intro} />
            </p>
          )}
        </div>
      </div>

      {(phase === "idle" || phase === "error" || phase === "starting") && (
        <button type="button" className="btn btn-accent min-h-14 text-lg" onClick={() => void start()} disabled={phase === "starting"}>
          <span aria-hidden>🎙️</span>
          <Bi
            text={phase === "starting" ? T.starting : phase === "error" ? T.tryAgain : T.start}
            className="items-start text-left"
            subClassName="!text-current opacity-80"
          />
        </button>
      )}

      {phase === "error" && errorKind && (
        <div role="alert" className="rounded-xl bg-bad-soft p-3 text-sm font-semibold text-bad">
          <Bi text={MIC_ERRORS[errorKind]} subClassName="font-normal text-bad" />
          {(errorKind === "denied" || errorKind === "busy") && (
            <button type="button" className="btn mt-3 min-h-11 text-sm" onClick={() => window.location.reload()}>
              <Bi text={T.reload} className="items-start text-left" />
            </button>
          )}
        </div>
      )}

      {live && <LevelMeter db={meterDb} />}

      {phase === "noise" && (
        <div className="card flex flex-col gap-2 p-4" role="status">
          <p className="text-lg font-black">
            <Bi text={T.shh} />
          </p>
          <p className="text-sm font-semibold text-muted">
            <Bi text={T.shhSub} />
          </p>
          <ProgressBar value={progress} />
        </div>
      )}

      {room && (phase === "ready" || phase === "testing" || phase === "done") && (
        <Result title={T.room} message={room.message} detail={`${Math.round(room.noiseDb)} dBFS`} />
      )}

      {device && (phase === "ready" || phase === "testing" || phase === "done") && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted">
            <Bi text={T.device} inline className="mr-1 font-extrabold" />
            {device.label || "—"} · {Math.round(device.rate / 100) / 10} kHz
          </p>
          {device.warnings.map((w, i) => (
            <Message key={i} message={w} />
          ))}
        </div>
      )}

      {phase === "ready" && (
        <div className="card flex flex-col gap-3 p-4">
          <p className="text-sm font-semibold text-muted">
            <Bi text={T.sayHi} />
          </p>
          <p className="font-bold">
            <Bi text={T.recordHint} />
          </p>
          <button type="button" className="btn btn-primary min-h-14 text-lg" onClick={startTest}>
            <span aria-hidden>⏺</span>
            <Bi text={T.record} className="items-start text-left" subClassName="!text-current opacity-80" />
          </button>
        </div>
      )}

      {phase === "testing" && (
        <div className="card flex flex-col gap-2 p-4" role="status">
          <p className="text-lg font-black">
            <Bi text={T.recording} />
          </p>
          <p className="font-bold">
            <Bi text={T.recordHint} />
          </p>
          <ProgressBar value={progress} tone="bad" />
        </div>
      )}

      {phase === "done" && (
        <div className="flex flex-col gap-3">
          {verdict && <Message message={verdict} big />}
          {takeUrl && (
            <div className="card flex flex-col gap-3 p-4">
              <button type="button" className="btn btn-accent min-h-14 text-lg" onClick={playBack}>
                <span aria-hidden>▶</span>
                <Bi text={T.play} className="items-start text-left" subClassName="!text-current opacity-80" />
              </button>
              <audio ref={audioRef} controls src={takeUrl} className="w-full" />
              <p className="text-sm font-semibold text-muted">
                <Bi text={T.playHint} />
              </p>
            </div>
          )}
          <button type="button" className="btn min-h-12" onClick={() => void start()}>
            <span aria-hidden>↻</span>
            <Bi text={T.again} className="items-start text-left" />
          </button>
        </div>
      )}
    </div>
  );
}

function LevelMeter({ db }: { db: number }) {
  const v = meterLevel(db);
  const quietAt = meterLevel(VOICE_DB);
  const loudAt = meterLevel(LOUD_DB);
  const zone = db >= LOUD_DB ? "loud" : db >= VOICE_DB ? "good" : "quiet";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-xs font-extrabold text-muted">
        <Bi text={T.meter} inline />
        <span aria-hidden>{db <= -119 ? "—" : `${Math.round(db)} dB`}</span>
      </div>
      <div
        role="meter"
        aria-label="Mic level · ระดับเสียงไมค์"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v * 100)}
        className="relative h-7 overflow-hidden rounded-full border-2 border-line bg-card"
      >
        {/* zones: quiet | good voice | too loud */}
        <div className="absolute inset-y-0 bg-good-soft" style={{ left: `${quietAt * 100}%`, width: `${(loudAt - quietAt) * 100}%` }} />
        <div className="absolute inset-y-0 right-0 bg-bad-soft" style={{ width: `${(1 - loudAt) * 100}%` }} />
        <div
          className={`absolute inset-y-1 left-1 rounded-full transition-[width] duration-75 ${
            zone === "loud" ? "bg-bad" : zone === "good" ? "bg-good" : "bg-muted"
          }`}
          style={{ width: `calc(${v * 100}% - 0.5rem)`, minWidth: "0.5rem" }}
        />
      </div>
      <div className="relative h-4 text-[0.7rem] font-bold text-muted" aria-hidden>
        <span className="absolute left-0">
          <Bi text={T.quietLabel} inline subClassName="hidden" />
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: `${((quietAt + loudAt) / 2) * 100}%` }}>
          <Bi text={T.goodLabel} inline subClassName="hidden" />
        </span>
        <span className="absolute right-0">
          <Bi text={T.loudLabel} inline subClassName="hidden" />
        </span>
      </div>
    </div>
  );
}

function ProgressBar({ value, tone = "accent" }: { value: number; tone?: "accent" | "bad" }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-line" aria-hidden>
      <div className={`h-full rounded-full ${tone === "bad" ? "bg-bad" : "bg-accent"}`} style={{ width: `${value * 100}%` }} />
    </div>
  );
}

function Message({ message, big = false }: { message: MicMessage; big?: boolean }) {
  const cls =
    message.level === "ok" ? "bg-good-soft text-good" : message.level === "warn" ? "bg-warn-soft text-warn" : "bg-bad-soft text-bad";
  return (
    <p role={message.level === "ok" ? "status" : "alert"} className={`rounded-xl p-3 font-bold ${big ? "text-base" : "text-sm"} ${cls}`}>
      <Bi text={message} subClassName="font-semibold" />
    </p>
  );
}

function Result({ title, message, detail }: { title: Bilingual; message: MicMessage; detail: string }) {
  const icon = message.level === "ok" ? "✓" : "!";
  const cls = message.level === "ok" ? "border-good bg-good-soft" : "border-warn bg-warn-soft";
  return (
    <div className={`card flex items-start gap-3 p-3 ${cls}`}>
      <span
        aria-hidden
        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-lg font-black text-bg ${
          message.level === "ok" ? "bg-good" : "bg-warn"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-extrabold uppercase tracking-wide text-muted">
          <Bi text={title} inline subClassName="hidden" /> · {detail}
        </p>
        <p className="font-bold">
          <Bi text={message} />
        </p>
      </div>
    </div>
  );
}
