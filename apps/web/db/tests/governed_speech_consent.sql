\set ON_ERROR_STOP on

BEGIN;

DO $contract$
DECLARE
  language_uuid UUID;
  speaker_uuid UUID := gen_random_uuid();
  consent_grant_uuid UUID;
  consent_withdrawal_uuid UUID;
  session_uuid UUID := gen_random_uuid();
  sentence_uuid UUID := gen_random_uuid();
  recording_uuid UUID := gen_random_uuid();
  transcript_review_uuid UUID;
  transcript_adjudicated_uuid UUID;
  source_key TEXT := '__speech_governance_contract__:' || gen_random_uuid()::text;
  mutation_rejected BOOLEAN := FALSE;
  duplicate_reviewers_rejected BOOLEAN := FALSE;
BEGIN
  SELECT id
    INTO STRICT language_uuid
    FROM public.languages
    WHERE code = 'kuku_yalanji';

  INSERT INTO public.speaker_profiles (id, language_id, name)
  VALUES (speaker_uuid, language_uuid, '__speech_governance_contract__');

  INSERT INTO public.speech_consent_records (
    speaker_id,
    language_id,
    version,
    event_type,
    consent_form_version,
    withdrawal_process,
    recording_allowed,
    asr_evaluation_allowed,
    asr_training_allowed,
    hosted_provider_transfer_allowed,
    tts_training_allowed
  ) VALUES (
    speaker_uuid,
    language_uuid,
    1,
    'grant',
    'contract-test-v1',
    'Append a withdrawal event.',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    TRUE
  )
  RETURNING id INTO consent_grant_uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM public.current_speech_consent
    WHERE id = consent_grant_uuid
      AND speaker_id = speaker_uuid
      AND event_type = 'grant'
      AND recording_allowed
      AND asr_training_allowed
      AND tts_training_allowed
  ) THEN
    RAISE EXCEPTION 'current consent did not expose the effective grant';
  END IF;

  INSERT INTO public.speech_recording_sessions (
    id,
    speaker_id,
    language_id,
    consent_record_id,
    condition,
    variety,
    device_metadata
  ) VALUES (
    session_uuid,
    speaker_uuid,
    language_uuid,
    consent_grant_uuid,
    'quiet-room',
    'Kuku Yalanji',
    '{"contract_test": true}'::jsonb
  );

  INSERT INTO public.recording_sentences (
    id,
    language_id,
    corpus_source,
    corpus_sentence_id,
    kuku_text,
    english_text,
    original_kuku,
    status
  ) VALUES (
    sentence_uuid,
    language_uuid,
    source_key,
    1,
    'ngayu binal',
    'I know',
    'ngayu binal',
    'recorded'
  );

  INSERT INTO public.sentence_recordings (
    id,
    sentence_id,
    speaker_id,
    spoken_kuku,
    audio_path,
    sample_rate,
    duration_ms,
    file_size_bytes,
    peak_amplitude,
    cultural_consent,
    training_consent,
    speech_consent_record_id,
    speech_session_id,
    client_id
  ) VALUES (
    recording_uuid,
    sentence_uuid,
    speaker_uuid,
    'ngayu binal',
    'sentences/contract-test/test.wav',
    16000,
    1250,
    40044,
    0.25,
    TRUE,
    TRUE,
    consent_grant_uuid,
    session_uuid,
    'speech-contract-' || recording_uuid::text
  );

  INSERT INTO public.speech_transcript_events (
    sentence_recording_id,
    version,
    status,
    transcript,
    orthography_version,
    reviewer_ids
  ) VALUES (
    recording_uuid,
    1,
    'single_review',
    'ngayu binal',
    'contract-test-v1',
    ARRAY['speaker:contract']
  )
  RETURNING id INTO transcript_review_uuid;

  INSERT INTO public.speech_transcript_events (
    sentence_recording_id,
    version,
    status,
    transcript,
    orthography_version,
    reviewer_ids,
    supersedes_id
  ) VALUES (
    recording_uuid,
    2,
    'adjudicated',
    'ngayu binal',
    'contract-test-v1',
    ARRAY['speaker:contract', 'operator:independent'],
    transcript_review_uuid
  )
  RETURNING id INTO transcript_adjudicated_uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM public.current_speech_transcript
    WHERE id = transcript_adjudicated_uuid
      AND sentence_recording_id = recording_uuid
      AND version = 2
      AND status = 'adjudicated'
  ) THEN
    RAISE EXCEPTION 'current transcript did not expose the adjudication';
  END IF;

  BEGIN
    INSERT INTO public.speech_transcript_events (
      sentence_recording_id,
      version,
      status,
      transcript,
      orthography_version,
      reviewer_ids,
      supersedes_id
    ) VALUES (
      recording_uuid,
      3,
      'adjudicated',
      'ngayu binal',
      'contract-test-v1',
      ARRAY['operator:same', 'operator:same'],
      transcript_adjudicated_uuid
    );
  EXCEPTION WHEN OTHERS THEN
    IF position('two distinct reviewers' IN SQLERRM) = 0 THEN
      RAISE;
    END IF;
    duplicate_reviewers_rejected := TRUE;
  END;

  IF NOT duplicate_reviewers_rejected THEN
    RAISE EXCEPTION 'duplicate adjudicators were accepted';
  END IF;

  BEGIN
    UPDATE public.speech_consent_records
    SET notes = 'mutation must fail'
    WHERE id = consent_grant_uuid;
  EXCEPTION WHEN OTHERS THEN
    IF position('append-only' IN SQLERRM) = 0 THEN
      RAISE;
    END IF;
    mutation_rejected := TRUE;
  END;

  IF NOT mutation_rejected THEN
    RAISE EXCEPTION 'speech consent history accepted an update';
  END IF;

  INSERT INTO public.speech_consent_records (
    speaker_id,
    language_id,
    version,
    event_type,
    supersedes_id,
    consent_form_version,
    withdrawal_process,
    reason
  ) VALUES (
    speaker_uuid,
    language_uuid,
    2,
    'withdraw',
    consent_grant_uuid,
    'contract-test-v1',
    'Append a later consent event if the speaker chooses.',
    'Contract-test withdrawal'
  )
  RETURNING id INTO consent_withdrawal_uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM public.current_speech_consent
    WHERE id = consent_withdrawal_uuid
      AND speaker_id = speaker_uuid
      AND version = 2
      AND event_type = 'withdraw'
      AND NOT recording_allowed
      AND NOT asr_evaluation_allowed
      AND NOT asr_training_allowed
      AND NOT hosted_provider_transfer_allowed
      AND NOT public_metrics_allowed
      AND NOT public_audio_allowed
      AND NOT public_transcript_allowed
      AND NOT asr_derived_weights_allowed
      AND NOT asr_weight_distribution_allowed
      AND NOT tts_training_allowed
      AND NOT speaker_voice_replication_allowed
      AND NOT tts_derived_weights_allowed
      AND NOT tts_weight_distribution_allowed
      AND NOT commercial_use_allowed
  ) THEN
    RAISE EXCEPTION 'withdrawal did not fail closed in current consent';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.current_speech_consent
    WHERE speaker_id = speaker_uuid
      AND (recording_allowed OR asr_evaluation_allowed OR asr_training_allowed
        OR tts_training_allowed OR speaker_voice_replication_allowed)
  ) THEN
    RAISE EXCEPTION 'a withdrawn speaker retained active speech rights';
  END IF;
END
$contract$;

ROLLBACK;
