-- Kuku Yalanji Dictionary Import SQL
-- Generated from 2624 words

-- Add any missing word classes
INSERT INTO public.word_classes (code, name, abbreviation, sort_order) VALUES
('modifier', 'Modifier', 'mod.', 15),
('transitive', 'transitive', 'transitive', 99),
('adj', 'adj', 'adj', 99),
('trv', 'trv', 'trv', 99),
('associative', 'associative', 'associative', 99),
('transitive verb', 'transitive verb', 'transitive verb', 99),
('intransitive verb', 'intransitive verb', 'intransitive verb', 99),
('auxilary', 'auxilary', 'auxilary', 99),
('manner', 'Manner', 'manner', 17),
('intranstive-verb', 'intranstive-verb', 'intranstive-verb', 99),
('pro-noun', 'pro-noun', 'pro-noun', 99),
('directional', 'directional', 'directional', 99),
('intrasitive-verb', 'intrasitive-verb', 'intrasitive-verb', 99),
('time', 'Time Expression', 'time', 16),
('conujunction', 'conujunction', 'conujunction', 99),
('negative', 'negative', 'negative', 99),
('adjunction', 'adjunction', 'adjunction', 99),
('pr', 'Pronoun', 'pr.', 18),
('policeman', 'policeman', 'policeman', 99),
('lower legs', 'lower legs', 'lower legs', 99),
('shellbait', 'shellbait', 'shellbait', 99),
('arm', 'arm', 'arm', 99),
('ass', 'ass', 'ass', 99),
('demonstrative', 'demonstrative', 'demonstrative', 99),
('transtive-verb', 'transtive-verb', 'transtive-verb', 99)
ON CONFLICT (code) DO NOTHING;

-- Import words
DO $$
DECLARE
  v_language_id UUID;
  v_word_id UUID;
  v_word_class_id UUID;
  v_definition_id UUID;
