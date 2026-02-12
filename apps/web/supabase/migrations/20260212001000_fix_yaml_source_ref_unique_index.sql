-- Upsert on (language_id, yaml_source_ref) requires a non-partial unique index.
DROP INDEX IF EXISTS public.words_language_yaml_source_ref_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS words_language_yaml_source_ref_uidx
ON public.words(language_id, yaml_source_ref);

