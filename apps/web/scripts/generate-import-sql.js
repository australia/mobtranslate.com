const fs = require('fs');
const yaml = require('js-yaml');

// Read and parse YAML file
const fileContent = fs.readFileSync('/Users/ajaxdavis/repos/mobtranslate.com/dictionaries/kuku_yalanji/dictionary.yaml', 'utf8');
const dictionary = yaml.load(fileContent);

console.log(`-- Kuku Yalanji Dictionary Import SQL`);
console.log(`-- Generated from ${dictionary.words.length} words\n`);

// First, add any missing word classes
const wordTypes = new Set();
dictionary.words.forEach(entry => {
  if (entry.type) {
    wordTypes.add(entry.type);
  }
});

console.log('-- Add any missing word classes');
console.log(`INSERT INTO public.word_classes (code, name, abbreviation, sort_order) VALUES`);
const typeMapping = {
  'modifier': "('modifier', 'Modifier', 'mod.', 15)",
  'time': "('time', 'Time Expression', 'time', 16)",
  'manner': "('manner', 'Manner', 'manner', 17)",
  'pr': "('pr', 'Pronoun', 'pr.', 18)",
  'n': "('n', 'Noun', 'n.', 19)",
  'tv': "('tv', 'Transitive Verb', 'tv.', 20)",
  'iv': "('iv', 'Intransitive Verb', 'iv.', 21)"
};

const missingTypes = Array.from(wordTypes).filter(type => 
  !['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 
    'conjunction', 'interjection', 'transitive-verb', 'intransitive-verb',
    'direction', 'exclamation', 'number', 'question', 'particle', 'determiner'].includes(type)
);

if (missingTypes.length > 0) {
  const values = missingTypes.map(type => typeMapping[type] || `('${type}', '${type}', '${type}', 99)`);
  console.log(values.join(',\n'));
  console.log('ON CONFLICT (code) DO NOTHING;\n');
}

// Generate import SQL
console.log('-- Import words');
console.log('DO $$');
console.log('DECLARE');
console.log('  v_language_id UUID;');
console.log('  v_word_id UUID;');
console.log('  v_word_class_id UUID;');
console.log('  v_definition_id UUID;');
console.log('BEGIN');
console.log("  -- Get language ID");
console.log("  SELECT id INTO v_language_id FROM public.languages WHERE code = 'kuku_yalanji';");
console.log('');

// Process words in batches
dictionary.words.forEach((entry, index) => {
  const word = entry.word.replace(/'/g, "''"); // Escape single quotes
  
  console.log(`  -- Word ${index + 1}: ${word}`);
  
  // Get word class ID if type exists
  if (entry.type) {
    const wordClassCode = entry.type === 'transitive-verb' ? 'transitive-verb' : 
                         entry.type === 'intransitive-verb' ? 'intransitive-verb' : 
                         entry.type;
    console.log(`  SELECT id INTO v_word_class_id FROM public.word_classes WHERE code = '${wordClassCode}';`);
  } else {
    console.log(`  v_word_class_id := NULL;`);
  }
  
  // Insert word
  const notes = entry.note ? entry.note.replace(/'/g, "''") : null;
  console.log(`  INSERT INTO public.words (language_id, word, word_class_id, word_type, notes)`);
  console.log(`  VALUES (v_language_id, '${word}', v_word_class_id, ${entry.type ? `'${entry.type}'` : 'NULL'}, ${notes ? `'${notes}'` : 'NULL'})`);
  console.log(`  ON CONFLICT (language_id, word, word_class_id) DO NOTHING`);
  console.log(`  RETURNING id INTO v_word_id;`);
  console.log('');
  
  // Only proceed if word was inserted
  console.log(`  IF v_word_id IS NOT NULL THEN`);
  
  // Insert definitions
  if (entry.definitions && entry.definitions.length > 0) {
    entry.definitions.forEach((definition, defIndex) => {
      const def = definition.replace(/'/g, "''");
      console.log(`    INSERT INTO public.definitions (word_id, definition, definition_number, is_primary)`);
      console.log(`    VALUES (v_word_id, '${def}', ${defIndex + 1}, ${defIndex === 0 ? 'TRUE' : 'FALSE'})`);
      console.log(`    RETURNING id INTO v_definition_id;`);
      
      // Insert translations
      if (entry.translations && entry.translations.length > 0) {
        entry.translations.forEach((translation, transIndex) => {
          const trans = String(translation).replace(/'/g, "''");
          console.log(`    INSERT INTO public.translations (word_id, definition_id, translation, target_language, is_primary)`);
          console.log(`    VALUES (v_word_id, v_definition_id, '${trans}', 'en', ${transIndex === 0 ? 'TRUE' : 'FALSE'});`);
        });
      }
      console.log('');
    });
  }
  
  // Insert synonyms
  if (entry.synonyms && entry.synonyms.length > 0) {
    entry.synonyms.forEach(synonym => {
      const syn = synonym.replace(/'/g, "''");
      console.log(`    INSERT INTO public.synonyms (word_id, synonym_text)`);
      console.log(`    VALUES (v_word_id, '${syn}');`);
    });
  }
  
  // Insert antonyms
  if (entry.antonyms && entry.antonyms.length > 0) {
    entry.antonyms.forEach(antonym => {
      const ant = antonym.replace(/'/g, "''");
      console.log(`    INSERT INTO public.antonyms (word_id, antonym_text)`);
      console.log(`    VALUES (v_word_id, '${ant}');`);
    });
  }
  
  // Insert usage examples
  if (entry.usage_examples && entry.usage_examples.length > 0) {
    entry.usage_examples.forEach(example => {
      const ex = example.replace(/'/g, "''");
      console.log(`    INSERT INTO public.usage_examples (word_id, example_text)`);
      console.log(`    VALUES (v_word_id, '${ex}');`);
    });
  }
  
  console.log(`  END IF;`);
  console.log('');
});

console.log('END $$;');
console.log('');
console.log('-- Verify import');
console.log("SELECT COUNT(*) as word_count FROM public.words WHERE language_id = (SELECT id FROM public.languages WHERE code = 'kuku_yalanji');");