import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Read the migration SQL
const migrationPath = path.join(__dirname, '../supabase/migrations/20250120_fix_rls_policies.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

// Create Supabase client with service role key
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyRLSPolicies() {
  console.log('Applying RLS policies migration...');
  
  try {
    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`Found ${statements.length} SQL statements to execute`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      console.log(`\nExecuting statement ${i + 1}/${statements.length}...`);
      console.log(statement.substring(0, 100) + '...');
      
      const { error } = await supabase.rpc('exec_sql', {
        sql: statement
      });
      
      if (error) {
        console.error('Error executing statement:', error);
        // Continue with other statements even if one fails
      } else {
        console.log('✓ Statement executed successfully');
      }
    }
    
    console.log('\nRLS policies migration completed!');
  } catch (error) {
    console.error('Error applying RLS policies:', error);
  }
}

// Run the migration
applyRLSPolicies();