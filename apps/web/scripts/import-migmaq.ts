import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Load env from root
const envPath = path.resolve(__dirname, '../../../.env')
const envContent = fs.readFileSync(envPath, 'utf8')
const apiKeyMatch = envContent.match(/SUPABASE_API_KEY="([^"]+)"/)
const supabaseKey = apiKeyMatch?.[1]

if (!supabaseKey) {
  throw new Error('SUPABASE_API_KEY not found in .env file')
}

const supabaseUrl = 'https://zgmeirjjarsakyfmlskl.supabase.co'

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

interface MigmaqWord {
  word: string
  type: string
  definitions: string[]
  translations: string[]
  usages: Array<{
    translation: string
    english: string
  }>
}

// Word class mappings for Mi'gmaq
const WORD_CLASS_MAP: Record<string, string> = {
  'verb animate transitive': 'f2249c35-672a-4e16-ae5e-c224f9582a5e',
  'verb inanimate transitive': '63ff5553-d0d4-4eea-a2c4-a156a71cd15d',
  'verb animate intransitive': '4767c39c-5dfd-4dc6-8da3-bc846377da71',
  'verb inanimate intransitive': '46c7f52b-4a70-4d19-b830-e2d9210a2331',
  'noun animate': '8f765666-83b9-4b76-b63b-262975f882be',
  'noun inanimate': 'dbcd46c3-9731-464b-a217-e924c637d14f',
  'particle': '8df05eb8-6285-4f39-bcf7-0f65640737a5',
  'unclassified': '6c18f44b-3d29-4400-a9c1-0478d225f0a9'
}

const MIGMAQ_LANGUAGE_ID = '88e8c9a7-232c-4426-8d9b-88b568c10fab'

async function importMigmaq() {
  console.log('Starting Mi\'gmaq dictionary import...')

  try {
    // Read the JSON file
    const dictionaryPath = '/tmp/migmaq_dictionary.json'
    const fileContents = fs.readFileSync(dictionaryPath, 'utf8')
    const words: MigmaqWord[] = JSON.parse(fileContents)

    console.log(`Loaded ${words.length} words from JSON file`)

    // Process each word
    let successCount = 0
    let errorCount = 0
    let skippedCount = 0

    for (const wordData of words) {
      try {
        // Determine word class
        const wordClassId = WORD_CLASS_MAP[wordData.type] || WORD_CLASS_MAP['unclassified']

        // Check if word already exists
        const { data: existingWord } = await supabase
          .from('words')
          .select('id')
          .eq('language_id', MIGMAQ_LANGUAGE_ID)
          .eq('word', wordData.word)
          .eq('word_class_id', wordClassId)
          .single()

        if (existingWord) {
          skippedCount++
          continue
        }

        // Insert the word
        const { data: word, error: wordError } = await supabase
          .from('words')
          .insert({
            language_id: MIGMAQ_LANGUAGE_ID,
            word: wordData.word,
            word_class_id: wordClassId,
            word_type: wordData.type || null,
            approved_by: null,
            approved_at: null
          })
          .select('id')
          .single()

        if (wordError) {
          throw wordError
        }

        const wordId = word.id

        // Insert definitions
        for (let i = 0; i < wordData.definitions.length; i++) {
          const { data: definition } = await supabase
            .from('definitions')
            .insert({
              word_id: wordId,
              definition: wordData.definitions[i],
              definition_number: i + 1,
              is_primary: i === 0
            })
            .select('id')
            .single()

          // Insert translations for this definition
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

        // Insert usage examples
        if (wordData.usages) {
          for (const usage of wordData.usages) {
            if (usage.translation || usage.english) {
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
    console.log(`Skipped (already exist): ${skippedCount} words`)
    console.log(`Errors: ${errorCount} words`)

  } catch (error) {
    console.error('Fatal error during import:', error)
    process.exit(1)
  }
}

// Run the import
importMigmaq()
  .then(() => {
    console.log('Import script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Import script failed:', error)
    process.exit(1)
  })
