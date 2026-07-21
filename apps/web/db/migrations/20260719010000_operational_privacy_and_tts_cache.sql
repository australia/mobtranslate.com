ALTER TABLE public.tts_generations
  ADD COLUMN IF NOT EXISTS input_fingerprint VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS tts_generations_fingerprint_unique
  ON public.tts_generations (language_code, input_fingerprint, model)
  WHERE input_fingerprint IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.translation_request_daily_metrics (
  activity_date DATE NOT NULL,
  kind TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  language_code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  request_count BIGINT NOT NULL CHECK (request_count >= 0),
  error_count BIGINT NOT NULL CHECK (error_count >= 0),
  total_duration_ms BIGINT NOT NULL CHECK (total_duration_ms >= 0),
  archived_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (activity_date, kind, source, language_code, status, model)
);

COMMENT ON TABLE public.translation_request_daily_metrics IS
  'Text-free aggregate retained after raw translation request logs expire.';
