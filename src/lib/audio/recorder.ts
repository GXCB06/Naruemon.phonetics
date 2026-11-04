// Browser microphone recorder: raw PCM via AudioWorklet at the device's native sample rate.
// Browser "voice call" processing (echo cancellation, noise suppression, auto gain) is switched off
// because it distorts pitch and loudness. We never request a 16 kHz AudioContext (Firefox throws).

export interface RecorderCallbacks {
  /** Called for each chunk of new samples (for the live pitch line and level meter). */
  onChunk?: (chunk: Float32Array, sampleRate: number) => void;
}

export type MicErrorKind = "denied" | "notFound" | "busy" | "unsupported" | "unknown";

export class MicError extends Error {
  constructor(public kind: MicErrorKind, message: string) {
    super(message);
  }
}

const RAW_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

export class MicRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private chunks: Float32Array[] = [];
  /** True when the browser accepted our "raw audio" constraints. */
  rawAudio = false;
  sampleRate = 48000;

  async start(cb: RecorderCallbacks = {}): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new MicError("unsupported", "This browser can't record audio (it needs HTTPS and a modern browser).");
    }
    // Create/resume the context inside the user's tap (required on iOS).
    this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.sampleRate = this.ctx.sampleRate;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: RAW_CONSTRAINTS });
      this.rawAudio = true;
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === "OverconstrainedError" || name === "TypeError") {
        // Some devices refuse the constraints: fall back to defaults, then try to switch processing off.
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch((e) => {
          throw toMicError(e);
        });
        await this.stream
          .getAudioTracks()[0]
          ?.applyConstraints(RAW_CONSTRAINTS)
          .then(() => (this.rawAudio = true))
          .catch(() => (this.rawAudio = false));
      } else {
        await this.ctx.close();
        this.ctx = null;
        throw toMicError(err);
      }
    }

    await this.ctx.audioWorklet.addModule("/worklets/recorder-processor.js");
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "recorder-processor");
    this.chunks = [];
    this.node.port.onmessage = (e) => {
      if (e.data instanceof Float32Array) {
        this.chunks.push(e.data);
        cb.onChunk?.(e.data, this.sampleRate);
      }
    };
    this.source.connect(this.node);
    // Keep the graph pulling audio without playing the mic back through the speakers.
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    this.node.connect(mute).connect(this.ctx.destination);
  }

  /** Stop and return everything recorded, as one Float32Array at `sampleRate`. */
  async stop(): Promise<Float32Array> {
    const node = this.node;
    if (node) {
      await new Promise<void>((resolve) => {
        const prev = node.port.onmessage;
        node.port.onmessage = (e) => {
          if (e.data === "stopped") resolve();
          else prev?.call(node.port, e);
        };
        node.port.postMessage("stop");
        setTimeout(resolve, 500);
      });
    }
    this.source?.disconnect();
    node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.node = null;
    this.source = null;
    this.stream = null;
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const out = new Float32Array(total);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    this.chunks = [];
    return out;
  }
}

function toMicError(err: unknown): MicError {
  const name = (err as DOMException)?.name;
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return new MicError(
        "denied",
        "Microphone access is blocked. Allow the microphone in your browser settings, then reload the page.",
      );
    case "NotFoundError":
      return new MicError("notFound", "No microphone found. Plug one in or check your device settings.");
    case "NotReadableError":
    case "AbortError":
      return new MicError("busy", "The microphone is busy or stuck. Close other apps using it, then reload the page.");
    default:
      return new MicError("unknown", `Couldn't start the microphone (${name ?? "unknown error"}). Try reloading the page.`);
  }
}

/** Decode any audio file the browser understands (wav/mp3/m4a/webm) to mono float samples. */
export async function decodeAudioFile(file: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const out = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < ch.length; i++) out[i] += ch[i] / buf.numberOfChannels;
    }
    return { samples: out, sampleRate: buf.sampleRate };
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
