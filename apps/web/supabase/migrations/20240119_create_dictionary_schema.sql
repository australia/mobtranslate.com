-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- Create languages table
CREATE TABLE IF NOT EXISTS public.languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'kuku_yalanji'
  name VARCHAR(255) NOT NULL, -- e.g., 'Kuku Yalanji'
  native_name VARCHAR(255), -- Name in the language itself
  description TEXT,
  region TEXT,
  country VARCHAR(100),
  speakers_count INTEGER,
  status VARCHAR(50), -- endangered, vulnerable, safe, etc.
  family VARCHAR(255), -- Language family
  iso_639_1 VARCHAR(2), -- ISO 639-1 code if exists
  iso_639_2 VARCHAR(3), -- ISO 639-2 code if exists
  iso_639_3 VARCHAR(3), -- ISO 639-3 code if exists
  glottocode VARCHAR(20), -- Glottolog code
  writing_system VARCHAR(100),
  orthography_notes TEXT,
  metadata JSONB DEFAULT '{}', -- Additional flexible metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true
);

-- Create contributors table
CREATE TABLE IF NOT EXISTS public.contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  role VARCHAR(100), -- linguist, native_speaker, researcher, etc.
  bio TEXT,
  credentials TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create language contributors junction table
CREATE TABLE IF NOT EXISTS public.language_contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language_id UUID REFERENCES public.languages(id) ON DELETE CASCADE,
  contributor_id UUID REFERENCES public.contributors(id) ON DELETE CASCADE,
  role VARCHAR(100), -- maintainer, contributor, reviewer
  permissions JSONB DEFAULT '{}', -- Specific permissions for this language
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(language_id, contributor_id)
);

-- Create word classes/parts of speech table
CREATE TABLE IF NOT EXISTS public.word_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL, -- noun, verb, adj, etc.
  name VARCHAR(100) NOT NULL,
  abbreviation VARCHAR(20),
  description TEXT,
  parent_id UUID REFERENCES public.word_classes(id), -- For sub-categories
  sort_order INTEGER DEFAULT 0
);

-- Create the main words table
CREATE TABLE IF NOT EXISTS public.words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language_id UUID REFERENCES public.languages(id) ON DELETE CASCADE NOT NULL,
  word VARCHAR(500) NOT NULL, -- The word itself
  normalized_word VARCHAR(500), -- Normalized form for searching
  phonetic_transcription VARCHAR(500), -- IPA transcription
  word_class_id UUID REFERENCES public.word_classes(id),
  word_type VARCHAR(100), -- More specific type from YAML
  gender VARCHAR(50), -- masculine, feminine, neuter, etc.
  number VARCHAR(50), -- singular, plural, dual, etc.
  stem VARCHAR(255), -- Root/stem form
  is_loan_word BOOLEAN DEFAULT false,
  loan_source_language VARCHAR(255),
  frequency_score INTEGER, -- How common the word is
  register VARCHAR(100), -- formal, informal, slang, etc.
  domain VARCHAR(255), -- medical, legal, everyday, etc.
  dialectal_variation BOOLEAN DEFAULT false,
  obsolete BOOLEAN DEFAULT false,
  sensitive_content BOOLEAN DEFAULT false, -- For culturally sensitive words
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  version INTEGER DEFAULT 1,
  UNIQUE(language_id, word, word_class_id)
);

-- Create definitions table
CREATE TABLE IF NOT EXISTS public.definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id UUID REFERENCES public.words(id) ON DELETE CASCADE NOT NULL,
  definition TEXT NOT NULL,
  definition_number INTEGER DEFAULT 1, -- Order of definitions
  context VARCHAR(500), -- Specific context where this definition applies
  register VARCHAR(100), -- formal, informal, etc.
  domain VARCHAR(255), -- specific field or domain
  is_primary BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id)
);

-- Create translations table
CREATE TABLE IF NOT EXISTS public.translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id UUID REFERENCES public.words(id) ON DELETE CASCADE NOT NULL,
  definition_id UUID REFERENCES public.definitions(id) ON DELETE CASCADE,
  translation VARCHAR(500) NOT NULL,
  target_language VARCHAR(10) DEFAULT 'en', -- ISO language code
  translation_type VARCHAR(50), -- literal, contextual, etc.
  is_primary BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id)
);

