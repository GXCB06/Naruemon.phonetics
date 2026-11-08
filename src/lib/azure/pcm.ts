// Extract raw PCM from a WAV so it can be pushed into the Speech SDK stream. Pure (no DOM).

export const AZURE_SAMPLE_RATE = 16000;

/**
 * Returns the raw 16-bit mono 16 kHz PCM bytes of a WAV file, i.e. the file without its header.
 * Our own `encodeWav` writes a plain 44-byte header; we still walk the RIFF chunks so a header with
 * extra chunks (LIST, etc.) is handled, and we refuse any other format rather than send garbage to Azure.
 */
export function toWavPcm16(wav: Uint8Array): Uint8Array {
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (wav.byteLength < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Not a WAV file");
  let pos = 12;
  let fmtOk = false;
  while (pos + 8 <= v.byteLength) {
    const id = tag(pos);
    const size = v.getUint32(pos + 4, true);
    const body = pos + 8;
    if (id === "fmt ") {
      const format = v.getUint16(body, true);
      const channels = v.getUint16(body + 2, true);
      const rate = v.getUint32(body + 4, true);
      const bits = v.getUint16(body + 14, true);
      fmtOk = format === 1 && channels === 1 && rate === AZURE_SAMPLE_RATE && bits === 16;
      if (!fmtOk) throw new Error(`Expected 16 kHz mono 16-bit PCM WAV, got ${rate} Hz, ${channels} ch, ${bits}-bit`);
    } else if (id === "data") {
      if (!fmtOk) throw new Error("WAV data chunk before fmt chunk");
      const end = Math.min(v.byteLength, body + size);
      const len = (end - body) & ~1; // whole 16-bit samples only
      return wav.subarray(body, body + len);
    }
    pos = body + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}
