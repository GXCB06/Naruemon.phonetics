// Slowing speech down WITHOUT changing its pitch (WSOLA: waveform-similarity overlap-add). Pure: no DOM.
//
// Why: playing a clip at 0.7x speed also lowers it by about 6 semitones, so the "slow" voice sounds deep and muddy, in
// exactly the exercises where a learner has to judge pitch. WSOLA instead cuts the clip into short overlapping frames and
// lays them down further apart, each one shifted a little so its waveform lines up with what came before; the voice keeps
// its pitch and timbre and only the timing stretches.

/**
 * `rate` < 1 slows down (0.7 = 70% speed, 1/0.7 as long), > 1 speeds up; 1 returns a copy. Pitch is unchanged.
 * Works best on speech between about 0.5 and 1.5.
 */
export function timeStretch(samples: Float32Array, sampleRate: number, rate: number): Float32Array {
  if (!(rate > 0) || Math.abs(rate - 1) < 1e-3 || samples.length === 0) return samples.slice();
  const frame = Math.max(64, Math.round(0.03 * sampleRate)); // 30 ms frames
  const hs = frame >> 1; // synthesis hop: 50% overlap
  const ha = hs * rate; // analysis hop
  const tol = Math.round(0.01 * sampleRate); // look up to 10 ms either way for the best-matching frame
  const outLen = Math.ceil(samples.length / rate) + frame;
  const out = new Float32Array(outLen);
  const norm = new Float32Array(outLen);
  const win = new Float32Array(frame);
  for (let i = 0; i < frame; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / frame);

  const at = (n: number) => (n >= 0 && n < samples.length ? samples[n] : 0);
  let prevSrc = 0; // where the last copied frame started in the input
  for (let k = 0; ; k++) {
    const dst = k * hs;
    const nominal = Math.round(k * ha);
    if (nominal >= samples.length || dst + frame > outLen) break;
    let src = nominal;
    if (k > 0) {
      // the natural continuation of the previous frame starts hs samples after it; find the input position near the nominal
      // one whose waveform matches that continuation best
      const target = prevSrc + hs;
      let best = -Infinity;
      for (let c = Math.max(0, nominal - tol); c <= nominal + tol; c++) {
        let xy = 0;
        let yy = 1e-9;
        for (let i = 0; i < hs; i += 2) {
          const a = at(target + i);
          const b = at(c + i);
          xy += a * b;
          yy += b * b;
        }
        const score = xy / Math.sqrt(yy);
        if (score > best) {
          best = score;
          src = c;
        }
      }
    }
    for (let i = 0; i < frame; i++) {
      out[dst + i] += at(src + i) * win[i];
      norm[dst + i] += win[i];
    }
    prevSrc = src;
  }
  const len = Math.min(outLen, Math.round(samples.length / rate));
  const res = new Float32Array(len);
  for (let n = 0; n < len; n++) res[n] = out[n] / Math.max(norm[n], 0.1); // the floor keeps the faded first/last few ms from blowing up
  return res;
}
