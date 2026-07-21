-- Living control files change as a language program advances. Preserve each
-- content identity append-only while keeping datasets, benchmarks, models, and
-- frozen reports immutable under their original artifact keys.

ALTER TABLE public.language_program_artifacts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS public.language_program_artifact_revisions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  artifact_id UUID NOT NULL
    REFERENCES public.language_program_artifacts(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  stage_key TEXT NOT NULL,
  source_id UUID REFERENCES public.language_program_sources(id) ON DELETE RESTRICT,
  artifact_kind TEXT NOT NULL,
  relative_path TEXT,
  external_uri TEXT,
  media_type TEXT,
  sha256 VARCHAR(64) CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  row_count BIGINT CHECK (row_count IS NULL OR row_count >= 0),
  byte_count BIGINT CHECK (byte_count IS NULL OR byte_count >= 0),
  status TEXT NOT NULL,
  immutable BOOLEAN NOT NULL,
  generated_by TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (artifact_id, revision),
  CHECK (relative_path IS NOT NULL OR external_uri IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS language_program_artifact_revisions_artifact_time_idx
  ON public.language_program_artifact_revisions (artifact_id, recorded_at DESC);

INSERT INTO public.language_program_artifact_revisions (
  artifact_id, revision, stage_key, source_id, artifact_kind, relative_path,
  external_uri, media_type, sha256, row_count, byte_count, status, immutable,
  generated_by, metadata, recorded_at
)
SELECT artifact.id, 1, artifact.stage_key, artifact.source_id,
       artifact.artifact_kind, artifact.relative_path, artifact.external_uri,
       artifact.media_type, artifact.sha256, artifact.row_count,
       artifact.byte_count, artifact.status, artifact.immutable,
       artifact.generated_by, artifact.metadata, artifact.created_at
FROM public.language_program_artifacts artifact
WHERE NOT EXISTS (
  SELECT 1
  FROM public.language_program_artifact_revisions revision
  WHERE revision.artifact_id = artifact.id
);

CREATE OR REPLACE FUNCTION public.record_language_program_artifact_revision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_revision INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(
      OLD.stage_key, OLD.source_id, OLD.artifact_kind, OLD.relative_path,
      OLD.external_uri, OLD.media_type, OLD.sha256, OLD.row_count,
      OLD.byte_count, OLD.status, OLD.immutable, OLD.generated_by, OLD.metadata
    ) IS NOT DISTINCT FROM ROW(
      NEW.stage_key, NEW.source_id, NEW.artifact_kind, NEW.relative_path,
      NEW.external_uri, NEW.media_type, NEW.sha256, NEW.row_count,
      NEW.byte_count, NEW.status, NEW.immutable, NEW.generated_by, NEW.metadata
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT COALESCE(max(revision), 0) + 1
    INTO next_revision
  FROM public.language_program_artifact_revisions
  WHERE artifact_id = NEW.id;

  INSERT INTO public.language_program_artifact_revisions (
    artifact_id, revision, stage_key, source_id, artifact_kind, relative_path,
    external_uri, media_type, sha256, row_count, byte_count, status,
    immutable, generated_by, metadata
  ) VALUES (
    NEW.id, next_revision, NEW.stage_key, NEW.source_id, NEW.artifact_kind,
    NEW.relative_path, NEW.external_uri, NEW.media_type, NEW.sha256,
    NEW.row_count, NEW.byte_count, NEW.status, NEW.immutable, NEW.generated_by,
    NEW.metadata
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_language_program_artifact_revision_write
  ON public.language_program_artifacts;
CREATE TRIGGER record_language_program_artifact_revision_write
  AFTER INSERT OR UPDATE ON public.language_program_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.record_language_program_artifact_revision();

CREATE OR REPLACE FUNCTION public.reject_language_program_artifact_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'language program artifact revisions are append-only';
END;
$$;

DROP TRIGGER IF EXISTS reject_language_program_artifact_revision_update_delete
  ON public.language_program_artifact_revisions;
CREATE TRIGGER reject_language_program_artifact_revision_update_delete
  BEFORE UPDATE OR DELETE ON public.language_program_artifact_revisions
  FOR EACH ROW EXECUTE FUNCTION public.reject_language_program_artifact_revision_mutation();

UPDATE public.language_program_artifacts
SET immutable = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE immutable
  AND artifact_kind IN (
    'program_state',
    'canonical_work_log',
    'source_ledger',
    'checklist_state',
    'corpus_requirements',
    'experiment_registry',
    'model_registry',
    'benchmark_registry',
    'benchmark_run_registry',
    'validated_registry_loader',
    'database_sync_command',
    'registry_integrity_test'
  );

CREATE OR REPLACE FUNCTION public.enforce_language_program_artifact_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    OLD.playbook_key, OLD.stage_key, OLD.source_id, OLD.artifact_key,
    OLD.artifact_kind, OLD.relative_path, OLD.external_uri, OLD.media_type,
    OLD.immutable, OLD.generated_by
  ) IS DISTINCT FROM ROW(
    NEW.playbook_key, NEW.stage_key, NEW.source_id, NEW.artifact_key,
    NEW.artifact_kind, NEW.relative_path, NEW.external_uri, NEW.media_type,
    NEW.immutable, NEW.generated_by
  ) THEN
    RAISE EXCEPTION 'language program artifact identity and location are immutable';
  END IF;

  IF OLD.immutable AND ROW(
    OLD.sha256, OLD.row_count, OLD.byte_count
  ) IS DISTINCT FROM ROW(
    NEW.sha256, NEW.row_count, NEW.byte_count
  ) THEN
    RAISE EXCEPTION 'immutable language program artifact content cannot change';
  END IF;

  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_language_program_artifact_identity_update
  ON public.language_program_artifacts;
CREATE TRIGGER enforce_language_program_artifact_identity_update
  BEFORE UPDATE ON public.language_program_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_language_program_artifact_identity();

CREATE OR REPLACE VIEW public.language_program_artifact_revision_summary AS
SELECT
  artifact.id AS artifact_id,
  artifact.program_id,
  artifact.artifact_key,
  artifact.artifact_kind,
  artifact.immutable,
  artifact.sha256 AS current_sha256,
  count(revision.id) AS revision_count,
  min(revision.recorded_at) AS first_recorded_at,
  max(revision.recorded_at) AS last_recorded_at
FROM public.language_program_artifacts artifact
LEFT JOIN public.language_program_artifact_revisions revision
  ON revision.artifact_id = artifact.id
GROUP BY artifact.id;
