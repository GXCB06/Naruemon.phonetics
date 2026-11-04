// AudioWorklet that copies raw microphone samples (Float32, native sample rate) to the main thread.
// Batches 128-sample render quanta into ~2048-sample chunks to keep message traffic low.
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = new Float32Array(2048);
    this.fill = 0;
    this.recording = true;
    this.port.onmessage = (e) => {
      if (e.data === "stop") {
        if (this.fill > 0) this.port.postMessage(this.chunk.slice(0, this.fill));
        this.fill = 0;
        this.recording = false;
        this.port.postMessage("stopped");
      }
    };
  }

  process(inputs) {
    if (!this.recording) return false;
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      let i = 0;
      while (i < channel.length) {
        const n = Math.min(channel.length - i, this.chunk.length - this.fill);
        this.chunk.set(channel.subarray(i, i + n), this.fill);
        this.fill += n;
        i += n;
        if (this.fill === this.chunk.length) {
          this.port.postMessage(this.chunk.slice());
          this.fill = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("recorder-processor", RecorderProcessor);
