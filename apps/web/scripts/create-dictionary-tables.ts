import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') })

// Initialize Supabase client with service role key for admin access
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

async function createTables() {
  console.log('Creating dictionary database tables...\n')

  try {
    // First, let's check if the languages table exists
    const { data: existingLanguages, error: checkError } = await supabase
      .from('languages')
      .select('id')
      .limit(1)

    if (!checkError) {
      console.log('✓ Tables already exist. Skipping table creation.')
      return true
    }

    console.log('Tables not found. Please run the SQL migrations manually in Supabase Dashboard.')
    console.log('\nTo do this:')
    console.log('1. Go to your Supabase project dashboard')
    console.log('2. Navigate to the SQL Editor')
    console.log('3. Copy and run the contents of:')
    console.log('   - apps/web/supabase/migrations/20240119_create_dictionary_schema.sql')
    console.log('   - apps/web/supabase/migrations/20240119_seed_dictionary_data.sql')
    console.log('\nThen run this script again to import the dictionary data.')
    
    return false
  } catch (error) {
    console.error('Error checking tables:', error)
    return false
  }
}

async function seedWordClasses() {
  console.log('\nSeeding word classes...')
  
  const { data: existingClasses } = await supabase
    .from('word_classes')
    .select('code')
    .limit(1)

  if (existingClasses && existingClasses.length > 0) {
    console.log('✓ Word classes already seeded')
    return
  }

  const wordClasses = [
    { code: 'noun', name: 'Noun', abbreviation: 'n.', description: 'A word used to identify people, places, things, or ideas', sort_order: 1 },
    { code: 'verb', name: 'Verb', abbreviation: 'v.', description: 'A word used to describe an action, state, or occurrence', sort_order: 2 },
    { code: 'adjective', name: 'Adjective', abbreviation: 'adj.', description: 'A word that modifies or describes a noun or pronoun', sort_order: 3 },
    { code: 'adverb', name: 'Adverb', abbreviation: 'adv.', description: 'A word that modifies a verb, adjective, or another adverb', sort_order: 4 },
    { code: 'pronoun', name: 'Pronoun', abbreviation: 'pron.', description: 'A word that takes the place of a noun', sort_order: 5 },
    { code: 'preposition', name: 'Preposition', abbreviation: 'prep.', description: 'A word that shows the relationship between a noun and other words', sort_order: 6 },
    { code: 'conjunction', name: 'Conjunction', abbreviation: 'conj.', description: 'A word used to connect clauses or sentences', sort_order: 7 },
    { code: 'interjection', name: 'Interjection', abbreviation: 'interj.', description: 'A word or phrase that expresses emotion', sort_order: 8 },
    { code: 'determiner', name: 'Determiner', abbreviation: 'det.', description: 'A word that introduces a noun', sort_order: 9 },
    { code: 'particle', name: 'Particle', abbreviation: 'part.', description: 'A function word that does not belong to other categories', sort_order: 10 },
    { code: 'transitive-verb', name: 'Transitive Verb', abbreviation: 'v.t.', description: 'A verb that requires a direct object', sort_order: 11 },
    { code: 'intransitive-verb', name: 'Intransitive Verb', abbreviation: 'v.i.', description: 'A verb that does not require a direct object', sort_order: 12 },
    { code: 'direction', name: 'Direction', abbreviation: 'dir.', description: 'Words indicating direction or location', sort_order: 13 },
    { code: 'exclamation', name: 'Exclamation', abbreviation: 'excl.', description: 'Words or phrases expressing strong emotion', sort_order: 14 },
    { code: 'number', name: 'Number', abbreviation: 'num.', description: 'Words representing numbers or quantities', sort_order: 15 },
    { code: 'question', name: 'Question Word', abbreviation: 'q.', description: 'Words used to form questions', sort_order: 16 }
  ]

  const { error } = await supabase
    .from('word_classes')
    .insert(wordClasses)

  if (error) {
    console.error('Error seeding word classes:', error)
  } else {
    console.log('✓ Word classes seeded successfully')
  }
}

async function seedLanguages() {
  console.log('\nSeeding languages...')
  
  const { data: existingLanguages } = await supabase
    .from('languages')
    .select('code')
    .eq('code', 'kuku_yalanji')
    .single()

  if (existingLanguages) {
    console.log('✓ Kuku Yalanji language already exists')
    return
  }

  const languages = [
    {
      code: 'kuku_yalanji',
      name: 'Kuku Yalanji',
      native_name: 'Kuku Yalanji',
      description: 'The Kuku Yalanji language is spoken by the Kuku Yalanji people of Far North Queensland, Australia. It is part of the Pama-Nyungan language family.',
      region: 'Far North Queensland',
      country: 'Australia',
      status: 'severely endangered',
      family: 'Pama-Nyungan',
      writing_system: 'Latin script',
      is_active: true
    }
  ]

  const { error } = await supabase
    .from('languages')
    .insert(languages)

  if (error) {
    console.error('Error seeding languages:', error)
  } else {
    console.log('✓ Languages seeded successfully')
  }
}

async function main() {
  console.log('Dictionary Database Setup')
  console.log('========================\n')

  // Check if tables exist
  const tablesExist = await createTables()
  
  if (!tablesExist) {
    process.exit(1)
  }

  // Seed initial data
  await seedWordClasses()
  await seedLanguages()

  console.log('\n✅ Setup completed! You can now run the import script:')
  console.log('   npm run import:kuku-yalanji')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Setup failed:', error)
    process.exit(1)
  })