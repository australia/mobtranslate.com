-- Speech-model permissions are explicit, versioned events. Legacy
-- cultural_consent/training_consent booleans remain for compatibility but do
-- not authorize ASR/TTS evaluation, training, provider transfer, or release.

CREATE TABLE IF NOT EXISTS public.speech_consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  speaker_id UUID NOT NULL REFERENCES public.speaker_profiles(id) ON DELETE RESTRICT,
  language_id UUID NOT NULL REFERENCES public.languages(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  event_type TEXT NOT NULL CHECK (event_type IN ('grant', 'replace', 'withdraw')),
  supersedes_id UUID REFERENCES public.speech_consent_records(id) ON DELETE RESTRICT,
  consent_form_version TEXT NOT NULL CHECK (btrim(consent_form_version) <> ''),
  effective_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  withdrawal_process TEXT NOT NULL CHECK (btrim(withdrawal_process) <> ''),
  authorizing_body TEXT,
  consent_artifact_ref TEXT,
  consent_artifact_sha256 VARCHAR(64),
  reason TEXT,
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  recording_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  asr_evaluation_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  asr_training_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  hosted_provider_transfer_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  public_metrics_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  public_audio_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  public_transcript_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  asr_derived_weights_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  asr_weight_distribution_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  tts_training_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  speaker_voice_replication_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  tts_derived_weights_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  tts_weight_distribution_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  commercial_use_allowed BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (speaker_id, version),
  CHECK (expires_at IS NULL OR expires_at > effective_at),
  CHECK (
    consent_artifact_sha256 IS NULL
    OR consent_artifact_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CHECK (event_type = 'withdraw' OR recording_allowed),
  CHECK (
    event_type <> 'withdraw'
    OR NOT (
      recording_allowed OR asr_evaluation_allowed OR asr_training_allowed
      OR hosted_provider_transfer_allowed OR public_metrics_allowed
      OR public_audio_allowed OR public_transcript_allowed
      OR asr_derived_weights_allowed OR asr_weight_distribution_allowed
      OR tts_training_allowed OR speaker_voice_replication_allowed
      OR tts_derived_weights_allowed OR tts_weight_distribution_allowed
      OR commercial_use_allowed
    )
  ),
  CHECK (NOT asr_derived_weights_allowed OR asr_training_allowed),
  CHECK (NOT asr_weight_distribution_allowed OR asr_derived_weights_allowed),
  CHECK (NOT speaker_voice_replication_allowed OR tts_training_allowed),
  CHECK (NOT tts_derived_weights_allowed OR tts_training_allowed),
  CHECK (NOT tts_weight_distribution_allowed OR tts_derived_weights_allowed),
  CHECK (
    NOT hosted_provider_transfer_allowed
    OR asr_evaluation_allowed OR asr_training_allowed OR tts_training_allowed
  )
);

CREATE INDEX IF NOT EXISTS speech_consent_records_speaker_version_idx
  ON public.speech_consent_records (speaker_id, version DESC);
CREATE INDEX IF NOT EXISTS speech_consent_records_language_idx
  ON public.speech_consent_records (language_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_speech_consent_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  latest_id UUID;
  latest_version INTEGER;
  speaker_language UUID;
BEGIN
  -- Lock the parent so two operators cannot append the same next version.
  SELECT language_id
    INTO speaker_language
    FROM public.speaker_profiles
    WHERE id = NEW.speaker_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'speech consent speaker does not exist';
  END IF;
  IF speaker_language IS DISTINCT FROM NEW.language_id THEN
    RAISE EXCEPTION 'speech consent language does not match speaker';
  END IF;

  SELECT id, version
    INTO latest_id, latest_version
    FROM public.speech_consent_records
    WHERE speaker_id = NEW.speaker_id
    ORDER BY version DESC
    LIMIT 1;

  IF latest_id IS NULL THEN
    IF NEW.version <> 1 OR NEW.event_type <> 'grant' OR NEW.supersedes_id IS NOT NULL THEN
      RAISE EXCEPTION 'first speech consent event must be grant version 1';
    END IF;
  ELSE
    IF NEW.version <> latest_version + 1 THEN
      RAISE EXCEPTION 'speech consent version must follow the latest event';
    END IF;
    IF NEW.event_type = 'grant' THEN
      RAISE EXCEPTION 'later speech consent events must replace or withdraw';
    END IF;
    IF NEW.supersedes_id IS DISTINCT FROM latest_id THEN
      RAISE EXCEPTION 'speech consent event must supersede the latest event';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_speech_consent_event_insert
  ON public.speech_consent_records;
CREATE TRIGGER validate_speech_consent_event_insert
  BEFORE INSERT ON public.speech_consent_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_speech_consent_event();

CREATE OR REPLACE FUNCTION public.reject_speech_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'speech consent records are append-only';
END;
$$;

DROP TRIGGER IF EXISTS reject_speech_consent_update_delete
  ON public.speech_consent_records;
CREATE TRIGGER reject_speech_consent_update_delete
  BEFORE UPDATE OR DELETE ON public.speech_consent_records
  FOR EACH ROW EXECUTE FUNCTION public.reject_speech_ledger_mutation();

CREATE OR REPLACE VIEW public.current_speech_consent AS
WITH effective_events AS (
  SELECT
    record.*,
    row_number() OVER (
      PARTITION BY record.speaker_id
      ORDER BY record.version DESC
    ) AS event_rank
  FROM public.speech_consent_records record
  WHERE record.effective_at <= CURRENT_TIMESTAMP
)
SELECT *
FROM effective_events
WHERE event_rank = 1
  AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);

ALTER TABLE public.recordings
  ADD COLUMN IF NOT EXISTS speech_consent_record_id UUID
  REFERENCES public.speech_consent_records(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.speech_recording_sessions (
  id UUID PRIMARY KEY,
  speaker_id UUID NOT NULL REFERENCES public.speaker_profiles(id) ON DELETE RESTRICT,
  language_id UUID NOT NULL REFERENCES public.languages(id) ON DELETE RESTRICT,
  consent_record_id UUID NOT NULL REFERENCES public.speech_consent_records(id) ON DELETE RESTRICT,
  condition TEXT NOT NULL CHECK (btrim(condition) <> ''),
  variety TEXT,
  device_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.sentence_recordings
  ADD COLUMN IF NOT EXISTS speech_consent_record_id UUID
  REFERENCES public.speech_consent_records(id) ON DELETE RESTRICT;
ALTER TABLE public.sentence_recordings
  ADD COLUMN IF NOT EXISTS speech_session_id UUID
  REFERENCES public.speech_recording_sessions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS recordings_speech_consent_idx
  ON public.recordings (speech_consent_record_id)
  WHERE speech_consent_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sentence_recordings_speech_consent_idx
  ON public.sentence_recordings (speech_consent_record_id)
  WHERE speech_consent_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sentence_recordings_speech_session_idx
  ON public.sentence_recordings (speech_session_id)
  WHERE speech_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.speech_transcript_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sentence_recording_id UUID NOT NULL
    REFERENCES public.sentence_recordings(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'single_review', 'adjudicated', 'rejected')),
  transcript TEXT NOT NULL CHECK (btrim(transcript) <> ''),
  orthography_version TEXT NOT NULL CHECK (btrim(orthography_version) <> ''),
  reviewer_ids TEXT[] NOT NULL CHECK (cardinality(reviewer_ids) > 0),
  supersedes_id UUID REFERENCES public.speech_transcript_events(id) ON DELETE RESTRICT,
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (sentence_recording_id, version),
  CHECK (status <> 'adjudicated' OR cardinality(reviewer_ids) >= 2)
);

CREATE INDEX IF NOT EXISTS speech_transcript_events_recording_version_idx
  ON public.speech_transcript_events (sentence_recording_id, version DESC);

CREATE OR REPLACE FUNCTION public.validate_speech_transcript_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  latest_id UUID;
  latest_version INTEGER;
  distinct_reviewer_count INTEGER;
BEGIN
  PERFORM 1
    FROM public.sentence_recordings
    WHERE id = NEW.sentence_recording_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'speech transcript recording does not exist';
  END IF;

  SELECT id, version
    INTO latest_id, latest_version
    FROM public.speech_transcript_events
    WHERE sentence_recording_id = NEW.sentence_recording_id
    ORDER BY version DESC
    LIMIT 1;

  IF latest_id IS NULL THEN
    IF NEW.version <> 1 OR NEW.supersedes_id IS NOT NULL THEN
      RAISE EXCEPTION 'first speech transcript event must be version 1';
    END IF;
  ELSE
    IF NEW.version <> latest_version + 1 OR NEW.supersedes_id IS DISTINCT FROM latest_id THEN
      RAISE EXCEPTION 'speech transcript event must supersede the latest version';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(NEW.reviewer_ids) AS reviewer_id
    WHERE btrim(reviewer_id) = ''
  ) THEN
    RAISE EXCEPTION 'speech transcript reviewer ids cannot be blank';
  END IF;

  SELECT count(DISTINCT reviewer_id)
    INTO distinct_reviewer_count
    FROM unnest(NEW.reviewer_ids) AS reviewer_id;
  IF NEW.status = 'adjudicated' AND distinct_reviewer_count < 2 THEN
    RAISE EXCEPTION 'adjudicated speech transcripts require two distinct reviewers';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_speech_transcript_event_insert
  ON public.speech_transcript_events;
