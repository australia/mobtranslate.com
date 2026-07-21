-- Persistent, version-bound cache for staged translation inference.
-- Raw user source text is deliberately not stored. source_fingerprint and
-- cache_key are keyed HMAC values computed by the application.

CREATE TABLE IF NOT EXISTS public.translation_pipeline_cache (
  cache_key VARCHAR(64) PRIMARY KEY,
  stage VARCHAR(40) NOT NULL,
  language_code VARCHAR(50) NOT NULL,
  source_fingerprint VARCHAR(64) NOT NULL,
  source_length INTEGER NOT NULL CHECK (source_length >= 0),
  dictionary_fingerprint VARCHAR(64),
  model_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  contract_version TEXT NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('ready', 'error')),
  payload JSONB,
  error_message TEXT,
  error_status INTEGER,
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count BIGINT NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT translation_pipeline_cache_payload_check CHECK (
    (status = 'ready' AND payload IS NOT NULL AND error_message IS NULL)
    OR (status = 'error' AND payload IS NULL AND error_message IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS translation_pipeline_cache_lookup_idx
  ON public.translation_pipeline_cache
  (language_code, stage, source_fingerprint);

CREATE INDEX IF NOT EXISTS translation_pipeline_cache_expiry_idx
  ON public.translation_pipeline_cache (expires_at);

CREATE INDEX IF NOT EXISTS translation_pipeline_cache_contract_idx
  ON public.translation_pipeline_cache
  (stage, model_id, model_version, contract_version);

ALTER TABLE public.translation_pipeline_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.translation_pipeline_cache IS
  'Internal HMAC-keyed cache for translation drafts, evidence, reviews and resolved outputs; stores no raw source text.';

