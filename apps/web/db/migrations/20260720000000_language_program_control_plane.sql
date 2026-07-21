-- Versioned control plane for taking a low-resource language from source
-- discovery through dictionary, corpus, model, speech, and release gates.

CREATE TABLE IF NOT EXISTS public.language_program_playbooks (
  playbook_key TEXT PRIMARY KEY CHECK (btrim(playbook_key) <> ''),
  version INTEGER NOT NULL CHECK (version > 0),
  title TEXT NOT NULL CHECK (btrim(title) <> ''),
  source_path TEXT NOT NULL CHECK (btrim(source_path) <> ''),
  source_sha256 VARCHAR(64) NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'superseded', 'withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (playbook_key, version)
);

CREATE TABLE IF NOT EXISTS public.language_program_stage_definitions (
  playbook_key TEXT NOT NULL
    REFERENCES public.language_program_playbooks(playbook_key) ON DELETE RESTRICT,
  stage_key TEXT NOT NULL CHECK (stage_key ~ '^[a-z][a-z0-9_]*$'),
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  title TEXT NOT NULL CHECK (btrim(title) <> ''),
  objective TEXT NOT NULL CHECK (btrim(objective) <> ''),
  pass_rule TEXT NOT NULL CHECK (btrim(pass_rule) <> ''),
  PRIMARY KEY (playbook_key, stage_key),
  UNIQUE (playbook_key, sequence)
);

CREATE TABLE IF NOT EXISTS public.language_program_checklist_definitions (
  playbook_key TEXT NOT NULL,
  item_key TEXT NOT NULL CHECK (item_key ~ '^[a-z][a-z0-9_.]*$'),
  stage_key TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  title TEXT NOT NULL CHECK (btrim(title) <> ''),
  verification_rule TEXT NOT NULL CHECK (btrim(verification_rule) <> ''),
  required_output_kind TEXT,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  blocks_paid_compute BOOLEAN NOT NULL DEFAULT FALSE,
  blocks_release BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (playbook_key, item_key),
  UNIQUE (playbook_key, stage_key, sequence),
  FOREIGN KEY (playbook_key, stage_key)
    REFERENCES public.language_program_stage_definitions(playbook_key, stage_key)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.language_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_key TEXT UNIQUE NOT NULL CHECK (program_key ~ '^[a-z0-9][a-z0-9-]*$'),
  language_id UUID NOT NULL REFERENCES public.languages(id) ON DELETE RESTRICT,
  playbook_key TEXT NOT NULL
    REFERENCES public.language_program_playbooks(playbook_key) ON DELETE RESTRICT,
  program_version INTEGER NOT NULL CHECK (program_version > 0),
  primary_variety TEXT NOT NULL CHECK (btrim(primary_variety) <> ''),
  primary_orthography TEXT NOT NULL CHECK (btrim(primary_orthography) <> ''),
  primary_direction TEXT NOT NULL CHECK (btrim(primary_direction) <> ''),
  source_language_token TEXT,
  target_language_token TEXT,
  claim_target TEXT NOT NULL DEFAULT 'research_only'
    CHECK (claim_target IN ('inventory_only', 'research_only', 'limited_public', 'production')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('planning', 'active', 'paused', 'blocked', 'complete', 'superseded')),
  program_root TEXT NOT NULL CHECK (btrim(program_root) <> ''),
  charter_path TEXT NOT NULL CHECK (btrim(charter_path) <> ''),
  charter_sha256 VARCHAR(64) NOT NULL CHECK (charter_sha256 ~ '^[0-9a-f]{64}$'),
  state_path TEXT NOT NULL CHECK (btrim(state_path) <> ''),
  state_sha256 VARCHAR(64) NOT NULL CHECK (state_sha256 ~ '^[0-9a-f]{64}$'),
  run_log_path TEXT NOT NULL CHECK (btrim(run_log_path) <> ''),
  current_stage_key TEXT NOT NULL,
  next_action TEXT NOT NULL CHECK (btrim(next_action) <> ''),
  paid_gpu_authorized BOOLEAN NOT NULL DEFAULT FALSE,
  public_release_authorized BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, playbook_key),
  FOREIGN KEY (playbook_key, current_stage_key)
    REFERENCES public.language_program_stage_definitions(playbook_key, stage_key)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.language_program_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.language_programs(id) ON DELETE RESTRICT,
  source_key TEXT NOT NULL CHECK (btrim(source_key) <> ''),
  title TEXT NOT NULL CHECK (btrim(title) <> ''),
  source_type TEXT NOT NULL CHECK (btrim(source_type) <> ''),
  url TEXT,
  catalog_id TEXT,
  local_path TEXT,
  sha256 VARCHAR(64) CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  archive_status TEXT NOT NULL
    CHECK (archive_status IN ('catalogued', 'partial', 'archived', 'verified', 'excluded', 'superseded')),
  license TEXT NOT NULL DEFAULT 'unknown',
  training_use TEXT NOT NULL
    CHECK (training_use IN ('unknown', 'allowed', 'not_allowed', 'needs_review')),
  redistribution TEXT NOT NULL
    CHECK (redistribution IN ('unknown', 'allowed', 'not_allowed', 'needs_review')),
  derived_weights TEXT NOT NULL
    CHECK (derived_weights IN ('unknown', 'allowed', 'not_allowed', 'needs_review')),
  hosted_transfer TEXT NOT NULL
    CHECK (hosted_transfer IN ('unknown', 'allowed', 'not_allowed', 'needs_review')),
  varieties TEXT[] NOT NULL DEFAULT '{}',
  orthographies TEXT[] NOT NULL DEFAULT '{}',
  contains_translation BOOLEAN NOT NULL DEFAULT FALSE,
  contains_igt BOOLEAN NOT NULL DEFAULT FALSE,
  contains_audio BOOLEAN NOT NULL DEFAULT FALSE,
  inventory JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  retrieved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (program_id, source_key),
  CHECK (archive_status NOT IN ('archived', 'verified') OR (local_path IS NOT NULL AND sha256 IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.language_program_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL,
  playbook_key TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  source_id UUID REFERENCES public.language_program_sources(id) ON DELETE RESTRICT,
  artifact_key TEXT NOT NULL CHECK (btrim(artifact_key) <> ''),
  artifact_kind TEXT NOT NULL CHECK (btrim(artifact_kind) <> ''),
  relative_path TEXT,
  external_uri TEXT,
  media_type TEXT,
  sha256 VARCHAR(64) CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  row_count BIGINT CHECK (row_count IS NULL OR row_count >= 0),
  byte_count BIGINT CHECK (byte_count IS NULL OR byte_count >= 0),
  status TEXT NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'verified', 'superseded', 'deleted_after_evaluation', 'withdrawn')),
  immutable BOOLEAN NOT NULL DEFAULT TRUE,
  generated_by TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (program_id, artifact_key),
  FOREIGN KEY (program_id, playbook_key)
    REFERENCES public.language_programs(id, playbook_key) ON DELETE RESTRICT,
  FOREIGN KEY (playbook_key, stage_key)
    REFERENCES public.language_program_stage_definitions(playbook_key, stage_key) ON DELETE RESTRICT,
  CHECK (relative_path IS NOT NULL OR external_uri IS NOT NULL),
  CHECK (status <> 'verified' OR sha256 IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.language_program_stage_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL,
  playbook_key TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'pass', 'fail', 'blocked', 'not_applicable', 'superseded')),
  evidence_summary TEXT,
  gate_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (program_id, stage_key),
  FOREIGN KEY (program_id, playbook_key)
    REFERENCES public.language_programs(id, playbook_key) ON DELETE RESTRICT,
  FOREIGN KEY (playbook_key, stage_key)
    REFERENCES public.language_program_stage_definitions(playbook_key, stage_key) ON DELETE RESTRICT,
  CHECK (status <> 'pass' OR btrim(COALESCE(evidence_summary, '')) <> '')
);

