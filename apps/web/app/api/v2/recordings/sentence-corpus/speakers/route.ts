import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';
import { STUDIO_ROLES, kukuLanguageId, rowsOf } from '@/lib/recording/sentence-studio';
import {
  SpeechConsentGrantSchema,
  legacySpeechConsentFlags,
} from '@/lib/recording/speech-consent';

export const runtime = 'nodejs';

// GET active speakers (Kuku Yalanji + any global), with their sentence-studio
// clip/minute totals for the speaker picker. Reuses public.speaker_profiles.
export async function GET(_request: NextRequest) {
  const { response } = await requireRole(STUDIO_ROLES);
  if (response) return response;

  const langId = await kukuLanguageId();
  try {
    const res = await db.execute(sql`
      select sp.id, sp.name, sp.community, sp.dialect, sp.gender, sp.age, sp.bio,
             sp.cultural_consent, sp.training_consent,
             consent.id as consent_record_id,
             consent.version as consent_version,
             consent.event_type as consent_event_type,
             consent.withdrawal_process,
             consent.recording_allowed,
             consent.asr_evaluation_allowed,
             consent.asr_training_allowed,
             consent.hosted_provider_transfer_allowed,
             consent.public_metrics_allowed,
             consent.public_audio_allowed,
             consent.public_transcript_allowed,
             consent.asr_derived_weights_allowed,
             consent.asr_weight_distribution_allowed,
             consent.tts_training_allowed,
             consent.speaker_voice_replication_allowed,
             consent.tts_derived_weights_allowed,
             consent.tts_weight_distribution_allowed,
             consent.commercial_use_allowed,
             coalesce(a.clips, 0)::int as clips,
             coalesce(a.minutes, 0)::float as minutes
      from public.speaker_profiles sp
      left join public.current_speech_consent consent on consent.speaker_id = sp.id
      left join lateral (
        select count(*)::int as clips, round(sum(duration_ms) / 60000.0, 1) as minutes
        from public.sentence_recordings sr where sr.speaker_id = sp.id and sr.status = 'active'
      ) a on true
      where sp.is_active = true and (sp.language_id = ${langId}::uuid or sp.language_id is null)
      order by sp.created_at asc`);
    return NextResponse.json(rowsOf(res), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('Kuku Yalanji speaker list failed:', {
      name: err instanceof Error ? err.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'The speaker list could not be loaded.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

// POST create a speaker with the in-person consent affirmation (CARE gate).
const schema = z.object({
  name: z.string().min(1).max(255),
  community: z.string().max(255).nullable().optional(),
  dialect: z.string().max(255).nullable().optional(),
  gender: z.string().max(50).nullable().optional(),
  age: z.number().int().min(0).max(130).nullable().optional(),
  bio: z.string().max(2000).nullable().optional(),
  consent: SpeechConsentGrantSchema,
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireRole(STUDIO_ROLES);
  if (response) return response;

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof z.ZodError ? err.issues : String(err) },
      { status: 400 },
    );
  }
  const langId = await kukuLanguageId();
  if (!langId) {
    return NextResponse.json(
      { error: 'The Kuku Yalanji recording language is not configured.' },
      { status: 503 },
    );
  }
  const legacy = legacySpeechConsentFlags(body.consent.rights);
  try {
    const created = await db.transaction(async (transaction) => {
      const speakerResult = await transaction.execute(sql`
        insert into public.speaker_profiles
          (name, language_id, community, dialect, gender, age, bio,
           cultural_consent, training_consent, training_consent_at, training_consent_note, created_by)
        values
          (${body.name}, ${langId}::uuid, ${body.community ?? null}, ${body.dialect ?? null},
           ${body.gender ?? null}, ${body.age ?? null}::int, ${body.bio ?? null},
           ${legacy.culturalConsent}::boolean, ${legacy.trainingConsent}::boolean,
           ${legacy.trainingConsent ? sql`now()` : sql`null`}, ${body.consent.notes ?? null},
           ${user!.id}::uuid)
        returning id, name, community, dialect, gender, age, cultural_consent, training_consent`);
      const speaker = rowsOf<{ id: string }>(speakerResult)[0];
      if (!speaker) throw new Error('speaker_insert_failed');

      const rights = body.consent.rights;
      const consentResult = await transaction.execute(sql`
        insert into public.speech_consent_records
          (speaker_id, language_id, version, event_type, consent_form_version,
           withdrawal_process, authorizing_body, consent_artifact_ref,
           consent_artifact_sha256, notes, recorded_by,
           recording_allowed, asr_evaluation_allowed, asr_training_allowed,
           hosted_provider_transfer_allowed, public_metrics_allowed,
           public_audio_allowed, public_transcript_allowed,
           asr_derived_weights_allowed, asr_weight_distribution_allowed,
           tts_training_allowed, speaker_voice_replication_allowed,
           tts_derived_weights_allowed, tts_weight_distribution_allowed,
           commercial_use_allowed)
        values
          (${speaker.id}::uuid, ${langId}::uuid, 1, 'grant',
           ${body.consent.consentFormVersion}, ${body.consent.withdrawalProcess},
           ${body.consent.authorizingBody ?? null}, ${body.consent.consentArtifactRef ?? null},
           ${body.consent.consentArtifactSha256 ?? null}, ${body.consent.notes ?? null},
           ${user!.id}::uuid,
           ${rights.recordingAllowed}, ${rights.asrEvaluationAllowed},
           ${rights.asrTrainingAllowed}, ${rights.hostedProviderTransferAllowed},
           ${rights.publicMetricsAllowed}, ${rights.publicAudioAllowed},
           ${rights.publicTranscriptAllowed}, ${rights.asrDerivedWeightsAllowed},
           ${rights.asrWeightDistributionAllowed}, ${rights.ttsTrainingAllowed},
           ${rights.speakerVoiceReplicationAllowed}, ${rights.ttsDerivedWeightsAllowed},
           ${rights.ttsWeightDistributionAllowed}, ${rights.commercialUseAllowed})
        returning id as consent_record_id, version as consent_version,
          event_type as consent_event_type, withdrawal_process,
          recording_allowed, asr_evaluation_allowed, asr_training_allowed,
          hosted_provider_transfer_allowed, public_metrics_allowed,
          public_audio_allowed, public_transcript_allowed,
          asr_derived_weights_allowed, asr_weight_distribution_allowed,
          tts_training_allowed, speaker_voice_replication_allowed,
          tts_derived_weights_allowed, tts_weight_distribution_allowed,
          commercial_use_allowed`);
      return { ...speaker, ...rowsOf(consentResult)[0] };
    });
    return NextResponse.json(created, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('Kuku Yalanji speaker/consent creation failed:', {
      name: err instanceof Error ? err.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'The speaker and consent record could not be saved.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
