CREATE INDEX IF NOT EXISTS translation_review_events_supersedes_idx
  ON public.translation_review_events (supersedes_event_id)
  WHERE supersedes_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS translation_review_events_subject_method_idx
  ON public.translation_review_events (
    subject_id,
    reviewer_kind,
    reviewer_identity,
    method,
    method_version,
    reviewed_at DESC,
    id DESC
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
  COUNT(DISTINCT (event.reviewer_kind, COALESCE(event.reviewer_identity, '')))::BIGINT
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
  latest.reviewed_at AS latest_reviewed_at,
  COUNT(DISTINCT (event.reviewer_kind, COALESCE(event.reviewer_identity, ''), event.method, event.method_version))::BIGINT
    AS distinct_review_method_count
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

COMMENT ON COLUMN public.translation_review_subject_status.independent_review_count IS
  'Distinct reviewer identities/kinds; repeat runs by the same reviewer do not inflate this count.';

COMMENT ON COLUMN public.translation_review_subject_status.distinct_review_method_count IS
  'Distinct reviewer and method-version combinations represented in append-only history.';

CREATE OR REPLACE VIEW public.translation_review_language_coverage AS
WITH retained AS (
  SELECT
    status.language_code,
    COUNT(*)::BIGINT AS individual_subject_count,
    COUNT(*) FILTER (WHERE status.request_id IS NOT NULL)::BIGINT AS raw_available_subject_count,
    COUNT(*) FILTER (WHERE status.raw_deleted_at IS NOT NULL)::BIGINT AS raw_deleted_subject_count,
    COUNT(*) FILTER (WHERE status.review_count >= 1)::BIGINT AS reviewed_once_count,
    COUNT(*) FILTER (WHERE status.review_count >= 2)::BIGINT AS reviewed_twice_count,
    COUNT(*) FILTER (WHERE status.review_count >= 3)::BIGINT AS reviewed_three_plus_count,
    COUNT(*) FILTER (WHERE status.qualified_review_count >= 1)::BIGINT AS qualified_review_count,
    COUNT(*) FILTER (WHERE status.has_current_disagreement)::BIGINT AS current_disagreement_count,
    COALESCE(SUM(status.review_count), 0)::BIGINT AS total_review_event_count,
    COUNT(*) FILTER (WHERE status.distinct_review_method_count >= 2)::BIGINT
      AS distinct_method_two_plus_count,
    COUNT(*) FILTER (WHERE status.independent_review_count >= 2)::BIGINT
      AS independent_reviewer_two_plus_count
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
    AS known_lifetime_request_count,
  COALESCE(retained.distinct_method_two_plus_count, 0)::BIGINT AS distinct_method_two_plus_count,
  COALESCE(retained.independent_reviewer_two_plus_count, 0)::BIGINT
    AS independent_reviewer_two_plus_count
FROM languages
LEFT JOIN retained USING (language_code)
LEFT JOIN public.translation_review_archive_gaps AS gaps USING (language_code);

CREATE OR REPLACE VIEW public.translation_review_unreviewed_queue AS
SELECT
  subject.id AS subject_id,
  subject.request_ref,
  subject.language_code,
  subject.kind,
  subject.source,
  subject.request_status,
  subject.model,
  subject.request_created_at,
  subject.input_char_count,
  subject.output_char_count,
  subject.raw_deleted_at
FROM public.translation_review_subjects AS subject
WHERE NOT EXISTS (
  SELECT 1
  FROM public.translation_review_events AS event
  WHERE event.subject_id = subject.id
)
ORDER BY subject.request_created_at, subject.id;

COMMENT ON VIEW public.translation_review_unreviewed_queue IS
  'Text-free oldest-first queue of individually trackable translations with zero review events.';
