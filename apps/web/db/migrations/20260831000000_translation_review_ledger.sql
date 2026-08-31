-- Append-only, text-free review accounting for human translation requests.
-- Raw request text remains governed by the existing retention job. This ledger
-- keeps only enough identity and provenance to count and audit reviews.

CREATE TABLE IF NOT EXISTS public.translation_review_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key TEXT NOT NULL UNIQUE,
  language_scope TEXT NOT NULL,
  reviewer_kind TEXT NOT NULL,
  method TEXT NOT NULL,
  method_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'running', 'complete', 'failed', 'cancelled')),
  cutoff_at TIMESTAMPTZ,
  expected_subject_count BIGINT CHECK (expected_subject_count IS NULL OR expected_subject_count >= 0),
  reviewed_subject_count BIGINT NOT NULL DEFAULT 0 CHECK (reviewed_subject_count >= 0),
  source_artifact_path TEXT,
  source_artifact_sha256 VARCHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (source_artifact_sha256 IS NULL OR source_artifact_sha256 ~ '^[0-9a-f]{64}$'),
  CHECK (completed_at IS NULL OR started_at IS NOT NULL),
  CHECK (status <> 'complete' OR completed_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.translation_review_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID UNIQUE REFERENCES public.translation_requests(id) ON DELETE SET NULL,
  request_ref UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  legacy_audit_ref VARCHAR(64) UNIQUE,
  language_code TEXT NOT NULL,
  kind TEXT NOT NULL,
  source TEXT,
  request_status TEXT,
  model TEXT,
  request_created_at TIMESTAMPTZ NOT NULL,
  input_char_count INTEGER NOT NULL CHECK (input_char_count >= 0),
  output_char_count INTEGER CHECK (output_char_count IS NULL OR output_char_count >= 0),
  raw_deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (legacy_audit_ref IS NULL OR legacy_audit_ref ~ '^[0-9a-f]{64}$')
);

COMMENT ON TABLE public.translation_review_subjects IS
  'Text-free stable identities for retained translation requests; raw input and output are never copied here.';

CREATE INDEX IF NOT EXISTS translation_review_subjects_language_created_idx
  ON public.translation_review_subjects (language_code, request_created_at, id);

CREATE TABLE IF NOT EXISTS public.translation_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES public.translation_review_subjects(id) ON DELETE RESTRICT,
  run_id UUID REFERENCES public.translation_review_runs(id) ON DELETE RESTRICT,
  reviewer_kind TEXT NOT NULL,
  reviewer_identity TEXT,
  method TEXT NOT NULL,
  method_version TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (
    decision IN (
      'supported',
      'partially_supported',
      'contradicted',
      'unverified',
      'error',
      'not_translation',
      'not_reviewable'
    )
  ),
  evidence_tier TEXT,
  category TEXT,
  confidence DOUBLE PRECISION CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  findings JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_artifact_path TEXT,
  source_artifact_sha256 VARCHAR(64),
  supersedes_event_id UUID REFERENCES public.translation_review_events(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL UNIQUE,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (source_artifact_sha256 IS NULL OR source_artifact_sha256 ~ '^[0-9a-f]{64}$'),
  CHECK (jsonb_typeof(evidence_refs) = 'array'),
  CHECK (jsonb_typeof(findings) = 'object'),
  CHECK (supersedes_event_id IS NULL OR supersedes_event_id <> id)
);

COMMENT ON TABLE public.translation_review_events IS
  'Append-only review evidence. Corrections add a new event linked with supersedes_event_id; prior judgments are never overwritten.';

CREATE INDEX IF NOT EXISTS translation_review_events_subject_reviewed_idx
  ON public.translation_review_events (subject_id, reviewed_at, id);

CREATE INDEX IF NOT EXISTS translation_review_events_run_idx
  ON public.translation_review_events (run_id, subject_id);

