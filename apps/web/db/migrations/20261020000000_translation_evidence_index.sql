-- Meaning-searchable evidence for the hybrid translation checker: dictionary
-- entries, dictionary example sentences, grammar passages and grammar-
-- documented word forms, each with a text embedding. Every row is derived
-- from the dictionary tables or from source files in the repository and can
-- be rebuilt at any time with scripts/build-translation-evidence-index.ts;
-- no user text is stored here.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.translation_evidence_units (
  language_code TEXT NOT NULL CHECK (language_code ~ '^[a-z_]+$'),
  unit_key TEXT NOT NULL CHECK (btrim(unit_key) <> ''),
  kind TEXT NOT NULL CHECK (kind IN ('dictionary', 'example', 'grammar', 'grammar_form')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_label TEXT NOT NULL,
  source_url TEXT NOT NULL,
  target_forms TEXT[] NOT NULL DEFAULT '{}',
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  content_sha256 VARCHAR(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  embedding_model TEXT NOT NULL,
  embedding vector(512) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (language_code, unit_key)
);

CREATE INDEX IF NOT EXISTS translation_evidence_units_kind_idx
  ON public.translation_evidence_units (language_code, kind);

CREATE TABLE IF NOT EXISTS public.translation_evidence_index_state (
  language_code TEXT PRIMARY KEY CHECK (language_code ~ '^[a-z_]+$'),
  revision VARCHAR(64) NOT NULL CHECK (revision ~ '^[0-9a-f]{64}$'),
  unit_count INTEGER NOT NULL CHECK (unit_count >= 0),
  embedding_model TEXT NOT NULL,
  dimensions INTEGER NOT NULL CHECK (dimensions > 0),
  source_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  built_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.translation_evidence_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translation_evidence_index_state ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.translation_evidence_units IS
  'Rebuildable, embedding-indexed dictionary and grammar evidence for the translation checker; derived data, no user text.';
COMMENT ON TABLE public.translation_evidence_index_state IS
  'One row per language: the revision of the evidence index currently in translation_evidence_units.';
