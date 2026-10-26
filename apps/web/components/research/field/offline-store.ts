// IndexedDB for the field app. Out on Country there is usually no signal:
// finds (with their photos) wait in `queue` until an upload succeeds, and each
// target's map bundle, the shared basemap and the last-seen logs wait in
// `cache` so the map and "where to look" work offline. Everything here stays
// on this device.

import type { AreaSpot, Bounds, FieldObservation, FieldTarget, ObservationInput } from '@/lib/research/field/types';

const DB_NAME = 'mobtranslate-field-models';
const VERSION = 1;

export type QueuedObservation = ObservationInput & {
  photo: Blob | null;
  /** Set once the observation row exists on the server; the photo may still be pending. */
  serverId: string | null;
  lastError: string | null;
  /** Uploads wait until this time, so a fresh log can still be undone locally. */
  holdUntil: number;
};

/** One target's model, saved for offline use. */
export type TargetBundle = {
  targetId: string;
  modelId: string;
  savedAt: string;
  spots: AreaSpot[];
  areaBounds: Bounds;
  areaImage: Blob;
};

export type Basemap = { savedAt: string; bounds: Bounds; image: Blob };

export type CachedTargets = { savedAt: string; targets: FieldTarget[] };
export type CachedLogs = { savedAt: string; observations: FieldObservation[] };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('queue')) db.createObjectStore('queue', { keyPath: 'clientId' });
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, body: (_store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = body(transaction.objectStore(store));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

export const queue = {
  put: (item: QueuedObservation) => run('queue', 'readwrite', (s) => s.put(item)).then(() => undefined),
  remove: (clientId: string) => run('queue', 'readwrite', (s) => s.delete(clientId)).then(() => undefined),
  all: () => run<QueuedObservation[]>('queue', 'readonly', (s) => s.getAll()),
};

export const cache = {
  get: <T>(key: string) => run<T | undefined>('cache', 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
  set: (key: string, value: unknown) => run('cache', 'readwrite', (s) => s.put(value, key)).then(() => undefined),
};

export const cacheKeys = {
  targets: 'targets',
  selectedTarget: 'selected-target',
  loggedByName: 'logged-by-name',
  basemap: 'basemap',
  bundle: (targetId: string) => `bundle:${targetId}`,
  logs: (targetId: string) => `logs:${targetId}`,
};
