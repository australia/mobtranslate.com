-- Dictionary Sync System
-- Keeps YAML dictionaries as source-of-truth while maintaining a fully tracked DB mirror.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Add sync + geo enrichment columns to words
ALTER TABLE public.words
ADD COLUMN IF NOT EXISTS managed_by_yaml_sync BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS yaml_source_file TEXT,
ADD COLUMN IF NOT EXISTS yaml_source_ref TEXT,
ADD COLUMN IF NOT EXISTS yaml_content_hash TEXT,
ADD COLUMN IF NOT EXISTS sync_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_location BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS location_confidence NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS location_source TEXT,
ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS words_language_yaml_source_ref_uidx
ON public.words(language_id, yaml_source_ref)
WHERE yaml_source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS words_yaml_sync_lookup_idx
ON public.words(language_id, managed_by_yaml_sync, yaml_source_file);

CREATE INDEX IF NOT EXISTS words_location_lookup_idx
ON public.words(language_id, is_location, location_updated_at);

-- Scheduler task definitions
CREATE TABLE IF NOT EXISTS public.dictionary_sync_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language_id UUID REFERENCES public.languages(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (task_type IN ('yaml_sync', 'location_enrichment')),
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  interval_minutes INTEGER NOT NULL DEFAULT 360 CHECK (interval_minutes > 0 AND interval_minutes <= 10080),
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_run_at TIMESTAMPTZ,
  last_status TEXT NOT NULL DEFAULT 'idle' CHECK (last_status IN ('idle', 'running', 'success', 'failed')),
  last_error TEXT,
  is_running BOOLEAN NOT NULL DEFAULT false,
  lock_expires_at TIMESTAMPTZ,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(language_id, task_type)
);

CREATE INDEX IF NOT EXISTS dictionary_sync_tasks_due_idx
ON public.dictionary_sync_tasks(enabled, next_run_at, is_running);

-- Historical run tracking
CREATE TABLE IF NOT EXISTS public.dictionary_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.dictionary_sync_tasks(id) ON DELETE SET NULL,
  language_id UUID REFERENCES public.languages(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('yaml_sync', 'location_enrichment')),
  triggered_by TEXT NOT NULL DEFAULT 'scheduler' CHECK (triggered_by IN ('scheduler', 'manual', 'api', 'cron')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  words_scanned INTEGER NOT NULL DEFAULT 0,
  words_upserted INTEGER NOT NULL DEFAULT 0,
  words_deleted INTEGER NOT NULL DEFAULT 0,
  definitions_upserted INTEGER NOT NULL DEFAULT 0,
  translations_upserted INTEGER NOT NULL DEFAULT 0,
  examples_upserted INTEGER NOT NULL DEFAULT 0,
  location_candidates INTEGER NOT NULL DEFAULT 0,
  locations_resolved INTEGER NOT NULL DEFAULT 0,
  cache_hits INTEGER NOT NULL DEFAULT 0,
  cache_misses INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dictionary_sync_runs_recent_idx
ON public.dictionary_sync_runs(started_at DESC);

CREATE INDEX IF NOT EXISTS dictionary_sync_runs_task_idx
ON public.dictionary_sync_runs(task_id, started_at DESC);

-- Cache table for geocoding results (positive or miss)
CREATE TABLE IF NOT EXISTS public.dictionary_location_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'nominatim',
  query_text TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  confidence NUMERIC(5,2),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  last_hit_at TIMESTAMPTZ,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dictionary_location_cache_expiry_idx
ON public.dictionary_location_cache(expires_at);

CREATE OR REPLACE FUNCTION public.set_dictionary_sync_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dictionary_sync_tasks_updated_at ON public.dictionary_sync_tasks;
CREATE TRIGGER trg_dictionary_sync_tasks_updated_at
BEFORE UPDATE ON public.dictionary_sync_tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_dictionary_sync_updated_at();

DROP TRIGGER IF EXISTS trg_dictionary_location_cache_updated_at ON public.dictionary_location_cache;
CREATE TRIGGER trg_dictionary_location_cache_updated_at
BEFORE UPDATE ON public.dictionary_location_cache
FOR EACH ROW
EXECUTE FUNCTION public.set_dictionary_sync_updated_at();

-- Sensible default tasks for all existing languages
INSERT INTO public.dictionary_sync_tasks (
  language_id,
  task_type,
  name,
  interval_minutes,
  next_run_at,
  config
)
SELECT
  l.id,
  'yaml_sync',
  l.name || ' YAML Sync',
  360,
  NOW() + INTERVAL '5 minutes',
  jsonb_build_object(
    'batch_size', 500,
    'prune_removed', true,
    'max_words_per_run', 100000
  )
FROM public.languages l
ON CONFLICT (language_id, task_type) DO NOTHING;

INSERT INTO public.dictionary_sync_tasks (
  language_id,
  task_type,
  name,
  interval_minutes,
  next_run_at,
  config
)
SELECT
  l.id,
  'location_enrichment',
  l.name || ' Location Enrichment',
  720,
  NOW() + INTERVAL '15 minutes',
  jsonb_build_object(
    'cache_ttl_days', 36500,
    'max_candidates', 100000,
    'stale_after_days', 45,
    'check_every_word', true,
    'ai_batch_size', 200,
    'geocode_with_ai_fallback', true
  )
FROM public.languages l
ON CONFLICT (language_id, task_type) DO NOTHING;
