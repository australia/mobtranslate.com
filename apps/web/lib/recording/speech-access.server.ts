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
      coalesce(session.language_id, speaker.language_id) as language_id,
      speaker.user_id as speaker_user_id,
      exists (
        select 1
        from public.current_speech_consent consent
        where consent.id = recording.speech_consent_record_id
          and consent.speaker_id = recording.speaker_id
          and consent.recording_allowed = true
          and consent.public_audio_allowed = true
      ) as public_allowed
      from public.sentence_recordings recording
      left join public.speech_recording_sessions session on session.id = recording.speech_session_id
      left join public.speaker_profiles speaker on speaker.id = recording.speaker_id
      where (recording.audio_path = ${storagePath} or recording.opus_path = ${storagePath})
        and recording.status = 'active'
      limit 1`);
  const row = rowsOf<{ language_id: string | null; speaker_user_id: string | null; public_allowed: boolean }>(result)[0];
  if (!row) return 'denied';
  if (row.public_allowed) return 'public';

  const user = await getSessionUser().catch(() => null);
  if (!user) return 'denied';
  if (row.speaker_user_id === user.id) return 'private';
  const allowed = row.language_id
    ? await userHasRole(user.id, STUDIO_ROLES, row.language_id).catch(() => false)
    : await userHasRole(user.id, ['super_admin']).catch(() => false);
  return allowed
    ? 'private'
    : 'denied';
}
