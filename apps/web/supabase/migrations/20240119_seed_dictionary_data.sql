-- Seed word classes/parts of speech
INSERT INTO public.word_classes (code, name, abbreviation, description, sort_order) VALUES
  ('noun', 'Noun', 'n.', 'A word used to identify people, places, things, or ideas', 1),
  ('verb', 'Verb', 'v.', 'A word used to describe an action, state, or occurrence', 2),
  ('adjective', 'Adjective', 'adj.', 'A word that modifies or describes a noun or pronoun', 3),
  ('adverb', 'Adverb', 'adv.', 'A word that modifies a verb, adjective, or another adverb', 4),
  ('pronoun', 'Pronoun', 'pron.', 'A word that takes the place of a noun', 5),
  ('preposition', 'Preposition', 'prep.', 'A word that shows the relationship between a noun and other words', 6),
  ('conjunction', 'Conjunction', 'conj.', 'A word used to connect clauses or sentences', 7),
  ('interjection', 'Interjection', 'interj.', 'A word or phrase that expresses emotion', 8),
  ('determiner', 'Determiner', 'det.', 'A word that introduces a noun', 9),
  ('particle', 'Particle', 'part.', 'A function word that does not belong to other categories', 10);

-- Add specific verb subcategories
INSERT INTO public.word_classes (code, name, abbreviation, description, parent_id, sort_order) 
SELECT 
  'transitive-verb', 'Transitive Verb', 'v.t.', 'A verb that requires a direct object', id, 1
FROM public.word_classes WHERE code = 'verb';

INSERT INTO public.word_classes (code, name, abbreviation, description, parent_id, sort_order) 
SELECT 
  'intransitive-verb', 'Intransitive Verb', 'v.i.', 'A verb that does not require a direct object', id, 2
FROM public.word_classes WHERE code = 'verb';

-- Add other specific word classes found in the dictionary
INSERT INTO public.word_classes (code, name, abbreviation, description, sort_order) VALUES
  ('direction', 'Direction', 'dir.', 'Words indicating direction or location', 11),
  ('exclamation', 'Exclamation', 'excl.', 'Words or phrases expressing strong emotion', 12),
  ('number', 'Number', 'num.', 'Words representing numbers or quantities', 13),
  ('question', 'Question Word', 'q.', 'Words used to form questions', 14);

-- Insert the languages we have dictionaries for
INSERT INTO public.languages (
  code, name, native_name, description, region, country, status, family,
  writing_system, is_active
) VALUES 
  (
    'kuku_yalanji',
    'Kuku Yalanji',
    'Kuku Yalanji',
    'The Kuku Yalanji language is spoken by the Kuku Yalanji people of Far North Queensland, Australia. It is part of the Pama-Nyungan language family.',
    'Far North Queensland',
    'Australia',
    'severely endangered',
    'Pama-Nyungan',
    'Latin script',
    true
  ),
  (
    'migmaq',
    'Mi''gmaq',
    'Mi''gmaq',
    'Mi''gmaq is an Eastern Algonquian language spoken primarily in Eastern Canada and parts of the United States.',
    'Eastern Canada, Northeastern United States',
    'Canada, United States',
    'vulnerable',
    'Algonquian',
    'Latin script, Mi''kmaq hieroglyphic writing',
    true
  ),
  (
    'anindilyakwa',
    'Anindilyakwa',
    'Anindilyakwa',
    'Anindilyakwa is an Australian Aboriginal language spoken on Groote Eylandt in the Northern Territory.',
    'Groote Eylandt, Northern Territory',
    'Australia',
    'vulnerable',
    'Gunwinyguan',
    'Latin script',
    true
  );

-- Create a function to normalize words for searching
CREATE OR REPLACE FUNCTION normalize_word(input_word TEXT) RETURNS TEXT AS $$
BEGIN
  -- Remove accents, convert to lowercase, trim spaces
  RETURN LOWER(TRIM(unaccent(input_word)));
EXCEPTION
  WHEN OTHERS THEN
    -- If unaccent extension is not available, just lowercase and trim
    RETURN LOWER(TRIM(input_word));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create a function to automatically set normalized_word
CREATE OR REPLACE FUNCTION set_normalized_word() RETURNS TRIGGER AS $$
BEGIN
  NEW.normalized_word := normalize_word(NEW.word);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER normalize_word_trigger
  BEFORE INSERT OR UPDATE ON public.words
  FOR EACH ROW
  EXECUTE FUNCTION set_normalized_word();