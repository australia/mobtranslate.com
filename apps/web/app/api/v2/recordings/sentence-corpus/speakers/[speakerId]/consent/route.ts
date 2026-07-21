import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';
import { STUDIO_ROLES, rowsOf } from '@/lib/recording/sentence-studio';
import {
  SpeechConsentGrantSchema,
  legacySpeechConsentFlags,
} from '@/lib/recording/speech-consent';

export const runtime = 'nodejs';

const RequestSchema = z
  .object({
    eventType: z.enum(['grant', 'replace', 'withdraw']),
    consent: SpeechConsentGrantSchema.optional(),
    reason: z.string().trim().min(3).max(2000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.eventType !== 'withdraw' && !value.consent) {
      context.addIssue({
        code: 'custom',
        path: ['consent'],
        message: 'A complete consent record is required.',
      });
    }
    if (value.eventType === 'withdraw' && !value.reason) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'A withdrawal reason is required.',
      });
    }
  });

type LatestConsent = {
  id: string;
  version: number;
  withdrawal_process: string;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ speakerId: string }> },
) {
  const { user, response } = await requireRole(STUDIO_ROLES);
  if (response) return response;

  const { speakerId } = await context.params;
  if (!z.string().uuid().safeParse(speakerId).success) {
    return NextResponse.json({ error: 'Speaker not found.' }, { status: 404 });
  }

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'The consent form is incomplete.', details: parsed.error.issues },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const result = await db.transaction(async (transaction) => {
      const speakerResult = await transaction.execute(sql`
        select id, language_id
        from public.speaker_profiles
        where id = ${speakerId}::uuid
        for update`);
      const speaker = rowsOf<{ id: string; language_id: string | null }>(speakerResult)[0];
      if (!speaker?.language_id) throw new Error('speaker_not_found');

      const latestResult = await transaction.execute(sql`
        select id, version, withdrawal_process
        from public.speech_consent_records
        where speaker_id = ${speakerId}::uuid
        order by version desc
        limit 1`);
      const latest = rowsOf<LatestConsent>(latestResult)[0] ?? null;
      const eventType = parsed.data.eventType;
      if (eventType === 'grant' && latest) throw new Error('grant_requires_no_history');
      if (eventType !== 'grant' && !latest) throw new Error('event_requires_history');

      const consent = parsed.data.consent;
      const rights =
        eventType === 'withdraw'
          ? {
              recordingAllowed: false,
              asrEvaluationAllowed: false,
              asrTrainingAllowed: false,
              hostedProviderTransferAllowed: false,
              publicMetricsAllowed: false,
              publicAudioAllowed: false,
              publicTranscriptAllowed: false,
              asrDerivedWeightsAllowed: false,
              asrWeightDistributionAllowed: false,
              ttsTrainingAllowed: false,
              speakerVoiceReplicationAllowed: false,
              ttsDerivedWeightsAllowed: false,
              ttsWeightDistributionAllowed: false,
              commercialUseAllowed: false,
            }
          : consent!.rights;
      const formVersion = consent?.consentFormVersion ?? 'mobtranslate-speech-v1';
      const withdrawalProcess =
        consent?.withdrawalProcess ?? latest?.withdrawal_process ?? 'Contact MobTranslate to withdraw.';

      const inserted = await transaction.execute(sql`
        insert into public.speech_consent_records
          (speaker_id, language_id, version, event_type, supersedes_id,
           consent_form_version, withdrawal_process, authorizing_body,
           consent_artifact_ref, consent_artifact_sha256, reason, notes, recorded_by,
           recording_allowed, asr_evaluation_allowed, asr_training_allowed,
           hosted_provider_transfer_allowed, public_metrics_allowed,
           public_audio_allowed, public_transcript_allowed,
           asr_derived_weights_allowed, asr_weight_distribution_allowed,
           tts_training_allowed, speaker_voice_replication_allowed,
           tts_derived_weights_allowed, tts_weight_distribution_allowed,
           commercial_use_allowed)
        values
          (${speakerId}::uuid, ${speaker.language_id}::uuid, ${latest ? latest.version + 1 : 1},
           ${eventType}, ${latest?.id ?? null}::uuid, ${formVersion}, ${withdrawalProcess},
           ${consent?.authorizingBody ?? null}, ${consent?.consentArtifactRef ?? null},
           ${consent?.consentArtifactSha256 ?? null}, ${parsed.data.reason ?? null},
           ${consent?.notes ?? null}, ${user!.id}::uuid,
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

      const legacy =
        eventType === 'withdraw'
          ? { culturalConsent: false, trainingConsent: false }
          : legacySpeechConsentFlags(rights);
      await transaction.execute(sql`
        update public.speaker_profiles
        set cultural_consent = ${legacy.culturalConsent},
            training_consent = ${legacy.trainingConsent},
            training_consent_at = ${legacy.trainingConsent ? sql`now()` : sql`null`},
            training_consent_note = ${consent?.notes ?? parsed.data.reason ?? null},
            updated_at = now()
        where id = ${speakerId}::uuid`);

      return rowsOf(inserted)[0];
    });

    return NextResponse.json(result, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Kuku Yalanji speech consent append failed:', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'The consent record could not be saved.' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
