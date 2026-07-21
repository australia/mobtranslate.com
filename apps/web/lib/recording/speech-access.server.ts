import { sql } from 'drizzle-orm';
import { getSessionUser, userHasRole } from '@/lib/auth-helpers';
import { db } from '@/lib/db/index';
import { STUDIO_ROLES, rowsOf } from '@/lib/recording/sentence-studio';

export type SentenceAudioAccess = 'public' | 'private' | 'denied';

export async function resolveSentenceAudioAccess(
  storagePath: string,
): Promise<SentenceAudioAccess> {
  const result = await db.execute(sql`
    select
      exists (
        select 1
        from public.sentence_recordings recording
        where (recording.audio_path = ${storagePath} or recording.opus_path = ${storagePath})
          and recording.status = 'active'
      ) as exists,
      exists (
        select 1
        from public.sentence_recordings recording
        join public.current_speech_consent consent
          on consent.id = recording.speech_consent_record_id
         and consent.speaker_id = recording.speaker_id
        where (recording.audio_path = ${storagePath} or recording.opus_path = ${storagePath})
          and recording.status = 'active'
          and consent.recording_allowed = true
          and consent.public_audio_allowed = true
      ) as public_allowed`);
  const row = rowsOf<{ exists: boolean; public_allowed: boolean }>(result)[0];
  if (!row?.exists) return 'denied';
  if (row.public_allowed) return 'public';

  const user = await getSessionUser().catch(() => null);
  if (!user) return 'denied';
  return (await userHasRole(user.id, STUDIO_ROLES).catch(() => false))
    ? 'private'
    : 'denied';
}
