/**
 * Band-limited resampling with a Hann-windowed sinc kernel.
 * Used to turn 44.1/48 kHz mic audio into the 16 kHz mono that Azure expects.
 * Small and dependency-free (libsamplerate-js is ~1.5 MB). Good enough for speech.
 */
export function resampleAudio(input: Float32Array, fromRate: number, toRate: number, halfTaps = 24): Float32Array {
  if (fromRate === toRate) return input.slice();
  const ratio = toRate / fromRate;
  const outLen = Math.floor(input.length * ratio);
  const out = new Float32Array(outLen);
  // When downsampling, lower the cutoff to the new Nyquist (with a little margin) to avoid aliasing.
  const cutoff = Math.min(1, ratio) * 0.95;
  const step = 1 / ratio;
  for (let n = 0; n < outLen; n++) {
    const centre = n * step;
    const i0 = Math.floor(centre);
    let acc = 0;
    let norm = 0;
    const reach = Math.ceil(halfTaps / cutoff);
    for (let k = i0 - reach + 1; k <= i0 + reach; k++) {
      if (k < 0 || k >= input.length) continue;
      const x = centre - k;
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * cutoff * x) / (Math.PI * cutoff * x);
      const win = 0.5 + 0.5 * Math.cos((Math.PI * x) / (reach + 1));
      const w = sinc * win;
      acc += input[k] * w;
      norm += w;
    }
    out[n] = norm !== 0 ? acc / norm : 0;
  }
  return out;
}
