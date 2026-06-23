-- Academic dictionary enrichment columns
-- Adds the grounded, additive fields produced by the Kuku Yalanji enrichment pass
-- (see dictionaries/kuku_yalanji/SCHEMA.md). All columns are nullable and optional,
-- so other dictionaries are unaffected until their YAML provides the data.
-- Populated by the YAML sync engine (apps/web/lib/dictionary-sync/engine.ts).

ALTER TABLE public.words
  ADD COLUMN IF NOT EXISTS phonemic TEXT,          -- rule-derived IPA, e.g. /ˈɟalbu/
  ADD COLUMN IF NOT EXISTS gloss TEXT,             -- concise primary English gloss
  ADD COLUMN IF NOT EXISTS semantic_domain TEXT,   -- controlled semantic field
  ADD COLUMN IF NOT EXISTS verb_class TEXT,        -- l-conjugation / y-conjugation
  ADD COLUMN IF NOT EXISTS derivation JSONB,       -- {morpheme, function}
  ADD COLUMN IF NOT EXISTS reduplication JSONB,    -- {pattern, base}
  ADD COLUMN IF NOT EXISTS loanword_source TEXT,   -- English source for loans
  ADD COLUMN IF NOT EXISTS dialect TEXT,           -- Yalanji / Nyungkul / ...
  ADD COLUMN IF NOT EXISTS commentary JSONB,       -- string[] scholarly notes
  ADD COLUMN IF NOT EXISTS see_also JSONB,         -- string[] cross-references
  ADD COLUMN IF NOT EXISTS usage_notes JSONB,      -- string[] usage/register notes
  ADD COLUMN IF NOT EXISTS entry_source TEXT,      -- provenance, e.g. 'grammar'
  ADD COLUMN IF NOT EXISTS needs_review TEXT;       -- review flag for stub entries

CREATE INDEX IF NOT EXISTS words_semantic_domain_idx
  ON public.words(language_id, semantic_domain);
