import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// This endpoint applies RLS policies - only run once
export async function POST() {
  try {
    // Create admin client with service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const policies = [
      // Enable RLS on tables
      `ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE spaced_repetition_states ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE languages ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE words ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE definitions ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE user_likes ENABLE ROW LEVEL SECURITY`,
      
      // Drop existing policies
      `DROP POLICY IF EXISTS "Users can view own quiz sessions" ON quiz_sessions`,
      `DROP POLICY IF EXISTS "Users can create own quiz sessions" ON quiz_sessions`,
      `DROP POLICY IF EXISTS "Users can update own quiz sessions" ON quiz_sessions`,
      `DROP POLICY IF EXISTS "Users can view own quiz attempts" ON quiz_attempts`,
      `DROP POLICY IF EXISTS "Users can create own quiz attempts" ON quiz_attempts`,
      `DROP POLICY IF EXISTS "Users can view own spaced repetition states" ON spaced_repetition_states`,
      `DROP POLICY IF EXISTS "Users can create own spaced repetition states" ON spaced_repetition_states`,
      `DROP POLICY IF EXISTS "Users can update own spaced repetition states" ON spaced_repetition_states`,
      `DROP POLICY IF EXISTS "Authenticated users can view languages" ON languages`,
      `DROP POLICY IF EXISTS "Authenticated users can view words" ON words`,
      `DROP POLICY IF EXISTS "Authenticated users can view definitions" ON definitions`,
      `DROP POLICY IF EXISTS "Users can view own likes" ON user_likes`,
      `DROP POLICY IF EXISTS "Users can create own likes" ON user_likes`,
      `DROP POLICY IF EXISTS "Users can update own likes" ON user_likes`,
      `DROP POLICY IF EXISTS "Users can delete own likes" ON user_likes`,
      
      // Create policies for quiz_sessions
      `CREATE POLICY "Users can view own quiz sessions" ON quiz_sessions FOR SELECT USING (auth.uid() = user_id)`,
      `CREATE POLICY "Users can create own quiz sessions" ON quiz_sessions FOR INSERT WITH CHECK (auth.uid() = user_id)`,
      `CREATE POLICY "Users can update own quiz sessions" ON quiz_sessions FOR UPDATE USING (auth.uid() = user_id)`,
      
      // Create policies for quiz_attempts
      `CREATE POLICY "Users can view own quiz attempts" ON quiz_attempts FOR SELECT USING (auth.uid() = user_id)`,
      `CREATE POLICY "Users can create own quiz attempts" ON quiz_attempts FOR INSERT WITH CHECK (auth.uid() = user_id)`,
      
      // Create policies for spaced_repetition_states
      `CREATE POLICY "Users can view own spaced repetition states" ON spaced_repetition_states FOR SELECT USING (auth.uid() = user_id)`,
      `CREATE POLICY "Users can create own spaced repetition states" ON spaced_repetition_states FOR INSERT WITH CHECK (auth.uid() = user_id)`,
      `CREATE POLICY "Users can update own spaced repetition states" ON spaced_repetition_states FOR UPDATE USING (auth.uid() = user_id)`,
      
      // Create policies for public tables
      `CREATE POLICY "Authenticated users can view languages" ON languages FOR SELECT USING (auth.role() = 'authenticated')`,
      `CREATE POLICY "Authenticated users can view words" ON words FOR SELECT USING (auth.role() = 'authenticated')`,
      `CREATE POLICY "Authenticated users can view definitions" ON definitions FOR SELECT USING (auth.role() = 'authenticated')`,
      
      // Create policies for user_likes
      `CREATE POLICY "Users can view own likes" ON user_likes FOR SELECT USING (auth.uid() = user_id)`,
      `CREATE POLICY "Users can create own likes" ON user_likes FOR INSERT WITH CHECK (auth.uid() = user_id)`,
      `CREATE POLICY "Users can update own likes" ON user_likes FOR UPDATE USING (auth.uid() = user_id)`,
      `CREATE POLICY "Users can delete own likes" ON user_likes FOR DELETE USING (auth.uid() = user_id)`
    ];

    const results = [];
    
    for (const policy of policies) {
      try {
        const { data, error } = await supabase.rpc('query', { 
          query_text: policy 
        }).single();
        
        if (error) {
          // Try direct execution as fallback
          const { error: directError } = await supabase.from('_sql').select(policy);
          
          results.push({
            query: policy.substring(0, 50) + '...',
            success: !directError,
            error: directError?.message
          });
        } else {
          results.push({
            query: policy.substring(0, 50) + '...',
            success: true
          });
        }
      } catch (e) {
        results.push({
          query: policy.substring(0, 50) + '...',
          success: false,
          error: (e as Error).message
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({
      message: `RLS policies applied: ${successful} successful, ${failed} failed`,
      results,
      summary: {
        total: policies.length,
        successful,
        failed
      }
    });
    
  } catch (error) {
    console.error('Error applying RLS policies:', error);
    return NextResponse.json(
      { error: 'Failed to apply RLS policies', details: (error as Error).message },
      { status: 500 }
    );
  }
}