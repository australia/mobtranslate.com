-- Create a function to get user stats without permission issues
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_stats json;
BEGIN
    WITH attempt_stats AS (
        SELECT 
            COUNT(*) AS total_attempts,
            COUNT(*) FILTER (WHERE is_correct) AS correct_attempts,
            COUNT(DISTINCT DATE(created_at)) AS days_active
        FROM quiz_attempts
        WHERE user_id = p_user_id
    ),
    recent_7_days AS (
        SELECT 
            COUNT(*) AS attempts,
            COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM quiz_attempts
        WHERE user_id = p_user_id
        AND created_at >= CURRENT_DATE - INTERVAL '7 days'
    ),
    recent_30_days AS (
        SELECT 
            COUNT(*) AS attempts,
            COUNT(*) FILTER (WHERE is_correct) AS correct
        FROM quiz_attempts
        WHERE user_id = p_user_id
        AND created_at >= CURRENT_DATE - INTERVAL '30 days'
    ),
    word_stats AS (
        SELECT 
            COUNT(DISTINCT word_id) AS total_words,
            COUNT(*) FILTER (WHERE bucket = 5) AS mastered_words,
            COUNT(*) FILTER (WHERE due_date <= NOW()) AS due_words
        FROM spaced_repetition_states
        WHERE user_id = p_user_id
    ),
    language_stats AS (
        SELECT 
            l.code,
            l.name,
            COUNT(DISTINCT srs.word_id) AS total_words,
            COUNT(DISTINCT srs.word_id) FILTER (WHERE srs.bucket = 5) AS mastered,
            COUNT(DISTINCT srs.word_id) FILTER (WHERE srs.due_date <= NOW()) AS due,
            COUNT(qa.id) AS attempts,
            COUNT(qa.id) FILTER (WHERE qa.is_correct) AS correct
        FROM languages l
        LEFT JOIN words w ON w.language_id = l.id
        LEFT JOIN spaced_repetition_states srs ON srs.word_id = w.id AND srs.user_id = p_user_id
        LEFT JOIN quiz_attempts qa ON qa.word_id = w.id AND qa.user_id = p_user_id
        WHERE EXISTS (
            SELECT 1 FROM words w2 
            JOIN spaced_repetition_states srs2 ON srs2.word_id = w2.id 
            WHERE w2.language_id = l.id AND srs2.user_id = p_user_id
        )
        GROUP BY l.id, l.code, l.name
    ),
    recent_attempts AS (
        SELECT 
            w.word,
            l.name AS language,
            qa.is_correct,
            qa.response_time_ms,
            qa.created_at
        FROM quiz_attempts qa
        JOIN words w ON w.id = qa.word_id
        JOIN languages l ON l.id = w.language_id
        WHERE qa.user_id = p_user_id
        ORDER BY qa.created_at DESC
        LIMIT 20
    ),
    streak_calc AS (
        SELECT 
            MAX(streak_length) AS streak_days
        FROM (
            SELECT 
                COUNT(*) AS streak_length
            FROM (
                SELECT 
                    DATE(created_at) AS attempt_date,
                    DATE(created_at) - ROW_NUMBER() OVER (ORDER BY DATE(created_at)) * INTERVAL '1 day' AS streak_group
                FROM quiz_attempts
                WHERE user_id = p_user_id
                GROUP BY DATE(created_at)
            ) grouped_dates
            GROUP BY streak_group
        ) streaks
    )
    SELECT json_build_object(
        'overall', json_build_object(
            'totalWords', COALESCE((SELECT total_words FROM word_stats), 0),
            'masteredWords', COALESCE((SELECT mastered_words FROM word_stats), 0),
            'dueWords', COALESCE((SELECT due_words FROM word_stats), 0),
            'totalAttempts', COALESCE((SELECT total_attempts FROM attempt_stats), 0),
            'correctAttempts', COALESCE((SELECT correct_attempts FROM attempt_stats), 0),
            'accuracy', CASE 
                WHEN COALESCE((SELECT total_attempts FROM attempt_stats), 0) = 0 THEN 0
                ELSE ROUND(
                    COALESCE((SELECT correct_attempts FROM attempt_stats), 0)::numeric / 
                    COALESCE((SELECT total_attempts FROM attempt_stats), 1) * 100, 
                    1
                )
            END,
            'streakDays', COALESCE((SELECT streak_days FROM streak_calc), 0)
        ),
        'recent', json_build_object(
            'last7Days', json_build_object(
                'attempts', COALESCE((SELECT attempts FROM recent_7_days), 0),
                'correct', COALESCE((SELECT correct FROM recent_7_days), 0),
                'accuracy', CASE 
                    WHEN COALESCE((SELECT attempts FROM recent_7_days), 0) = 0 THEN 0
                    ELSE ROUND(
                        COALESCE((SELECT correct FROM recent_7_days), 0)::numeric / 
                        COALESCE((SELECT attempts FROM recent_7_days), 1) * 100, 
                        1
                    )
                END
            ),
            'last30Days', json_build_object(
                'attempts', COALESCE((SELECT attempts FROM recent_30_days), 0),
                'correct', COALESCE((SELECT correct FROM recent_30_days), 0),
                'accuracy', CASE 
                    WHEN COALESCE((SELECT attempts FROM recent_30_days), 0) = 0 THEN 0
                    ELSE ROUND(
                        COALESCE((SELECT correct FROM recent_30_days), 0)::numeric / 
                        COALESCE((SELECT attempts FROM recent_30_days), 1) * 100, 
                        1
                    )
                END
            )
        ),
        'languages', COALESCE((
            SELECT json_agg(json_build_object(
                'code', code,
                'name', name,
                'totalWords', total_words,
                'attempts', attempts,
                'correct', correct,
                'accuracy', CASE 
                    WHEN attempts = 0 THEN 0 
                    ELSE ROUND(correct::numeric / attempts * 100, 1) 
                END,
                'mastered', mastered,
                'due', due
            ))
            FROM language_stats
        ), '[]'::json),
        'recentAttempts', COALESCE((
            SELECT json_agg(json_build_object(
                'word', word,
                'language', language,
                'isCorrect', is_correct,
                'responseTime', response_time_ms,
                'date', created_at
            ))
            FROM recent_attempts
        ), '[]'::json)
    ) INTO v_stats;
    
    RETURN v_stats;
END;
$$;