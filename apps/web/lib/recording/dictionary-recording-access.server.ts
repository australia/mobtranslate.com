import { sql } from 'drizzle-orm';
import { getSessionUser, userHasRole } from '@/lib/auth-helpers';
import { db } from '@/lib/db/index';
import { STUDIO_ROLES, rowsOf } from '@/lib/recording/sentence-studio';

export interface DictionaryRecordingConsentAccess {
  speakerId: string;
  consentRecordId: string;
}

/** A client-supplied ledger id is never trusted on its own. It must be the
 * contributor's current consent event for this exact language and must permit
 * retention, public audio, and the public word/sentence label. */
export async function requirePublicDictionaryRecordingConsent(
  userId: string,
  languageId: string,
  consentRecordId: string,
): Promise<DictionaryRecordingConsentAccess | null> {
  const result = await db.execute(sql`
    select consent.id as consent_record_id, consent.speaker_id
      from public.current_speech_consent consent
      join public.speaker_profiles speaker on speaker.id = consent.speaker_id
     where consent.id = ${consentRecordId}::uuid
       and consent.language_id = ${languageId}::uuid
       and speaker.user_id = ${userId}::uuid
       and speaker.language_id = ${languageId}::uuid
       and speaker.is_active = true
       and consent.consent_artifact_ref = 'app:self-service'
       and consent.event_type <> 'withdraw'
       and consent.recording_allowed = true
       and consent.public_audio_allowed = true
       and consent.public_transcript_allowed = true
       and consent.asr_evaluation_allowed = false
       and consent.asr_training_allowed = false
       and consent.hosted_provider_transfer_allowed = false
       and consent.public_metrics_allowed = false
       and consent.asr_derived_weights_allowed = false
       and consent.asr_weight_distribution_allowed = false
       and consent.tts_training_allowed = false
       and consent.speaker_voice_replication_allowed = false
       and consent.tts_derived_weights_allowed = false
       and consent.tts_weight_distribution_allowed = false
       and consent.commercial_use_allowed = false
     limit 1
  `);
  const row = rowsOf<{ consent_record_id: string; speaker_id: string }>(result)[0];
  return row
    ? { consentRecordId: row.consent_record_id, speakerId: row.speaker_id }
    : null;
}

export type DictionaryAudioAccess = 'public' | 'private' | 'denied';

/** Dictionary audio is public only when it is an attributed source recording
 * with documented terms, or when the exact contributor consent event is still
 * current and permits public playback. Legacy NULL consent authorizes nothing. */
export async function resolveDictionaryAudioAccess(
  storagePath: string,
): Promise<DictionaryAudioAccess> {
  const result = await db.execute(sql`
    select
      recording.language_id,
      speaker.user_id as speaker_user_id,
      exists (
        select 1
          from public.recording_external_refs external_ref
          join public.recording_sources source on source.id = external_ref.source_id
         where external_ref.recording_id = recording.id
           and btrim(source.license_name) <> ''
           and btrim(source.license_url) <> ''
      ) as attributed_source,
      exists (
        select 1
          from public.current_speech_consent consent
         where consent.id = recording.speech_consent_record_id
           and consent.speaker_id = recording.speaker_id
           and consent.language_id = recording.language_id
           and consent.event_type <> 'withdraw'
           and consent.recording_allowed = true
           and consent.public_audio_allowed = true
      ) as public_allowed
      from public.recordings recording
      left join public.speaker_profiles speaker on speaker.id = recording.speaker_id
     where (recording.storage_path = ${storagePath} or recording.opus_path = ${storagePath})
       and recording.status = 'active'
     limit 1
  `);
  const row = rowsOf<{
    language_id: string;
    speaker_user_id: string | null;
    attributed_source: boolean;
    public_allowed: boolean;
  }>(result)[0];
  if (!row) return 'denied';
  if (row.attributed_source || row.public_allowed) return 'public';

  const user = await getSessionUser().catch(() => null);
  if (!user) return 'denied';
  // The speaker can always revisit their own private recording. An operator
  // does not retain access merely because they pressed Record; their current,
  // language-scoped role is checked below and can be revoked.
  if (row.speaker_user_id === user.id) return 'private';
  return (await userHasRole(user.id, STUDIO_ROLES, row.language_id).catch(() => false))
    ? 'private'
    : 'denied';
}
