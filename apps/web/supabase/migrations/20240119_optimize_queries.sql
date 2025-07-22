-- Add indexes for common query patterns

-- Index for searching words by language and normalized word
CREATE INDEX IF NOT EXISTS idx_words_language_normalized 
ON public.words(language_id, normalized_word);

-- Index for word class lookups
CREATE INDEX IF NOT EXISTS idx_words_word_class 
ON public.words(word_class_id);

-- Index for sorting by frequency
CREATE INDEX IF NOT EXISTS idx_words_frequency 
ON public.words(language_id, frequency_score DESC NULLS LAST);

-- Index for filtering by first letter
CREATE INDEX IF NOT EXISTS idx_words_first_letter 
ON public.words(language_id, LEFT(normalized_word, 1));

-- Composite index for common filters
CREATE INDEX IF NOT EXISTS idx_words_filters 
ON public.words(language_id, word_class_id, obsolete, sensitive_content);

-- Index for definitions word lookup
CREATE INDEX IF NOT EXISTS idx_definitions_word_primary 
ON public.definitions(word_id, is_primary);

-- Index for translations lookup
CREATE INDEX IF NOT EXISTS idx_translations_word_definition 
ON public.translations(word_id, definition_id);

-- Create materialized view for word counts per language
CREATE MATERIALIZED VIEW IF NOT EXISTS language_word_counts AS
SELECT 
  l.id as language_id,
  l.code as language_code,
  COUNT(w.id) as word_count,
  COUNT(DISTINCT w.word_class_id) as word_class_count,
  COUNT(CASE WHEN w.obsolete = true THEN 1 END) as obsolete_count,
  COUNT(CASE WHEN w.sensitive_content = true THEN 1 END) as sensitive_count
FROM public.languages l
LEFT JOIN public.words w ON w.language_id = l.id
GROUP BY l.id, l.code;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_language_word_counts_id 
ON language_word_counts(language_id);

-- Create function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_language_word_counts()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY language_word_counts;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to refresh counts periodically (using pg_cron or manual refresh)
COMMENT ON FUNCTION refresh_language_word_counts() IS 
'Refresh the language word counts materialized view. Call this after bulk imports or periodically.';

-- Optimize search function for better performance
CREATE OR REPLACE FUNCTION search_words_optimized(
  p_search_term TEXT,
  p_language_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
  word_id UUID,
  word TEXT,
  normalized_word TEXT,
  word_class_name TEXT,
  definition TEXT,
  translation TEXT,
  language_name TEXT,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  WITH search_results AS (
    SELECT 
      w.id,
      w.word,
      w.normalized_word,
      wc.name as word_class_name,
      d.definition,
      t.translation,
      l.name as language_name,
      -- Calculate relevance score
      CASE 
        WHEN w.normalized_word = LOWER(p_search_term) THEN 1.0
        WHEN w.normalized_word LIKE LOWER(p_search_term) || '%' THEN 0.8
        WHEN w.normalized_word LIKE '%' || LOWER(p_search_term) || '%' THEN 0.6
        ELSE 0.4
      END as relevance
    FROM public.words w
    INNER JOIN public.languages l ON l.id = w.language_id
    LEFT JOIN public.word_classes wc ON wc.id = w.word_class_id
    LEFT JOIN public.definitions d ON d.word_id = w.id AND d.is_primary = true
    LEFT JOIN public.translations t ON t.word_id = w.id AND t.is_primary = true
    WHERE 
      (p_language_id IS NULL OR w.language_id = p_language_id)
      AND (
        w.normalized_word LIKE '%' || LOWER(p_search_term) || '%'
        OR w.word LIKE '%' || p_search_term || '%'
      )
      AND w.obsolete = false
      AND w.sensitive_content = false
  )
  SELECT 
    id as word_id,
    word,
    normalized_word,
    word_class_name,
    definition,
    translation,
    language_name,
    relevance as rank
  FROM search_results
  ORDER BY relevance DESC, normalized_word
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;