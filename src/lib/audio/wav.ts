// Minimal WAV (RIFF) encode/decode. Works in the browser and in Node (no DOM APIs).

/** Encode mono float samples (-1..1) as 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  writeStr(v, 0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  writeStr(v, 8, "WAVE");
  writeStr(v, 12, "fmt ");
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  writeStr(v, 36, "data");
  v.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

/** Decode a PCM (8/16/24/32-bit int) or 32-bit float WAV into mono float samples. */
export function decodeWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readStr(v, 0, 4) !== "RIFF" || readStr(v, 8, 4) !== "WAVE") throw new Error("Not a WAV file");
  let pos = 12;
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null;
  while (pos + 8 <= v.byteLength) {
    const id = readStr(v, pos, 4);
    const size = v.getUint32(pos + 4, true);
    const body = pos + 8;
    if (id === "fmt ") {
      fmt = {
        format: v.getUint16(body, true),
        channels: v.getUint16(body + 2, true),
        rate: v.getUint32(body + 4, true),
        bits: v.getUint16(body + 14, true),
      };
      if (fmt.format === 0xfffe && size >= 26) fmt.format = v.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE
    } else if (id === "data" && fmt) {
      const bytesPer = fmt.bits / 8;
      const frames = Math.floor(Math.min(size, v.byteLength - body) / (bytesPer * fmt.channels));
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < fmt.channels; c++) {
          const o = body + (i * fmt.channels + c) * bytesPer;
          sum += readSample(v, o, fmt.bits, fmt.format);
        }
        out[i] = sum / fmt.channels;
      }
      return { samples: out, sampleRate: fmt.rate };
    }
    pos = body + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

function readSample(v: DataView, o: number, bits: number, format: number): number {
  if (format === 3 && bits === 32) return v.getFloat32(o, true);
  switch (bits) {
    case 8:
      return (v.getUint8(o) - 128) / 128;
    case 16:
      return v.getInt16(o, true) / 0x8000;
    case 24: {
      const x = v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getInt8(o + 2) << 16);
      return x / 0x800000;
    }
    case 32:
      return v.getInt32(o, true) / 0x80000000;
    default:
      throw new Error(`Unsupported WAV bit depth: ${bits}`);
  }
}

function writeStr(v: DataView, o: number, s: string) {
  for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
}
function readStr(v: DataView, o: number, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += String.fromCharCode(v.getUint8(o + i));
  return s;
}
