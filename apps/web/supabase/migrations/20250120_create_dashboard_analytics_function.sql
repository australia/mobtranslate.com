-- Create a function to get dashboard analytics data with proper permissions
CREATE OR REPLACE FUNCTION get_dashboard_analytics(
  p_user_id UUID,
  p_date_filter TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  WITH user_sessions AS (
    SELECT 
      qs.id,
      qs.language_id,
      qs.total_questions,
      qs.correct_answers,
      qs.accuracy_percentage,
      qs.streak,
      qs.avg_response_time_ms,
      qs.created_at,
      qs.completed_at,
      l.name as language_name,
      l.code as language_code
    FROM quiz_sessions qs
    LEFT JOIN languages l ON qs.language_id = l.id
    WHERE qs.user_id = p_user_id
      AND qs.completed_at IS NOT NULL
      AND (p_date_filter IS NULL OR qs.created_at >= p_date_filter)
  ),
  user_attempts AS (
    SELECT 
      qa.id,
      qa.word_id,
      qa.session_id,
      qa.is_correct,
      qa.response_time_ms,
      qa.bucket_at_time,
      qa.created_at,
      w.word,
      l.name as language_name,
      l.code as language_code
    FROM quiz_attempts qa
    LEFT JOIN words w ON qa.word_id = w.id
    LEFT JOIN languages l ON w.language_id = l.id
    WHERE qa.user_id = p_user_id
      AND (p_date_filter IS NULL OR qa.created_at >= p_date_filter)
  ),
  user_states AS (
    SELECT 
      bucket,
      word_id
    FROM spaced_repetition_states
    WHERE user_id = p_user_id
  )
  SELECT json_build_object(
    'sessions', COALESCE((SELECT json_agg(row_to_json(s)) FROM user_sessions s), '[]'::json),
    'attempts', COALESCE((SELECT json_agg(row_to_json(a)) FROM user_attempts a), '[]'::json),
    'states', COALESCE((SELECT json_agg(row_to_json(st)) FROM user_states st), '[]'::json)
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_dashboard_analytics TO authenticated;

-- Add comment
COMMENT ON FUNCTION get_dashboard_analytics IS 'Retrieves dashboard analytics data for a user with proper permissions';