CREATE TRIGGER validate_speech_transcript_event_insert
  BEFORE INSERT ON public.speech_transcript_events
  FOR EACH ROW EXECUTE FUNCTION public.validate_speech_transcript_event();

DROP TRIGGER IF EXISTS reject_speech_transcript_update_delete
  ON public.speech_transcript_events;
CREATE TRIGGER reject_speech_transcript_update_delete
  BEFORE UPDATE OR DELETE ON public.speech_transcript_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_speech_ledger_mutation();

CREATE OR REPLACE VIEW public.current_speech_transcript AS
SELECT *
FROM (
  SELECT
    event.*,
    row_number() OVER (
      PARTITION BY event.sentence_recording_id
      ORDER BY event.version DESC
    ) AS event_rank
  FROM public.speech_transcript_events event
) ranked
WHERE event_rank = 1;

COMMENT ON TABLE public.speech_consent_records IS
  'Append-only, purpose-specific speech permission events. Absence or withdrawal means no ASR/TTS authorization.';
COMMENT ON VIEW public.current_speech_consent IS
  'Latest effective speech-consent event per speaker; withdrawal remains visible with every right false.';
COMMENT ON COLUMN public.speech_consent_records.speaker_voice_replication_allowed IS
  'Separate permission for a recognizably speaker-like synthetic voice; TTS training alone does not imply this.';
COMMENT ON COLUMN public.sentence_recordings.speech_consent_record_id IS
  'Exact consent event in force when this sentence recording was captured; NULL legacy rows authorize nothing.';
COMMENT ON TABLE public.speech_recording_sessions IS
  'Stable recording-session provenance used to prevent session leakage across speech benchmark splits.';
COMMENT ON TABLE public.speech_transcript_events IS
  'Append-only transcript review/adjudication chain; promotion benchmarks require the current adjudicated event.';
