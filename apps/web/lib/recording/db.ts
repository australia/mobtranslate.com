// Tiny IndexedDB wrapper for the recording upload queue.
//
// Recordings (Blobs + metadata) are persisted here the instant the speaker
// saves a take, so audio survives a closed tab, reload, or network drop until
// the background queue confirms it reached Supabase Storage.

import type { PendingRecording } from './types';

const DB_NAME = 'mobtranslate-recordings';
const STORE = 'pending';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'clientId' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function putRecording(rec: PendingRecording): Promise<void> {
  await tx('readwrite', (s) => s.put(rec));
}

export async function getRecording(clientId: string): Promise<PendingRecording | undefined> {
  return tx<PendingRecording | undefined>('readonly', (s) => s.get(clientId) as IDBRequest<PendingRecording | undefined>);
}

export async function getAllRecordings(): Promise<PendingRecording[]> {
  return openDb().then(
    (db) =>
      new Promise<PendingRecording[]>((resolve, reject) => {
        const t = db.transaction(STORE, 'readonly');
        const req = t.objectStore(STORE).getAll();
        req.onsuccess = () => resolve((req.result as PendingRecording[]).sort((a, b) => a.createdAt - b.createdAt));
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function deleteRecording(clientId: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(clientId));
}

/** Drop uploaded records older than `maxAgeMs` to reclaim space. */
export async function pruneUploaded(maxAgeMs = 1000 * 60 * 60): Promise<void> {
  const all = await getAllRecordings();
  const cutoff = Date.now() - maxAgeMs;
  await Promise.all(
    all
      .filter((r) => r.status === 'uploaded' && r.createdAt < cutoff)
      .map((r) => deleteRecording(r.clientId)),
  );
}
