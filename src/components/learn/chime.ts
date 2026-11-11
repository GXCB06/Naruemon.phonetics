// Melobi's own sound effects, made on the fly with Web Audio (no audio files, nothing borrowed from other apps).
// Every sound must start inside the learner's tap (iPad): call these from click handlers, never after an await.

import { prepareToPlay } from "@/components/audio/webAudio";

const KEY = "myna.sfx";
let enabled: boolean | null = null;

/** Sound effects on or off (remembered on this device). Speech and clips are not affected. */
export function sfxEnabled(): boolean {
  if (enabled === null) {
    try {
      enabled = localStorage.getItem(KEY) !== "off";
    } catch {
      enabled = true;
    }
  }
  return enabled;
}

const listeners = new Set<() => void>();

/** For useSyncExternalStore: re-render when sound effects are switched on or off. */
export function subscribeSfx(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setSfxEnabled(on: boolean): void {
  enabled = on;
  listeners.forEach((l) => l());
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // applies for this visit only
  }
}

// C major pentatonic from C6 up: always pleasant, whatever order the notes come in
const SCALE = [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.32, 2637.02, 3135.96, 3520];

interface Voice {
  f: number;
  t: number;
  dur?: number;
  vol?: number;
  type?: OscillatorType;
  /** End frequency for a glide. */
  to?: number;
  /** Bell-like overtone (2.76× the note, quieter and shorter). */
  bell?: boolean;
}

function out(ctx: AudioContext): AudioNode {
  // one gentle low-pass + compressor so stacked notes never clip on small speakers
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.connect(ctx.destination);
  return comp;
}

function note(ctx: AudioContext, dest: AudioNode, v: Voice) {
  const { f, t, dur = 0.22, vol = 0.18, type = "sine", to, bell = false } = v;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.8);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.03);
  if (bell) note(ctx, dest, { f: f * 2.76, t, dur: dur * 0.45, vol: vol * 0.22, type: "sine" });
}

function play(build: (ctx: AudioContext, dest: AudioNode, t0: number) => void) {
  if (!sfxEnabled()) return;
  try {
    const ctx = prepareToPlay(); // shared context, playback session, resumed inside this tap (iPad)
    if (!ctx) return;
    build(ctx, out(ctx), ctx.currentTime + 0.02);
  } catch (e) {
    // sound is optional: never break a tap over it (but say why in the console, so a silent app can be diagnosed)
    if (typeof console !== "undefined") console.warn("Melobi sound effect failed:", e);
  }
}

let lastTapAt = 0;

/** A soft click when anything tappable is pressed (the app plays it for every button and link; see SfxClicks). */
export function playTap() {
  const now = typeof performance === "undefined" ? 0 : performance.now();
  if (now - lastTapAt < 90) return; // one click per tap, however many places ask for it
  lastTapAt = now;
  play((ctx, d, t) => note(ctx, d, { f: 740, to: 980, t, dur: 0.07, vol: 0.09, type: "triangle" }));
}

/** A tile or card going back: the tap in reverse. */
export function playUntap() {
  play((ctx, d, t) => note(ctx, d, { f: 900, to: 620, t, dur: 0.07, vol: 0.07, type: "triangle" }));
}

/** One correct pair in "Match the pairs": a quick rising pop, higher for each pair found. */
export function playPair(n: number) {
  play((ctx, d, t) => {
    const f = SCALE[Math.min(n, SCALE.length - 3)];
    note(ctx, d, { f: f / 2, t, dur: 0.12, vol: 0.12, type: "triangle" });
    note(ctx, d, { f, t: t + 0.06, dur: 0.18, vol: 0.12, bell: true });
  });
}

/** A wrong pair: a short low wobble. */
export function playNoPair() {
  play((ctx, d, t) => note(ctx, d, { f: 260, to: 200, t, dur: 0.16, vol: 0.12, type: "triangle" }));
}

/**
 * After CHECK. Right: a bright two-note "ding-ding" that climbs with the combo, with a sparkle for Perfect and a short
 * run at combo 3, 5, 10, ... Wrong: a soft two-step drop, low and short (never harsh).
 */
export function playResult(ok: boolean, opts: { combo: number; perfect?: boolean }) {
  play((ctx, d, t0) => {
    if (!ok) {
      note(ctx, d, { f: 330, to: 300, t: t0, dur: 0.16, vol: 0.13, type: "triangle" });
      note(ctx, d, { f: 247, to: 196, t: t0 + 0.14, dur: 0.3, vol: 0.13, type: "triangle" });
      return;
    }
    const step = Math.min(Math.max(opts.combo - 1, 0), 4);
    note(ctx, d, { f: SCALE[step] / 2, t: t0, dur: 0.14, vol: 0.14, type: "triangle" });
    note(ctx, d, { f: SCALE[step], t: t0, dur: 0.16, vol: 0.12, bell: true });
    note(ctx, d, { f: SCALE[step + 2], t: t0 + 0.1, dur: 0.38, vol: 0.15, bell: true });
    let t = t0 + 0.22;
    if (opts.perfect) {
      [4, 5, 6].forEach((k, i) => note(ctx, d, { f: SCALE[Math.min(step + k, SCALE.length - 1)], t: t + i * 0.05, dur: 0.4, vol: 0.06, bell: true }));
      t += 0.18;
    }
    const milestone = opts.combo === 3 || opts.combo === 5 || (opts.combo > 5 && opts.combo % 5 === 0);
    if (milestone) [0, 1, 2, 3].forEach((k) => note(ctx, d, { f: SCALE[Math.min(step + k + 2, SCALE.length - 1)], t: t + 0.08 + k * 0.06, dur: 0.22, vol: 0.08, type: "triangle" }));
  });
}

/** Lesson complete: a little rising fanfare and a held chord. */
export function playComplete() {
  play((ctx, d, t) => {
    [0, 2, 3, 5].forEach((k, i) => note(ctx, d, { f: SCALE[k] / 2, t: t + i * 0.1, dur: 0.2, vol: 0.13, type: "triangle" }));
    [5, 7, 8].forEach((k) => note(ctx, d, { f: SCALE[k] / 2, t: t + 0.42, dur: 0.9, vol: 0.07, bell: true }));
  });
}
