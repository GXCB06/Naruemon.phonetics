// Short original reward tones for the result sheet. Made on the fly with Web Audio, started inside the CHECK tap.

let ctx: AudioContext | null = null;
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

function tone(f: number, t: number, dur = 0.24, vol = 0.16, type: OscillatorType = "sine") {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/**
 * Right: rising notes, higher as the combo grows, with a sparkle for Perfect and a short run at combo 3, 5, 10, ...
 * Wrong: two soft low notes. Sound is optional: any failure is ignored.
 */
export function playResult(ok: boolean, opts: { combo: number; perfect?: boolean }) {
  try {
    ctx = ctx ?? new AudioContext();
    void ctx.resume();
    const t0 = ctx.currentTime + 0.03;
    if (!ok) {
      tone(300, t0, 0.22, 0.14);
      tone(220, t0 + 0.11, 0.22, 0.14);
      return;
    }
    const step = Math.min(Math.max(opts.combo - 1, 0), 5);
    tone(SCALE[step], t0);
    tone(SCALE[step + 2], t0 + 0.13);
    let t = t0 + 0.26;
    if (opts.perfect) {
      tone(SCALE[step + 4], t, 0.42, 0.12);
      tone(SCALE[Math.min(step + 5, SCALE.length - 1)], t + 0.07, 0.5, 0.07, "triangle");
      t += 0.2;
    }
    const milestone = opts.combo === 3 || opts.combo === 5 || (opts.combo > 5 && opts.combo % 5 === 0);
    if (milestone) [0, 2, 4].forEach((d, k) => tone(SCALE[Math.min(step + d + 2, SCALE.length - 1)], t + 0.1 + k * 0.08, 0.3, 0.09, "triangle"));
  } catch {
    // sound is optional
  }
}
