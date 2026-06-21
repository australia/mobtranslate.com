// StudioRecorder — highest-fidelity microphone capture for the recording studio.
//
// Strategy: capture raw Float32 PCM off the live MediaStream (via AudioWorklet,
// falling back to ScriptProcessor) and encode a lossless 16-bit WAV master. In
// parallel, run a MediaRecorder on the *same* stream to produce a compressed
// copy (Opus on Chrome/Firefox, AAC/mp4 on Safari) for fast playback. The
// compressed copy is an independent encode of the live signal, never a
// recompression of the master, so the master stays pristine.

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

export interface InputDevice {
  deviceId: string;
  label: string;
}

const PREFERRED_SAMPLE_RATE = 48000;
const MIN_DURATION_MS = 250; // shorter than this is almost certainly a mistap
const OPUS_STOP_TIMEOUT_MS = 5000; // never let a missing onstop hang the UI

// Inline AudioWorklet processor: transfers mono Float32 frames to the main
// thread (zero-copy via Transferable) to avoid per-frame allocation churn.
const WORKLET_SRC = `
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const copy = input[0].slice(0);
      this.port.postMessage(copy, [copy.buffer]);
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
  private stopping = false;
  private deviceId: string | null = null;
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

  /** List available microphones (labels require a prior permission grant). */
  async listInputDevices(): Promise<InputDevice[]> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
    } catch {
      return [];
    }
  }

  /** Switch microphones. Reopens the stream if already open. */
  async setDeviceId(deviceId: string | null): Promise<void> {
    if (deviceId === this.deviceId) return;
    this.deviceId = deviceId;
    if (this.stream) {
      // reopen with the new device
      this.teardownGraph();
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      const ctx = this.ctx;
      this.ctx = null;
      this.source = null;
      this.analyser = null;
      await ctx?.close().catch(() => undefined);
      await this.open();
    }
  }

  /** Open the microphone with fidelity-preserving constraints. Idempotent. */
  async open(): Promise<void> {
    if (this.stream && this.ctx) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.setState('error', 'This browser does not support microphone recording. Try Chrome or Safari.');
      throw new Error('getUserMedia unsupported');
    }

    this.setState('requesting');
    // Prefer the speaker's true voice (DSP off) but as *ideal*, not *exact* —
    // iOS Safari rejects exact `false` and a hard sampleRate, so we only hint.
    const audio: MediaTrackConstraints = {
      channelCount: { ideal: 1 },
      echoCancellation: { ideal: false },
      noiseSuppression: { ideal: false },
      autoGainControl: { ideal: false },
      sampleRate: { ideal: PREFERRED_SAMPLE_RATE },
    };
    if (this.deviceId) (audio as MediaTrackConstraints).deviceId = { exact: this.deviceId };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio });
    } catch (err) {
      const name = (err as DOMException)?.name;
      // Last-ditch retry with the most permissive request before giving up.
      if (name === 'OverconstrainedError' || name === 'NotSupportedError' || name === 'TypeError') {
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err2) {
          this.failOpen(err2 as DOMException);
          throw err2;
        }
      } else {
        this.failOpen(err as DOMException);
        throw err;
      }
    }

    const Ctx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    // Use the hardware sample rate (don't force one — forcing can be ignored or
    // cause silent resampling). encodeWav reads ctx.sampleRate, so this is exact.
    this.ctx = new Ctx();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.source.connect(this.analyser);

    this.startMetering();
    this.setState('ready');
  }

  private failOpen(err: DOMException) {
    const name = err?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') this.setState('denied');
    else if (name === 'NotFoundError' || name === 'OverconstrainedError') this.setState('nomic');
    else if (name === 'NotReadableError' || name === 'AbortError') this.setState('inuse');
    else this.setState('error', (err as Error)?.message);
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
    // iOS suspends the context when not in a gesture; resume defensively.
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => undefined);

    this.pcmChunks = [];
    this.opusChunks = [];
    this.peak = 0;
    this.capturing = true;
    this.stopping = false;

    // --- PCM tap (master): exactly one path, worklet preferred ---
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
        const mute = this.ctx.createGain();
        mute.gain.value = 0;
        this.worklet.connect(mute).connect(this.ctx.destination);
        usedWorklet = true;
      } catch {
        usedWorklet = false;
      }
    }
    if (!usedWorklet) {
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

    // --- Compressed copy (best-effort) ---
    if (this.stream && typeof MediaRecorder !== 'undefined') {
      const mime = pickCompressedMime();
      try {
        this.opusMime = mime;
        this.mediaRecorder = mime
          ? new MediaRecorder(this.stream, { mimeType: mime, audioBitsPerSecond: 128000 })
          : new MediaRecorder(this.stream);
        this.opusMime = this.mediaRecorder.mimeType || mime;
        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size) this.opusChunks.push(e.data);
        };
        this.mediaRecorder.start();
      } catch {
        this.mediaRecorder = null;
      }
    }

    this.setState('recording');
  }

  /** End the take and produce the encoded result. */
  async stop(): Promise<CapturedRecording> {
    if (!this.capturing || !this.ctx) throw new Error('Not recording');
    if (this.stopping) throw new Error('Already stopping');
    this.stopping = true;
    this.capturing = false;

    // Flush MediaRecorder, but never hang: if onstop doesn't fire, give up.
    const opusBlob = await new Promise<Blob | null>((resolve) => {
      const mr = this.mediaRecorder;
      if (!mr || mr.state === 'inactive') return resolve(null);
      let settled = false;
      const done = (b: Blob | null) => {
        if (settled) return;
        settled = true;
        resolve(b);
      };
      const timer = setTimeout(() => done(this.opusChunks.length ? new Blob(this.opusChunks, { type: this.opusMime }) : null), OPUS_STOP_TIMEOUT_MS);
      mr.onstop = () => {
        clearTimeout(timer);
        done(this.opusChunks.length ? new Blob(this.opusChunks, { type: this.opusMime }) : null);
      };
      try {
        mr.stop();
      } catch {
        clearTimeout(timer);
        done(null);
      }
    });

    this.teardownGraph();
    this.mediaRecorder = null;

    const sampleRate = this.ctx.sampleRate;
    const pcm = mergeChunks(this.pcmChunks);
    this.pcmChunks = [];
    const wavBlob = encodeWav([pcm], sampleRate);
    const durationMs = Math.round((pcm.length / sampleRate) * 1000);
    const peak = this.peak;

    this.stopping = false;
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
      tooShort: durationMs < MIN_DURATION_MS,
    };
  }

  private teardownGraph() {
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
  }

  /** Fully release the microphone and audio graph. */
  close(): void {
    this.capturing = false;
    this.stopping = false;
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    try {
      this.mediaRecorder?.stop();
    } catch {
      /* noop */
    }
    this.teardownGraph();
    this.analyser?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => undefined);
    this.stream = null;
    this.ctx = null;
    this.source = null;
    this.analyser = null;
    this.mediaRecorder = null;
    this.setState('idle');
  }
}

/**
 * Choose the best-supported compressed container/codec, or '' to let the
 * browser decide. Order is iOS-aware: Safari only does audio/mp4 (AAC).
 */
function pickCompressedMime(): string {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/mp4;codecs=mp4a.40.2', // AAC-LC (Safari)
    'audio/mp4',
    'audio/webm',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}
