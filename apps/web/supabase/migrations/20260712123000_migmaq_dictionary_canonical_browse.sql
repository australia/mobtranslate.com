BEGIN;

CREATE TEMP TABLE _migmaq_browse_pairs ON COMMIT DROP AS
SELECT legacy.id AS legacy_id, canonical.id AS canonical_id
FROM public.words legacy
JOIN LATERAL (
  SELECT managed.id
  FROM public.words managed
  WHERE managed.language_id = legacy.language_id
    AND managed.normalized_word = legacy.normalized_word
    AND lower(btrim(coalesce(managed.word_type, ''))) = lower(btrim(coalesce(legacy.word_type, '')))
    AND managed.managed_by_yaml_sync = true
  ORDER BY managed.updated_at DESC, managed.id
  LIMIT 1
) canonical ON true
WHERE legacy.language_id = (SELECT id FROM public.languages WHERE code = 'migmaq')
  AND legacy.managed_by_yaml_sync = false
  AND legacy.entry_source IS NULL;

DO $$
DECLARE
  pair_count integer;
BEGIN
  SELECT count(*) INTO pair_count FROM _migmaq_browse_pairs;
  IF pair_count <> 6581 THEN
    RAISE EXCEPTION 'Mi''gmaq consolidation expected 6581 legacy/canonical pairs, found %', pair_count;
  END IF;
END $$;

WITH candidates AS (
  SELECT
    pairs.canonical_id,
    definition.*,
    row_number() OVER (PARTITION BY pairs.canonical_id ORDER BY definition.definition_number, definition.id) AS copy_rank
  FROM _migmaq_browse_pairs pairs
  JOIN public.definitions definition ON definition.word_id = pairs.legacy_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.definitions existing
    WHERE existing.word_id = pairs.canonical_id
      AND lower(btrim(existing.definition)) = lower(btrim(definition.definition))
  )
)
INSERT INTO public.definitions (
  word_id, definition, definition_number, context, register, domain,
  is_primary, notes, created_by
)
SELECT
  candidate.canonical_id,
  candidate.definition,
  coalesce((SELECT max(existing.definition_number) FROM public.definitions existing WHERE existing.word_id = candidate.canonical_id), 0)
    + candidate.copy_rank,
  candidate.context,
  candidate.register,
  candidate.domain,
  false,
  concat_ws(E'\n', candidate.notes, '[MobTranslate browse consolidation 2026-07-12: copied from preserved legacy definition ' || candidate.id || ']'),
  candidate.created_by
FROM candidates candidate;

INSERT INTO public.translations (
  word_id, definition_id, translation, target_language, translation_type,
  is_primary, notes, created_by
)
SELECT
  pairs.canonical_id,
  canonical_definition.id,
  translation.translation,
  translation.target_language,
  translation.translation_type,
  false,
  concat_ws(E'\n', translation.notes, '[MobTranslate browse consolidation 2026-07-12: copied from preserved legacy translation ' || translation.id || ']'),
  translation.created_by
FROM _migmaq_browse_pairs pairs
JOIN public.definitions legacy_definition ON legacy_definition.word_id = pairs.legacy_id
JOIN public.translations translation ON translation.definition_id = legacy_definition.id
JOIN LATERAL (
  SELECT definition.id
  FROM public.definitions definition
  WHERE definition.word_id = pairs.canonical_id
    AND lower(btrim(definition.definition)) = lower(btrim(legacy_definition.definition))
  ORDER BY definition.is_primary DESC, definition.definition_number, definition.id
  LIMIT 1
) canonical_definition ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.translations existing
  WHERE existing.word_id = pairs.canonical_id
    AND existing.definition_id = canonical_definition.id
    AND lower(btrim(existing.translation)) = lower(btrim(translation.translation))
    AND coalesce(existing.target_language, '') = coalesce(translation.target_language, '')
);

