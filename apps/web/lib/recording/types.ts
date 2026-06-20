// Shared types for the native-speaker recording studio.

export type RecordingKind = 'word' | 'phrase' | 'sentence';

/** Result of a single microphone capture, held in memory before save. */
export interface CapturedRecording {
  /** Lossless 16-bit PCM WAV master — the archival copy. */
  wavBlob: Blob;
  /** Compressed Opus copy for fast playback/streaming (best-effort; may be null). */
  opusBlob: Blob | null;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  durationMs: number;
  /** Peak amplitude 0..1 across the take (for clip detection / QA). */
  peakAmplitude: number;
  /** True if any sample reached full scale (likely clipping). */
  clipped: boolean;
}

/** A recording queued in IndexedDB for background upload. */
export interface PendingRecording extends CapturedRecording {
  /** Stable idempotency key — the same row is upserted server-side on retry. */
  clientId: string;
  languageId: string;
  languageCode: string;
  wordId: string | null;
  targetId: string | null;
  exampleId: string | null;
  kind: RecordingKind;
  /** The text that was actually spoken. */
  label: string;
  gloss: string | null;
  speakerId: string | null;
  isCorrection: boolean;
  correctionNote: string | null;
  /** Recording id this one corrects/replaces, if any. */
  supersedesId: string | null;

  status: 'queued' | 'uploading' | 'uploaded' | 'error';
  attempts: number;
  lastError: string | null;
  createdAt: number;
  /** Server recording id, once uploaded. */
  serverId?: string;
}

/** Lightweight view of queue state for the UI (no blobs). */
export interface QueueItemView {
  clientId: string;
  label: string;
  gloss: string | null;
  kind: RecordingKind;
  durationMs: number;
  status: PendingRecording['status'];
  attempts: number;
  lastError: string | null;
  createdAt: number;
  sizeBytes: number;
}
