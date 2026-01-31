import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const MIGMAQ_LANGUAGE_ID = '88e8c9a7-232c-4426-8d9b-88b568c10fab';
const API_URL = 'https://migmaq-foundation.vercel.app/api/dictionary';

interface DictionaryEntry {
  word: string;
  type: string;
  definitions: string[];
  translations: string[];
  usages?: Array<{
    translation: string;
    english: string;
  }>;
}

// Map API word types to word class codes
const wordTypeMap: Record<string, string> = {
  'verb animate transitive': 'vat',
  'verb inanimate transitive': 'vit',
  'verb animate intransitive': 'vai',
  'verb inanimate intransitive': 'vii',
  'noun animate': 'na',
  'noun inanimate': 'ni',
  'particle': 'part',
  'unclassified': 'unc',
};

async function getOrCreateWordClasses(): Promise<Record<string, string>> {
  const wordClassIds: Record<string, string> = {};

  for (const [typeName, code] of Object.entries(wordTypeMap)) {
    // Check if word class exists
    const { data: existing } = await supabase
      .from('word_classes')
      .select('id')
      .eq('code', code)
      .single();

    if (existing) {
      wordClassIds[typeName] = existing.id;
    } else {
      // Create new word class
      const { data: newClass, error } = await supabase
        .from('word_classes')
        .insert({
          code,
          name: typeName,
          abbreviation: code.toUpperCase(),
          description: `${typeName} word class`,
        })
        .select('id')
        .single();

      if (error) {
        console.error(`Error creating word class ${code}:`, error);
        continue;
      }
      wordClassIds[typeName] = newClass.id;
    }
  }

  return wordClassIds;
}

async function importDictionary() {
  console.log('Fetching dictionary from API...');
  const response = await fetch(API_URL);
  const entries: DictionaryEntry[] = await response.json();
  console.log(`Fetched ${entries.length} entries`);

  console.log('Setting up word classes...');
  const wordClassIds = await getOrCreateWordClasses();
  console.log('Word classes ready:', Object.keys(wordClassIds).length);

  // Process in batches
  const BATCH_SIZE = 100;
  let imported = 0;
  let errors = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);

    for (const entry of batch) {
      try {
        // Get word class ID
        const wordClassId = wordClassIds[entry.type] || null;

        // Insert word
        const { data: word, error: wordError } = await supabase
          .from('words')
          .insert({
            language_id: MIGMAQ_LANGUAGE_ID,
            word: entry.word,
            normalized_word: entry.word.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
            word_class_id: wordClassId,
            word_type: entry.type,
          })
          .select('id')
          .single();

        if (wordError) {
          // Check for duplicate
          if (wordError.code === '23505') {
            console.log(`Skipping duplicate: ${entry.word}`);
            continue;
          }
          console.error(`Error inserting word ${entry.word}:`, wordError);
          errors++;
          continue;
        }

        const wordId = word.id;

        // Insert definitions
        if (entry.definitions && entry.definitions.length > 0) {
          for (let defIdx = 0; defIdx < entry.definitions.length; defIdx++) {
            const { data: definition, error: defError } = await supabase
              .from('definitions')
              .insert({
                word_id: wordId,
                definition: entry.definitions[defIdx],
                definition_number: defIdx + 1,
                is_primary: defIdx === 0,
              })
              .select('id')
              .single();

            if (defError) {
              console.error(`Error inserting definition for ${entry.word}:`, defError);
              continue;
            }

            // Insert translations for this definition
            if (entry.translations && entry.translations[defIdx]) {
              await supabase
                .from('translations')
                .insert({
                  word_id: wordId,
                  definition_id: definition.id,
                  translation: entry.translations[defIdx],
                  target_language: 'en',
                  is_primary: true,
                });
            }
          }

          // Insert any remaining translations
          if (entry.translations && entry.translations.length > entry.definitions.length) {
            for (let transIdx = entry.definitions.length; transIdx < entry.translations.length; transIdx++) {
              await supabase
                .from('translations')
                .insert({
                  word_id: wordId,
                  translation: entry.translations[transIdx],
                  target_language: 'en',
                  is_primary: false,
                });
            }
          }
        }

        // Insert usage examples
        if (entry.usages && entry.usages.length > 0) {
          for (const usage of entry.usages) {
            await supabase
              .from('usage_examples')
              .insert({
                word_id: wordId,
                example_text: usage.translation,
                translation: usage.english,
              });
          }
        }

        imported++;
      } catch (err) {
        console.error(`Error processing ${entry.word}:`, err);
        errors++;
      }
    }

    console.log(`Progress: ${Math.min(i + BATCH_SIZE, entries.length)}/${entries.length} (${imported} imported, ${errors} errors)`);
  }

  console.log(`\nImport complete!`);
  console.log(`Total imported: ${imported}`);
  console.log(`Total errors: ${errors}`);
}

importDictionary().catch(console.error);
