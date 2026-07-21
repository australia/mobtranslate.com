import { promises as fs } from 'fs';
import path from 'path';

// Box-filesystem storage for the former Supabase `recordings` bucket.
// Files live under STORAGE_ROOT and are served same-origin via
// app/api/storage/recordings/[...path]/route.ts. Build URLs at render time from
// the host-independent `storage_path`/`opus_path` columns — do NOT rely on the
// legacy absolute `master_url`/`opus_url` (they point at hosted Supabase).

export const STORAGE_ROOT =
  process.env.MOBTRANSLATE_STORAGE_DIR || '/mnt/donto-data/mobtranslate-storage/recordings';

const PUBLIC_PREFIX = '/api/storage/recordings';

/** Same-origin URL for a stored object given its host-independent storage path. */
export function recordingPublicUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  const clean = storagePath.replace(/^\/+/, '');
  return `${PUBLIC_PREFIX}/${clean}`;
}

/** Resolve a storage path to an absolute on-disk path, guarding against traversal. */
export function resolveStoragePath(storagePath: string): string {
  const clean = storagePath.replace(/^\/+/, '');
  const root = path.resolve(/*turbopackIgnore: true*/ STORAGE_ROOT);
  const abs = path.resolve(/*turbopackIgnore: true*/ root, clean);
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) {
    throw new Error('Invalid storage path');
  }
  return abs;
}

/** Write a buffer to STORAGE_ROOT/<storagePath>, creating parent dirs. */
export async function saveRecording(storagePath: string, data: Buffer | Uint8Array): Promise<void> {
  const abs = resolveStoragePath(storagePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
}

/** Read a stored object; null if it doesn't exist. */
export async function readRecording(storagePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(resolveStoragePath(storagePath));
  } catch {
    return null;
  }
}

/** Delete a stored object (no error if missing). */
export async function deleteRecording(storagePath: string): Promise<void> {
  try {
    await fs.unlink(resolveStoragePath(storagePath));
  } catch {
    /* already gone */
  }
}

const CONTENT_TYPES: Record<string, string> = {
  '.wav': 'audio/wav',
  '.opus': 'audio/opus',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.webm': 'audio/webm',
  '.m4a': 'audio/mp4',
};

export function contentTypeFor(p: string): string {
  return CONTENT_TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream';
}
