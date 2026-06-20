// StudioRecorder — highest-fidelity microphone capture for the recording studio.
//
// Strategy: capture raw Float32 PCM off the live MediaStream (via AudioWorklet,
// falling back to ScriptProcessor) and encode a lossless 16-bit WAV master. In
// parallel, run a MediaRecorder on the *same* stream to produce a compressed
// Opus copy for fast playback. The Opus copy is an independent encode of the
// live signal, never a recompression of the master, so the master stays pristine.

import type { CapturedRecording } from './types';
import { encodeWav, mergeChunks } from './wav';

export type MicState =
  | 'idle'
  | 'requesting' // asking for mic permission
  | 'ready' // mic open, not recording
  | 'recording'
  | 'denied' // permission refused
  | 'nomic' // no input device
  | 'inuse' // device busy / not readable
  | 'error';

export interface RecorderEvents {
  /** Smoothed input level 0..1, ~60fps while the mic is open. */
  onLevel?: (level: number) => void;
  onState?: (state: MicState, detail?: string) => void;
}

const PREFERRED_SAMPLE_RATE = 48000;

// Inline AudioWorklet processor: forwards mono Float32 frames to the main thread.
const WORKLET_SRC = `
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      this.port.postMessage(input[0].slice(0));
    }
    return true;
  }
}
registerProcessor('studio-capture', CaptureProcessor);
`;

export class StudioRecorder {
  private events: RecorderEvents;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private rafId: number | null = null;

  private pcmChunks: Float32Array[] = [];
  private opusChunks: BlobPart[] = [];
  private opusMime = '';
  private capturing = false;
  private peak = 0;
  private smoothedLevel = 0;
  state: MicState = 'idle';

  constructor(events: RecorderEvents = {}) {
    this.events = events;
  }

  private setState(state: MicState, detail?: string) {
    this.state = state;
    this.events.onState?.(state, detail);
  }

  /** Open the microphone with fidelity-preserving constraints. Idempotent. */
  async open(): Promise<void> {
    if (this.stream && this.ctx) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.setState('error', 'This browser does not support microphone capture.');
      throw new Error('getUserMedia unsupported');
    }

    this.setState('requesting');
    try {
      // Disable browser DSP so the speaker's true voice is preserved for
      // linguistic fidelity (no AGC pumping, no noise-gate artefacts).
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: PREFERRED_SAMPLE_RATE,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as MediaTrackConstraints,
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') this.setState('denied');
      else if (name === 'NotFoundError' || name === 'OverconstrainedError') this.setState('nomic');
      else if (name === 'NotReadableError') this.setState('inuse');
      else this.setState('error', (err as Error)?.message);
      throw err;
    }

    const Ctx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx({ sampleRate: PREFERRED_SAMPLE_RATE });
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.source.connect(this.analyser);

    this.startMetering();
    this.setState('ready');
  }

  private startMetering() {
    const analyser = this.analyser;
    if (!analyser) return;
    const buf = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sumSquares = 0;
      let framePeak = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i]);
        sumSquares += buf[i] * buf[i];
        if (v > framePeak) framePeak = v;
      }
      const rms = Math.sqrt(sumSquares / buf.length);
      // Perceptual-ish smoothing: fast attack, slow release.
      this.smoothedLevel = Math.max(rms, this.smoothedLevel * 0.85);
      this.events.onLevel?.(Math.min(1, this.smoothedLevel));
      if (this.capturing && framePeak > this.peak) this.peak = framePeak;
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /** Begin a take. Mic must be open. */
  async start(): Promise<void> {
    if (!this.ctx || !this.source) await this.open();
    if (!this.ctx || !this.source) throw new Error('Recorder not ready');
    if (this.capturing) return;

    this.pcmChunks = [];
    this.opusChunks = [];
    this.peak = 0;
    this.capturing = true;

    // --- PCM tap (master) ---
    let usedWorklet = false;
    if (this.ctx.audioWorklet) {
      try {
        const blobUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
        await this.ctx.audioWorklet.addModule(blobUrl);
        URL.revokeObjectURL(blobUrl);
        this.worklet = new AudioWorkletNode(this.ctx, 'studio-capture');
        this.worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
          if (this.capturing) this.pcmChunks.push(e.data);
        };
        this.source.connect(this.worklet);
        // Worklet must reach the graph's destination to be pulled; route through
        // a muted gain so nothing is monitored back to the speaker.
        const mute = this.ctx.createGain();
        mute.gain.value = 0;
        this.worklet.connect(mute).connect(this.ctx.destination);
        usedWorklet = true;
      } catch {
        usedWorklet = false;
      }
    }
    if (!usedWorklet) {
      // Fallback: ScriptProcessorNode (deprecated but universal).
      const node = this.ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (e) => {
        if (this.capturing) this.pcmChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      this.source.connect(node);
      const mute = this.ctx.createGain();
      mute.gain.value = 0;
      node.connect(mute).connect(this.ctx.destination);
      this.scriptNode = node;
    }

    // --- Opus copy (best-effort) ---
    if (this.stream && typeof MediaRecorder !== 'undefined') {
      const mime = pickOpusMime();
      if (mime) {
        try {
          this.opusMime = mime;
          this.mediaRecorder = new MediaRecorder(this.stream, {
            mimeType: mime,
            audioBitsPerSecond: 128000,
          });
          this.mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size) this.opusChunks.push(e.data);
          };
          this.mediaRecorder.start();
        } catch {
          this.mediaRecorder = null;
        }
      }
    }

    this.setState('recording');
  }

  /** End the take and produce the encoded result. */
  async stop(): Promise<CapturedRecording> {
    if (!this.capturing || !this.ctx) throw new Error('Not recording');
    this.capturing = false;

    // Flush MediaRecorder
    const opusBlob = await new Promise<Blob | null>((resolve) => {
      const mr = this.mediaRecorder;
      if (!mr || mr.state === 'inactive') return resolve(null);
      mr.onstop = () => resolve(new Blob(this.opusChunks, { type: this.opusMime }));
      try {
        mr.stop();
      } catch {
        resolve(null);
      }
    });

    // Tear down PCM tap
    if (this.worklet) {
      this.worklet.port.onmessage = null;
      this.worklet.disconnect();
      this.worklet = null;
    }
    if (this.scriptNode) {
      this.scriptNode.onaudioprocess = null;
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }
    this.mediaRecorder = null;

    const sampleRate = this.ctx.sampleRate;
    const pcm = mergeChunks(this.pcmChunks);
    this.pcmChunks = [];
    const wavBlob = encodeWav([pcm], sampleRate);
    const durationMs = Math.round((pcm.length / sampleRate) * 1000);
    const peak = this.peak;

    this.setState('ready');
    return {
      wavBlob,
      opusBlob: opusBlob && opusBlob.size > 0 ? opusBlob : null,
      sampleRate,
      channels: 1,
      bitDepth: 16,
      durationMs,
      peakAmplitude: Number(peak.toFixed(4)),
      clipped: peak >= 0.999,
    };
  }

  /** Fully release the microphone and audio graph. */
  close(): void {
    this.capturing = false;
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    try {
      this.mediaRecorder?.stop();
    } catch {
      /* noop */
    }
    this.worklet?.disconnect();
    this.scriptNode?.disconnect();
    this.analyser?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => undefined);
    this.stream = null;
    this.ctx = null;
    this.source = null;
    this.analyser = null;
    this.worklet = null;
    this.scriptNode = null;
    this.mediaRecorder = null;
    this.setState('idle');
  }
}

/** Choose the best-supported Opus container, or '' if none. */
function pickOpusMime(): string {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}
