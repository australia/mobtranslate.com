const fs = require('fs');
const yaml = require('js-yaml');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables from .env
const envPath = require('path').join(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1]] = match[2];
  }
});

// Initialize Supabase client
const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function getLanguageId() {
  const { data, error } = await supabase
    .from('languages')
    .select('id')
    .eq('code', 'kuku_yalanji')
    .single();

  if (error) {
    console.error('Error fetching language:', error);
    process.exit(1);
  }

  return data.id;
}

async function getWordClassId(type) {
  // Map YAML types to database word class codes
  const typeMapping = {
    'noun': 'noun',
    'transitive-verb': 'transitive-verb',
    'intransitive-verb': 'intransitive-verb',
    'verb': 'verb',
    'adjective': 'adjective',
    'adverb': 'adverb',
    'pronoun': 'pronoun',
    'preposition': 'preposition',
    'conjunction': 'conjunction',
    'interjection': 'interjection',
    'exclamation': 'exclamation',
    'direction': 'direction',
    'number': 'number',
    'question': 'question',
    'particle': 'particle',
    'determiner': 'determiner'
  };

  const wordClassCode = typeMapping[type] || type;

  const { data, error } = await supabase
    .from('word_classes')
    .select('id')
    .eq('code', wordClassCode)
    .single();

  if (error) {
    console.error(`Error fetching word class for type "${type}":`, error);
    return null;
  }

  return data?.id;
}

async function importDictionary() {
  try {
    // Read and parse YAML file
    const fileContent = fs.readFileSync('/Users/ajaxdavis/repos/mobtranslate.com/dictionaries/kuku_yalanji/dictionary.yaml', 'utf8');
    const dictionary = yaml.load(fileContent);

    console.log(`Found ${dictionary.words.length} words to import`);

    // Get language ID
    const languageId = await getLanguageId();
    console.log('Language ID:', languageId);

    // Check how many words already exist
    const { data: existingCount } = await supabase
      .from('words')
      .select('id', { count: 'exact', head: true })
      .eq('language_id', languageId);
    
    console.log(`Already have ${existingCount?.count || 0} words in database`);

    let successCount = 0;
    let errorCount = 0;
    let skipCount = 0;

    // Process words in batches
    const batchSize = 50;
    for (let i = 0; i < dictionary.words.length; i += batchSize) {
      const batch = dictionary.words.slice(i, i + batchSize);
      
      for (const entry of batch) {
        try {
          // Get word class ID
          const wordClassId = entry.type ? await getWordClassId(entry.type) : null;

          // Insert word
          const { data: wordData, error: wordError } = await supabase
            .from('words')
            .insert({
              language_id: languageId,
              word: entry.word,
              word_class_id: wordClassId,
              word_type: entry.type || null,
              notes: entry.note || null
            })
            .select()
            .single();

          if (wordError) {
            // Check if it's a duplicate error
            if (wordError.code === '23505') {
              // Skip duplicates silently
              skipCount++;
              continue;
            }
            console.error(`Error inserting word "${entry.word}":`, wordError);
            errorCount++;
            continue;
          }

          // Insert definitions
          if (entry.definitions && entry.definitions.length > 0) {
            for (let defIndex = 0; defIndex < entry.definitions.length; defIndex++) {
              const definition = entry.definitions[defIndex];
              
              const { data: defData, error: defError } = await supabase
                .from('definitions')
                .insert({
                  word_id: wordData.id,
                  definition: definition,
                  definition_number: defIndex + 1,
                  is_primary: defIndex === 0
                })
                .select()
                .single();

              if (defError) {
                console.error(`Error inserting definition for "${entry.word}":`, defError);
              }

              // Insert translations
              if (entry.translations && entry.translations.length > 0 && defData) {
                for (let transIndex = 0; transIndex < entry.translations.length; transIndex++) {
                  const translation = entry.translations[transIndex];
                  
                  const { error: transError } = await supabase
                    .from('translations')
                    .insert({
                      word_id: wordData.id,
                      definition_id: defData.id,
                      translation: translation,
                      target_language: 'en',
                      is_primary: transIndex === 0
                    });

                  if (transError) {
                    console.error(`Error inserting translation for "${entry.word}":`, transError);
                  }
                }
              }
            }
          }

          // Insert synonyms
          if (entry.synonyms && entry.synonyms.length > 0) {
            for (const synonym of entry.synonyms) {
              const { error: synError } = await supabase
                .from('synonyms')
                .insert({
                  word_id: wordData.id,
                  synonym_text: synonym
                });

              if (synError) {
                console.error(`Error inserting synonym for "${entry.word}":`, synError);
              }
            }
          }

          // Insert antonyms
          if (entry.antonyms && entry.antonyms.length > 0) {
            for (const antonym of entry.antonyms) {
              const { error: antError } = await supabase
                .from('antonyms')
                .insert({
                  word_id: wordData.id,
                  antonym_text: antonym
                });

              if (antError) {
                console.error(`Error inserting antonym for "${entry.word}":`, antError);
              }
            }
          }

          // Insert usage examples
          if (entry.usage_examples && entry.usage_examples.length > 0) {
            for (const example of entry.usage_examples) {
              const { error: exError } = await supabase
                .from('usage_examples')
                .insert({
                  word_id: wordData.id,
                  example_text: example
                });

              if (exError) {
                console.error(`Error inserting usage example for "${entry.word}":`, exError);
              }
            }
          }

          successCount++;
          if (successCount % 100 === 0) {
            console.log(`Progress: ${successCount} words imported successfully`);
          }

        } catch (error) {
          console.error(`Error processing word "${entry.word}":`, error);
          errorCount++;
        }
      }
    }

    console.log('\nImport completed!');
    console.log(`Successfully imported: ${successCount} words`);
    console.log(`Skipped (already exist): ${skipCount} words`);
    console.log(`Errors: ${errorCount} words`);

  } catch (error) {
    console.error('Fatal error during import:', error);
    process.exit(1);
  }
}

// Run the import
importDictionary();