INSERT INTO public.usage_examples (
  word_id, definition_id, example_text, translation, transliteration,
  context, source, audio_id, notes, created_by
)
SELECT
  pairs.canonical_id,
  canonical_definition.id,
  example.example_text,
  example.translation,
  example.transliteration,
  example.context,
  coalesce(example.source, 'Preserved legacy Mi''gmaq import'),
  example.audio_id,
  concat_ws(E'\n', example.notes, '[MobTranslate browse consolidation 2026-07-12: copied from preserved legacy example ' || example.id || ']'),
  example.created_by
FROM _migmaq_browse_pairs pairs
JOIN public.usage_examples example ON example.word_id = pairs.legacy_id
LEFT JOIN public.definitions legacy_definition ON legacy_definition.id = example.definition_id
LEFT JOIN LATERAL (
  SELECT definition.id
  FROM public.definitions definition
  WHERE definition.word_id = pairs.canonical_id
    AND legacy_definition.id IS NOT NULL
    AND lower(btrim(definition.definition)) = lower(btrim(legacy_definition.definition))
  ORDER BY definition.is_primary DESC, definition.definition_number, definition.id
  LIMIT 1
) canonical_definition ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.usage_examples existing
  WHERE existing.word_id = pairs.canonical_id
    AND lower(btrim(existing.example_text)) = lower(btrim(example.example_text))
    AND coalesce(lower(btrim(existing.translation)), '') = coalesce(lower(btrim(example.translation)), '')
);

UPDATE public.words legacy
SET metadata = coalesce(legacy.metadata, '{}'::jsonb) || jsonb_build_object(
      'browseSupersededBy', pairs.canonical_id::text,
      'browseSupersededAt', '2026-07-12T12:30:00Z',
      'browseSupersededReason', 'Equivalent Mi''gmaq import under the superseded word-class taxonomy; unique child content copied to the canonical managed row.'
    ),
    updated_at = now()
FROM _migmaq_browse_pairs pairs
WHERE legacy.id = pairs.legacy_id;

UPDATE public.languages
SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'dictionaryBrowse', jsonb_build_object(
        'strategy', 'hide_row_metadata_browseSupersededBy',
        'configuredAt', '2026-07-12T12:30:00Z',
        'preservesRows', true
      )
    ),
    updated_at = now()
WHERE code = 'migmaq';

DO $$
DECLARE
  marked_count integer;
  visible_count integer;
  legacy_only_definitions integer;
  legacy_only_examples integer;
BEGIN
  SELECT count(*) INTO marked_count
  FROM public.words
  WHERE language_id = (SELECT id FROM public.languages WHERE code = 'migmaq')
    AND metadata ? 'browseSupersededBy';

  SELECT count(*) INTO visible_count
  FROM public.words
  WHERE language_id = (SELECT id FROM public.languages WHERE code = 'migmaq')
    AND NOT (coalesce(metadata, '{}'::jsonb) ? 'browseSupersededBy');

  SELECT count(*) INTO legacy_only_definitions
  FROM _migmaq_browse_pairs pairs
  JOIN public.definitions legacy ON legacy.word_id = pairs.legacy_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.definitions canonical
    WHERE canonical.word_id = pairs.canonical_id
      AND lower(btrim(canonical.definition)) = lower(btrim(legacy.definition))
  );

  SELECT count(*) INTO legacy_only_examples
  FROM _migmaq_browse_pairs pairs
  JOIN public.usage_examples legacy ON legacy.word_id = pairs.legacy_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.usage_examples canonical
    WHERE canonical.word_id = pairs.canonical_id
      AND lower(btrim(canonical.example_text)) = lower(btrim(legacy.example_text))
      AND coalesce(lower(btrim(canonical.translation)), '') = coalesce(lower(btrim(legacy.translation)), '')
  );

  IF marked_count <> 6581 OR visible_count <> 7062
     OR legacy_only_definitions <> 0 OR legacy_only_examples <> 0 THEN
    RAISE EXCEPTION 'Mi''gmaq consolidation postcondition failed: marked=%, visible=%, definitions=%, examples=%',
      marked_count, visible_count, legacy_only_definitions, legacy_only_examples;
  END IF;
END $$;

COMMIT;

