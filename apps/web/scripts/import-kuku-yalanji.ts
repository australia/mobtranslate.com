import { createClient } from '@supabase/supabase-js'
import yaml from 'js-yaml'
import fs from 'fs'
import path from 'path'

// Initialize Supabase client with service role key for admin access
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use service role for admin access
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

interface DictionaryWord {
  word: string
  type?: string
  definition?: string
  definitions?: string[]
  translations?: string[]
  synonyms?: string[]
  example?: string
  cultural_context?: string
  usages?: Array<{
    english?: string
    translation?: string
  }>
}

interface Dictionary {
  meta: {
    name: string
  }
  words: DictionaryWord[]
}

async function importKukuYalanji() {
  console.log('Starting Kuku Yalanji dictionary import...')

  try {
    // Read the YAML file
    const dictionaryPath = path.join(__dirname, '../../../dictionaries/kuku_yalanji/dictionary.yaml')
    const fileContents = fs.readFileSync(dictionaryPath, 'utf8')
    const dictionary = yaml.load(fileContents) as Dictionary

    console.log(`Loaded ${dictionary.words.length} words from YAML file`)

    // Get the language ID
    const { data: language, error: langError } = await supabase
      .from('languages')
      .select('id')
      .eq('code', 'kuku_yalanji')
      .single()

    if (langError || !language) {
      throw new Error('Kuku Yalanji language not found in database')
    }

    const languageId = language.id
    console.log(`Found language ID: ${languageId}`)

    // Get word class mappings
    const { data: wordClasses } = await supabase
      .from('word_classes')
      .select('id, code')

    const wordClassMap = new Map(wordClasses?.map(wc => [wc.code, wc.id]) || [])

    // Process each word
    let successCount = 0
    let errorCount = 0

    for (const wordData of dictionary.words) {
      try {
        // Determine word class
        let wordClassId = null
        if (wordData.type) {
          wordClassId = wordClassMap.get(wordData.type) || null
        }

        // Insert the word
        let { data: word, error: wordError } = await supabase
          .from('words')
          .insert({
            language_id: languageId,
            word: wordData.word,
            word_class_id: wordClassId,
            word_type: wordData.type || null,
            approved_by: null, // Will need admin approval
            approved_at: null
          })
          .select('id')
          .single()

        if (wordError) {
          // Word might already exist, try to get it
          const { data: existingWord } = await supabase
            .from('words')
            .select('id')
            .eq('language_id', languageId)
            .eq('word', wordData.word)
            .eq('word_class_id', wordClassId)
            .single()

          if (!existingWord) {
            throw wordError
          }
          word = existingWord
        }

        if (!word) {
          console.error(`Failed to insert or find word: ${wordData.word}`)
          continue
        }

        const wordId = word.id

        // Insert definitions
        const definitions = wordData.definitions || (wordData.definition ? [wordData.definition] : [])
        
        for (let i = 0; i < definitions.length; i++) {
          const { data: definition } = await supabase
            .from('definitions')
            .insert({
              word_id: wordId,
              definition: definitions[i],
              definition_number: i + 1,
              is_primary: i === 0
            })
            .select('id')
            .single()

          // Insert translations for this definition if they exist
          if (wordData.translations && definition) {
            for (const translation of wordData.translations) {
              await supabase
                .from('translations')
                .insert({
                  word_id: wordId,
                  definition_id: definition.id,
                  translation: translation,
                  target_language: 'en',
                  is_primary: wordData.translations.indexOf(translation) === 0
                })
            }
          }
        }

        // Insert general translations (not linked to specific definitions)
        if (wordData.translations && definitions.length === 0) {
          for (const translation of wordData.translations) {
            await supabase
              .from('translations')
              .insert({
                word_id: wordId,
                definition_id: null,
                translation: translation,
                target_language: 'en',
                is_primary: wordData.translations.indexOf(translation) === 0
              })
          }
        }

        // Insert synonyms
        if (wordData.synonyms) {
          for (const synonym of wordData.synonyms) {
            // First check if the synonym exists as a word
            const { data: synonymWord } = await supabase
              .from('words')
              .select('id')
              .eq('language_id', languageId)
              .eq('word', synonym)
              .single()

            await supabase
              .from('synonyms')
              .insert({
                word_id: wordId,
                synonym_word_id: synonymWord?.id || null,
                synonym_text: synonymWord ? null : synonym
              })
          }
        }

        // Insert usage examples
        if (wordData.usages) {
          for (const usage of wordData.usages) {
            if (usage.english || usage.translation) {
              await supabase
                .from('usage_examples')
                .insert({
                  word_id: wordId,
                  example_text: usage.translation || '',
                  translation: usage.english || null
                })
            }
          }
        }

        // Insert single example if exists
        if (wordData.example) {
          await supabase
            .from('usage_examples')
            .insert({
              word_id: wordId,
              example_text: wordData.example,
              translation: null
            })
        }

        // Insert cultural context if exists
        if (wordData.cultural_context) {
          await supabase
            .from('cultural_contexts')
            .insert({
              word_id: wordId,
              context_description: wordData.cultural_context
            })
        }

        successCount++
        if (successCount % 100 === 0) {
          console.log(`Processed ${successCount} words...`)
        }

      } catch (error) {
        console.error(`Error processing word "${wordData.word}":`, error)
        errorCount++
      }
    }

    console.log('\n=== Import Complete ===')
    console.log(`Successfully imported: ${successCount} words`)
    console.log(`Errors: ${errorCount} words`)

  } catch (error) {
    console.error('Fatal error during import:', error)
    process.exit(1)
  }
}

// Run the import
importKukuYalanji()
  .then(() => {
    console.log('Import script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Import script failed:', error)
    process.exit(1)
  })