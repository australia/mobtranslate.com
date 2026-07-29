import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-helpers';
import { db } from '@/lib/db/index';
import {
  PUBLIC_DICTIONARY_CONSENT_FORM_VERSION,
  PUBLIC_DICTIONARY_CONSENT_NOTE,
  PUBLIC_DICTIONARY_SPEECH_RIGHTS,
  PUBLIC_DICTIONARY_WITHDRAWAL_PROCESS,
} from '@/lib/recording/dictionary-public-consent';
import { rowsOf } from '@/lib/recording/sentence-studio';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

const BodySchema = z.object({
  languageId: z.string().uuid(),
  grant: z.boolean(),
  speakerConfirmed: z.boolean().optional(),
  sharingAuthorityConfirmed: z.boolean().optional(),
}).superRefine((body, context) => {
  if (body.grant && body.speakerConfirmed !== true) {
    context.addIssue({ code: 'custom', path: ['speakerConfirmed'], message: 'The recorded speaker must confirm.' });
  }
  if (body.grant && body.sharingAuthorityConfirmed !== true) {
    context.addIssue({ code: 'custom', path: ['sharingAuthorityConfirmed'], message: 'Permission to share must be confirmed.' });
  }
});

type ConsentRow = {
  id: string;
  speaker_id: string;
  version: number;
  event_type: 'grant' | 'replace' | 'withdraw';
  consent_artifact_ref: string | null;
  recording_allowed: boolean;
  asr_evaluation_allowed: boolean;
  asr_training_allowed: boolean;
  hosted_provider_transfer_allowed: boolean;
  public_metrics_allowed: boolean;
  public_audio_allowed: boolean;
  public_transcript_allowed: boolean;
  asr_derived_weights_allowed: boolean;
  asr_weight_distribution_allowed: boolean;
  tts_training_allowed: boolean;
  speaker_voice_replication_allowed: boolean;
  tts_derived_weights_allowed: boolean;
  tts_weight_distribution_allowed: boolean;
  commercial_use_allowed: boolean;
};

function response(row?: ConsentRow | null) {
  const granted = !!(
    row && row.event_type !== 'withdraw' && row.recording_allowed
    && row.public_audio_allowed && row.public_transcript_allowed
    && row.consent_artifact_ref === 'app:self-service'
    && !row.asr_evaluation_allowed
    && !row.asr_training_allowed
    && !row.hosted_provider_transfer_allowed
    && !row.public_metrics_allowed
    && !row.asr_derived_weights_allowed
    && !row.asr_weight_distribution_allowed
    && !row.tts_training_allowed
    && !row.speaker_voice_replication_allowed
    && !row.tts_derived_weights_allowed
    && !row.tts_weight_distribution_allowed
    && !row.commercial_use_allowed
  );
  return {
    granted,
    consentRecordId: granted ? row?.id ?? null : null,
    version: row?.version ?? null,
    publicAudioAllowed: granted,
    publicTranscriptAllowed: granted,
    modelTrainingAllowed: !!(row?.asr_training_allowed || row?.tts_training_allowed),
    providerTransferAllowed: !!row?.hosted_provider_transfer_allowed,
    publicMetricsAllowed: !!row?.public_metrics_allowed,
    voiceReplicationAllowed: !!row?.speaker_voice_replication_allowed,
    modelWeightsAllowed: !!(
      row?.asr_derived_weights_allowed || row?.asr_weight_distribution_allowed
      || row?.tts_derived_weights_allowed || row?.tts_weight_distribution_allowed
    ),
    commercialUseAllowed: !!row?.commercial_use_allowed,
    withdrawalProcess: PUBLIC_DICTIONARY_WITHDRAWAL_PROCESS,
  };
}