CREATE OR REPLACE FUNCTION public.create_translation_review_subject()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.kind = 'translate' THEN
    INSERT INTO public.translation_review_subjects (
      request_id,
      language_code,
      kind,
      source,
      request_status,
      model,
      request_created_at,
      input_char_count,
      output_char_count
    ) VALUES (
      NEW.id,
      COALESCE(NULLIF(NEW.language_code, ''), 'unknown'),
      NEW.kind,
      NEW.source,
      NEW.status,
      NEW.model,
      NEW.created_at,
      char_length(NEW.input_text),
      CASE WHEN NEW.output_text IS NULL THEN NULL ELSE char_length(NEW.output_text) END
    )
    ON CONFLICT (request_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS translation_requests_create_review_subject
  ON public.translation_requests;
CREATE TRIGGER translation_requests_create_review_subject
AFTER INSERT ON public.translation_requests
FOR EACH ROW EXECUTE FUNCTION public.create_translation_review_subject();

CREATE OR REPLACE FUNCTION public.mark_translation_review_subject_raw_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.translation_review_subjects
     SET raw_deleted_at = COALESCE(raw_deleted_at, CURRENT_TIMESTAMP)
   WHERE request_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS translation_requests_mark_review_subject_raw_deleted
  ON public.translation_requests;
CREATE TRIGGER translation_requests_mark_review_subject_raw_deleted
BEFORE DELETE ON public.translation_requests
FOR EACH ROW EXECUTE FUNCTION public.mark_translation_review_subject_raw_deleted();

CREATE OR REPLACE FUNCTION public.reject_translation_review_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'translation review events are append-only; add a superseding event instead';
END;
$$;

DROP TRIGGER IF EXISTS translation_review_events_append_only
  ON public.translation_review_events;
CREATE TRIGGER translation_review_events_append_only
BEFORE UPDATE OR DELETE ON public.translation_review_events
FOR EACH ROW EXECUTE FUNCTION public.reject_translation_review_event_mutation();

CREATE OR REPLACE FUNCTION public.validate_translation_review_supersession()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  prior_subject_id UUID;
BEGIN
  IF NEW.supersedes_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT subject_id
    INTO prior_subject_id
    FROM public.translation_review_events
   WHERE id = NEW.supersedes_event_id;

  IF prior_subject_id IS DISTINCT FROM NEW.subject_id THEN
    RAISE EXCEPTION 'a translation review event may supersede only an event for the same subject';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS translation_review_events_validate_supersession
  ON public.translation_review_events;
CREATE TRIGGER translation_review_events_validate_supersession
BEFORE INSERT ON public.translation_review_events
FOR EACH ROW EXECUTE FUNCTION public.validate_translation_review_supersession();

-- Establish subjects for every retained human translation before any review
-- importer runs. The raw text is measured but never copied into the ledger.
INSERT INTO public.translation_review_subjects (
  request_id,
  language_code,
  kind,
  source,
  request_status,
  model,
  request_created_at,
  input_char_count,
  output_char_count
)
SELECT
  request.id,
  COALESCE(NULLIF(request.language_code, ''), 'unknown'),
  request.kind,
  request.source,
  request.status,
  request.model,
  request.created_at,
  char_length(request.input_text),
  CASE WHEN request.output_text IS NULL THEN NULL ELSE char_length(request.output_text) END
FROM public.translation_requests AS request
WHERE request.kind = 'translate'
ON CONFLICT (request_id) DO NOTHING;

CREATE OR REPLACE VIEW public.current_translation_review_events AS
SELECT event.*
FROM public.translation_review_events AS event
WHERE NOT EXISTS (
  SELECT 1
  FROM public.translation_review_events AS replacement
  WHERE replacement.supersedes_event_id = event.id
);

CREATE OR REPLACE VIEW public.translation_review_subject_status AS
SELECT
  subject.id AS subject_id,
  subject.request_ref,
  subject.request_id,
  subject.language_code,
  subject.request_created_at,
  subject.raw_deleted_at,
  COUNT(event.id)::BIGINT AS review_count,
  COUNT(DISTINCT (event.reviewer_kind, COALESCE(event.reviewer_identity, ''), event.method, event.method_version))::BIGINT
    AS independent_review_count,
  COUNT(event.id) FILTER (
    WHERE event.reviewer_kind IN ('qualified_speaker_review', 'community_authority_review')
  )::BIGINT AS qualified_review_count,
  COUNT(event.id) FILTER (WHERE event.reviewer_kind = 'automated_evidence_audit')::BIGINT
    AS automated_review_count,
  COUNT(current_event.id)::BIGINT AS current_review_count,
  (COUNT(current_event.id) FILTER (WHERE current_event.decision = 'supported') > 0
    AND COUNT(current_event.id) FILTER (WHERE current_event.decision = 'contradicted') > 0)
    AS has_current_disagreement,
  latest.decision AS latest_decision,
  latest.reviewed_at AS latest_reviewed_at
FROM public.translation_review_subjects AS subject
LEFT JOIN public.translation_review_events AS event
  ON event.subject_id = subject.id
LEFT JOIN public.current_translation_review_events AS current_event
  ON current_event.id = event.id
LEFT JOIN LATERAL (
  SELECT current_latest.decision, current_latest.reviewed_at
  FROM public.current_translation_review_events AS current_latest
  WHERE current_latest.subject_id = subject.id
  ORDER BY current_latest.reviewed_at DESC, current_latest.id DESC
  LIMIT 1
) AS latest ON TRUE
GROUP BY
  subject.id,
  subject.request_ref,
  subject.request_id,
  subject.language_code,
  subject.request_created_at,
  subject.raw_deleted_at,
  latest.decision,
  latest.reviewed_at;

CREATE OR REPLACE VIEW public.translation_review_archive_gaps AS
WITH archived AS (
  SELECT
    COALESCE(NULLIF(language_code, ''), 'unknown') AS language_code,
    SUM(request_count)::BIGINT AS archived_request_count,
    MIN(activity_date) AS earliest_activity_date,
    MAX(activity_date) AS latest_activity_date
  FROM public.translation_request_daily_metrics
  WHERE kind = 'translate'
  GROUP BY COALESCE(NULLIF(language_code, ''), 'unknown')
), individually_tracked AS (
  SELECT language_code, COUNT(*)::BIGINT AS tracked_raw_deleted_count
  FROM public.translation_review_subjects
  WHERE raw_deleted_at IS NOT NULL
  GROUP BY language_code
)
SELECT
  archived.language_code,
  archived.archived_request_count,
  COALESCE(individually_tracked.tracked_raw_deleted_count, 0)::BIGINT AS tracked_raw_deleted_count,
  GREATEST(
    archived.archived_request_count - COALESCE(individually_tracked.tracked_raw_deleted_count, 0),
    0
  )::BIGINT AS privacy_pruned_request_count,
  archived.earliest_activity_date,
  archived.latest_activity_date,
  FALSE AS individually_reviewable
FROM archived
LEFT JOIN individually_tracked USING (language_code);

CREATE OR REPLACE VIEW public.translation_review_language_coverage AS
WITH retained AS (
  SELECT
    status.language_code,
    COUNT(*)::BIGINT AS individual_subject_count,
    COUNT(*) FILTER (WHERE status.request_id IS NOT NULL)::BIGINT AS raw_available_subject_count,
    COUNT(*) FILTER (WHERE status.raw_deleted_at IS NOT NULL)::BIGINT AS raw_deleted_subject_count,
    COUNT(*) FILTER (WHERE status.review_count >= 1)::BIGINT AS reviewed_once_count,
    COUNT(*) FILTER (WHERE status.independent_review_count >= 2)::BIGINT AS reviewed_twice_count,
    COUNT(*) FILTER (WHERE status.independent_review_count >= 3)::BIGINT AS reviewed_three_plus_count,
    COUNT(*) FILTER (WHERE status.qualified_review_count >= 1)::BIGINT AS qualified_review_count,
    COUNT(*) FILTER (WHERE status.has_current_disagreement)::BIGINT AS current_disagreement_count,
    COALESCE(SUM(status.review_count), 0)::BIGINT AS total_review_event_count
  FROM public.translation_review_subject_status AS status
  GROUP BY status.language_code
), languages AS (
  SELECT language_code FROM retained
  UNION
  SELECT language_code FROM public.translation_review_archive_gaps
)
SELECT
  languages.language_code,
  COALESCE(retained.individual_subject_count, 0)::BIGINT AS individual_subject_count,
  COALESCE(retained.raw_available_subject_count, 0)::BIGINT AS raw_available_subject_count,
  COALESCE(retained.raw_deleted_subject_count, 0)::BIGINT AS raw_deleted_subject_count,
  COALESCE(retained.reviewed_once_count, 0)::BIGINT AS reviewed_once_count,
  COALESCE(retained.reviewed_twice_count, 0)::BIGINT AS reviewed_twice_count,
  COALESCE(retained.reviewed_three_plus_count, 0)::BIGINT AS reviewed_three_plus_count,
  COALESCE(retained.qualified_review_count, 0)::BIGINT AS qualified_review_count,
  COALESCE(retained.current_disagreement_count, 0)::BIGINT AS current_disagreement_count,
  COALESCE(retained.total_review_event_count, 0)::BIGINT AS total_review_event_count,
  COALESCE(gaps.privacy_pruned_request_count, 0)::BIGINT AS privacy_pruned_request_count,
  (COALESCE(retained.individual_subject_count, 0) + COALESCE(gaps.privacy_pruned_request_count, 0))::BIGINT
    AS known_lifetime_request_count
FROM languages
LEFT JOIN retained USING (language_code)
LEFT JOIN public.translation_review_archive_gaps AS gaps USING (language_code);

COMMENT ON VIEW public.translation_review_language_coverage IS
  'Per-language review depth for individually tracked requests plus explicit aggregate gaps for privacy-pruned requests that can no longer be reviewed individually.';
