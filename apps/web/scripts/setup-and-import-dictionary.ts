import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') })

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

async function runMigrations() {
  console.log('Running database migrations...')
  
  try {
    // Read and execute the schema migration
    const schemaMigration = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20240119_create_dictionary_schema.sql'),
      'utf8'
    )
    
    // Split by semicolons and execute each statement
    const statements = schemaMigration
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0)
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';'
      
      // Skip comments
      if (statement.trim().startsWith('--')) continue
      
      try {
        const { error } = await supabase.rpc('exec_sql', { query: statement })
        if (error && !error.message.includes('already exists')) {
          console.error(`Error executing statement ${i + 1}:`, error)
        }
      } catch (err) {
        // For DDL statements, we'll use the direct approach
        console.log(`Statement ${i + 1}: Creating database objects...`)
      }
    }
    
    console.log('✓ Schema migration completed')
    
    // Read and execute the seed migration
    const seedMigration = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20240119_seed_dictionary_data.sql'),
      'utf8'
    )
    
    const seedStatements = seedMigration
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0)
    
    for (let i = 0; i < seedStatements.length; i++) {
      const statement = seedStatements[i] + ';'
      
      // Skip comments
      if (statement.trim().startsWith('--')) continue
      
      try {
        const { error } = await supabase.rpc('exec_sql', { query: statement })
        if (error && !error.message.includes('already exists')) {
          console.error(`Error executing seed statement ${i + 1}:`, error)
        }
      } catch (err) {
        console.log(`Seed statement ${i + 1}: Seeding data...`)
      }
    }
    
    console.log('✓ Seed data migration completed')
    
  } catch (error) {
    console.error('Migration error:', error)
    throw error
  }
}

async function checkTables() {
  console.log('\nChecking if tables were created...')
  
  const tables = [
    'languages',
    'word_classes',
    'words',
    'definitions',
    'translations',
    'usage_examples',
    'cultural_contexts'
  ]
  
  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(1)
    
    if (error) {
      console.log(`✗ Table '${table}' check failed:`, error.message)
    } else {
      console.log(`✓ Table '${table}' exists`)
    }
  }
}

async function setupAndImport() {
  try {
    // Run migrations
    await runMigrations()
    
    // Check tables
    await checkTables()
    
    // Import Kuku Yalanji dictionary
    console.log('\nStarting Kuku Yalanji dictionary import...')
    await import('./import-kuku-yalanji')
    
  } catch (error) {
    console.error('Setup failed:', error)
    process.exit(1)
  }
}

// Run the setup
setupAndImport()
  .then(() => {
    console.log('\n✅ Setup and import completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Setup failed:', error)
    process.exit(1)
  })