-- Create synonyms table (self-referencing words)
CREATE TABLE IF NOT EXISTS public.synonyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id UUID REFERENCES public.words(id) ON DELETE CASCADE NOT NULL,
  synonym_word_id UUID REFERENCES public.words(id) ON DELETE CASCADE,
  synonym_text VARCHAR(500), -- For synonyms not in the database
  relationship_type VARCHAR(50) DEFAULT 'synonym', -- synonym, near-synonym, regional-variant
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(word_id, synonym_word_id),
  CHECK (word_id != synonym_word_id)
);

-- Create antonyms table
CREATE TABLE IF NOT EXISTS public.antonyms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id UUID REFERENCES public.words(id) ON DELETE CASCADE NOT NULL,
  antonym_word_id UUID REFERENCES public.words(id) ON DELETE CASCADE,
  antonym_text VARCHAR(500), -- For antonyms not in the database
  relationship_type VARCHAR(50) DEFAULT 'antonym',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(word_id, antonym_word_id),
  CHECK (word_id != antonym_word_id)
);

-- Create usage examples table
CREATE TABLE IF NOT EXISTS public.usage_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id UUID REFERENCES public.words(id) ON DELETE CASCADE NOT NULL,
  definition_id UUID REFERENCES public.definitions(id) ON DELETE CASCADE,
  example_text TEXT NOT NULL, -- Example in the source language
  translation TEXT, -- Translation of the example
  transliteration TEXT, -- Romanized version if applicable
  context VARCHAR(255), -- Conversational, formal, etc.
  source VARCHAR(500), -- Where this example comes from
  audio_id UUID, -- Reference to audio table
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id)
);

-- Create cultural contexts table
CREATE TABLE IF NOT EXISTS public.cultural_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id UUID REFERENCES public.words(id) ON DELETE CASCADE NOT NULL,
  context_description TEXT NOT NULL,
  cultural_significance TEXT,
  usage_restrictions TEXT, -- Who can use this word, when, etc.
  ceremonial_use BOOLEAN DEFAULT false,
  gender_specific BOOLEAN DEFAULT false,
  age_specific BOOLEAN DEFAULT false,
  sacred_or_taboo VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id)
);

-- Create etymology table
CREATE TABLE IF NOT EXISTS public.etymologies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id UUID REFERENCES public.words(id) ON DELETE CASCADE NOT NULL,
  origin_language VARCHAR(255),
  origin_word VARCHAR(500),
  origin_meaning TEXT,
  etymology_description TEXT,
  borrowed_date VARCHAR(100), -- Approximate date/period
  semantic_shift TEXT, -- How meaning has changed
  cognates TEXT, -- Related words in other languages
  reference_sources TEXT, -- Changed from 'references' which is reserved
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id)
);

-- Create word relationships table (for compound words, derived words, etc.)
CREATE TABLE IF NOT EXISTS public.word_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_word_id UUID REFERENCES public.words(id) ON DELETE CASCADE NOT NULL,
  related_word_id UUID REFERENCES public.words(id) ON DELETE CASCADE NOT NULL,
  relationship_type VARCHAR(100) NOT NULL, -- compound, derived, inflection, etc.
  relationship_description TEXT,
  morphological_process VARCHAR(255), -- affixation, reduplication, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(parent_word_id, related_word_id, relationship_type),
  CHECK (parent_word_id != related_word_id)
);

-- Create audio pronunciations table
CREATE TABLE IF NOT EXISTS public.audio_pronunciations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id UUID REFERENCES public.words(id) ON DELETE CASCADE NOT NULL,
  speaker_id UUID REFERENCES public.contributors(id),
  audio_url TEXT NOT NULL,
  audio_format VARCHAR(20), -- mp3, wav, etc.
  duration_ms INTEGER,
  dialect VARCHAR(255),
  speaker_gender VARCHAR(20),
  speaker_age_group VARCHAR(50),
  quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 5),
  is_primary BOOLEAN DEFAULT false,
  transcription TEXT, -- Phonetic transcription of this specific recording
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id)
);

-- Create dialects table
CREATE TABLE IF NOT EXISTS public.dialects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language_id UUID REFERENCES public.languages(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  region VARCHAR(255),
  speaker_count INTEGER,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create word dialects junction table
CREATE TABLE IF NOT EXISTS public.word_dialects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id UUID REFERENCES public.words(id) ON DELETE CASCADE NOT NULL,
  dialect_id UUID REFERENCES public.dialects(id) ON DELETE CASCADE NOT NULL,
  dialectal_form VARCHAR(500), -- How the word appears in this dialect
  pronunciation_difference TEXT,
  meaning_difference TEXT,
  notes TEXT,
  UNIQUE(word_id, dialect_id)
);

