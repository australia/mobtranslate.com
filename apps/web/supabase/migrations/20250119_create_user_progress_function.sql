-- Create function to refresh user quiz progress materialized view
CREATE OR REPLACE FUNCTION refresh_user_quiz_progress(p_user_id UUID)
RETURNS void AS $$
BEGIN
  -- This function would refresh a materialized view if we had one
  -- For now, it's a placeholder that could trigger recalculation of user stats
  -- In the future, we might add a materialized view for performance
  
  -- Update user's last activity timestamp
  INSERT INTO user_quiz_progress (
    user_id,
    language_id,
    language_code,
    language_name,
    total_words,
    new_words,
    learning_words,
    review_words,
    mastered_words,
    due_for_review,
    best_streak,
    updated_at
  )
  SELECT 
    p_user_id,
    l.id,
    l.code,
    l.name,
    COALESCE(word_counts.total, 0),
    COALESCE(word_counts.new_words, 0),
    COALESCE(word_counts.learning_words, 0),
    COALESCE(word_counts.review_words, 0),
    COALESCE(word_counts.mastered_words, 0),
    COALESCE(word_counts.due_count, 0),
    COALESCE(session_stats.best_streak, 0),
    NOW()
  FROM languages l
  LEFT JOIN (
    SELECT 
      w.language_id,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE srs.bucket = 0) as new_words,
      COUNT(*) FILTER (WHERE srs.bucket BETWEEN 1 AND 2) as learning_words,
      COUNT(*) FILTER (WHERE srs.bucket BETWEEN 3 AND 4) as review_words,
      COUNT(*) FILTER (WHERE srs.bucket = 5) as mastered_words,
      COUNT(*) FILTER (WHERE srs.due_date <= NOW()) as due_count
    FROM spaced_repetition_states srs
    JOIN words w ON w.id = srs.word_id
    WHERE srs.user_id = p_user_id
    GROUP BY w.language_id
  ) word_counts ON word_counts.language_id = l.id
  LEFT JOIN (
    SELECT 
      qs.language_id,
      MAX(qs.streak) as best_streak
    FROM quiz_sessions qs
    WHERE qs.user_id = p_user_id
    GROUP BY qs.language_id
  ) session_stats ON session_stats.language_id = l.id
  WHERE l.is_active = true
    AND (word_counts.total > 0 OR session_stats.best_streak > 0)
  ON CONFLICT (user_id, language_id) 
  DO UPDATE SET
    total_words = EXCLUDED.total_words,
    new_words = EXCLUDED.new_words,
    learning_words = EXCLUDED.learning_words,
    review_words = EXCLUDED.review_words,
    mastered_words = EXCLUDED.mastered_words,
    due_for_review = EXCLUDED.due_for_review,
    best_streak = EXCLUDED.best_streak,
    updated_at = EXCLUDED.updated_at;
    
  -- Log the refresh for debugging
  INSERT INTO user_activity_log (user_id, activity_type, metadata, created_at)
  VALUES (
    p_user_id, 
    'progress_refresh', 
    jsonb_build_object('refreshed_at', NOW()),
    NOW()
  )
  ON CONFLICT DO NOTHING;
  
EXCEPTION WHEN OTHERS THEN
  -- Log any errors but don't fail the calling function
  RAISE WARNING 'Error refreshing user progress for user %: %', p_user_id, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Create user activity log table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, activity_type, created_at)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_activity_log_user_id_type 
ON user_activity_log(user_id, activity_type);

-- Enable RLS
ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Users can view own activity logs"
ON user_activity_log FOR ALL
TO authenticated
USING (auth.uid() = user_id);