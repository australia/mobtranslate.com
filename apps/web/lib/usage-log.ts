import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { ttsInputFingerprint } from '@/lib/tts-cache.server';

/**
 * Best-effort usage logging for the admin "Explore" console.
 *
 * Every helper here is fire-and-forget: it swallows its own errors so a logging
 * failure can never break a user-facing translate / chat / TTS response. We log
 * what people asked to translate, their chats, and how often each synthesized
 * voice clip gets played.
 */

export type RequestKind = 'translate' | 'chat' | 'chat_app';

interface LogRequestInput {
  kind: RequestKind;
  source?: string; // 'homepage' | 'chat_page'
  languageCode?: string | null;
  inputText: string;
  outputText?: string | null;
  gloss?: string | null;
  userId?: string | null;
  status?: 'ok' | 'error';
  error?: string | null;
  model?: string | null;
  durationMs?: number | null;
}

/** Record a single translate/chat request. Never throws. */
export async function logTranslationRequest(input: LogRequestInput): Promise<void> {
  try {
    const text = (input.inputText ?? '').slice(0, 8000);
    if (!text.trim()) return;
    await db.execute(sql`
      insert into public.translation_requests
        (kind, source, language_code, input_text, output_text, gloss, user_id, status, error, model, duration_ms)
      values (
        ${input.kind},
        ${input.source ?? null},
        ${input.languageCode ?? null},
        ${text},
        ${input.outputText ? input.outputText.slice(0, 20000) : null},
        ${input.gloss ?? null},
        ${input.userId ?? null},
        ${input.status ?? 'ok'},
        ${input.error ? String(input.error).slice(0, 2000) : null},
        ${input.model ?? null},
        ${input.durationMs ?? null}
      )
    `);
  } catch (err) {
    console.error('logTranslationRequest failed (non-fatal):', err);
  }
}

/** Bump the play counter for a stored TTS clip. Never throws. */
export async function recordTtsPlay(languageCode: string, text: string, model: string): Promise<void> {
  try {
    const inputFingerprint = ttsInputFingerprint(languageCode, text, model);
    await db.execute(sql`
      update public.tts_generations
         set play_count = play_count + 1,
             last_played_at = now()
       where language_code = ${languageCode}
         and model = ${model}
         and (
           input_fingerprint = ${inputFingerprint}
           or (input_fingerprint is null and text = ${text})
         )
    `);
  } catch (err) {
    console.error('recordTtsPlay failed (non-fatal):', err);
  }
}
