/**
 * Offline-tolerant queue for Elder recording takes.
 *
 * An Elder's take must NEVER be lost. If an upload fails (no signal, server
 * down, timeout), the captured m4a is copied into the app's document directory
 * and the pending take is persisted to a small JSON manifest. `retryPending()`
 * re-uploads everything that is waiting; the server dedups on `clientId`, so a
 * double-send is harmless. The clientId is generated once at capture time and
 * carried through the queue, which is what makes the retry idempotent.
 */
import {
  documentDirectory, makeDirectoryAsync, copyAsync, deleteAsync,
  getInfoAsync, readAsStringAsync, writeAsStringAsync,
} from 'expo-file-system/legacy';
import { uploadSentenceTake, type SentenceTakeMeta } from './api';

const DIR = `${documentDirectory}elder-takes/`;
const MANIFEST = `${DIR}pending.json`;

export interface PendingTake {
  meta: SentenceTakeMeta;
  /** Persisted copy of the audio under DIR (survives cache eviction). */
  fileUri: string;
  /** The Kuku Yalanji text of the take, for the pending-list UI. */
  sentenceLabel: string;
  createdAt: number;
  attempts: number;
  lastError?: string | null;
}

async function ensureDir(): Promise<void> {
  try {
    const info = await getInfoAsync(DIR);
    if (!info.exists) await makeDirectoryAsync(DIR, { intermediates: true });
  } catch { /* best effort */ }
}

async function readManifest(): Promise<PendingTake[]> {
  try {
    const info = await getInfoAsync(MANIFEST);
    if (!info.exists) return [];
    const raw = await readAsStringAsync(MANIFEST);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingTake[]) : [];
  } catch {
    return [];
  }
}

async function writeManifest(list: PendingTake[]): Promise<void> {
  await ensureDir();
  await writeAsStringAsync(MANIFEST, JSON.stringify(list));
}

/** Persist a take that could not be uploaded right now. */
export async function enqueueTake(
  meta: SentenceTakeMeta, sourceUri: string, sentenceLabel: string,
): Promise<void> {
  await ensureDir();
  let fileUri = sourceUri;
  const dest = `${DIR}${meta.clientId.replace(/[^a-zA-Z0-9_.-]/g, '')}.m4a`;
  try {
    await copyAsync({ from: sourceUri, to: dest });
    fileUri = dest;
  } catch {
    // Couldn't copy — keep the original cache URI; better than losing the take.
    fileUri = sourceUri;
  }
  const list = await readManifest();
  list.push({ meta, fileUri, sentenceLabel, createdAt: Date.now(), attempts: 0, lastError: null });
  await writeManifest(list);
}

export async function pendingCount(): Promise<number> {
  return (await readManifest()).length;
}

export async function listPending(): Promise<PendingTake[]> {
  return readManifest();
}

/**
 * Try to upload every queued take. Idempotent (server dedups on clientId).
 * Returns how many uploaded and how many remain.
 */
export async function retryPending(): Promise<{ uploaded: number; remaining: number }> {
  const list = await readManifest();
  const keep: PendingTake[] = [];
  let uploaded = 0;
  for (const t of list) {
    try {
      await uploadSentenceTake(t.meta, t.fileUri);
      uploaded++;
      if (t.fileUri.startsWith(DIR)) deleteAsync(t.fileUri, { idempotent: true }).catch(() => {});
    } catch (e: any) {
      keep.push({ ...t, attempts: t.attempts + 1, lastError: e?.message ?? 'failed' });
    }
  }
  await writeManifest(keep);
  return { uploaded, remaining: keep.length };
}