BEGIN
  -- Get language ID
  SELECT id INTO v_language_id FROM public.languages WHERE code = 'kuku_yalanji';

  -- Word 1: ba
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'intransitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'ba', v_word_class_id, 'intransitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'come. Baby talk, usually used with very small children only. Used only as a command.', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'come', 'en', TRUE);

  END IF;

  -- Word 2: babajaka
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'babajaka', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'species of bloodwood tree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'blood wood tree', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bloodwood tree', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bloodwood', 'en', FALSE);

  END IF;

  -- Word 3: babaji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'babaji', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'ask. "Ngayu nyungundu babajin, Wanju nyulu?" "I asked him, Who is he?"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'ask', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'asked', 'en', FALSE);

  END IF;

  -- Word 4: babal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'babal', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'try. "ngayu baduriji dungaka, yinya bubu babanka", "I want to go fishing to try the place out"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'try', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'taste', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'taste. "ngayu mayi wayjul-wayjul, babal saltmunku", "While I''m cooking the food I''ll taste it for salt"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'try', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'taste', 'en', FALSE);

  END IF;

  -- Word 5: baban
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baban', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'anglefish', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'anglefish', 'en', TRUE);

  END IF;

  -- Word 6: babarr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'babarr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'older sister. "Yabaju-karra babarranda dungan mayika", "The younger brothers went to their older sister for food"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'older sister', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sister', 'en', FALSE);

  END IF;

  -- Word 7: babi
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'babi', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'grandmother, father''s mother. "Babingka jija kujin-kujil", "Grand mother is looking after her grandchild"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'grandmother', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'grandfather', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'grandfather, mother''s father', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'grandmother', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'grandfather', 'en', FALSE);

  END IF;

  -- Word 8: bada
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'direction';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bada', v_word_class_id, 'direction', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'down, down river, down hill. "Ngayu bada beachmunbu dungan", "I went to the beach"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'down', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'down hill', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'down river', 'en', FALSE);

  END IF;

  -- Word 9: badamal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'intransitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'badamal', v_word_class_id, 'intransitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'bend down. "Yungu dukul badamaka", "You bend your head down"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bend', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bend down', 'en', FALSE);

  END IF;

  -- Word 10: bada-bada
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'direction';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bada-bada', v_word_class_id, 'direction', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'underneath, below. "Kaban bada-bada tablebu", "The paper is under the table"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'below', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'underneath', 'en', FALSE);

  END IF;

  -- Word 11: badi
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'intransitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'badi', v_word_class_id, 'intransitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to cry, "karrakay badin mayika", "the child cried for food"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'cry', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'wail', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sing', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'howl', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to wail, mourn. "jana banbadi yaba wulanya", "They are wailing because their older brother died"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'cry', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'wail', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sing', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'howl', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to sing. "Dikal yalibalaku banbadin", "The birds were singing early in the morning"', 3, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'cry', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'wail', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sing', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'howl', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to howl. "kaya-kaya banbadin majangka bawanya", "the dogs were howling because their master left them"', 4, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'cry', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'wail', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sing', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'howl', 'en', FALSE);

  END IF;

  -- Word 12: badibu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'badibu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'spotted eagle ray', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'ray', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'eagle ray', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'spotted eagle ray', 'en', FALSE);

  END IF;

  -- Word 13: badur
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'badur', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'hook and line. "ngayu badurriji bundanday", "I''m fishing (sitting with hook and line)"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'hook', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fishing', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fishing line', 'en', FALSE);

  END IF;

  -- Word 14: baja
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'modifier';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baja', v_word_class_id, 'modifier', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'again. "jana kuljubu jarba kunin baja, kunin baja", "They hit the snake again and again with stones"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'more', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'again', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'more. "yundu wunay baja?", "do you have more?"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'more', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'again', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'I don''t know. "ngayu wanyu baja balkal", "I don''t know what to tell" (This is used only with a question word)', 3, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'more', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'again', 'en', FALSE);

  END IF;

  -- Word 15: bajabaja
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bajabaja', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'blue-tongue lizard', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'blue-tongue lizard', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'lizard', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name. spring above middle camp, story site', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'blue-tongue lizard', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'lizard', 'en', FALSE);

  END IF;

  -- Word 16: baja-burray
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'intransitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baja-burray', v_word_class_id, 'intransitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'tired. "ngayu baja-burray jilbamun", "I''m tired after the walkabout"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tired', 'en', TRUE);

  END IF;

  -- Word 17: bajaku
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'modifier';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bajaku', v_word_class_id, 'modifier', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'very. "jana mayi jirray ajaku manin storemun", "They got very much food from the store"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'very', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'definitely', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'real', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'definitely. "ngayu kari bajakudungay", "I''m definitely not going"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'very', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'definitely', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'real', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'shows intensity. "nyulu bama bajaku", "he''s a real aboriginal"', 3, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'very', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'definitely', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'real', 'en', FALSE);

  END IF;

  -- Word 18: bajal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bajal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'species of bower bird"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bower bird', 'en', TRUE);

  END IF;

  -- Word 19: bajalji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bajalji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'species of rock python. Not many at Bloomfield, but many at Helenvale, Rossville and Shiptons Flats. They have a white head and will chase bald-headed people not wearing a hat beecause they think they are being copied', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'rock python', 'en', TRUE);

  END IF;

  -- Word 20: bajanji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bajanji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'stubborn', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'stubborn', 'en', TRUE);

    INSERT INTO public.synonyms (word_id, synonym_text)
    VALUES (v_word_id, 'dukul-dandi');
    INSERT INTO public.synonyms (word_id, synonym_text)
    VALUES (v_word_id, 'walu-walu');
    INSERT INTO public.synonyms (word_id, synonym_text)
    VALUES (v_word_id, 'walu-dandi');
  END IF;

  -- Word 21: bajar
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bajar', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Moreton Bay ash.', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'ash', 'en', TRUE);

  END IF;

  -- Word 22: bajar
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bajar', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Moreton Bay ash.', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'ash', 'en', TRUE);

  END IF;

  -- Word 23: bajarr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bajarr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'loya vine fern leaves, used in making mia-mia', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'leaves', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'vine', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fern', 'en', FALSE);

  END IF;

  -- Word 24: bajarr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bajarr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'loya vine fern leaves, used in making mia-mia', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'leaves', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'vine', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fern', 'en', FALSE);

  END IF;

  -- Word 25: bajaybajay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bajaybajay', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'painful. "Bangkarr bajaybajay flumunmun", "My body is sore after the fly"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'pain', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'painful', 'en', FALSE);

    INSERT INTO public.synonyms (word_id, synonym_text)
    VALUES (v_word_id, 'kaka');
    INSERT INTO public.synonyms (word_id, synonym_text)
    VALUES (v_word_id, 'wurrkal');
  END IF;

  -- Word 26: baji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'a sore', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sore', 'en', TRUE);

  END IF;

  -- Word 27: bajibay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bajibay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'bone', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bone', 'en', TRUE);

  END IF;

  -- Word 28: baju
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baju', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'lump on neck', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'lump', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'neck lump', 'en', FALSE);

  END IF;

  -- Word 29: bajurr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bajurr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'nuisance. "Yinya karrkay bajurr bajaku", "That child is a big nuisance"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'nuisance', 'en', TRUE);

  END IF;

  -- Word 30: bajurr-bangkan
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bajurr-bangkan', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to scold. "Ngayu kangkal bajurr-bangkan, nyulu cassette dumbarrinya", "I scolded my child because he broke the cassette"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'scolded', 'en', TRUE);

  END IF;

  -- Word 31: bajuy
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bajuy', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'slippery lizard', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'lizard', 'en', TRUE);

  END IF;

  -- Word 32: bakal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bakal', v_word_class_id, 'transitive', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'dig. "Jana bubu bakan", "They dug a hole"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'dig', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'stab', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'prick', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'stab, prick. "Sisterrangka needleda bakan", "Sister gave me a shot (pricked with a needle)"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'dig', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'stab', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'prick', 'en', FALSE);

  END IF;

  -- Word 33: bakamu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bakamu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'green pigeon', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'pigeon', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'green pigeon', 'en', FALSE);

  END IF;

  -- Word 34: bakarr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bakarr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'ridge pole', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'ridge pole', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'pole', 'en', FALSE);

  END IF;

  -- Word 35: bakay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bakay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'short light brown or yellow water snake', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'water snake', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'snake', 'en', FALSE);

  END IF;

  -- Word 36: baki
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baki', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'toys with wheels. English loan word from buggy.', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'toy', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'buggy', 'en', FALSE);

  END IF;

  -- Word 37: Bakikiri
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'Bakikiri', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name, the river and ground at Butcher''s Hill', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'butchers hill', 'en', TRUE);

  END IF;

  -- Word 38: Baku
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'Baku', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name, point off Snapper Island', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'snapper island', 'en', TRUE);

  END IF;

  -- Word 39: bakul
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bakul', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'poison plant found at Rossville.', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'poison plant', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'tobacco. This is no longer in use for tobacco.', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'poison plant', 'en', TRUE);

  END IF;

  -- Word 40: bala
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bala', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'feathertail flider or sugar glider', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sugar glider', 'en', TRUE);

  END IF;

  -- Word 41: bala
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bala', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'skinny, weak from sickness or not enough to eat. "Yundu balaman mayi karimun", "You became skinny from not having enough food"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'skinny', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'weak', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'boney', 'en', FALSE);

    INSERT INTO public.synonyms (word_id, synonym_text)
    VALUES (v_word_id, 'yayji');
  END IF;

  -- Word 42: Balabay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'Balabay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name. Plantation Creek and the ground around its mouth', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'plantation creek', 'en', TRUE);

  END IF;

  -- Word 43: balamu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balamu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'boil', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'boil', 'en', TRUE);

  END IF;

  -- Word 44: balanbalan
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adj';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balanbalan', v_word_class_id, 'adj', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'level, flat', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'level', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'flat', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'a "Yundu balnhi wunay, bayan ngara bubunga balanbalanba.", "When you camp out, you should build your shelter on flat ground"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'level', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'flat', 'en', FALSE);

  END IF;

  -- Word 45: balar
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balar', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'high tide', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'high tide', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'high-tide', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tide', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name - Okay Creek ground', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'high tide', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'high-tide', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tide', 'en', FALSE);

  END IF;

  -- Word 46: balarr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balarr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'human body flea', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'flea', 'en', TRUE);

  END IF;

  -- Word 47: balarri
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balarri', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'queenfish', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'queenfish', 'en', TRUE);

  END IF;

  -- Word 48: balay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balay', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'level ground', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'ground', 'en', TRUE);

    INSERT INTO public.synonyms (word_id, synonym_text)
    VALUES (v_word_id, 'dubar');
  END IF;

  -- Word 49: balba
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balba', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'pregnant', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'pregnant', 'en', TRUE);

    INSERT INTO public.synonyms (word_id, synonym_text)
    VALUES (v_word_id, 'kulngkul');
  END IF;

  -- Word 50: balbal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'trv';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balbal', v_word_class_id, 'trv', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'shine "Wungaraba dayirr bajaku balban." , "The sun shone brightly"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'shine', 'en', TRUE);

  END IF;

  -- Word 51: balbay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balbay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'lightning "Balbaynja dalbarrinji", "Lighting might strike"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'lightning', 'en', TRUE);

  END IF;

  -- Word 52: balbi
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'trv';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balbi', v_word_class_id, 'trv', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'hunt for, search for', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'hunt', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'search', 'en', FALSE);

  END IF;

  -- Word 53: balibali
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adj';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balibali', v_word_class_id, 'adj', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'leaky, "Bayan balibali, bana walalarrku", "The house is leaky, the water is coming in."', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'leaky', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'leaking', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'leak', 'en', FALSE);

  END IF;

  -- Word 54: baliji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baliji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'people belonging to open country', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'people', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'country people', 'en', FALSE);

  END IF;

  -- Word 55: balja
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balja', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'A kind of food. It is coked in the fire, groud up and eaten.', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'food', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'ground food', 'en', FALSE);

  END IF;

  -- Word 56: balji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'ladie''s dilly bag, made from grass or black palm', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bag', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'dilly bag', 'en', FALSE);

  END IF;

  -- Word 57: balkabalka
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balkabalka', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'something fishy', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fishy', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'stinky', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name, mouth of Bloomfield River, south side', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fishy', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'stinky', 'en', FALSE);

  END IF;

  -- Word 58: balkaji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'intransitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balkaji', v_word_class_id, 'intransitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to be born, to come into being', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'being', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'becoming', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'born', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name, mouth of Bloomfield River, south side', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'being', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'becoming', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'born', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'being, "ngawa yilayku balkajin", "the baby was born yesterday"', 3, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'being', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'becoming', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'born', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'being, "nganka balkajinda", "there are are flowers now"', 4, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'being', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'becoming', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'born', 'en', FALSE);

  END IF;

  -- Word 59: balkal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balkal', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'tell, "ngayu yunundu balkankuda", "I already told you"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tell', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'make', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'make, "nyulu kalka balkan", "he made a spear"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tell', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'make', 'en', FALSE);

  END IF;

  -- Word 60: balkalaway
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'intransitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balkalaway', v_word_class_id, 'intransitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'discuss', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'discuss', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'talk together', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'talk together', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'discuss', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'talk together', 'en', FALSE);

  END IF;

  -- Word 61: balmbalka
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balmbalka', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'species of tree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tree', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'balmbalka', 'en', FALSE);

  END IF;

  -- Word 62: balngku
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balngku', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'not quite fully grown', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'immature', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'boy', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'boy''s age before he becomes a warru', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'immature', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'boy', 'en', FALSE);

  END IF;

  -- Word 63: balnji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'modifier';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balnji', v_word_class_id, 'modifier', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'doing something right', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'properly', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'correct', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'right', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'properly with a fire as in cooking or hardening spears over a fire', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'properly', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'correct', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'right', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'doing something right, "minya balnji baja wayju", "cook the meat properly"', 3, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'properly', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'correct', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'right', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'camping out, "jana balnji wunanay", "they are camping out"', 4, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'properly', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'correct', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'right', 'en', FALSE);

  END IF;

  -- Word 64: balu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'associative';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balu', v_word_class_id, 'associative', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'not want, "ngayu diyika baluda", "I don''t want any tea right now"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'don''t want', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'not want', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'don''t want', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'don''t want', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'not want', 'en', FALSE);

  END IF;

  -- Word 65: balu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'modifier';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balu', v_word_class_id, 'modifier', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'contrary to fact thought, "balu nyulu kadan", "I thought he came but he didn''t"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'let', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'allow', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'almost', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'almost, just about, "ngayu balu jukijuki kunin", "I almost hit the chicken"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'let', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'allow', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'almost', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'allow, let, "diyi balu bujarmaka", "let the tea get cool"', 3, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'let', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'allow', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'almost', 'en', FALSE);

  END IF;

  -- Word 66: balungkul
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balungkul', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'shell back snail', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'shell back snail', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'snail', 'en', FALSE);

  END IF;

  -- Word 67: balur
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balur', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'spear thrower', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'spear thrower', 'en', TRUE);

  END IF;

  -- Word 68: bama
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bama', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'people, mankind', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'people', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bama', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'mankind', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'people', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bama', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'aborigine, not a white person', 3, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'people', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bama', 'en', FALSE);

  END IF;

  -- Word 69: bama-ngaykunku
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'exclamation';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bama-ngaykunku', v_word_class_id, 'exclamation', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'my word, "bama ngaykunku, nganya balu kunijinkuda", "my word, I was almost hit"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'my word', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'my voice', 'en', FALSE);

  END IF;

  -- Word 70: bambal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bambal', v_word_class_id, 'transitive verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'call by kinship term, "ngayu nyungunin bambal babi", "I call her grandmother"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'claim', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'kinship', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'family', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'choose in the sense of claim', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'claim', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'kinship', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'family', 'en', FALSE);

  END IF;

  -- Word 71: bamban
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bamban', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'me first', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'me first', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'first in line', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'me first', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'first to get something', 3, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'me first', 'en', TRUE);

  END IF;

  -- Word 72: bambay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bambay', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'sick', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sick', 'en', TRUE);

  END IF;

  -- Word 73: bambay-baka
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bambay-baka', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'a sickly person', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sick person', 'en', TRUE);

  END IF;

  -- Word 74: bambayal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bambayal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'a long thin variety of yam', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'yam', 'en', TRUE);

  END IF;

  -- Word 75: bana
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bana', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'water', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'water', 'en', TRUE);

  END IF;

  -- Word 76: banabila
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'banabila', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name - the ground at the mouth of the Bloomfield River on the south side through where Mr. Biddle''s mission used to be', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'Banabila', 'en', TRUE);

  END IF;

  -- Word 77: banabila-warra
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'banabila-warra', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'the people that belong to the mouth of the river and along the beach', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'Banabila people', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'people who belong to Banabila', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'Banabila people', 'en', TRUE);

  END IF;

  -- Word 78: banabul
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'banabul', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'pineapple', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'pineapple', 'en', TRUE);

  END IF;

  -- Word 79: banaji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'banaji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'name given to a doctor man', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'doctor', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'doctor', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'doctor', 'en', TRUE);

  END IF;

  -- Word 80: banamu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'banamu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'fresh water snake', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fresh water snake', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'snake', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fresh water snake', 'en', TRUE);

  END IF;

  -- Word 81: Banbanba
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'Banbanba', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name - Spring Vale', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'Spring Vale', 'en', TRUE);

  END IF;

  -- Word 82: banda
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'banda', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'point of tail', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tail', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tail tip', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'tip of tail', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tail', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tail tip', 'en', FALSE);

  END IF;

  -- Word 83: banday
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'banday', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'species of tree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'Banday', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'also the fruit of the tree which is like a small cherry, ripe in December', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'Banday', 'en', TRUE);

  END IF;

  -- Word 84: bandin
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bandin', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'waist on the side above the hips', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'love handles', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'love handles', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'love handles', 'en', TRUE);

  END IF;

  -- Word 85: bangka-bangkangal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bangka-bangkangal', v_word_class_id, 'transitive verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to sing, shout, cry loudly, "kaykay-kaykayangka wulngku bangka-bangkangan", "the children sang loudly"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'cry', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'wail', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'shout', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sing', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'sing', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'cry', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'wail', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'shout', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sing', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'shout', 3, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'cry', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'wail', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'shout', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sing', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'wail', 4, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'cry', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'wail', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'shout', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sing', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'cry loudly', 5, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'cry', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'wail', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'shout', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sing', 'en', FALSE);

  END IF;

  -- Word 86: bangkal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bangkal', v_word_class_id, 'transitive verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'gather, accumulate, "ngayu Brisbane dungan, toy, kambi bangkal-bangkan yabaju-karragna", "When I went to Brisbane, I got (gathered) toys and clothing for my younger brothers"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'gather', 'en', TRUE);

  END IF;

  -- Word 87: bangkal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bangkal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'tongs made from voya vine, used in cooking in a kurrma - an earth oven', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tongs', 'en', TRUE);

  END IF;

  -- Word 88: Bangkal-ngaran
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'Bangkal-ngaran', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name of ground where Grass tree and Bijan creeks meet.', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'Bangkal-ngaran', 'en', TRUE);

  END IF;

  -- Word 89: bangkamu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bangkamu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'sweet potato', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sweet potato', 'en', TRUE);

  END IF;

  -- Word 90: bangkan
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bangkan', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'a kind of root, a medecine for sores. Boil the roots and wash the sores with the water.', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'root', 'en', TRUE);

  END IF;

  -- Word 91: bangkarr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bangkarr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'a person''s body, his flesh', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'body', 'en', TRUE);

  END IF;

  -- Word 92: bangkarr-bajurr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bangkarr-bajurr', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'a person who is a nuisance', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'nuisance', 'en', TRUE);

  END IF;

  -- Word 93: bangkarr-bila
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bangkarr-bila', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'a person who is in a hurry', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'hurry', 'en', TRUE);

  END IF;

  -- Word 94: bangkarr-buyan
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bangkarr-buyan', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'sick', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sick person', 'en', TRUE);

  END IF;

  -- Word 95: bangkarr-jiba-badi
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bangkarr-jiba-badi', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'person who shows mercy', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'merciful', 'en', TRUE);

  END IF;

  -- Word 96: bangkarr-wumba
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bangkarr-wumba', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'humble', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'humble', 'en', TRUE);

  END IF;

  -- Word 97: bangunji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bangunji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'cousin', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'cousin', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'full blood cousin', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'cousin', 'en', TRUE);

  END IF;

  -- Word 98: banjay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'banjay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'species of wild yam, small and round. They are roasted in the fire, ground up and eaten. Given to the child to make it talk.', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'wild yam', 'en', TRUE);

  END IF;

  -- Word 99: banji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'banji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'relationship term, brother-in-law or sister-in-law. This shows actual relationship, not tribal relationship, someone who marries your actual brother or sister.', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'brother-in-law', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sister-in-law', 'en', FALSE);

  END IF;

  -- Word 100: baral
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baral', v_word_class_id, 'transitive verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to feel something, "nyulu nguwul-nguwulbu torch baran-baral", "He was feeling for his torch in the dark"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'feeling', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'feel', 'en', FALSE);

  END IF;

  -- Word 101: baral
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baral', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'road, path, track, trail', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'road', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'path', 'en', FALSE);

  END IF;

  -- Word 102: barbarr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'barbarr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'young cassowary', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'young cassowary', 'en', TRUE);

  END IF;

  -- Word 103: barbi
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'barbi', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'pale, as from sickness', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'pale', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sick', 'en', FALSE);

  END IF;

  -- Word 104: barbi
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'barbi', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'half-caste', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'half-caste', 'en', TRUE);

  END IF;

  -- Word 105: bari
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bari', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'chin', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'chin', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'jaw', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'jaw', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'chin', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'jaw', 'en', FALSE);

  END IF;

  -- Word 106: baril-baril
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baril-baril', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Moreton Bay fig tree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'Moreton Bay fig tree', 'en', TRUE);

  END IF;

  -- Word 107: baringkan
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baringkan', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'species of small bird', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'baringkan (small bird)', 'en', TRUE);

  END IF;

  -- Word 108: barka
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'barka', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Queensland nut, ripe in July-October', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'yellow water snake', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'yellow water snake', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'yellow water snake', 'en', TRUE);

  END IF;

  -- Word 109: Barkamali
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'Barkamali', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name - in the China camp area', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'Barkamali', 'en', TRUE);

  END IF;

  -- Word 110: baru
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baru', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'lap, "nyulu karrkay barunga kujil-kujil", "she is holding the child in her lap"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'lap', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'lap, "nyulu karrkay baru-baka", "The child is spoiled - always wanting to be held"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'lap', 'en', TRUE);

  END IF;

  -- Word 111: barrangkul
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'barrangkul', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'flat', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'flat', 'en', TRUE);

  END IF;

  -- Word 112: barrbal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'barrbal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'black bream', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'black bream', 'en', TRUE);

  END IF;

  -- Word 113: barrka-buyan
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'barrka-buyan', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'person with a bad leg or arm, lame, crippled.', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'lame person', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'crippled', 'en', FALSE);

  END IF;

  -- Word 114: barrkar
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'barrkar', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'upper jaw', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'upper jaw', 'en', TRUE);

  END IF;

  -- Word 115: barrkawun
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'barrkawun', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'not good at something', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'unskilled', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'not good', 'en', FALSE);

  END IF;

  -- Word 116: barrmal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'barrmal', v_word_class_id, 'transitive verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'escort, to take a person somewhere, "ngayu jinkurr barrman kaminda", "I took younger sister to grandmother"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'escort', 'en', TRUE);

  END IF;

  -- Word 117: bawal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bawal', v_word_class_id, 'transitive verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to leave something or some place, "ngayu Bloomfield bawan, Mossman dungan", "I left Bloomfield and went to Mossman"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'quit', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'leave', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to quit something, "Kuyungku kari bajaku baykan, ngayu badu bawanda", "the fish wouldn''t bite so I quit fishing"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'quit', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'leave', 'en', FALSE);

  END IF;

  -- Word 118: bawaji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'intransitive verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bawaji', v_word_class_id, 'intransitive verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'stay, remain, is left, "jana bayanbaku dungan ngayu bawajin", "they all went home but I stayed"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'stay', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'remain', 'en', FALSE);

  END IF;

  -- Word 119: baway
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baway', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'black bean tree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'black bean tree', 'en', TRUE);

  END IF;

  -- Word 120: baya
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baya', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'flame, fire', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fire', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'flame', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'fire, "baya wayu", light a fire', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fire', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'flame', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'firewood, "nyulu baya mujan", "he collected firewood"', 3, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fire', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'flame', 'en', FALSE);

  END IF;

  -- Word 121: bayan
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bayan', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'house, camp, shelter', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'house', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'camp', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'shelter', 'en', FALSE);

  END IF;

  -- Word 122: baybu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baybu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'pipe', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'pipe', 'en', TRUE);

  END IF;

  -- Word 123: bayil
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bayil', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'fresh water perch', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'perch', 'en', TRUE);

  END IF;

  -- Word 124: bayilbayil
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bayilbayil', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'peewee, mud shark', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'mud shark', 'en', TRUE);

  END IF;

  -- Word 125: bayin
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bayin', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'premature child, "yinya ngawa bayin bajaku", "That baby is very premature"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'small child', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'very small child', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'small child', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'child spirit', 3, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'small child', 'en', TRUE);

  END IF;

  -- Word 126: bayjal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bayjal', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'ignore, don''t pay attention to', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'ignore', 'en', TRUE);

  END IF;

  -- Word 127: bayjurr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bayjurr', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'restless, always moving about', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'restless', 'en', TRUE);

  END IF;

  -- Word 128: baykal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baykal', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'bite, "kayangka bikibiki baykan, kujinkuda", "the dog bit the pig and held on"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bite', 'en', TRUE);

  END IF;

  -- Word 129: baykal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'intransitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baykal', v_word_class_id, 'intransitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'ache, pain, "ngayu dukal baykal", "my head aches"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'ache', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'pain', 'en', FALSE);

  END IF;

  -- Word 130: baykal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'intransitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baykal', v_word_class_id, 'intransitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'ache, pain, "ngayu dukal baykal", "my head aches"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'ache', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'pain', 'en', FALSE);

  END IF;

  -- Word 131: baymbay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baymbay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'large mud clam', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'large mud clam', 'en', TRUE);

  END IF;

  -- Word 132: bibar
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bibar', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'shin, ankle', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'shin', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'ankle', 'en', FALSE);

  END IF;

  -- Word 133: bibi
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bibi', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'breast', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'breast', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'breast milk', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'breast milk, "nyulu karrkay banbadi bibi nukanka", "The baby is crying, he wants to feed"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'breast', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'breast milk', 'en', FALSE);

  END IF;

  -- Word 134: Bibikarrbaja
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'Bibikarrbaja', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name - Helenvale', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'Bibikarrbaja', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'Helenvale', 'en', FALSE);

  END IF;

  -- Word 135: Bidin-damaja
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'Bidin-damaja', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name - close to Ten Mile and upper reaches of the Daintree river', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'Bidin-damaja', 'en', TRUE);

  END IF;

  -- Word 136: bidubidu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bidubidu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'bank bird', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bank bird', 'en', TRUE);

  END IF;

  -- Word 137: bijal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bijal', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to lick, "karrkayangka icecream cone bijan", "The child licked the icecream cone"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'lick', 'en', TRUE);

  END IF;

  -- Word 138: bijalabay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bijalabay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'five corner nut, found in the scrub', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'five corner nut', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name, a hill near China Camp with lots of five corner nuts', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'five corner nut', 'en', TRUE);

  END IF;

  -- Word 139: bijarr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bijarr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'dream', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'dream', 'en', TRUE);

  END IF;

  -- Word 140: bijjaril
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bijjaril', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to dream, "ngayu kurriyala bijarrin", "I dream about a carpet snake"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'dream', 'en', TRUE);

  END IF;

  -- Word 141: biji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'biji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'tail', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tail', 'en', TRUE);

  END IF;

  -- Word 142: bijikan
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bijikan', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'stern of a boat', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'stern of a boat', 'en', TRUE);

  END IF;

  -- Word 143: bijin
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bijin', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'species of tea tree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tea tree', 'en', TRUE);

  END IF;

  -- Word 144: bikarr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bikarr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'fishy smell or taste', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fishy', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'stinks', 'en', FALSE);

  END IF;

  -- Word 145: bikarrakal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bikarrakal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'a kind of grub used for bait', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bikarrakal fruit', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'species of tree and its fruit. The fruit must be cooked first.', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bikarrakal fruit', 'en', TRUE);

  END IF;

  -- Word 146: bikibiki
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bikibiki', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'pig', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'pig', 'en', TRUE);

  END IF;

  -- Word 147: biku-nyajil
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'biku-nyajil', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to study something', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'study', 'en', TRUE);

  END IF;

  -- Word 148: bila
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'auxilary';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bila', v_word_class_id, 'auxilary', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'fast, rapid, "bana-bila", "fast running water"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fast', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'rapid', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'fast, rapid, "bangkarr bila", "a person in a hurry"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fast', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'rapid', 'en', FALSE);

  END IF;

  -- Word 149: bilaji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bilaji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'flat-tailed ray', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'flat-tailed ray', 'en', TRUE);

  END IF;

  -- Word 150: bilamal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'intransitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bilamal', v_word_class_id, 'intransitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'homesick', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'homesick', 'en', TRUE);

  END IF;

  -- Word 151: bilangkurr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bilangkurr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'blanket', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'blanket', 'en', TRUE);

  END IF;

  -- Word 152: bilanji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bilanji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'grass used to make dilly bags', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'grass', 'en', TRUE);

  END IF;

  -- Word 153: bilar
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bilar', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'candle nut tree. The nuts are edible after roasting.', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'candle nut tree', 'en', TRUE);

  END IF;

  -- Word 154: bilbil-bilbil
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bilbil-bilbil', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'gecko', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'gecko', 'en', TRUE);

  END IF;

  -- Word 155: bilirr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bilirr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'eyebrow or eyelash', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'eyebrow', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'eyelash', 'en', FALSE);

  END IF;

  -- Word 156: bilmbin
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bilmbin', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'small shark which comes around mangroves and in the river', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'black-tip shark', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'shark', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'black-tip shark', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'black-tip shark', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'shark', 'en', FALSE);

  END IF;

  -- Word 157: bilngkumu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bilngkumu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'salt water crocodile', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'crocodile', 'en', TRUE);

  END IF;

  -- Word 158: biluwarra
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'biluwarra', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'spoon bill bird', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'spoon bill', 'en', TRUE);

  END IF;

  -- Word 159: bimakay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bimakay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'father''s sister', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'father''s sister', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'aunty', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'aunty', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'father''s sister', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'aunty', 'en', FALSE);

  END IF;

  -- Word 160: bimay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bimay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'father''s sister', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'father''s sister', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'aunty', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'aunty', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'father''s sister', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'aunty', 'en', FALSE);

  END IF;

  -- Word 161: bimbarrbay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bimbarrbay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'scrub wallaby', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'scrub wallaby', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'wallaby', 'en', FALSE);

  END IF;

  -- Word 162: binal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'associative';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'binal', v_word_class_id, 'associative', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to know, "ngayu binal kari", "I don''t know"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'know', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to know, "Ngayu binal-binalku bundanka", "I want to know"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'know', 'en', TRUE);

  END IF;

  -- Word 163: binal-bungal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'binal-bungal', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'teach, "teacherangka kaykay-kaykay binal-bungan-bungal", "The teacher is teaching children"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'teach', 'en', TRUE);

  END IF;

  -- Word 164: binal-damaji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'intransitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'binal-damaji', v_word_class_id, 'intransitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to go back to get something you left', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'retrieve', 'en', TRUE);

  END IF;

  -- Word 165: binalku
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'associative';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'binalku', v_word_class_id, 'associative', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'remember', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'remember', 'en', TRUE);

  END IF;

  -- Word 166: binan
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'binan', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'rudder, for steering', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'rudder', 'en', TRUE);

  END IF;

  -- Word 167: binanjal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'binanjal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'frill necked lizard', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'frill necked lizard', 'en', TRUE);

  END IF;

  -- Word 168: binda
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'binda', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'shoulder', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'shoulder', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fork in river', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fork in tree', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'fork in a tree or river', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'shoulder', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fork in river', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fork in tree', 'en', FALSE);

  END IF;

  -- Word 169: Binda-babarra
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'Binda-babarra', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name - top of divide btween the Daintree and Bloomfield watersheds', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'Binda-babarra', 'en', TRUE);

  END IF;

  -- Word 170: binda-damal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'binda-damal', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'run someone down, gossip, "jana bama yindu binda-damal-damal", "They are running someone else down"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'explain', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'gossip', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'explain, describe', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'explain', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'gossip', 'en', FALSE);

  END IF;

  -- Word 171: Binda-dijarr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'Binda-dijarr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name - Stoney crossing in the upper Daintree River', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'Binda-dijarr', 'en', TRUE);

  END IF;

  -- Word 172: Binda-jalbu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'Binda-jalbu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name - along Daintree River', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'Binda-jalbu', 'en', TRUE);

  END IF;

  -- Word 173: Binda-milmal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'Binda-milmal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name - upper Daintree River', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'Binda-milmal', 'en', TRUE);

  END IF;

  -- Word 174: bindi
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bindi', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'any broad leaf', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'broad leaf', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'leaf', 'en', FALSE);

  END IF;

  -- Word 175: bindimu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bindimu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'black snake', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'black snake', 'en', TRUE);

  END IF;

  -- Word 176: binju
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'binju', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'wrongly married according to tribal law', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'wrong marriage', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'poorly cooked', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'black snake', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'poorly made or cooked, "binju tea", "tea that is too strong"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'wrong marriage', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'poorly cooked', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'black snake', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'small black snake, light or reddish belly, poisonous', 3, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'wrong marriage', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'poorly cooked', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'black snake', 'en', FALSE);

  END IF;

  -- Word 177: binjul-binjul
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'binjul-binjul', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'scarlet robin', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'scarlet robin', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'robin', 'en', FALSE);

  END IF;

  -- Word 178: binjurrbinjurr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'binjurrbinjurr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'honey eater bird', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'robin', 'en', TRUE);

  END IF;

  -- Word 179: bingabinga
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bingabinga', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'old man or men', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'old man', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'old men', 'en', FALSE);

  END IF;

  -- Word 180: bingaji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bingaji', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'white or light colored', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'light color', 'en', TRUE);

  END IF;

  -- Word 181: bingaji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bingaji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'white-haired man or woman', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'white-haired person', 'en', TRUE);

  END IF;

  -- Word 182: bingkajiri
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bingkajiri', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'species of tree with long finger-like seed which people used to eat but don''t anyore. A white man supposedly got blind from eating it.', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bingkajiri tree', 'en', TRUE);

  END IF;

  -- Word 183: binyu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'binyu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'shooting star', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'shooting star', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'the spirit of a dead person which becomes a shooting star, someone recently dead. If you see a shooting star you know someone has or will soon die, as the shootying star can come before or during death.', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'shooting star', 'en', TRUE);

  END IF;

  -- Word 184: bira
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bira', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'windbreak', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'windbreak', 'en', TRUE);

  END IF;

  -- Word 185: biray
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'biray', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'grey March fly', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'grey March fly', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fly', 'en', FALSE);

  END IF;

  -- Word 186: birbun
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'birbun', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'curse plate. The face of the wrong-doer is painted on a piece of wood with charcoal. It is hung up and as it is twirling, the curse takes effect on the wrong-doer.', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'curse plate', 'en', TRUE);

  END IF;

  -- Word 187: birinjil
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'birinjil', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'centipede', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'centipede', 'en', TRUE);

  END IF;

  -- Word 188: birmba
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'birmba', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'straw-necked ibis, which is the totem of the walarr moiety', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'straw-necked ibis', 'en', TRUE);

  END IF;

  -- Word 189: biru-biru
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'biru-biru', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'bee eater, rainbow bird', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'rainbow bird', 'en', TRUE);

  END IF;

  -- Word 190: birukay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'birukay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'yolk of the egg', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'yolk', 'en', TRUE);

  END IF;

  -- Word 191: birungubay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'birungubay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'paddle, oar. Often contracted to biruwybay or birubay', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'paddle', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'oar', 'en', FALSE);

  END IF;

  -- Word 192: birungubaynja manil
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'birungubaynja manil', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to row', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'row', 'en', TRUE);

  END IF;

  -- Word 193: birra
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'birra', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'leaf', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'leaf', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'lungs', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'lungs', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'leaf', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'lungs', 'en', FALSE);

  END IF;

  -- Word 194: birrbirr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'birrbirr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'parrot, parakeet, lorikeet', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'parrot', 'en', TRUE);

  END IF;

  -- Word 195: birri
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'birri', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'fingernail, toenail', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fingernail', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'toenail', 'en', FALSE);

  END IF;

  -- Word 196: birrili
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'manner';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'birrili', v_word_class_id, 'manner', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'natural death', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'death', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'natural death', 'en', FALSE);

  END IF;

  -- Word 197: birru
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'birru', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'kind of bad spirit', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bad spirit', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'savage', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'white man', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'a bad, savage person', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bad spirit', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'savage', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'white man', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'derogatory term for a white man', 3, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bad spirit', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'savage', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'white man', 'en', FALSE);

  END IF;

  -- Word 198: biwar
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'biwar', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'wife', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'wife', 'en', TRUE);

  END IF;

  -- Word 199: biwul
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'biwul', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'mother in law', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'mother in law', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'name of seprate language used to speak to in-laws', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'mother in law', 'en', TRUE);

  END IF;

  -- Word 200: biwur
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'manner';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'biwur', v_word_class_id, 'manner', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'sitting with hands holding legs, "Nyulu biwurku bundanday", "He is sitting with his hands holding his legs"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sitting with hands in legs', 'en', TRUE);

  END IF;

  -- Word 201: biwuy
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'biwuy', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'purpoise, dugong, sea cow', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'dugong', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'iron', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'dugong', 'en', TRUE);

  END IF;

  -- Word 202: biyal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'biyal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'gristle, sinew, string, blood vessel (especially wallaby tail sinew)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'gristle', 'en', TRUE);

  END IF;

  -- Word 203: biyangkal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'biyangkal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'yam, which must be first roasted, then ground, then leached for a couple huors in many changes of water before it can be safely eaten', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'yam', 'en', TRUE);

  END IF;

  -- Word 204: biyul
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'biyul', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'nyungkal - turtle spear point', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'spear head', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'turtle spear head', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'yalanji kurajan.', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'spear head', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'turtle spear head', 'en', FALSE);

  END IF;

  -- Word 205: bubal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bubal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'species of tree snake', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'snake', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tree snake', 'en', FALSE);

  END IF;

  -- Word 206: buban
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buban', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'small amount, "ngayu money buban wunay", "I have only a little bit of money"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'small', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'broke', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'short time, "nyulu buban bundan", "He stayed a little while"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'small', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'broke', 'en', FALSE);

  END IF;

  -- Word 207: bubanmal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'intransitive verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bubanmal', v_word_class_id, 'intransitive verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'jumble, unimportant', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'humble', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'unimportant', 'en', FALSE);

  END IF;

  -- Word 208: bubu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bubu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'groud, earth. "kambi bubujida", "the clothes are dirty now"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'ground', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'earth', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'a person''s country, where he belonds, "nyungu bubu Shipton''s Flats", "his country is Shipton''s Flats"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'ground', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'earth', 'en', FALSE);

  END IF;

  -- Word 209: bubu walu-yindu-walu-yindi
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bubu walu-yindu-walu-yindi', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 210: baja-baja
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baja-baja', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'spring at Middle Camp', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'Middle Camp', 'en', TRUE);

  END IF;

  -- Word 211: bakikiri
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bakikiri', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Butcher''s hill', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 212: balabay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balabay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Plantation Creek area', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 213: balar
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balar', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Oaky Creek', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 214: banabila
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'banabila', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Olbar''s camp', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 215: banbanba
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'banbanba', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Springvale', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 216: bangkal-ngaren
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bangkal-ngaren', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Shipton''s Flat area, a junction of Grasstree and Bijan creeks', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 217: barkamali
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'barkamali', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'near China Camp', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 218: bibikarrbaja
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bibikarrbaja', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Helenvale (warrkin)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 219: bidin-damaja
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bidin-damaja', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Ten mile area', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 220: bijalabay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bijalabay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'near China Camp', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 221: bulban
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulban', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'near China Camp', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 222: burrkaymba
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burrkaymba', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'near China Camp', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 223: buru
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buru', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'China Camp', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 224: dikarr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dikarr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Thompson Creek Camp', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 225: dilngku-baja
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dilngku-baja', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Middle camp', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 226: dubu-mirrkirr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dubu-mirrkirr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'skill in rocks', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 227: dulmbill
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dulmbill', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Stucky''s Gap', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 228: jijamali
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jijamali', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'coconut grove across from mill', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 229: jinjurri
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jinjurri', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Billygoat Creek', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 230: jiwurru
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jiwurru', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Romeo area', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 231: jilkurr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jilkurr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Roy Haach''s old farm', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 232: julay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'julay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Daintree (site of old bama camp)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 233: jungur
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jungur', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Collin''s Hill', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 234: kada-kada
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kada-kada', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Bailey''s Creek', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 235: kalal-kalal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kalal-kalal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Harry Dick''s place', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 236: kalkajaka
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kalkajaka', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Black Mountains (also the caves there)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 237: kangkiji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kangkiji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'see jalundurr list', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 238: karu-kumbo
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'karu-kumbo', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'top end of Watermelon Creek', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 239: kija
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kija', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Roaring Meg Falls', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 240: kulki
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kulki', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Tribulation', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 241: kulngku
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kulngku', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Bailey''s Creek', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 242: kumarkaji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kumarkaji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'near China Camp', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 243: kuna
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kuna', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Shipton''s Flats', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 244: manyi
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'manyi', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'summit between Bloomfield and Rossville (sea view)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 245: maramba
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'maramba', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'upper Watermelon Creek', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 246: marbaymba
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'marbaymba', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Rattlesnake Point (story site)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 247: mawurmbu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'mawurmbu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Gold Hill', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 248: mijinan
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'mijinan', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Wallaby Creek bridge', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 249: milbayarr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'milbayarr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'near China Camp', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 250: muja
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'muja', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Wtermlon Creek', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 251: ngurra
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'ngurra', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Wtermlon Creek', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 252: muliku
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'muliku', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Annan River area (between the Annan and the Bloomfield turnoff)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 253: munju-jubal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'munju-jubal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Shpton''s Flat area (near the fork of Grasstree Creek)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 254: nambil-nambil
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'nambil-nambil', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Jubilee', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 255: ngalba-bulal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'ngalba-bulal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Mt. Peter Botte', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 256: ngalkunbu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'ngalkunbu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Wayalla Plains (upper end of Plantation Creek)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 257: ngamujin
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'ngamujin', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Emojin Beach', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 258: ngarri-murril
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'ngarri-murril', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Romeo area', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 259: ngurrku
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'ngurrku', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'rock in Bloomfield River', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 260: walba-ngarra
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'walba-ngarra', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Grasstree (story site)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 261: wayal-wayal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'wayal-wayal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Wayalla Plains', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 262: wujal-wujal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'wujal-wujal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'present Mission site', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 263: wundu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'wundu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Mt. Alexandra', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 264: wungkabaja
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'wungkabaja', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Tourist camp', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 265: yubulu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'yubulu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Mt. Poverty', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 266: yuku-baja
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'yuku-baja', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Annan River', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 267: yumalba
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'yumalba', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Mt. Yumalba, a montain new Mt. Poverty', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 268: bubu walu-yindu-walu-yindi
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bubu walu-yindu-walu-yindi', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 269: mangkalba
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'mangkalba', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Cebar Bar', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 270: marbaymba
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'marbaymba', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Rattlesnake Point and Fritz Creek (story site)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 271: balabay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balabay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Plantation Creek', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 272: jajikal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jajikal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'north side of Bloomfield River mouth', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 273: banabila
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'banabila', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'south side of Bloomfield River mouth', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 274: jijiniliji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jijiniliji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'south side of Bloomfield River mouth', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 275: wungkabaja
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'wungkabaja', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'tourist fishing camp', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 276: kangkiji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kangkiji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Kangkiji (north end)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 277: kalal-kalal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kalal-kalal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Harry Dick''s area', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 278: burra-warrija
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burra-warrija', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'southwards', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 279: kurrbi
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kurrbi', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'southwards (story site of wind)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 280: jibul
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jibul', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'cave (story site)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 281: ngiwa
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'ngiwa', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'two jutting stones (snake story site)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 282: malajakuy
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'malajakuy', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'southwards', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 283: yida
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'yida', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'southwards', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 284: kaway
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kaway', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Cowie Beach', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 285: ngamujin
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'ngamujin', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Emogin Beach', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 286: kulngurbu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kulngurbu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Coconut grove near mouth of creek', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 287: kaliway
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kaliway', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'lower end of Emogin (story site, big footprint)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 288: kulki
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kulki', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Cape Tribulation', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 289: ngiri
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'ngiri', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'creek south of Tribulation', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 290: muwul
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'muwul', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'next ground south', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 291: kaba-kada
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kaba-kada', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'kulngurbu', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 292: kulngurk
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kulngurk', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Bailey''s Creek', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 293: kulngku
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kulngku', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Bailey''s Creek', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 294: baku
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baku', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'point off Snapper Island', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 295: yibuy-karrbaja
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'yibuy-karrbaja', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Snapper Island', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 296: Bubu Walu-yindu wawubajaburr
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'Bubu Walu-yindu wawubajaburr', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 297: julay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'julay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Daintree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', TRUE);

  END IF;

  -- Word 298: mulujin
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'mulujin', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'upriver Daintree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'upriver Daintree', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', FALSE);

  END IF;

  -- Word 299: jiwaymba
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jiwaymba', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'upriver Daintree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'upriver Daintree', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', FALSE);

  END IF;

  -- Word 300: binda-dijarr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'binda-dijarr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'stony crosing', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'stony crossing', 'en', TRUE);

  END IF;

  -- Word 301: binda-milmal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'binda-milmal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'upriver Daintree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'upriver Daintree', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', FALSE);

  END IF;

  -- Word 302: burranga
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burranga', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'upriver Daintree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'upriver Daintree', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', FALSE);

  END IF;

  -- Word 303: binda-jalbu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'binda-jalbu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'upriver Daintree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'upriver Daintree', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', FALSE);

  END IF;

  -- Word 304: kunyurrimba
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kunyurrimba', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'upriver Daintree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'upriver Daintree', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', FALSE);

  END IF;

  -- Word 305: jiwukal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jiwukal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'upriver Daintree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'upriver Daintree', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', FALSE);

  END IF;

  -- Word 306: milbija
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'milbija', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'upriver Daintree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'upriver Daintree', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', FALSE);

  END IF;

  -- Word 307: jangkarra
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jangkarra', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'upriver Daintree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'upriver Daintree', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', FALSE);

  END IF;

  -- Word 308: kalmbakay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kalmbakay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'upriver Daintree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'upriver Daintree', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', FALSE);

  END IF;

  -- Word 309: wankara
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'wankara', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'upriver Daintree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'upriver Daintree', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', FALSE);

  END IF;

  -- Word 310: bidin-damaja
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bidin-damaja', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'upriver Daintree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'upriver Daintree', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', FALSE);

  END IF;

  -- Word 311: jarrabi
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jarrabi', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'junction to Gold Hill', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'junction to Gold Hill', 'en', TRUE);

  END IF;

  -- Word 312: ngara-bali-bali
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'ngara-bali-bali', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'upriver Daintree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'upriver Daintree', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', FALSE);

  END IF;

  -- Word 313: binda-babara
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'binda-babara', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'top of divide', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'top of divide', 'en', TRUE);

  END IF;

  -- Word 314: Babu walu-yindu wawubjaburr Bloomfieldmundurr jalunmun wangkar Binda-babaranga
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'Babu walu-yindu wawubjaburr Bloomfieldmundurr jalunmun wangkar Binda-babaranga', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 315: jajikal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jajikal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'Bloomfield', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'Bloomfield', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'place', 'en', FALSE);

  END IF;

  -- Word 316: dilngku-baja
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dilngku-baja', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 317: baja-baja
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baja-baja', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 318: landin
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'landin', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 319: jilnganji
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jilnganji', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 320: jinjurri
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jinjurri', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 321: maraymbaja
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'maraymbaja', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 322: bularr
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bularr', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 323: wujal-wujal
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'wujal-wujal', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 324: Naka wawabajaburr wujal-wujaldarr
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'Naka wawabajaburr wujal-wujaldarr', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 325: jijiniliji
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jijiniliji', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 326: jungur
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jungur', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 327: banabila
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'banabila', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 328: nganjuninda
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'nganjuninda', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 329: jijiamali
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jijiamali', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 330: jarunga-kija
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jarunga-kija', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 331: dikarr
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dikarr', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 332: landin
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'landin', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 333: ngurku
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'ngurku', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 334: wujal-wujal
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'wujal-wujal', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 335: Wujal-wujalmun wangkar Binda-babranga
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'Wujal-wujalmun wangkar Binda-babranga', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 336: wujal-wujal
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'wujal-wujal', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 337: bulngkalba
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulngkalba', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 338: walba-murru
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'walba-murru', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 339: burunbu
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burunbu', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 340: riba
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'riba', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 341: nbalmbungu
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'nbalmbungu', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 342: kubi
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kubi', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 343: ngamu-kaja
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'ngamu-kaja', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 344: kija
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kija', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 345: karrulbu
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'karrulbu', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 346: milbayarr
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'milbayarr', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 347: dabul
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dabul', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 348: bununbu
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bununbu', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 349: burrkaymba
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burrkaymba', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 350: jiri-wuran
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jiri-wuran', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 351: jingka-jingka
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jingka-jingka', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 352: binda-babara
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'binda-babara', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 353: bubu walu-yinda wawubajaburr
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bubu walu-yinda wawubajaburr', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 354: dikarr
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dikarr', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 355: landin
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'landin', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 356: jarramaliyan
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'jarramaliyan', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 357: kalngkan-damal
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kalngkan-damal', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 358: kabi
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'kabi', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 359: walu-dalbaji
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'walu-dalbaji', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 360: warral-warral
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'warral-warral', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 361: Zigazagmun Main Campmunbu
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'Zigazagmun Main Campmunbu', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 362: dikurrbu
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dikurrbu', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 363: dubu-mirrkirr
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dubu-mirrkirr', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 364: mabarrba
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'mabarrba', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 365: ngumbuymbu
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'ngumbuymbu', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 366: marangaku
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'marangaku', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 367: bububay
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bububay', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 368: bubun
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bubun', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 369: buda
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buda', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 370: budida
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'budida', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 371: budukul
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'budukul', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 372: bujabay
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bujabay', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 373: bujabuja
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bujabuja', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 374: bujal
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bujal', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 375: bujan
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bujan', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 376: bujar
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bujar', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 377: bujarr-bujarr
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bujarr-bujarr', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 378: buji
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buji', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 379: bujil
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bujil', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 380: bujil-barin
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bujil-barin', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 381: bujil-bulkaji
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bujil-bulkaji', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 382: bujil-jalngkun
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bujil-jalngkun', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 383: bujil-janjil
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bujil-janjil', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 384: bujil-kabu
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bujil-kabu', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 385: bujil-wungara
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bujil-wungara', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 386: bujil-yiran
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bujil-yiran', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 387: bujur
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bujur', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 388: bukarr
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bukarr', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 389: bukul
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bukul', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 390: bukul-bukul
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bukul-bukul', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 391: bukunjarra
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bukunjarra', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 392: bula
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bula', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 393: bularr
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bularr', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 394: bulawu
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulawu', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 395: bulba
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulba', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 396: bulban
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulban', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 397: bulbu
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulbu', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 398: bulbuji
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulbuji', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 399: bulbul
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulbul', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 400: bulbululul
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulbululul', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 401: bulbun
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulbun', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 402: bulbur
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulbur', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 403: buldar
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buldar', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 404: buliman
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buliman', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 405: buljun
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buljun', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 406: bulka
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulka', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 407: bulkiji
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulkiji', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 408: bulmbuy
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulmbuy', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 409: bulngal
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulngal', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 410: bulngkalba
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulngkalba', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 411: bulngkarr
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulngkarr', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 412: bulnja
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulnja', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 413: bulnjur
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulnjur', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 414: bulu
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulu', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 415: bulu-kajaji
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulu-kajaji', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 416: bulu-ngaru
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulu-ngaru', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 417: bulu-duray
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bulu-duray', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 418: buubarr
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buubarr', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 419: balur
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'balur', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 420: baluriji
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'baluriji', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 421: bunda
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bunda', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 422: bunday
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bunday', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 423: bungkay
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bungkay', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 424: bungku
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bungku', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 425: bungkubu janay
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bungkubu janay', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 426: bungku-duray
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bungku-duray', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 427: bungku-jaba
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bungku-jaba', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 428: bungku-mururmur
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bungku-mururmur', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 429: bungun
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bungun', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 430: bungun
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bungun', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 431: bunjal
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bunjal', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 432: bunjay
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bunjay', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 433: bunjay-dalkay
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bunjay-dalkay', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 434: bunjay-kangal
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bunjay-kangal', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 435: bunjil
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bunjil', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 436: bunjulu
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bunjulu', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 437: bunjurril
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bunjurril', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 438: bununbu
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bununbu', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 439: burakal
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burakal', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 440: burakaji
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burakaji', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 441: bural
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bural', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 442: buray
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buray', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 443: burdal
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burdal', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 444: burin
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burin', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 445: buriwarr
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buriwarr', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 446: burkul
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burkul', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 447: burkulbu
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burkulbu', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 448: burmu
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burmu', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 449: burngkal
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burngkal', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 450: burngu
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burngu', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 451: burra
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burra', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 452: burranga
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burranga', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 453: burra-warri
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burra-warri', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 454: burra-warrija
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burra-warrija', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 455: burray
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burray', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 456: burrba
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burrba', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 457: burrkaymba
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burrkaymba', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 458: burri
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burri', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 459: burri-burri
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burri-burri', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 460: burri-dalkil
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burri-dalkil', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 461: burri-dudal
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burri-dudal', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 462: burri-kari
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burri-kari', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 463: burril
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burril', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 464: burrin-burrin
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burrin-burrin', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 465: burrir
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burrir', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 466: burrir-warra
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burrir-warra', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 467: burriyaja
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burriyaja', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 468: burrki
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burrki', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 469: burrki-manil
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burrki-manil', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 470: burrkul
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burrkul', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 471: burrkul-dandi
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burrkul-dandi', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 472: burrkun
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burrkun', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 473: burrngkay-burrngkay
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burrngkay-burrngkay', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 474: burrngkuy
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burrngkuy', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 475: buru
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buru', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 476: buru-warra
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buru-warra', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 477: buruku
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buruku', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 478: burukuy
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burukuy', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 479: burul
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burul', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 480: burul-burul
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burul-burul', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 481: burunbu
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'burunbu', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 482: bururr
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'bururr', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 483: buru-warri
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buru-warri', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 484: buru-warri-manil
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buru-warri-manil', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 485: buwal
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buwal', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 486: buwiku
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buwiku', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 487: buwun
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buwun', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 488: buyay-manil
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buyay-manil', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 489: buyi
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buyi', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 490: buyi
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buyi', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 491: buyilbuyil
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buyilbuyil', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 492: buykuji
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buykuji', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 493: buymbil
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buymbil', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 494: buyukal
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buyukal', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 495: buyun
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buyun', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 496: buyunkay
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buyunkay', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 497: buyun-buyun
  v_word_class_id := NULL;
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'buyun-buyun', v_word_class_id, NULL, NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
  END IF;

  -- Word 498: dabadaba
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dabadaba', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'larvae and eggs of any kind of bee', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'larvae', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'eggs', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bee', 'en', FALSE);

  END IF;

  -- Word 499: dabal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dabal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'boys from the time they are babies - ngawa - to older boys - warru', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'boys', 'en', TRUE);

  END IF;

  -- Word 500: dabway
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dabway', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'black messenger bird, totem of both dabu and walarr moieties', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'black bird', 'en', TRUE);

  END IF;

  -- Word 501: dabu
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dabu', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'small black bee which nests in trees, has a light sting', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bee', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'the honey from this bee', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bee', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'the name of one of the clan moieties', 3, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bee', 'en', TRUE);

  END IF;

  -- Word 502: dabul
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dabul', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'pierced nose and nose peg. The piecing is always done by a man''s biwul, his mother in law. Biwulungku dabul bakan. "My mother in law pierced his nose"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'pierced nose', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'place name - between upper Daintree River and Roaring Meg. The big rock here is a jarramali (thunder) and nose piecing story site.', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'pierced nose', 'en', TRUE);

  END IF;

  -- Word 503: dabulkurra
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dabulkurra', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'human shin bone, for conveying messages to someone. The hollow bone is also used to catch a person''s shadow which is then closed up inside the bone. This is then used to put withcraft on the person. He may also put a person''s urine or other belonging inside.', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'shin bone', 'en', TRUE);

  END IF;

  -- Word 504: daburri
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'daburri', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'brackish swamp water', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'swamp', 'en', TRUE);

  END IF;

  -- Word 505: dabuy
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dabuy', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'small brownish kingfisher, totem of both dabu and walarr moieties. When this bird starts singing yo know you will get company, that someone is travelling.', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'spirit', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'kingfisher', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'spirit', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'spirit', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'kingfisher', 'en', FALSE);

  END IF;

  -- Word 506: dajal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dajal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'fighting spear', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'spear', 'en', TRUE);

  END IF;

  -- Word 507: dajali
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dajali', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'deep water', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'deep water', 'en', TRUE);

  END IF;

  -- Word 508: dajalkira
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dajalkira', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'brothers and sisters', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'brothers', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sisters', 'en', FALSE);

  END IF;

  -- Word 509: dajay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dajay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'person''s spirit after death. "Nyulu jalbu wulan, yinyayanka jana nyungu dajay warrmba-bunganka." "The woman died, that''s why they want to find her spirit". Afer a dambunji (murderer) kills a person, the murdered person becomes a dajay. The witch doctor (rrunyuji) will then try to locate this dajay in order to ascertain who did the killing. All people''s spirits become a dajay after death, not only those who are murdered.', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'spirit', 'en', TRUE);

  END IF;

  -- Word 510: dajil
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dajil', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'give', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'nyulu present ngayku dajin, "he gave me a present"', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'gave', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'nyulu present ngayku dajin, "he gave me a present"', 'en', TRUE);

  END IF;

  -- Word 511: daya
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'daya', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'give', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'give', 'en', TRUE);

  END IF;

  -- Word 512: dajiway
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'intransitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dajiway', v_word_class_id, 'intransitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'trade', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'trade', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'share', 'en', FALSE);

  END IF;

  -- Word 513: dakal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'intransitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dakal', v_word_class_id, 'intransitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'climb. "nyulu jukungu dakan", "he climbed the tree"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'climb', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'get into a truck or car', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'get into a truck or car, "nyulu truckmunbu dakan", "he got on the truck"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'climb', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'get into a truck or car', 'en', FALSE);

  END IF;

  -- Word 514: dakaldakal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dakaldakal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'trocus shell', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'trocus shell', 'en', TRUE);

  END IF;

  -- Word 515: dakandil
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dakandil', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to break something down', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to break something down', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'destroy', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'destroy', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to break something down', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'destroy', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'delberately drop something', 3, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to break something down', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'destroy', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'push someone down, to do anything of this sort, if you lose your temper, to call attention to oneself if one feels he has been wronged in some way. "Dingkarangka karrkay dakandin kuli-kadanymundu" "The man dropped the child because he was angry"', 4, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to break something down', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'destroy', 'en', FALSE);

  END IF;

  -- Word 516: daki-daki
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'daki-daki', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'lazy or in the way. "Yundu daki-daki, dungayda", "You are lazy, get out of my way"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'lazy', 'en', TRUE);

  END IF;

  -- Word 517: dakil
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dakil', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'arm, branch of a tree, wing', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'branch', 'en', TRUE);

  END IF;

  -- Word 518: dakil-dakil
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dakil-dakil', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'branches of a tree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'branches of a tree', 'en', TRUE);

  END IF;

  -- Word 519: dakilji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dakilji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'cup', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'cup', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'panninkin, only rarely used now.', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'cup', 'en', TRUE);

  END IF;

  -- Word 520: dakumbar
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dakumbar', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'water gum tree (nyungkul dialect). "yalanji-jinajina", "This wood is good for woomeras"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'water gum tree', 'en', TRUE);

  END IF;

  -- Word 521: dakwul-dakwul
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dakwul-dakwul', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'brown and white scrub bird. The male has brown on the top of his head, a white strip past the eye. Tey clear an area, then many form a circle with on in the middle and the middle one will sing and dance.', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'brown scrub bird', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'white scrub bird', 'en', FALSE);

  END IF;

  -- Word 522: dakwurr-dakwun
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dakwurr-dakwun', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'hammer bird, totem of the walarr moiety', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'hammer bird', 'en', TRUE);

  END IF;

  -- Word 523: dakwuy
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dakwuy', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'hungry', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'hungry', 'en', TRUE);

  END IF;

  -- Word 524: dalban
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dalban', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'species of oak tree', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'oak tree', 'en', TRUE);

  END IF;

  -- Word 525: dalbarril
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dalbarril', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'strike by lightning. "balbaynja juku dalbarrin", "the lightning struck the tree"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'scolded', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'strike by lightning', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'ricochet', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'ricochet, as a stone striking another stone and bouncing off or a person throwing a spear at a sea turtle and the spear glancing off the shell', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'scolded', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'strike by lightning', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'ricochet', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to quickly scold someone and then quickly leave. "bamangka kukubu dalbarrin", "the man scolded (him), (then left)"', 3, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'scolded', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'strike by lightning', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'ricochet', 'en', FALSE);

  END IF;

  -- Word 526: dalkal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dalkal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'freshwater sardine, red', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'freshwater sardine', 'en', TRUE);

  END IF;

  -- Word 527: dalkan
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dalkan', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'species of tree, grows along beaches', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tree', 'en', TRUE);

  END IF;

  -- Word 528: dalkari
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dalkari', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'bladder', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bladder', 'en', TRUE);

  END IF;

  -- Word 529: dalkay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'intranstive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dalkay', v_word_class_id, 'intranstive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'hatch. "warngku 10-bala, kaykay-kaykay dalkay", "after 10 days the little ones hatch out"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'hatch', 'en', TRUE);

  END IF;

  -- Word 530: dalkay-manil
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dalkay-manil', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to blow up, as to blow up a balloon', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'blow up', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to break in little pieces, as a bottle', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'blow up', 'en', TRUE);

  END IF;

  -- Word 531: dalkiji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dalkiji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to beat up. "nyulu ngamungku karrkay dalkijin", "the mother beat up the child"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'beat up', 'en', TRUE);

  END IF;

  -- Word 532: dalkil
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dalkil', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to crack a nut or whip,or shoot a gun', 1, TRUE)
    RETURNING id INTO v_definition_id;

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to give a name or call a person by a name. "ngayu nyungunyin burri dalkin carol", "I gave her the name Carol"', 2, FALSE)
    RETURNING id INTO v_definition_id;

  END IF;

  -- Word 533: dalku
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dalku', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'archer fish (nyungkul dialect)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'archer fish', 'en', TRUE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'yalanji - mujarrka', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'archer fish', 'en', TRUE);

  END IF;

  -- Word 534: dalmbal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dalmbal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'flathad (also dukul-barangka)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'flathead', 'en', TRUE);

  END IF;

  -- Word 535: dalngan
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dalngan', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'well able to do something, courageous. (synonym - muna, burrkul-dandi)', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'courage', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'do something', 'en', FALSE);

  END IF;

  -- Word 536: dalngarri
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dalngarri', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'flames which make light. "baya dalngarri-bunga", "make the fire give light"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'flames', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'light', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'urinate', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'urine. "ngayu dalngarrinji dungay", "I have to go to the toilet"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'flames', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'light', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'urinate', 'en', FALSE);

    INSERT INTO public.synonyms (word_id, synonym_text)
    VALUES (v_word_id, 'wula');
    INSERT INTO public.synonyms (word_id, synonym_text)
    VALUES (v_word_id, 'kumbu');
    INSERT INTO public.synonyms (word_id, synonym_text)
    VALUES (v_word_id, 'yiwan');
  END IF;

  -- Word 537: damal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'damal', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to spear. "nyulu kalkabu kuyu daman", "he speared a fish with a spear"', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to spear', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to sew', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to baptise', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to wash', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to sea. "ngayu kambi daman", "I made the dress"', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to spear', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to sew', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to baptise', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to wash', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to baptise. "pastorangka nyungun banabu dukul daman", "the pastor baptised him"', 3, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to spear', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to sew', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to baptise', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to wash', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to wash. "nyulu yinkinba kambi daman", "she washed clothes in the creek"', 4, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to spear', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to sew', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to baptise', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'to wash', 'en', FALSE);

    INSERT INTO public.synonyms (word_id, synonym_text)
    VALUES (v_word_id, 'julurril');
  END IF;

  -- Word 538: dama-murnil
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dama-murnil', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'twirl a fire drill', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'twirl a fire drill', 'en', TRUE);

  END IF;

  -- Word 539: damaway
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'intransitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'damaway', v_word_class_id, 'intransitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'fight with spears', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fight with spears', 'en', TRUE);

  END IF;

  -- Word 540: damba
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'damba', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'damper', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'damper', 'en', TRUE);

  END IF;

  -- Word 541: dambal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dambal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'shoes, boots, thongs, footwear', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'shoes', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'boots', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'thongs', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'footwear', 'en', FALSE);

  END IF;

  -- Word 542: dambun
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dambun', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'a spirit who kills people', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'spirit', 'en', TRUE);

  END IF;

  -- Word 543: dambunji
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dambunji', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'a person who is possed with a spirit who kills, a murderer', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'spirit', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'murderer', 'en', FALSE);

  END IF;

  -- Word 544: danbal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'danbal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'king fish', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'king fish', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fish', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'flat head', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'flat head', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'king fish', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fish', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'flat head', 'en', FALSE);

  END IF;

  -- Word 545: danda
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'danda', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'chestnut horse', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'chestnut horse', 'en', TRUE);

  END IF;

  -- Word 546: dandarrbina
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dandarrbina', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'yellow freshwater eelfish', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'eelfish', 'en', TRUE);

  END IF;

  -- Word 547: dandi
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dandi', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'hard, tough', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'hard', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tough', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'healthy', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'strong', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'healthy, strong', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'hard', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tough', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'healthy', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'strong', 'en', FALSE);

  END IF;

  -- Word 548: Dandi
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'pro-noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'Dandi', v_word_class_id, 'pro-noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'King''s Plains, a place', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'King''s Plains', 'en', TRUE);

  END IF;

  -- Word 549: dangal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dangal', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'baggy, sloppy', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'baggy', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'sloppy', 'en', FALSE);

  END IF;

  -- Word 550: dara
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dara', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'bambo spear stick', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bambo spear stick', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'spear stick', 'en', FALSE);

  END IF;

  -- Word 551: daray
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'intransitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'daray', v_word_class_id, 'intransitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'fall', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'fall', 'en', TRUE);

  END IF;

  -- Word 552: daray-manil
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'daray-manil', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to drop something', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'drop', 'en', TRUE);

  END IF;

  -- Word 553: dari
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dari', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'boxwood tree, grows mainly in high places', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'boxwood tree', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tree', 'en', FALSE);

  END IF;

  -- Word 554: darka
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'darka', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'kind of nut', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'nut', 'en', TRUE);

  END IF;

  -- Word 555: darkay
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'darkay', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'small mud clam', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'clam', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'small mud clam', 'en', FALSE);

  END IF;

  -- Word 556: darra
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'darra', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'narrow', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'narrow', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'too small', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'too small', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'narrow', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'too small', 'en', FALSE);

  END IF;

  -- Word 557: wawu-darra
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'wawu-darra', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'so small that other things/people are being forced/squeezed out', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tight', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'crowded out', 'en', FALSE);

  END IF;

  -- Word 558: darrba
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'darrba', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'grass wallaby', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'wallaby', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'grass wallaby', 'en', FALSE);

  END IF;

  -- Word 559: darrbil
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'darrbil', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'deny relationship with someone', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'disown', 'en', TRUE);

  END IF;

  -- Word 560: dawadawa
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dawadawa', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'magpie', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'magpie', 'en', TRUE);

  END IF;

  -- Word 561: dawal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dawal', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'kingfish, trevally', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'kingfish', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'trevally', 'en', FALSE);

  END IF;

  -- Word 562: dawar
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dawar', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'star', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'star', 'en', TRUE);

  END IF;

  -- Word 563: dawarr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dawarr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'straw hat', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'straw hat', 'en', TRUE);

  END IF;

  -- Word 564: daya
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'daya', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'command form of give', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'give', 'en', TRUE);

  END IF;

  -- Word 565: dayirr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'adjective';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dayirr', v_word_class_id, 'adjective', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'clean, clear, bright', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'clean', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'clear', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bright', 'en', FALSE);

  END IF;

  -- Word 566: dibarr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dibarr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'teapot', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'teapot', 'en', TRUE);

  END IF;

  -- Word 567: dibirrdibirr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dibirrdibirr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'rainbow bird, honey eater', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'rainbow bird', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'honey eater', 'en', FALSE);

  END IF;

  -- Word 568: dibul
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'dibul', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'cane', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'cane', 'en', TRUE);

  END IF;

  -- Word 569: diburr
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'diburr', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'seed', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'seed', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'egg', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bullet', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tablets', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'egg', 2, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'seed', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'egg', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bullet', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tablets', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'bullet', 3, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'seed', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'egg', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bullet', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tablets', 'en', FALSE);

    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'tablets', 4, FALSE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'seed', 'en', TRUE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'egg', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'bullet', 'en', FALSE);
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'tablets', 'en', FALSE);

  END IF;

  -- Word 570: diburr-miyil
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'noun';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'diburr-miyil', v_word_class_id, 'noun', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'eyeball', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'eyeball', 'en', TRUE);

  END IF;

  -- Word 571: didal
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'didal', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'to put clothes on', 1, TRUE)
    RETURNING id INTO v_definition_id;
    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)
    VALUES (v_word_id, v_definition_id, 'get dressed', 'en', TRUE);

  END IF;

  -- Word 572: diday-manil
  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = 'transitive-verb';
  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)
  VALUES (v_language_id, 'diday-manil', v_word_class_id, 'transitive-verb', NULL)
  ON CONFLICT (language_id, word, word_class_id) DO NOTHING
  RETURNING id INTO v_word_id;

  IF v_word_id IS NOT NULL THEN
    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)
    VALUES (v_word_id, 'say something bad about someone', 1, TRUE)
    RETURNING id INTO v_definition_id;