-- Create revision history table
CREATE TABLE IF NOT EXISTS public.word_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id UUID REFERENCES public.words(id) ON DELETE CASCADE NOT NULL,
  revision_data JSONB NOT NULL, -- Complete snapshot of word data
  change_description TEXT,
  changed_by UUID REFERENCES auth.users(id) NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  revision_number INTEGER NOT NULL
);

-- Create user favorites table
CREATE TABLE IF NOT EXISTS public.user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  word_id UUID REFERENCES public.words(id) ON DELETE CASCADE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, word_id)
);

-- Create search history table
CREATE TABLE IF NOT EXISTS public.search_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  language_id UUID REFERENCES public.languages(id) ON DELETE CASCADE,
  search_term VARCHAR(500) NOT NULL,
  search_type VARCHAR(50), -- word, definition, translation
  results_count INTEGER,
  selected_word_id UUID REFERENCES public.words(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_words_language_id ON public.words(language_id);
CREATE INDEX idx_words_normalized ON public.words(normalized_word);
CREATE INDEX idx_words_word_trgm ON public.words USING gin(word gin_trgm_ops);
CREATE INDEX idx_definitions_word_id ON public.definitions(word_id);
CREATE INDEX idx_translations_word_id ON public.translations(word_id);
CREATE INDEX idx_usage_examples_word_id ON public.usage_examples(word_id);
CREATE INDEX idx_search_history_user_id ON public.search_history(user_id);
CREATE INDEX idx_search_history_created_at ON public.search_history(created_at DESC);

-- Create full-text search
ALTER TABLE public.words ADD COLUMN search_vector tsvector;
ALTER TABLE public.definitions ADD COLUMN search_vector tsvector;

-- Update search vectors
CREATE OR REPLACE FUNCTION update_word_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', COALESCE(NEW.word, '') || ' ' || COALESCE(NEW.normalized_word, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_definition_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', COALESCE(NEW.definition, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER word_search_vector_update 
  BEFORE INSERT OR UPDATE ON public.words
  FOR EACH ROW EXECUTE FUNCTION update_word_search_vector();

CREATE TRIGGER definition_search_vector_update 
  BEFORE INSERT OR UPDATE ON public.definitions
  FOR EACH ROW EXECUTE FUNCTION update_definition_search_vector();

-- Create search indexes
CREATE INDEX idx_words_search_vector ON public.words USING gin(search_vector);
CREATE INDEX idx_definitions_search_vector ON public.definitions USING gin(search_vector);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_languages_updated_at BEFORE UPDATE ON public.languages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_words_updated_at BEFORE UPDATE ON public.words
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cultural_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_pronunciations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

-- Create basic RLS policies (read access for all, write access for authenticated users)
-- Languages - everyone can read
CREATE POLICY "Languages are viewable by everyone" ON public.languages
  FOR SELECT USING (is_active = true);

CREATE POLICY "Authenticated users can insert languages" ON public.languages
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Language maintainers can update" ON public.languages
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT lc.contributor_id 
      FROM public.language_contributors lc 
      WHERE lc.language_id = languages.id 
      AND lc.role IN ('maintainer', 'admin')
    )
  );

-- Words - everyone can read approved words
CREATE POLICY "Approved words are viewable by everyone" ON public.words
  FOR SELECT USING (approved_by IS NOT NULL OR created_by = auth.uid());

CREATE POLICY "Authenticated users can insert words" ON public.words
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own words" ON public.words
  FOR UPDATE USING (created_by = auth.uid() AND approved_by IS NULL);

-- Similar policies for other tables
CREATE POLICY "Definitions are viewable by everyone" ON public.definitions
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert definitions" ON public.definitions
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Translations are viewable by everyone" ON public.translations
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert translations" ON public.translations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Usage examples are viewable by everyone" ON public.usage_examples
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert usage examples" ON public.usage_examples
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Cultural contexts are viewable by everyone" ON public.cultural_contexts
  FOR SELECT USING (true);

CREATE POLICY "Contributors are viewable by everyone" ON public.contributors
  FOR SELECT USING (true);

CREATE POLICY "Audio pronunciations are viewable by everyone" ON public.audio_pronunciations
  FOR SELECT USING (true);

-- User-specific policies
CREATE POLICY "Users can manage their own favorites" ON public.user_favorites
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can view their own search history" ON public.search_history
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can insert search history" ON public.search_history
  FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);