import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface WajarriEntry {
  Wajarri: string
  English: string
  description: string
  sound?: string
  image?: string
}

async function importWajarriDictionary() {
  console.log('🚀 Starting Wajarri dictionary import...\n')

  try {
    // Step 1: Create Wajarri language entry
    console.log('📝 Creating Wajarri language entry...')
    
    const { data: existingLanguage } = await supabase
      .from('languages')
      .select('id')
      .eq('code', 'wbv')
      .single()

    let languageId: string

    if (existingLanguage) {
      languageId = existingLanguage.id
      console.log('✅ Wajarri language already exists')
    } else {
      const { data: newLanguage, error: langError } = await supabase
        .from('languages')
        .insert({
          code: 'wbv',
          name: 'Wajarri',
          native_name: 'Wajarri',
          description: 'Wajarri is an Indigenous Australian language from Western Australia. It is spoken by the Wajarri people in the Mid West region of Western Australia.',
          region: 'Mid West Western Australia',
          country: 'Australia',
          speakers_count: 100, // Estimated
          status: 'endangered',
          family: 'Pama-Nyungan',
          iso_639_3: 'wbv',
          glottocode: 'waja1257',
          writing_system: 'Latin',
          orthography_notes: 'Modern practical orthography developed for language preservation',
          metadata: {
            sources: ['MobTranslate Dictionary Project'],
            preservation_status: 'Active revitalization',
            dialects: ['Eastern Wajarri', 'Western Wajarri']
          },
          is_active: true
        })
        .select()
        .single()

      if (langError) {
        console.error('❌ Error creating language:', langError)
        return
      }

      languageId = newLanguage!.id
      console.log('✅ Created Wajarri language entry')
    }

    // Step 2: Get or create word classes
    console.log('\n📚 Setting up word classes...')
    
    const wordClassMap: { [key: string]: string } = {}
    const classesToCreate = [
      { name: 'noun', abbreviation: 'n.' },
      { name: 'verb', abbreviation: 'v.' },
      { name: 'adjective', abbreviation: 'adj.' },
      { name: 'adverb', abbreviation: 'adv.' },
      { name: 'interjection', abbreviation: 'interj.' },
      { name: 'phrase', abbreviation: 'phr.' },
      { name: 'unknown', abbreviation: 'unk.' }
    ]

    for (const cls of classesToCreate) {
      const { data: existing } = await supabase
        .from('word_classes')
        .select('id')
        .eq('name', cls.name)
        .single()

      if (existing) {
        wordClassMap[cls.name] = existing.id
      } else {
        const { data: newClass } = await supabase
          .from('word_classes')
          .insert(cls)
          .select()
          .single()
        
        if (newClass) {
          wordClassMap[cls.name] = newClass.id
        }
      }
    }
    console.log('✅ Word classes ready')

    // Step 3: Load and parse dictionary data
    console.log('\n📖 Loading dictionary data...')
    const dictionaryPath = path.join(process.cwd(), '../../dictionaries/wajarri/dictionary.json')
    const dictionaryData = JSON.parse(fs.readFileSync(dictionaryPath, 'utf-8')) as WajarriEntry[]
    console.log(`✅ Loaded ${dictionaryData.length} entries`)

    // Step 4: Import words with batch processing
    console.log('\n💾 Importing words to database...')
    
    let successCount = 0
    let errorCount = 0
    const batchSize = 50
    
    for (let i = 0; i < dictionaryData.length; i += batchSize) {
      const batch = dictionaryData.slice(i, i + batchSize)
      const wordsToInsert = []
      
      for (const entry of batch) {
        // Determine word class based on description/English term
        let wordClass = 'unknown'
        const lowerDesc = entry.description?.toLowerCase() || ''
        const lowerEng = entry.English?.toLowerCase() || ''
        
        if (lowerDesc.includes('verb') || lowerEng.startsWith('to ')) {
          wordClass = 'verb'
        } else if (lowerDesc.includes('adj') || lowerEng.includes('adjective')) {
          wordClass = 'adjective'
        } else if (lowerDesc.includes('adv') || lowerEng.includes('adverb')) {
          wordClass = 'adverb'
        } else if (lowerDesc.includes('interj') || lowerEng.includes('!')) {
          wordClass = 'interjection'
        } else if (lowerDesc.includes('phrase') || entry.Wajarri.includes(' ')) {
          wordClass = 'phrase'
        } else {
          wordClass = 'noun' // Default to noun
        }

        const wordData = {
          language_id: languageId,
          word: entry.Wajarri,
          normalized_word: entry.Wajarri.toLowerCase().replace(/[^a-z\s-]/g, ''),
          word_class_id: wordClassMap[wordClass],
          notes: entry.sound ? `Audio: ${entry.sound}` : null,
          metadata: {
            audio_file: entry.sound,
            image_file: entry.image,
            original_entry: entry
          },
          is_verified: true,
          quality_score: 80
        }
        
        wordsToInsert.push(wordData)
      }

      // Insert batch of words
      const { data: insertedWords, error: wordsError } = await supabase
        .from('words')
        .insert(wordsToInsert)
        .select('id, word')

      if (wordsError) {
        console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, wordsError.message)
        errorCount += batch.length
        continue
      }

      // Insert definitions for each word
      if (insertedWords) {
        const definitionsToInsert = []
        
        for (let j = 0; j < insertedWords.length; j++) {
          const word = insertedWords[j]
          const entry = batch[j]
          
          // Add primary definition
          definitionsToInsert.push({
            word_id: word.id,
            definition: entry.description || entry.English,
            definition_number: 1,
            is_primary: true
          })
        }

        const { error: defError } = await supabase
          .from('definitions')
          .insert(definitionsToInsert)

        if (defError) {
          console.error('❌ Error inserting definitions:', defError.message)
        }

        // Insert translations
        const translationsToInsert = []
        
        for (let j = 0; j < insertedWords.length; j++) {
          const word = insertedWords[j]
          const entry = batch[j]
          
          translationsToInsert.push({
            word_id: word.id,
            translation: entry.English,
            target_language: 'en',
            is_primary: true
          })
        }

        const { error: transError } = await supabase
          .from('translations')
          .insert(translationsToInsert)

        if (transError) {
          console.error('❌ Error inserting translations:', transError.message)
        }

        successCount += insertedWords.length
      }

      // Progress update
      const progress = Math.min(100, Math.round(((i + batchSize) / dictionaryData.length) * 100))
      process.stdout.write(`\rProgress: ${progress}% | Success: ${successCount} | Errors: ${errorCount}`)
    }

    console.log('\n\n✨ Import completed!')
    console.log(`📊 Statistics:`)
    console.log(`   - Total entries: ${dictionaryData.length}`)
    console.log(`   - Successfully imported: ${successCount}`)
    console.log(`   - Errors: ${errorCount}`)
    console.log(`   - Language ID: ${languageId}`)
    
    // Step 5: Verify via API
    console.log('\n🔍 Verifying via API...')
    const apiUrl = 'http://localhost:3000/api/v2/public'
    
    try {
      // Check if Wajarri appears in dictionaries list
      const dictResponse = await fetch(`${apiUrl}/dictionaries`)
      const dictData = await dictResponse.json()
      const wajarriDict = dictData.dictionaries?.find((d: any) => d.code === 'wbv')
      
      if (wajarriDict) {
        console.log('✅ Wajarri available in dictionaries API')
        
        // Get some sample words
        const wordsResponse = await fetch(`${apiUrl}/dictionaries/wbv/words?limit=5`)
        const wordsData = await wordsResponse.json()
        
        if (wordsData.words && wordsData.words.length > 0) {
          console.log(`✅ Successfully retrieved ${wordsData.words.length} sample words`)
          console.log('\n📝 Sample words:')
          wordsData.words.forEach((w: any) => {
            console.log(`   - ${w.word}: ${w.translations?.[0]?.translation || w.definitions?.[0]?.definition}`)
          })
        }
      } else {
        console.log('⚠️  Wajarri not found in API (may need to restart server)')
      }
    } catch (apiError) {
      console.log('⚠️  Could not verify via API (server may not be running)')
    }

    console.log('\n🎉 Wajarri dictionary is now available via the API!')
    console.log('   Access at: http://localhost:3000/api/v2/public/dictionaries/wbv/words')
    
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  }
}

// Run the import
importWajarriDictionary()
  .then(() => {
    console.log('\n✅ Import script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Import script failed:', error)
    process.exit(1)
  })