async function latestFor(userId: string, languageId: string): Promise<ConsentRow | null> {
  const result = await db.execute(sql`
    select consent.*
      from public.speech_consent_records consent
      join public.speaker_profiles speaker on speaker.id = consent.speaker_id
     where speaker.user_id = ${userId}::uuid
       and speaker.language_id = ${languageId}::uuid
     order by consent.version desc
     limit 1
  `);
  return rowsOf<ConsentRow>(result)[0] ?? null;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const languageId = request.nextUrl.searchParams.get('languageId');
  if (!languageId || !z.string().uuid().safeParse(languageId).success) {
    return NextResponse.json({ error: 'languageId (uuid) is required' }, { status: 400 });
  }
  return NextResponse.json(response(await latestFor(user.id, languageId)), {
    headers: NO_STORE_HEADERS,
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid consent choice', details: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  try {
    const result = await db.transaction(async (tx) => {
      const language = rowsOf<{ id: string }>(await tx.execute(sql`
        select id from public.languages where id = ${body.languageId}::uuid limit 1
      `))[0];
      if (!language) throw new Error('Language not found');

      const profile = rowsOf<{ id: string }>(await tx.execute(sql`
        insert into public.speaker_profiles (
          user_id, name, language_id, cultural_consent, is_active, created_by
        ) values (
          ${user.id}::uuid, ${user.name || user.email || 'Contributor'}, ${body.languageId}::uuid,
          false, true, ${user.id}::uuid
        )
        on conflict (user_id, language_id) where user_id is not null
        do update set name = excluded.name, is_active = true, updated_at = now()
        returning id
      `))[0];
      if (!profile) throw new Error('Could not create speaker profile');

      const latest = rowsOf<ConsentRow>(await tx.execute(sql`
        select * from public.speech_consent_records
         where speaker_id = ${profile.id}::uuid
         order by version desc
         limit 1
         for update
      `))[0] ?? null;

      if (!body.grant && (!latest || latest.event_type === 'withdraw')) {
        return latest;
      }
      const eventType = latest ? (body.grant ? 'replace' : 'withdraw') : 'grant';
      const rights = body.grant ? PUBLIC_DICTIONARY_SPEECH_RIGHTS : null;
      const inserted = rowsOf<ConsentRow>(await tx.execute(sql`
        insert into public.speech_consent_records (
          speaker_id, language_id, version, event_type, supersedes_id,
          consent_form_version, withdrawal_process, consent_artifact_ref,
          notes, recorded_by,
          recording_allowed, asr_evaluation_allowed, asr_training_allowed,
          hosted_provider_transfer_allowed, public_metrics_allowed,
          public_audio_allowed, public_transcript_allowed,
          asr_derived_weights_allowed, asr_weight_distribution_allowed,
          tts_training_allowed, speaker_voice_replication_allowed,
          tts_derived_weights_allowed, tts_weight_distribution_allowed,
          commercial_use_allowed
        ) values (
          ${profile.id}::uuid, ${body.languageId}::uuid, ${Number(latest?.version ?? 0) + 1},
          ${eventType}, ${latest?.id ?? null}::uuid,
          ${PUBLIC_DICTIONARY_CONSENT_FORM_VERSION}, ${PUBLIC_DICTIONARY_WITHDRAWAL_PROCESS},
          ${'app:self-service'}, ${body.grant ? PUBLIC_DICTIONARY_CONSENT_NOTE : 'Self-service public dictionary audio permission withdrawn.'},
          ${user.id}::uuid,
          ${rights?.recordingAllowed ?? false}, ${rights?.asrEvaluationAllowed ?? false},
          ${rights?.asrTrainingAllowed ?? false}, ${rights?.hostedProviderTransferAllowed ?? false},
          ${rights?.publicMetricsAllowed ?? false}, ${rights?.publicAudioAllowed ?? false},
          ${rights?.publicTranscriptAllowed ?? false}, ${rights?.asrDerivedWeightsAllowed ?? false},
          ${rights?.asrWeightDistributionAllowed ?? false}, ${rights?.ttsTrainingAllowed ?? false},
          ${rights?.speakerVoiceReplicationAllowed ?? false}, ${rights?.ttsDerivedWeightsAllowed ?? false},
          ${rights?.ttsWeightDistributionAllowed ?? false}, ${rights?.commercialUseAllowed ?? false}
        ) returning *
      `))[0];

      await tx.execute(sql`
        update public.speaker_profiles
           set cultural_consent = ${body.grant}, training_consent = false, updated_at = now()
         where id = ${profile.id}::uuid
      `);
      if (body.grant) {
        // The explicit choice covers this contributor's existing self-recorded
        // clips for the same language too. Admin-captured Elder recordings are
        // never reassigned to the operator.
        await tx.execute(sql`
          update public.recordings
             set speaker_id = ${profile.id}::uuid,
                 speech_consent_record_id = ${inserted.id}::uuid,
                 updated_at = now()
           where recorded_by = ${user.id}::uuid
             and language_id = ${body.languageId}::uuid
             and status = 'active'
             and (speaker_id is null or speaker_id = ${profile.id}::uuid)
        `);
      }
      return inserted;
    });
    return NextResponse.json(response(result), { headers: NO_STORE_HEADERS });
  } catch (error) {
    const message = (error as Error).message || 'Could not save recording permission';
    return NextResponse.json(
      { error: message === 'Language not found' ? message : 'Could not save recording permission' },
      { status: message === 'Language not found' ? 404 : 500, headers: NO_STORE_HEADERS },
    );
  }
}