CREATE TABLE IF NOT EXISTS public.language_program_checklist_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL,
  playbook_key TEXT NOT NULL,
  item_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'pass', 'fail', 'blocked', 'not_applicable', 'superseded')),
  evidence_note TEXT,
  blocker TEXT,
  checked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (program_id, item_key),
  FOREIGN KEY (program_id, playbook_key)
    REFERENCES public.language_programs(id, playbook_key) ON DELETE RESTRICT,
  FOREIGN KEY (playbook_key, item_key)
    REFERENCES public.language_program_checklist_definitions(playbook_key, item_key) ON DELETE RESTRICT,
  CHECK (status <> 'pass' OR btrim(COALESCE(evidence_note, '')) <> ''),
  CHECK (status <> 'blocked' OR btrim(COALESCE(blocker, '')) <> '')
);

CREATE TABLE IF NOT EXISTS public.language_program_checklist_evidence (
  checklist_run_id UUID NOT NULL
    REFERENCES public.language_program_checklist_runs(id) ON DELETE RESTRICT,
  artifact_id UUID NOT NULL
    REFERENCES public.language_program_artifacts(id) ON DELETE RESTRICT,
  evidence_role TEXT NOT NULL DEFAULT 'supports' CHECK (btrim(evidence_role) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (checklist_run_id, artifact_id, evidence_role)
);

CREATE TABLE IF NOT EXISTS public.language_program_corpus_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.language_programs(id) ON DELETE RESTRICT,
  requirement_key TEXT NOT NULL CHECK (btrim(requirement_key) <> ''),
  capability TEXT NOT NULL
    CHECK (capability IN ('dictionary', 'lexical_reconstruction', 'morphology', 'glossary_uptake', 'sentence_translation', 'degeneration', 'asr', 'tts')),
  evidence_unit TEXT NOT NULL CHECK (btrim(evidence_unit) <> ''),
  feature_key TEXT NOT NULL CHECK (btrim(feature_key) <> ''),
  feature_value TEXT,
  priority SMALLINT NOT NULL CHECK (priority BETWEEN 1 AND 5),
  target_count INTEGER CHECK (target_count IS NULL OR target_count >= 0),
  observed_count INTEGER NOT NULL DEFAULT 0 CHECK (observed_count >= 0),
  status TEXT NOT NULL DEFAULT 'identified'
    CHECK (status IN ('identified', 'collecting', 'met', 'blocked', 'waived', 'superseded')),
  evidence_policy TEXT NOT NULL CHECK (btrim(evidence_policy) <> ''),
  generation_policy TEXT NOT NULL CHECK (btrim(generation_policy) <> ''),
  rationale TEXT NOT NULL CHECK (btrim(rationale) <> ''),
  measurement_artifact_id UUID
    REFERENCES public.language_program_artifacts(id) ON DELETE RESTRICT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (program_id, requirement_key)
);

CREATE TABLE IF NOT EXISTS public.language_program_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.language_programs(id) ON DELETE RESTRICT,
  experiment_key TEXT NOT NULL CHECK (btrim(experiment_key) <> ''),
  title TEXT NOT NULL CHECK (btrim(title) <> ''),
  hypothesis TEXT NOT NULL CHECK (btrim(hypothesis) <> ''),
  controlled_variable TEXT NOT NULL CHECK (btrim(controlled_variable) <> ''),
  base_contract JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'preregistered', 'running', 'evaluated', 'promoted', 'failed', 'stopped', 'superseded')),
  planned_max_steps INTEGER CHECK (planned_max_steps IS NULL OR planned_max_steps > 0),
  observed_global_step INTEGER CHECK (observed_global_step IS NULL OR observed_global_step >= 0),
  seeds INTEGER[] NOT NULL DEFAULT '{}',
  token_accounting JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_compute_authorized BOOLEAN NOT NULL DEFAULT FALSE,
  provider_run_id TEXT,
  preregistration_artifact_id UUID
    REFERENCES public.language_program_artifacts(id) ON DELETE RESTRICT,
  run_contract_artifact_id UUID
    REFERENCES public.language_program_artifacts(id) ON DELETE RESTRICT,
  outcome_summary TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (program_id, experiment_key),
  CHECK (status <> 'running' OR paid_compute_authorized),
  CHECK (status NOT IN ('evaluated', 'promoted', 'failed', 'stopped') OR completed_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.language_program_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.language_programs(id) ON DELETE RESTRICT,
  model_key TEXT NOT NULL CHECK (btrim(model_key) <> ''),
  version TEXT NOT NULL CHECK (btrim(version) <> ''),
  architecture TEXT NOT NULL CHECK (btrim(architecture) <> ''),
  base_model_id TEXT,
  base_revision TEXT,
  base_sha256 VARCHAR(64) CHECK (base_sha256 IS NULL OR base_sha256 ~ '^[0-9a-f]{64}$'),
  tokenizer_sha256 VARCHAR(64) CHECK (tokenizer_sha256 IS NULL OR tokenizer_sha256 ~ '^[0-9a-f]{64}$'),
  adapter_sha256 VARCHAR(64) CHECK (adapter_sha256 IS NULL OR adapter_sha256 ~ '^[0-9a-f]{64}$'),
  merged_weights_sha256 VARCHAR(64) CHECK (merged_weights_sha256 IS NULL OR merged_weights_sha256 ~ '^[0-9a-f]{64}$'),
  task_contract JSONB NOT NULL DEFAULT '{}'::jsonb,
  decoder_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  resource_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  produced_by_experiment_id UUID
    REFERENCES public.language_program_experiments(id) ON DELETE RESTRICT,
  huggingface_repo TEXT,
  status TEXT NOT NULL
    CHECK (status IN ('candidate', 'negative_result', 'research_release', 'mounted', 'unmounted', 'withdrawn', 'deleted_after_evaluation')),
  lexical_gate_status TEXT NOT NULL DEFAULT 'not_evaluated'
    CHECK (lexical_gate_status IN ('not_evaluated', 'pass', 'fail', 'not_applicable')),
  sentence_gate_status TEXT NOT NULL DEFAULT 'not_evaluated'
    CHECK (sentence_gate_status IN ('not_evaluated', 'pass', 'fail', 'not_applicable')),
  asr_gate_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (asr_gate_status IN ('not_evaluated', 'pass', 'fail', 'not_applicable')),
  tts_gate_status TEXT NOT NULL DEFAULT 'not_applicable'
    CHECK (tts_gate_status IN ('not_evaluated', 'pass', 'fail', 'not_applicable')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (program_id, model_key, version),
  CHECK (status <> 'mounted' OR sentence_gate_status = 'pass')
);

CREATE TABLE IF NOT EXISTS public.language_program_benchmark_suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.language_programs(id) ON DELETE RESTRICT,
  suite_key TEXT NOT NULL CHECK (btrim(suite_key) <> ''),
  capability TEXT NOT NULL
    CHECK (capability IN ('dictionary_router', 'lexical_reconstruction', 'contextual_acquisition', 'morphology', 'glossary_uptake', 'sentence_translation', 'degeneration', 'decoder_damage', 'asr', 'tts')),
  role TEXT NOT NULL CHECK (role IN ('development', 'regression', 'sealed_final', 'operational')),
  sampling_unit TEXT NOT NULL CHECK (btrim(sampling_unit) <> ''),
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  artifact_id UUID NOT NULL REFERENCES public.language_program_artifacts(id) ON DELETE RESTRICT,
  sha256 VARCHAR(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  sealed BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'opened', 'superseded', 'withdrawn')),
  metric_contract JSONB NOT NULL DEFAULT '{}'::jsonb,
  claim_limit TEXT NOT NULL CHECK (btrim(claim_limit) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (program_id, suite_key),
  CHECK (role <> 'sealed_final' OR sealed)
);

