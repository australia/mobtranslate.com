-- Fix RLS policies for quiz and learning tables

-- Enable RLS on tables if not already enabled
ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE spaced_repetition_states ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own quiz sessions" ON quiz_sessions;
DROP POLICY IF EXISTS "Users can create own quiz sessions" ON quiz_sessions;
DROP POLICY IF EXISTS "Users can update own quiz sessions" ON quiz_sessions;

DROP POLICY IF EXISTS "Users can view own quiz attempts" ON quiz_attempts;
DROP POLICY IF EXISTS "Users can create own quiz attempts" ON quiz_attempts;

DROP POLICY IF EXISTS "Users can view own spaced repetition states" ON spaced_repetition_states;
DROP POLICY IF EXISTS "Users can create own spaced repetition states" ON spaced_repetition_states;
DROP POLICY IF EXISTS "Users can update own spaced repetition states" ON spaced_repetition_states;

-- Create policies for quiz_sessions
CREATE POLICY "Users can view own quiz sessions" 
ON quiz_sessions FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own quiz sessions" 
ON quiz_sessions FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quiz sessions" 
ON quiz_sessions FOR UPDATE 
USING (auth.uid() = user_id);

-- Create policies for quiz_attempts
CREATE POLICY "Users can view own quiz attempts" 
ON quiz_attempts FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own quiz attempts" 
ON quiz_attempts FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create policies for spaced_repetition_states
CREATE POLICY "Users can view own spaced repetition states" 
ON spaced_repetition_states FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own spaced repetition states" 
ON spaced_repetition_states FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own spaced repetition states" 
ON spaced_repetition_states FOR UPDATE 
USING (auth.uid() = user_id);

-- Also check if languages table needs RLS policies
-- Languages should be viewable by all authenticated users
ALTER TABLE languages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view languages" ON languages;
CREATE POLICY "Authenticated users can view languages" 
ON languages FOR SELECT 
USING (auth.role() = 'authenticated');

-- Words table should also be viewable by authenticated users
ALTER TABLE words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view words" ON words;
CREATE POLICY "Authenticated users can view words" 
ON words FOR SELECT 
USING (auth.role() = 'authenticated');

-- Definitions table
ALTER TABLE definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view definitions" ON definitions;
CREATE POLICY "Authenticated users can view definitions" 
ON definitions FOR SELECT 
USING (auth.role() = 'authenticated');

-- User likes table
ALTER TABLE user_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own likes" ON user_likes;
DROP POLICY IF EXISTS "Users can create own likes" ON user_likes;
DROP POLICY IF EXISTS "Users can update own likes" ON user_likes;
DROP POLICY IF EXISTS "Users can delete own likes" ON user_likes;

CREATE POLICY "Users can view own likes" 
ON user_likes FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own likes" 
ON user_likes FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own likes" 
ON user_likes FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own likes" 
ON user_likes FOR DELETE 
USING (auth.uid() = user_id);

-- Add comment
COMMENT ON POLICY "Users can view own quiz sessions" ON quiz_sessions IS 'Allow users to view their own quiz sessions';
COMMENT ON POLICY "Users can view own quiz attempts" ON quiz_attempts IS 'Allow users to view their own quiz attempts';
COMMENT ON POLICY "Users can view own spaced repetition states" ON spaced_repetition_states IS 'Allow users to view their own learning progress';