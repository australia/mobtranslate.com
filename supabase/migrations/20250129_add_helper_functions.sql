-- Add missing columns to word_comments table
ALTER TABLE word_comments
ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES auth.users(id);

-- Create index for flagged comments
CREATE INDEX IF NOT EXISTS idx_word_comments_is_flagged ON word_comments(is_flagged) WHERE is_flagged = true;

-- Helper function to check if a user has a specific role
CREATE OR REPLACE FUNCTION user_has_role(
    user_uuid UUID,
    role_names TEXT[],
    language_uuid UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    has_role BOOLEAN;
BEGIN
    -- Check if user has any of the specified roles
    -- If language_uuid is provided, check for that specific language
    -- If user has super_admin or dictionary_admin role, they have access to all languages
    SELECT EXISTS (
        SELECT 1 
        FROM user_role_assignments ura
        JOIN user_roles ur ON ura.role_id = ur.id
        WHERE ura.user_id = user_uuid
        AND ura.is_active = true
        AND ur.name = ANY(role_names)
        AND (
            -- Super admin or dictionary admin has access to everything
            ur.name IN ('super_admin', 'dictionary_admin')
            -- Or user has role for specific language
            OR (language_uuid IS NULL)
            OR (ura.language_id = language_uuid)
            -- Or user has role with null language_id (all languages)
            OR (ura.language_id IS NULL AND ur.name NOT IN ('super_admin', 'dictionary_admin'))
        )
    ) INTO has_role;
    
    RETURN has_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get user's role for a specific language
CREATE OR REPLACE FUNCTION get_user_language_role(
    user_uuid UUID,
    language_uuid UUID
)
RETURNS TABLE(
    role_name TEXT,
    role_display_name TEXT,
    is_global BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ur.name,
        ur.display_name,
        CASE 
            WHEN ur.name IN ('super_admin', 'dictionary_admin') THEN true
            WHEN ura.language_id IS NULL THEN true
            ELSE false
        END as is_global
    FROM user_role_assignments ura
    JOIN user_roles ur ON ura.role_id = ur.id
    WHERE ura.user_id = user_uuid
    AND ura.is_active = true
    AND (
        ur.name IN ('super_admin', 'dictionary_admin')
        OR ura.language_id = language_uuid
        OR ura.language_id IS NULL
    )
    ORDER BY 
        CASE ur.name
            WHEN 'super_admin' THEN 1
            WHEN 'dictionary_admin' THEN 2
            WHEN 'curator' THEN 3
            WHEN 'contributor' THEN 4
            ELSE 5
        END
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate word quality score
CREATE OR REPLACE FUNCTION calculate_word_quality_score(word_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    score INTEGER := 0;
    has_definition BOOLEAN;
    has_translation BOOLEAN;
    has_examples BOOLEAN;
    has_pronunciation BOOLEAN;
    has_etymology BOOLEAN;
    has_cultural_context BOOLEAN;
    definition_count INTEGER;
    example_count INTEGER;
BEGIN
    -- Check for definitions (20 points)
    SELECT COUNT(*) > 0, COUNT(*) INTO has_definition, definition_count
    FROM definitions WHERE word_id = word_uuid;
    IF has_definition THEN
        score := score + LEAST(20, 10 + (definition_count * 5));
    END IF;
    
    -- Check for translations (20 points)
    SELECT COUNT(*) > 0 INTO has_translation
    FROM translations WHERE word_id = word_uuid;
    IF has_translation THEN
        score := score + 20;
    END IF;
    
    -- Check for examples (15 points)
    SELECT COUNT(*) > 0, COUNT(*) INTO has_examples, example_count
    FROM usage_examples WHERE word_id = word_uuid;
    IF has_examples THEN
        score := score + LEAST(15, 5 + (example_count * 5));
    END IF;
    
    -- Check for pronunciation (15 points)
    SELECT COUNT(*) > 0 INTO has_pronunciation
    FROM audio_pronunciations WHERE word_id = word_uuid;
    IF has_pronunciation THEN
        score := score + 15;
    END IF;
    
    -- Check for etymology (10 points)
    SELECT COUNT(*) > 0 INTO has_etymology
    FROM etymologies WHERE word_id = word_uuid;
    IF has_etymology THEN
        score := score + 10;
    END IF;
    
    -- Check for cultural context (10 points)
    SELECT COUNT(*) > 0 INTO has_cultural_context
    FROM cultural_contexts WHERE word_id = word_uuid;
    IF has_cultural_context THEN
        score := score + 10;
    END IF;
    
    -- Verification bonus (10 points)
    SELECT is_verified INTO has_definition
    FROM words WHERE id = word_uuid;
    IF has_definition THEN
        score := score + 10;
    END IF;
    
    RETURN LEAST(100, score);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update quality score when related data changes
CREATE OR REPLACE FUNCTION update_word_quality_score()
RETURNS TRIGGER AS $$
DECLARE
    word_uuid UUID;
BEGIN
    -- Determine the word_id based on the table
    IF TG_TABLE_NAME = 'definitions' THEN
        word_uuid := COALESCE(NEW.word_id, OLD.word_id);
    ELSIF TG_TABLE_NAME = 'translations' THEN
        word_uuid := COALESCE(NEW.word_id, OLD.word_id);
    ELSIF TG_TABLE_NAME = 'usage_examples' THEN
        word_uuid := COALESCE(NEW.word_id, OLD.word_id);
    ELSIF TG_TABLE_NAME = 'audio_pronunciations' THEN
        word_uuid := COALESCE(NEW.word_id, OLD.word_id);
    ELSIF TG_TABLE_NAME = 'etymologies' THEN
        word_uuid := COALESCE(NEW.word_id, OLD.word_id);
    ELSIF TG_TABLE_NAME = 'cultural_contexts' THEN
        word_uuid := COALESCE(NEW.word_id, OLD.word_id);
    END IF;
    
    -- Update the quality score
    IF word_uuid IS NOT NULL THEN
        UPDATE words
        SET quality_score = calculate_word_quality_score(word_uuid)
        WHERE id = word_uuid;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for quality score updates
CREATE TRIGGER update_quality_on_definitions
AFTER INSERT OR UPDATE OR DELETE ON definitions
FOR EACH ROW EXECUTE FUNCTION update_word_quality_score();

CREATE TRIGGER update_quality_on_translations
AFTER INSERT OR UPDATE OR DELETE ON translations
FOR EACH ROW EXECUTE FUNCTION update_word_quality_score();

CREATE TRIGGER update_quality_on_examples
AFTER INSERT OR UPDATE OR DELETE ON usage_examples
FOR EACH ROW EXECUTE FUNCTION update_word_quality_score();

CREATE TRIGGER update_quality_on_pronunciations
AFTER INSERT OR UPDATE OR DELETE ON audio_pronunciations
FOR EACH ROW EXECUTE FUNCTION update_word_quality_score();

CREATE TRIGGER update_quality_on_etymologies
AFTER INSERT OR UPDATE OR DELETE ON etymologies
FOR EACH ROW EXECUTE FUNCTION update_word_quality_score();

CREATE TRIGGER update_quality_on_cultural_contexts
AFTER INSERT OR UPDATE OR DELETE ON cultural_contexts
FOR EACH ROW EXECUTE FUNCTION update_word_quality_score();

-- Function to get curator statistics
CREATE OR REPLACE FUNCTION get_curator_stats(
    curator_uuid UUID,
    language_uuid UUID DEFAULT NULL,
    date_from TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
    date_to TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(
    total_reviews INTEGER,
    words_approved INTEGER,
    words_rejected INTEGER,
    improvements_approved INTEGER,
    improvements_rejected INTEGER,
    comments_moderated INTEGER,
    average_review_time_seconds INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER as total_reviews,
        COUNT(*) FILTER (WHERE activity_type = 'word_approved')::INTEGER as words_approved,
        COUNT(*) FILTER (WHERE activity_type = 'word_rejected')::INTEGER as words_rejected,
        COUNT(*) FILTER (WHERE activity_type = 'improvement_approved')::INTEGER as improvements_approved,
        COUNT(*) FILTER (WHERE activity_type = 'improvement_rejected')::INTEGER as improvements_rejected,
        COUNT(*) FILTER (WHERE activity_type IN ('comment_deleted', 'comment_restored', 'comment_approved'))::INTEGER as comments_moderated,
        0::INTEGER as average_review_time_seconds -- Placeholder, would need more complex calculation
    FROM curator_activities
    WHERE user_id = curator_uuid
    AND created_at BETWEEN date_from AND date_to
    AND (language_uuid IS NULL OR language_id = language_uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;