// Resilient background upload queue.
//
// Saved takes live in IndexedDB and are uploaded one at a time to
// /api/v2/admin/recordings. Uploads retry with exponential backoff, pause when
// the browser goes offline, and resume automatically on reconnect or reload.
// The server upsert is keyed by clientId, so a retry never creates a duplicate.

import { deleteRecording, getAllRecordings, getRecording, putRecording, pruneUploaded } from './db';
import type { CapturedRecording, PendingRecording, QueueItemView, RecordingKind } from './types';

const DEFAULT_ENDPOINT = '/api/v2/admin/recordings';
const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60_000;

export interface EnqueueInput {
  captured: CapturedRecording;
  languageId: string;
  languageCode: string;
  label: string;
  kind: RecordingKind;
  wordId?: string | null;
  targetId?: string | null;
  exampleId?: string | null;
  gloss?: string | null;
  speakerId?: string | null;
  isCorrection?: boolean;
  correctionNote?: string | null;
  supersedesId?: string | null;
  /** Override the upload endpoint (defaults to the admin studio route). */
  uploadEndpoint?: string;
}

type Listener = (items: QueueItemView[]) => void;

export class UploadQueue {
  private listeners = new Set<Listener>();
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  /** Begin processing and wire up reconnect handling (call once, client-side). */
  init() {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    window.addEventListener('online', () => this.kick());
    window.addEventListener('focus', () => this.kick());
    pruneUploaded().catch(() => undefined);
    this.kick();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.emit();
    return () => this.listeners.delete(listener);
  }

  private async emit() {
    if (this.listeners.size === 0) return;
    const all = await getAllRecordings();
    const views: QueueItemView[] = all.map((r) => ({
      clientId: r.clientId,
      label: r.label,
      gloss: r.gloss,
      kind: r.kind,
      durationMs: r.durationMs,
      status: r.status,
      attempts: r.attempts,
      lastError: r.lastError,
      createdAt: r.createdAt,
      sizeBytes: (r.wavBlob?.size ?? 0) + (r.opusBlob?.size ?? 0),
    }));
    this.listeners.forEach((l) => l(views));
  }

  /** Persist a take to IndexedDB and schedule upload. Returns the clientId. */
  async enqueue(input: EnqueueInput): Promise<string> {
    const clientId =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const rec: PendingRecording = {
      ...input.captured,
      clientId,
      languageId: input.languageId,
      languageCode: input.languageCode,
      wordId: input.wordId ?? null,
      targetId: input.targetId ?? null,
      exampleId: input.exampleId ?? null,
      kind: input.kind,
      label: input.label,
      gloss: input.gloss ?? null,
      speakerId: input.speakerId ?? null,
      isCorrection: input.isCorrection ?? false,
      correctionNote: input.correctionNote ?? null,
      supersedesId: input.supersedesId ?? null,
      uploadEndpoint: input.uploadEndpoint ?? DEFAULT_ENDPOINT,
      status: 'queued',
      attempts: 0,
      lastError: null,
      createdAt: Date.now(),
    };
    await putRecording(rec);
    await this.emit();
    this.kick();
    return clientId;
  }

  /** Manually retry a single errored item now. */
  async retry(clientId: string) {
    const rec = await getRecording(clientId);
    if (!rec) return;
    rec.status = 'queued';
    rec.attempts = 0;
    rec.lastError = null;
    await putRecording(rec);
    await this.emit();
    this.kick();
  }

  async remove(clientId: string) {
    await deleteRecording(clientId);
    await this.emit();
  }

  private kick() {
    if (this.running) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    void this.drain();
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      // Loop until nothing is uploadable right now.
      for (;;) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
        const all = await getAllRecordings();
        const next = all.find((r) => r.status === 'queued' || r.status === 'error');
        if (!next) break;
        if (next.attempts >= MAX_ATTEMPTS) {
          // Give up automatic retries; leave it visible for manual retry.
          if (next.status !== 'error') {
            next.status = 'error';
            await putRecording(next);
            await this.emit();
          }
          // Skip permanently-failed item this pass.
          const more = all.find((r) => (r.status === 'queued' || r.status === 'error') && r.attempts < MAX_ATTEMPTS);
          if (!more) break;
          continue;
        }

        const ok = await this.uploadOne(next);
        if (!ok) {
          // Back off, then let a later kick/online/focus retry.
          const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, next.attempts - 1));
          this.timer = setTimeout(() => this.kick(), delay);
          break;
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async uploadOne(rec: PendingRecording): Promise<boolean> {
    rec.status = 'uploading';
    rec.attempts += 1;
    await putRecording(rec);
    await this.emit();

    try {
      const form = new FormData();
      const meta = {
        clientId: rec.clientId,
        languageId: rec.languageId,
        wordId: rec.wordId,
        targetId: rec.targetId,
        exampleId: rec.exampleId,
        kind: rec.kind,
        label: rec.label,
        gloss: rec.gloss,
        speakerId: rec.speakerId,
        isCorrection: rec.isCorrection,
        correctionNote: rec.correctionNote,
        supersedesId: rec.supersedesId,
        sampleRate: rec.sampleRate,
        bitDepth: rec.bitDepth,
        channels: rec.channels,
        durationMs: rec.durationMs,
        peakAmplitude: rec.peakAmplitude,
        clipped: rec.clipped,
      };
      form.append('meta', JSON.stringify(meta));
      form.append('master', rec.wavBlob, `${rec.clientId}.wav`);
      if (rec.opusBlob) {
        const ext = rec.opusBlob.type.includes('ogg') ? 'ogg' : 'webm';
        form.append('opus', rec.opusBlob, `${rec.clientId}.${ext}`);
      }

      const res = await fetch(rec.uploadEndpoint || DEFAULT_ENDPOINT, { method: 'POST', body: form });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        rec.status = 'error';
        rec.lastError = `${res.status} ${text.slice(0, 200)}`;
        await putRecording(rec);
        await this.emit();
        // 4xx (except 408/429) are not worth retrying automatically.
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          rec.attempts = MAX_ATTEMPTS;
          await putRecording(rec);
        }
        return false;
      }

      const json = (await res.json().catch(() => ({}))) as { id?: string };
      rec.status = 'uploaded';
      rec.serverId = json.id;
      rec.lastError = null;
      // Free the audio blobs now that the server holds the durable copy.
      (rec as Partial<PendingRecording>).wavBlob = undefined;
      (rec as Partial<PendingRecording>).opusBlob = undefined;
      await putRecording(rec);
      await this.emit();
      window.dispatchEvent(new CustomEvent('recording-uploaded', { detail: { clientId: rec.clientId, id: json.id } }));
      return true;
    } catch (err) {
      rec.status = 'error';
      rec.lastError = (err as Error)?.message ?? 'Network error';
      await putRecording(rec);
      await this.emit();
      return false;
    }
  }
}

export const uploadQueue = new UploadQueue();
