// Shared helpers for the sentence recording studio (elder-in-person TTS corpus
// capture + elder verification of the synthetic corpus).
//
// Reuses the existing recording infrastructure: speaker_profiles, the
// box-filesystem storage under MOBTRANSLATE_STORAGE_DIR (lib/storage), and the
// app-level authz helpers (RLS is dropped in the migrated DB).
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';

// The studio is operated in person by a curator/admin driving the tablet.
export const STUDIO_ROLES = ['super_admin', 'dictionary_admin', 'curator'];
// Exports feed the training program — restrict to admins.
export const EXPORT_ROLES = ['super_admin', 'dictionary_admin'];

export const CORPUS_SOURCE = 'synthetic-v1';
export const LANGUAGE_CODE = 'kuku_yalanji';

/** Object path for a sentence take, grouped by speaker (good for per-voice TTS). */
export function sentenceAudioBase(speakerId: string, clientId: string): string {
  const safeSpeaker = (speakerId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeClient = clientId.replace(/[^a-zA-Z0-9_.-]/g, '');
  return `sentences/${safeSpeaker}/${safeClient}`;
}

/** Normalise a drizzle/postgres-js execute() result to a plain row array. */
export function rowsOf<T = any>(res: any): T[] {
  return (Array.isArray(res) ? res : res?.rows ?? []) as T[];
}

/** The Kuku Yalanji language id, cached for the process lifetime. */
let cachedLanguageId: string | null = null;
export async function kukuLanguageId(): Promise<string | null> {
  if (cachedLanguageId) return cachedLanguageId;
  const res = await db.execute(sql`select id from public.languages where code = ${LANGUAGE_CODE} limit 1`);
  const row = rowsOf<{ id: string }>(res)[0];
  cachedLanguageId = row?.id ?? null;
  return cachedLanguageId;
}
