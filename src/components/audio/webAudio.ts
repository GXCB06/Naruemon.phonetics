// One shared Web Audio engine for the whole app, built for iPad and iPhone Safari. Browser-only.
//
// What goes wrong on iOS without this:
//  - Web Audio is MUTED while the device is in silent/mute mode, unless the page's audio session is "playback"
//    (navigator.audioSession, Safari 16.4+) or an <audio> element has played first (older iOS).
//  - A context can be "suspended" (not unlocked yet) or "interrupted" (after the microphone, Siri, a call or another
//    app); both need resume() from inside a tap. Code that only checks "suspended" stays silent after an interruption.
//  - Every module making its own AudioContext multiplies these problems.
// So: one context, resumed from any tap, session switched to playback, and recording switches it back (recorder.ts).

type AudioSessionType = "auto" | "playback" | "play-and-record" | "transient" | "transient-solo" | "ambient";
type SessionNavigator = Navigator & { audioSession?: { type: AudioSessionType } };

/** A 2-sample silent WAV: playing it from a tap tells older iOS that this page makes real sound. */
const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQQAAAAAAAAA";

let ctx: AudioContext | null = null;
let armed = false;
let primed = false;

export function setAudioSession(type: AudioSessionType): void {
  try {
    const s = (navigator as SessionNavigator).audioSession;
    if (s && s.type !== type) s.type = type;
  } catch {
    // not supported: nothing to do
  }
}

/** The app's one AudioContext, at the device's native sample rate (never request 16 kHz). Null without Web Audio. */
export function sharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx || ctx.state === "closed") {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/**
 * Call at the START of every sound, synchronously inside the learner's tap (before any await): switches the audio session
 * to playback (audible in silent mode), and resumes the context when it is suspended or interrupted.
 */
export function prepareToPlay(): AudioContext | null {
  setAudioSession("playback");
  const c = sharedAudioContext();
  if (c && c.state !== "running") void c.resume().catch(() => undefined);
  return c;
}

/** Before using the microphone: a recording session (the recorder calls this itself). */
export function prepareToRecord(): void {
  setAudioSession("play-and-record");
}

function prime(): void {
  const c = prepareToPlay();
  if (c && !primed) {
    // a one-sample silent buffer completes the unlock on iOS
    try {
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, 22050);
      src.connect(c.destination);
      src.start(0);
    } catch {
      // ignore
    }
  }
  if (!primed) {
    try {
      const a = new Audio(SILENT_WAV);
      a.setAttribute("playsinline", "");
      void a.play().catch(() => undefined);
    } catch {
      // ignore
    }
    primed = true;
  }
}

/**
 * Listen for the first taps and unlock audio on them; keep listening, because iOS can suspend or interrupt the context
 * again later (a phone call, switching apps). Safe to call many times.
 */
export function installAudioUnlock(): () => void {
  if (typeof window === "undefined" || armed) return () => undefined;
  armed = true;
  const onTap = () => {
    if (!primed || (ctx && ctx.state !== "running")) prime();
  };
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  document.addEventListener("pointerdown", onTap, opts);
  document.addEventListener("touchend", onTap, opts);
  document.addEventListener("keydown", onTap, opts);
  return () => {
    armed = false;
    document.removeEventListener("pointerdown", onTap, opts);
    document.removeEventListener("touchend", onTap, opts);
    document.removeEventListener("keydown", onTap, opts);
  };
}