CREATE TABLE IF NOT EXISTS public.language_program_benchmark_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.language_programs(id) ON DELETE RESTRICT,
  run_key TEXT NOT NULL CHECK (btrim(run_key) <> ''),
  suite_id UUID NOT NULL REFERENCES public.language_program_benchmark_suites(id) ON DELETE RESTRICT,
  model_id UUID REFERENCES public.language_program_models(id) ON DELETE RESTRICT,
  experiment_id UUID REFERENCES public.language_program_experiments(id) ON DELETE RESTRICT,
  seed INTEGER,
  decoder_policy_sha256 VARCHAR(64)
    CHECK (decoder_policy_sha256 IS NULL OR decoder_policy_sha256 ~ '^[0-9a-f]{64}$'),
  prediction_artifact_id UUID
    REFERENCES public.language_program_artifacts(id) ON DELETE RESTRICT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  gate_status TEXT NOT NULL
    CHECK (gate_status IN ('not_applicable', 'pass', 'fail', 'exploratory')),
  duration_seconds NUMERIC CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  executed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (program_id, run_key),
  CHECK (model_id IS NOT NULL OR experiment_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.language_program_release_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.language_programs(id) ON DELETE RESTRICT,
  decision_key TEXT NOT NULL CHECK (btrim(decision_key) <> ''),
  capability TEXT NOT NULL CHECK (btrim(capability) <> ''),
  route TEXT NOT NULL CHECK (btrim(route) <> ''),
  model_id UUID REFERENCES public.language_program_models(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject', 'defer', 'withdraw')),
  gate_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  rationale TEXT NOT NULL CHECK (btrim(rationale) <> ''),
  evidence_artifact_id UUID
    REFERENCES public.language_program_artifacts(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (program_id, decision_key)
);

CREATE TABLE IF NOT EXISTS public.language_program_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES public.language_programs(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (btrim(event_type) <> ''),
  entity_type TEXT NOT NULL CHECK (btrim(entity_type) <> ''),
  entity_key TEXT NOT NULL CHECK (btrim(entity_key) <> ''),
  prior_status TEXT,
  new_status TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS language_program_sources_program_type_idx
  ON public.language_program_sources (program_id, source_type, archive_status);
CREATE INDEX IF NOT EXISTS language_program_artifacts_program_stage_idx
  ON public.language_program_artifacts (program_id, stage_key, status);
CREATE INDEX IF NOT EXISTS language_program_stage_runs_status_idx
  ON public.language_program_stage_runs (program_id, status);
CREATE INDEX IF NOT EXISTS language_program_checklist_runs_status_idx
  ON public.language_program_checklist_runs (program_id, status);
CREATE INDEX IF NOT EXISTS language_program_requirements_status_idx
  ON public.language_program_corpus_requirements (program_id, capability, status, priority);
CREATE INDEX IF NOT EXISTS language_program_models_status_idx
  ON public.language_program_models (program_id, status);
CREATE INDEX IF NOT EXISTS language_program_events_program_time_idx
  ON public.language_program_events (program_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.instantiate_language_program_playbook()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.language_program_stage_runs (program_id, playbook_key, stage_key)
  SELECT NEW.id, NEW.playbook_key, definition.stage_key
  FROM public.language_program_stage_definitions definition
  WHERE definition.playbook_key = NEW.playbook_key
  ON CONFLICT (program_id, stage_key) DO NOTHING;

  INSERT INTO public.language_program_checklist_runs (program_id, playbook_key, item_key)
  SELECT NEW.id, NEW.playbook_key, definition.item_key
  FROM public.language_program_checklist_definitions definition
  WHERE definition.playbook_key = NEW.playbook_key
  ON CONFLICT (program_id, item_key) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS instantiate_language_program_playbook_insert
  ON public.language_programs;
CREATE TRIGGER instantiate_language_program_playbook_insert
  AFTER INSERT ON public.language_programs
  FOR EACH ROW EXECUTE FUNCTION public.instantiate_language_program_playbook();

CREATE OR REPLACE FUNCTION public.enforce_language_program_stage_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  incomplete_count INTEGER;
BEGIN
  IF NEW.status = 'pass' THEN
    SELECT count(*)::integer
      INTO incomplete_count
    FROM public.language_program_checklist_definitions definition
    LEFT JOIN public.language_program_checklist_runs run
      ON run.program_id = NEW.program_id
     AND run.playbook_key = definition.playbook_key
     AND run.item_key = definition.item_key
    WHERE definition.playbook_key = NEW.playbook_key
      AND definition.stage_key = NEW.stage_key
      AND definition.is_required
      AND COALESCE(run.status, 'not_started') NOT IN ('pass', 'not_applicable');
    IF incomplete_count > 0 THEN
      RAISE EXCEPTION 'stage % cannot pass with % required checklist items incomplete',
        NEW.stage_key, incomplete_count;
    END IF;
  END IF;
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_language_program_stage_gate_write
  ON public.language_program_stage_runs;
CREATE TRIGGER enforce_language_program_stage_gate_write
  BEFORE INSERT OR UPDATE ON public.language_program_stage_runs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_language_program_stage_gate();

CREATE OR REPLACE FUNCTION public.enforce_language_program_authorization()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  incomplete_count INTEGER;
BEGIN
  IF OLD.playbook_key IS DISTINCT FROM NEW.playbook_key THEN
    RAISE EXCEPTION 'a language program playbook is immutable; create a new program version';
  END IF;
  IF NEW.paid_gpu_authorized AND NOT OLD.paid_gpu_authorized THEN
    SELECT count(*)::integer INTO incomplete_count
    FROM public.language_program_checklist_definitions definition
    LEFT JOIN public.language_program_checklist_runs run
      ON run.program_id = NEW.id
     AND run.playbook_key = definition.playbook_key
     AND run.item_key = definition.item_key
    WHERE definition.playbook_key = NEW.playbook_key
      AND definition.blocks_paid_compute
      AND COALESCE(run.status, 'not_started') NOT IN ('pass', 'not_applicable');
    IF incomplete_count > 0 THEN
      RAISE EXCEPTION 'paid GPU authorization blocked by % incomplete preflight items', incomplete_count;
    END IF;
  END IF;
  IF NEW.public_release_authorized AND NOT OLD.public_release_authorized THEN
    SELECT count(*)::integer INTO incomplete_count
    FROM public.language_program_checklist_definitions definition
    LEFT JOIN public.language_program_checklist_runs run
      ON run.program_id = NEW.id
     AND run.playbook_key = definition.playbook_key
     AND run.item_key = definition.item_key
    WHERE definition.playbook_key = NEW.playbook_key
      AND definition.blocks_release
      AND COALESCE(run.status, 'not_started') NOT IN ('pass', 'not_applicable');
    IF incomplete_count > 0 THEN
      RAISE EXCEPTION 'public release authorization blocked by % incomplete release items', incomplete_count;
    END IF;
  END IF;
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_language_program_authorization_update
  ON public.language_programs;
CREATE TRIGGER enforce_language_program_authorization_update
  BEFORE UPDATE ON public.language_programs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_language_program_authorization();

CREATE OR REPLACE FUNCTION public.record_language_program_stage_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.language_program_events
      (program_id, event_type, entity_type, entity_key, prior_status, new_status, payload)
    VALUES
      (NEW.program_id, 'status_change', 'stage', NEW.stage_key,
       CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
       NEW.status, jsonb_build_object('evidence_summary', NEW.evidence_summary));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_language_program_checklist_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.language_program_events
      (program_id, event_type, entity_type, entity_key, prior_status, new_status, payload)
    VALUES
      (NEW.program_id, 'status_change', 'checklist_item', NEW.item_key,
       CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
       NEW.status, jsonb_build_object('evidence_note', NEW.evidence_note, 'blocker', NEW.blocker));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_language_program_stage_event_write
  ON public.language_program_stage_runs;
CREATE TRIGGER record_language_program_stage_event_write
  AFTER INSERT OR UPDATE ON public.language_program_stage_runs
  FOR EACH ROW EXECUTE FUNCTION public.record_language_program_stage_event();

DROP TRIGGER IF EXISTS record_language_program_checklist_event_write
  ON public.language_program_checklist_runs;
CREATE TRIGGER record_language_program_checklist_event_write
  AFTER INSERT OR UPDATE ON public.language_program_checklist_runs
  FOR EACH ROW EXECUTE FUNCTION public.record_language_program_checklist_event();

CREATE OR REPLACE FUNCTION public.reject_language_program_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'language program events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS reject_language_program_event_update_delete
  ON public.language_program_events;
CREATE TRIGGER reject_language_program_event_update_delete
  BEFORE UPDATE OR DELETE ON public.language_program_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_language_program_event_mutation();

CREATE OR REPLACE FUNCTION public.reject_language_program_release_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'language program release decisions are append-only';
END;
$$;

DROP TRIGGER IF EXISTS reject_language_program_release_update_delete
  ON public.language_program_release_decisions;
CREATE TRIGGER reject_language_program_release_update_delete
  BEFORE UPDATE OR DELETE ON public.language_program_release_decisions
  FOR EACH ROW EXECUTE FUNCTION public.reject_language_program_release_mutation();

CREATE OR REPLACE VIEW public.language_program_stage_readiness AS
SELECT
  program.id AS program_id,
  program.program_key,
  definition.stage_key,
  definition.sequence,
  definition.title,
  run.status,
  count(item.item_key) FILTER (WHERE item.is_required) AS required_items,
  count(item.item_key) FILTER (
    WHERE item.is_required AND item_run.status IN ('pass', 'not_applicable')
  ) AS completed_required_items,
  count(item.item_key) FILTER (WHERE item_run.status = 'blocked') AS blocked_items,
  bool_and(
    CASE WHEN item.is_required THEN item_run.status IN ('pass', 'not_applicable') ELSE TRUE END
  ) AS gate_ready
FROM public.language_programs program
JOIN public.language_program_stage_definitions definition
  ON definition.playbook_key = program.playbook_key
JOIN public.language_program_stage_runs run
  ON run.program_id = program.id AND run.stage_key = definition.stage_key
LEFT JOIN public.language_program_checklist_definitions item
  ON item.playbook_key = definition.playbook_key AND item.stage_key = definition.stage_key
LEFT JOIN public.language_program_checklist_runs item_run
  ON item_run.program_id = program.id AND item_run.item_key = item.item_key
GROUP BY program.id, program.program_key, definition.stage_key, definition.sequence,
  definition.title, run.status;

INSERT INTO public.language_program_playbooks
  (playbook_key, version, title, source_path, source_sha256, status)
VALUES
  ('low-resource-language-v1', 1,
   'Low-resource language knowledge and model playbook',
   '/mnt/donto-data/donto-resources/research/translation-training/LANGUAGE-KNOWLEDGE-AND-MODEL-PLAYBOOK.md',
   '61331e1abfd712f257bd8046d70da9ae445a6fee95b2970bd2b80cd452a3ee01',
   'active')
ON CONFLICT (playbook_key) DO NOTHING;

INSERT INTO public.language_program_stage_definitions
  (playbook_key, stage_key, sequence, title, objective, pass_rule)
VALUES
  ('low-resource-language-v1', 'identity', 0, 'Language charter', 'Freeze language, variety, orthography, direction, task, and claim scope.', 'Every required identity item passes and the charter is hashed.'),
  ('low-resource-language-v1', 'source_archive', 1, 'Source archive', 'Discover, preserve, checksum, classify, and inventory every usable source.', 'The best-known source inventory is locally reproducible and provenance-complete.'),
  ('low-resource-language-v1', 'dictionary', 2, 'Dictionary', 'Build a source-preserving entry, sense, form, example, conflict, and media ledger.', 'Every source entry is accounted for and unresolved relations remain in review.'),
  ('low-resource-language-v1', 'grammar', 3, 'Grammar', 'Represent morphology, syntax, orthography, paradigms, and examples as evidence-linked claims.', 'Core grammatical systems have structured coverage and explicit gaps.'),
  ('low-resource-language-v1', 'natural_corpus', 4, 'Natural corpus', 'Build provenance-rich natural text, parallel, interlinear, and speech corpora.', 'Usable rows are deduplicated, clustered, labelled, and split without leakage.'),
  ('low-resource-language-v1', 'benchmarks', 5, 'Benchmarks', 'Measure lexical, morphological, sentence, degeneration, and speech capabilities independently.', 'Frozen benchmark contracts, leakage audits, and claim limits exist for every evaluated capability.'),
  ('low-resource-language-v1', 'gap_analysis', 6, 'Failure and gap analysis', 'Explain failures by linguistic, tokenization, exposure, source, and decoding factors.', 'A measured failure census produces an explicit collect/generate/do-not-train decision.'),
  ('low-resource-language-v1', 'synthetic_corpus', 7, 'Synthetic corpus', 'Generate only evidence-constrained rows required by measured coverage gaps.', 'The corpus is balanced, reviewed, deduplicated, split-safe, manifested, and hashed.'),
  ('low-resource-language-v1', 'translation_model', 8, 'Translation model', 'Run controlled, token-accounted model experiments and independent capability gates.', 'The full run is reproducible and all reported capabilities have passed their own gates.'),
  ('low-resource-language-v1', 'asr', 9, 'Speech recognition', 'Build and evaluate target-speech to target-text recognition.', 'Speaker-disjoint ASR evidence passes the declared accuracy and serving contract.'),
  ('low-resource-language-v1', 'tts', 10, 'Speech synthesis', 'Build and evaluate target-text to target-speech synthesis.', 'Intelligibility, pronunciation, speaker scope, and serving requirements pass.'),
  ('low-resource-language-v1', 'release', 11, 'Release and operations', 'Package, route, monitor, version, and if necessary withdraw each capability independently.', 'All release-blocking items pass and the exact artifact/route decision is append-only.')
ON CONFLICT (playbook_key, stage_key) DO NOTHING;

INSERT INTO public.language_program_checklist_definitions
  (playbook_key, item_key, stage_key, sequence, title, verification_rule, required_output_kind, is_required, blocks_paid_compute, blocks_release)
VALUES
  ('low-resource-language-v1','identity.identifiers','identity',1,'Verify stable language identifiers','ISO 639-3, Glottocode, names, and aliases are recorded and independently checked.','charter',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','identity.variety_scope','identity',2,'Freeze variety scope','Included, excluded, and unknown-variety handling are explicit.','charter',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','identity.orthography_versions','identity',3,'Version every orthography','The target spelling and every source-preserving orthography have separate identifiers.','charter',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','identity.direction','identity',4,'Freeze one primary direction','Source, target, and deferred directions are explicit.','charter',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','identity.task_separation','identity',5,'Separate product tasks','Lookup, reconstruction, morphology, glossary uptake, sentence translation, ASR, and TTS are distinct.','charter',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','identity.normalization','identity',6,'Freeze normalization','Source-preserving and comparison normalization are separately specified.','charter',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','identity.model_tokens','identity',7,'Reserve model tokens','Language codes and task tokens are fixed before adapter training.','model_contract',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','identity.claim_limits','identity',8,'State claim limits','A lexical score cannot authorize sentence or speech claims.','charter',TRUE,FALSE,TRUE),

  ('low-resource-language-v1','source_archive.local_inventory','source_archive',1,'Inventory existing local assets','All existing databases, corpora, archives, models, and reports are counted before downloading.','inventory',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','source_archive.discovery','source_archive',2,'Search all source classes','Dictionaries, grammars, lessons, archives, text, audio, IGT, historical works, and catalog leads are searched.','source_ledger',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','source_archive.ledger','source_archive',3,'Register every source','One source ledger row records identity, URL, local path, hash, contents, variety, orthography, and use constraints.','source_ledger',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','source_archive.raw_capture','source_archive',4,'Preserve original bytes','Raw pages, documents, media, and headers are retained before transformation.','source_archive',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','source_archive.checksums','source_archive',5,'Verify checksums','Canonical source manifests and source bytes have verified SHA-256 identities.','checksums',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','source_archive.media_integrity','source_archive',6,'Probe media integrity','Media references, downloads, MIME types, decodability, duration, and errors are reconciled.','media_audit',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','source_archive.cluster_labels','source_archive',7,'Label evidence clusters','Speaker, text, story, source occasion, variety, and orthography clusters are preserved.','inventory',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','source_archive.use_constraints','source_archive',8,'Record use constraints','Training, redistribution, derived-weight, and hosted-transfer states are explicit per source.','source_ledger',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','source_archive.provenance','source_archive',9,'Preserve row provenance','Every derived row can resolve to source ID, source location, and source hash.','provenance_audit',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','source_archive.inventory_report','source_archive',10,'Publish measured inventory','Counts cover entries, senses, forms, sentences, IGT, media, speakers, clusters, duplicates, and missing links.','inventory',TRUE,TRUE,TRUE),

  ('low-resource-language-v1','dictionary.entries','dictionary',1,'Preserve every source entry','Every source entry has a stable record or an explicit exclusion reason.','dictionary_entries',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','dictionary.stable_ids','dictionary',2,'Assign deterministic identities','Entry, candidate, form, example, and media-link IDs are byte-reproducible.','reproducibility_test',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','dictionary.headword_normalization','dictionary',3,'Separate headword normalization','Original headwords and comparison forms are both stored.','dictionary_entries',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','dictionary.pos','dictionary',4,'Preserve parts of speech','Raw POS and comparison POS are stored without invented remapping.','dictionary_entries',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','dictionary.gloss_candidates','dictionary',5,'Extract all source gloss candidates','Primary translations and meanings are retained with source-field provenance.','sense_candidates',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','dictionary.sense_status','dictionary',6,'Do not invent sense equivalence','Unadjudicated meanings, senses, synonyms, and variants remain explicitly unclassified.','sense_candidates',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','dictionary.forms','dictionary',7,'Build the form ledger','All alternate, inflected, derived, and bound-form evidence is retained before parsing.','form_ledger',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','dictionary.examples','dictionary',8,'Link usage examples','Examples retain target text, translation, entry, source, split, and context.','example_ledger',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','dictionary.media_links','dictionary',9,'Link recordings','Every recording reference resolves to entry/example, speaker code, source URL, and archive path.','media_ledger',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','dictionary.ambiguity_queue','dictionary',10,'Quarantine ambiguous mappings','Multi-target gloss/POS groups are reviewed rather than treated as accepted synonyms.','review_queue',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','dictionary.conflicts','dictionary',11,'Preserve conflicts','Duplicate pages, homographs, spelling conflicts, and source disagreements remain explicit.','conflict_ledger',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','dictionary.exports','dictionary',12,'Validate dictionary exports','JSONL and any JSON, YAML, CLDF, LIFT, or Markdown exports reconcile to the canonical ledger.','export_audit',TRUE,FALSE,TRUE),

  ('low-resource-language-v1','grammar.sources','grammar',1,'Archive grammar sources','Primary grammars, teaching grammars, theses, and orthography descriptions are checksummed.','grammar_source_archive',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','grammar.evidence_claims','grammar',2,'Anchor grammar claims','Every rule records source, location, variety, orthography, confidence, and conflicts.','grammar_claims',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','grammar.category_inventory','grammar',3,'Inventory grammatical categories','POS subclasses, person, number, animacy, case, TAM, polarity, and other attested categories are represented.','grammar_inventory',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','grammar.paradigms','grammar',4,'Structure paradigms','Paradigm cells distinguish attested, inferred, conflicting, and missing forms.','paradigm_ledger',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','grammar.morphotactics','grammar',5,'Document morphotactics','Stem classes, affix ordering, allomorphy, reduplication, and productive constraints are recorded.','grammar_claims',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','grammar.syntax','grammar',6,'Document syntax','Argument structure, clause types, negation, questions, subordination, information structure, and discourse are covered.','grammar_claims',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','grammar.orthography','grammar',7,'Document spelling rules','Phoneme-grapheme, punctuation, normalization, and orthography conversion claims are explicit.','orthography_contract',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','grammar.igt','grammar',8,'Preserve interlinear examples','Forms, morphemes, glosses, translations, source spans, and context remain aligned.','igt_corpus',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','grammar.review_queue','grammar',9,'Track grammar gaps and conflicts','Unsupported cells and conflicting analyses have explicit review records.','grammar_review_queue',TRUE,FALSE,TRUE),

  ('low-resource-language-v1','natural_corpus.inventory','natural_corpus',1,'Inventory natural corpora','Rows, texts, speakers, genres, varieties, orthographies, and audio duration are counted.','corpus_inventory',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','natural_corpus.deduplication','natural_corpus',2,'Deduplicate conservatively','Exact and near duplicates are measured without deleting source provenance.','deduplication_audit',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','natural_corpus.provenance','natural_corpus',3,'Attach exact provenance','Every row resolves to source, page/time span, speaker/text cluster, and transform.','parallel_corpus',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','natural_corpus.cluster_splits','natural_corpus',4,'Split by independent clusters','Speaker, text, story, and source occasion do not leak across controlled splits.','split_manifest',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','natural_corpus.discourse_context','natural_corpus',5,'Preserve discourse context','Sentence rows retain surrounding segment and participant/topic context where available.','parallel_corpus',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','natural_corpus.variety_labels','natural_corpus',6,'Label variety and orthography','Unknown values remain unknown; systems are not silently merged.','corpus_inventory',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','natural_corpus.audio_alignment','natural_corpus',7,'Align speech and transcripts','Audio, transcript, translation, speaker, timing, and recording condition are linked.','speech_corpus',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','natural_corpus.quality_audit','natural_corpus',8,'Audit natural rows','Blank, copied, mismatched, truncated, malformed, and suspicious rows are reported.','quality_audit',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','natural_corpus.blind_clusters','natural_corpus',9,'Reserve independent final evidence','Final natural evaluation contains independent, unopened speaker/text clusters.','sealed_manifest',TRUE,FALSE,TRUE),

  ('low-resource-language-v1','benchmarks.lexical_census','benchmarks',1,'Census all lexical entries','Every dictionary entry is represented in a ready row or a named review/exclusion category.','lexical_census',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','benchmarks.lexical_exact','benchmarks',2,'Freeze lexical exact scoring','Normalization, POS conditioning, accepted references, and ambiguity policy are fixed.','benchmark_contract',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','benchmarks.contextual_acquisition','benchmarks',3,'Measure contextual acquisition','Lexemes seen in sentences but not direct pairs have a separate endpoint.','benchmark_suite',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','benchmarks.morphology','benchmarks',4,'Measure morphology','Known lemmas and held-out attested forms test feature realization independently.','benchmark_suite',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','benchmarks.glossary_uptake','benchmarks',5,'Measure glossary uptake','Training-held-out entries supplied at inference are tested in novel contexts.','benchmark_suite',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','benchmarks.sentence','benchmarks',6,'Measure natural sentences','Meaning, participants, morphology, grammar, variety, and discourse have natural evaluation.','benchmark_suite',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','benchmarks.degeneration','benchmarks',7,'Measure degeneration','Blank, source-copy, loop, overtranslation, and truncation rates are frozen.','benchmark_suite',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','benchmarks.decoder_damage','benchmarks',8,'Measure decoder damage','Guarded, unguarded, and retry-only policies test legitimate repetition loss.','benchmark_suite',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','benchmarks.asr','benchmarks',9,'Define ASR benchmark','Speaker-disjoint WER, CER, grapheme CER, semantic and named-item errors are specified.','benchmark_contract',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','benchmarks.tts','benchmarks',10,'Define TTS benchmark','Intelligibility, pronunciation, naturalness, speaker scope, latency, and failure policy are specified.','benchmark_contract',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','benchmarks.metric_signatures','benchmarks',11,'Freeze metric signatures','Tokenization, normalization, library versions, and full metric signatures are published.','benchmark_contract',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','benchmarks.lineage_leakage','benchmarks',12,'Audit full-lineage exposure','Direct pair, sentence context, project ancestors, and unknown upstream exposure are distinguished.','leakage_audit',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','benchmarks.human_protocol','benchmarks',13,'Freeze human review','Blind ordering, dimensions, critical errors, adjudication, and disagreement reporting are specified.','review_protocol',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','benchmarks.sealed_final','benchmarks',14,'Seal final suites','Final rows and hashes are frozen before candidate outputs are inspected.','sealed_manifest',TRUE,FALSE,TRUE),

  ('low-resource-language-v1','gap_analysis.baseline','gap_analysis',1,'Run complete baseline','The current model or deterministic baseline is evaluated on every applicable development suite.','benchmark_run',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','gap_analysis.by_pos','gap_analysis',2,'Analyze failures by POS','Counts and rates are reported by source POS and lexical class.','failure_census',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','gap_analysis.by_tokenization','gap_analysis',3,'Analyze tokenization','Fertility, complete-token exposure, length, punctuation, and unknown/fallback behavior are related to errors.','failure_census',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','gap_analysis.by_exposure','gap_analysis',4,'Analyze lineage exposure','Direct, contextual, ancestor, and unknown-upstream exposure are related to outcomes.','failure_census',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','gap_analysis.by_ambiguity','gap_analysis',5,'Analyze sense ambiguity','Sense, synonym, variant, homograph, and prompt ambiguity are not pooled.','failure_census',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','gap_analysis.by_morphology','gap_analysis',6,'Analyze morphology','Errors are grouped by lemma, feature bundle, paradigm cell, and source evidence.','failure_census',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','gap_analysis.by_sentence_feature','gap_analysis',7,'Analyze sentence phenomena','Meaning loss, participant reversal, TAM, negation, argument structure, and discourse errors are counted.','failure_census',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','gap_analysis.requirements','gap_analysis',8,'Freeze corpus requirements','Every proposed new row maps to a measured gap, evidence policy, target count, and stop rule.','corpus_requirements',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','gap_analysis.train_decision','gap_analysis',9,'Make the train/no-train decision','Training is blocked until the measured requirements and experiment hypothesis justify it.','decision_record',TRUE,TRUE,TRUE),

  ('low-resource-language-v1','synthetic_corpus.requirements','synthetic_corpus',1,'Freeze generation contract','Only cells named by the corpus-requirement ledger may be generated.','generation_contract',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','synthetic_corpus.source_grounding','synthetic_corpus',2,'Ground every generated row','Lexemes, forms, grammar claims, and templates resolve to approved source evidence.','synthetic_manifest',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','synthetic_corpus.task_labels','synthetic_corpus',3,'Separate generated tasks','Lexeme, morphology, glossary uptake, and sentence rows have explicit model-visible task contracts.','synthetic_manifest',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','synthetic_corpus.contrast_sets','synthetic_corpus',4,'Generate contrast sets','Minimal pairs isolate polarity, participants, TAM, argument structure, and morphology where supported.','synthetic_corpus',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','synthetic_corpus.coverage_balance','synthetic_corpus',5,'Balance feature exposure','Counts are controlled by lexeme, POS, feature, template, and target-token exposure.','coverage_matrix',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','synthetic_corpus.review_sample','synthetic_corpus',6,'Review stratified samples','A stratified sample is checked for source fidelity, grammaticality, and template artifacts.','quality_audit',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','synthetic_corpus.deduplication','synthetic_corpus',7,'Audit contamination and duplicates','Exact, normalized, near-duplicate, template-family, and benchmark overlap are measured.','leakage_audit',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','synthetic_corpus.split_safety','synthetic_corpus',8,'Preserve split safety','Lexeme, source, template, and natural-evidence groups obey the preregistered split policy.','split_manifest',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','synthetic_corpus.provenance','synthetic_corpus',9,'Record row-level provenance','Generator, prompt, inputs, source claims, seed, review, and transforms are stored.','synthetic_manifest',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','synthetic_corpus.freeze','synthetic_corpus',10,'Freeze and checksum corpus','Training files, manifests, coverage matrices, and hashes are immutable before training.','checksums',TRUE,TRUE,TRUE),

  ('low-resource-language-v1','translation_model.preregistration','translation_model',1,'Preregister the experiment','Hypothesis, arms, controls, endpoints, selection rule, stop rule, and multiplicity handling are frozen.','preregistration',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','translation_model.base_identity','translation_model',2,'Freeze base identity','Model ID, immutable revision, full hash, license, and architecture are recorded.','run_contract',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','translation_model.tokenizer_audit','translation_model',3,'Audit tokenizer fertility','Fertility, fallback rate, truncation, complete tokens, and task-token segmentation are measured.','tokenizer_audit',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','translation_model.custom_tokens','translation_model',4,'Audit custom tokens','Token IDs, initialization, trainability, serialization, and reload equality are verified.','model_audit',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','translation_model.embedding_aliases','translation_model',5,'Audit tied embeddings','Shared, encoder, decoder, and output-head aliases survive adapter save, load, merge, and unmerge.','model_audit',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','translation_model.fixed_steps','translation_model',6,'Freeze optimizer updates','Exact max steps, batch construction, gradient accumulation, and LR trajectory are fixed.','run_contract',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','translation_model.token_accounting','translation_model',7,'Account for token exposure','Examples, source tokens, target tokens, non-padding tokens, task loss, and presentations per item are reported.','run_contract',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','translation_model.paired_randomization','translation_model',8,'Pair controlled arms','Seeds, starting weights, retention order, batch boundaries, and schedules are paired where possible.','run_contract',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','translation_model.baselines','translation_model',9,'Keep untouched and continuation baselines','Untouched base and compute-matched continuation are evaluated beside treatments.','run_contract',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','translation_model.disk_preflight','translation_model',10,'Pass disk and path preflight','Root and data mounts have reserved free space and all output paths resolve to the intended disk.','preflight_report',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','translation_model.resource_monitor','translation_model',11,'Install resource monitoring','GPU, CPU, RAM, disk, process liveness, throughput, and output growth are sampled.','run_contract',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','translation_model.shutdown_plan','translation_model',12,'Install automatic shutdown','Maximum runtime, failure cleanup, artifact pull, pod termination, and post-run verification are scripted.','run_contract',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','translation_model.smoke_overfit','translation_model',13,'Pass plumbing and overfit gates','A tiny run proves token, label, embedding, merge, reload, and inference behavior before full compute.','preflight_report',TRUE,TRUE,TRUE),
  ('low-resource-language-v1','translation_model.multi_seed','translation_model',14,'Run confirmatory seeds','Recipe selection uses aggregate development evidence and all confirmatory seeds are reported.','experiment_report',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','translation_model.decoder_freeze','translation_model',15,'Freeze decoder for weight comparison','Training effects and decoder-policy effects are evaluated separately.','decoder_contract',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','translation_model.artifact_integrity','translation_model',16,'Pull and verify artifacts','Adapters, tokenizer, generation config, manifests, predictions, and hashes are verified locally.','checksums',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','translation_model.capability_gates','translation_model',17,'Evaluate independent gates','Lookup, lexical, morphology, glossary, sentence, degeneration, and speech results cannot authorize one another.','experiment_report',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','translation_model.negative_results','translation_model',18,'Retain negative-result evidence','Compact adapters where permitted, manifests, predictions, metrics, and deletion ledgers survive failed runs.','experiment_report',TRUE,FALSE,TRUE),

  ('low-resource-language-v1','asr.audio_inventory','asr',1,'Inventory speech evidence','Duration, utterances, speakers, varieties, devices, conditions, and transcript coverage are measured.','speech_inventory',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','asr.transcript_quality','asr',2,'Verify transcripts','Orthography version, alignment, reviewer state, and unresolved uncertainty are explicit.','transcript_audit',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','asr.speaker_splits','asr',3,'Use speaker-disjoint splits','No speaker, recording session, or near-duplicate utterance leaks across final splits.','split_manifest',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','asr.audio_quality','asr',4,'Audit audio quality','Decode errors, clipping, noise, silence, sample rate, duration, and duplicate audio are reported.','audio_audit',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','asr.orthography_contract','asr',5,'Freeze transcript orthography','Accepted spellings, punctuation, casing, normalization, and alternatives are explicit.','benchmark_contract',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','asr.baselines','asr',6,'Run ASR baselines','At least one multilingual baseline and deterministic preprocessing baseline are measured.','benchmark_run',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','asr.error_analysis','asr',7,'Analyze ASR errors','WER, code-point CER, grapheme CER, lexical, morphological, named-item, and speaker slices are reported.','failure_census',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','asr.serving_benchmark','asr',8,'Benchmark practical serving','CPU, hosted, or bounded GPU latency, memory, concurrency, and cold-start behavior are measured.','resource_profile',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','asr.release_gate','asr',9,'Pass ASR release gate','The exact ASR artifact passes its own frozen speaker-disjoint quality and serving thresholds.','release_gate',TRUE,FALSE,TRUE),

  ('low-resource-language-v1','tts.speech_inventory','tts',1,'Inventory synthesis evidence','Aligned utterances, speakers, styles, phoneme/grapheme coverage, duration, and conditions are measured.','speech_inventory',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','tts.alignment_quality','tts',2,'Verify text-audio alignment','Transcript, orthography, timing, speaker, recording condition, and exclusions are explicit.','audio_audit',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','tts.coverage','tts',3,'Measure sound and prosody coverage','Grapheme/phoneme, cluster, word-boundary, stress, phrase, and prosodic coverage gaps are reported.','coverage_matrix',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','tts.speaker_scope','tts',4,'Freeze speaker scope','Single-speaker, multi-speaker, voice identity, and unsupported voice claims are explicit.','model_contract',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','tts.baselines','tts',5,'Run TTS baselines','A reproducible baseline establishes intelligibility, pronunciation, naturalness, and failure modes.','benchmark_run',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','tts.human_review','tts',6,'Review synthesis output','Blind intelligibility, pronunciation, naturalness, and unacceptable-error judgments are recorded.','review_report',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','tts.serving_benchmark','tts',7,'Benchmark practical serving','CPU or hosted latency, real-time factor, memory, concurrency, and cold start are measured.','resource_profile',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','tts.release_gate','tts',8,'Pass TTS release gate','The exact TTS artifact passes its own frozen quality, speaker-scope, and serving thresholds.','release_gate',TRUE,FALSE,TRUE),

  ('low-resource-language-v1','release.immutable_identity','release',1,'Bind release to immutable identity','Weights, adapter, base, tokenizer, task contract, decoder, router, benchmark, and normalizer hashes are fixed.','release_manifest',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','release.model_card','release',2,'Publish model card','Training data, method, limits, metrics, failure cases, use terms, and artifact hashes are complete.','model_card',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','release.dataset_card','release',3,'Publish dataset card','Source composition, transforms, splits, leakage, licenses, and known errors are complete.','dataset_card',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','release.license_separation','release',4,'Separate component terms','Application code, base model, adapters, dictionary, natural data, synthetic data, and hosted outputs are labelled separately.','release_manifest',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','release.lookup_route','release',5,'Keep lookup deterministic','Known dictionary queries return source-attributed database results before any generative route.','route_test',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','release.capability_routes','release',6,'Route capabilities independently','Lookup, lexical, sentence, ASR, and TTS use separate gate-bound route states.','route_manifest',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','release.sentence_gate','release',7,'Require sentence evidence','No lexical score can mount or label a sentence translator.','release_gate',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','release.uncertainty_labels','release',8,'Label output provenance','Users can distinguish dictionary evidence, model drafts, hosted post-editing, and unavailable routes.','ux_verification',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','release.api_contract','release',9,'Version API contract','Responses expose route, language, model, version, decoder, provenance, warnings, latency, and errors.','api_contract',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','release.cache_identity','release',10,'Version cache identity','Cache keys bind text, language, dictionary, model, decoder, prompt, router, and contract versions.','cache_contract',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','release.monitoring','release',11,'Install monitoring','Latency, errors, route selection, resource use, cache behavior, and quality feedback are observable.','operations_report',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','release.rollback','release',12,'Prove rollback and withdrawal','Unmount, disable, rollback, cache invalidation, registry status, and artifact withdrawal are tested.','operations_report',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','release.compute_shutdown','release',13,'Verify paid compute is off','No RunPod or other paid training resource remains active after artifact retrieval.','operations_report',TRUE,FALSE,TRUE),
  ('low-resource-language-v1','release.final_checksums','release',14,'Verify release checksums','Every distributed file and public registry record matches the signed release manifest.','checksums',TRUE,FALSE,TRUE)
ON CONFLICT (playbook_key, item_key) DO NOTHING;

COMMENT ON TABLE public.language_programs IS
  'Versioned language-development programs; GPU and release flags are database-gated by required checklist evidence.';
COMMENT ON TABLE public.language_program_checklist_definitions IS
  'Reusable, version-bound checklist defining the full low-resource language workflow.';
COMMENT ON TABLE public.language_program_events IS
  'Append-only audit history for stage and checklist status transitions.';
