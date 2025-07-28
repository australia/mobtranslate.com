-- Enable RLS on all curation tables
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_improvement_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvement_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE curator_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE curator_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE language_curation_settings ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user has role
CREATE OR REPLACE FUNCTION user_has_role(user_uuid UUID, role_names TEXT[], lang_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM user_role_assignments ura
        JOIN user_roles ur ON ura.role_id = ur.id
        WHERE ura.user_id = user_uuid
        AND ur.name = ANY(role_names)
        AND ura.is_active = true
        AND (ura.expires_at IS NULL OR ura.expires_at > NOW())
        AND (lang_id IS NULL OR ura.language_id = lang_id OR ura.language_id IS NULL)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- User roles policies
CREATE POLICY "Anyone can view roles" ON user_roles
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Only super admins can manage roles" ON user_roles
    FOR ALL TO authenticated
    USING (user_has_role(auth.uid(), ARRAY['super_admin']))
    WITH CHECK (user_has_role(auth.uid(), ARRAY['super_admin']));

-- User role assignments policies
CREATE POLICY "Users can view their own role assignments" ON user_role_assignments
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR user_has_role(auth.uid(), ARRAY['super_admin', 'dictionary_admin']));

CREATE POLICY "Admins can manage role assignments" ON user_role_assignments
    FOR INSERT TO authenticated
    WITH CHECK (
        user_has_role(auth.uid(), ARRAY['super_admin']) OR 
        (user_has_role(auth.uid(), ARRAY['dictionary_admin']) AND 
         EXISTS (SELECT 1 FROM user_roles WHERE id = role_id AND name NOT IN ('super_admin', 'dictionary_admin')))
    );

CREATE POLICY "Admins can update role assignments" ON user_role_assignments
    FOR UPDATE TO authenticated
    USING (
        user_has_role(auth.uid(), ARRAY['super_admin']) OR 
        (user_has_role(auth.uid(), ARRAY['dictionary_admin']) AND 
         EXISTS (SELECT 1 FROM user_roles WHERE id = role_id AND name NOT IN ('super_admin', 'dictionary_admin')))
    )
    WITH CHECK (
        user_has_role(auth.uid(), ARRAY['super_admin']) OR 
        (user_has_role(auth.uid(), ARRAY['dictionary_admin']) AND 
         EXISTS (SELECT 1 FROM user_roles WHERE id = role_id AND name NOT IN ('super_admin', 'dictionary_admin')))
    );

-- Word comments policies
CREATE POLICY "Anyone can view non-deleted comments" ON word_comments
    FOR SELECT TO authenticated
    USING (NOT is_deleted);

CREATE POLICY "Users can create comments" ON word_comments
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id AND NOT is_deleted);

CREATE POLICY "Users can edit their own comments" ON word_comments
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id AND NOT is_deleted)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Curators can moderate comments" ON word_comments
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM words w 
            WHERE w.id = word_id 
            AND user_has_role(auth.uid(), ARRAY['curator', 'dictionary_admin', 'super_admin'], w.language_id)
        )
    );

-- Comment votes policies
CREATE POLICY "Anyone can view comment votes" ON comment_votes
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Users can vote on comments" ON comment_votes
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can change their own votes" ON comment_votes
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own votes" ON comment_votes
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- Word improvement suggestions policies
CREATE POLICY "Anyone can view improvement suggestions" ON word_improvement_suggestions
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can suggest improvements" ON word_improvement_suggestions
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = submitted_by);

CREATE POLICY "Curators can review improvements" ON word_improvement_suggestions
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM words w 
            WHERE w.id = word_id 
            AND user_has_role(auth.uid(), ARRAY['curator', 'dictionary_admin', 'super_admin'], w.language_id)
        )
    );

-- Improvement votes policies
CREATE POLICY "Curators can view improvement votes" ON improvement_votes
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM word_improvement_suggestions wis
            JOIN words w ON wis.word_id = w.id
            WHERE wis.id = suggestion_id
            AND user_has_role(auth.uid(), ARRAY['curator', 'dictionary_admin', 'super_admin'], w.language_id)
        )
    );

CREATE POLICY "Curators can vote on improvements" ON improvement_votes
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = voter_id AND
        EXISTS (
            SELECT 1 FROM word_improvement_suggestions wis
            JOIN words w ON wis.word_id = w.id
            WHERE wis.id = suggestion_id
            AND user_has_role(auth.uid(), ARRAY['curator', 'dictionary_admin', 'super_admin'], w.language_id)
        )
    );

CREATE POLICY "Curators can update their votes" ON improvement_votes
    FOR UPDATE TO authenticated
    USING (auth.uid() = voter_id)
    WITH CHECK (auth.uid() = voter_id);

-- Curator activities policies
CREATE POLICY "Curators can view their own activities" ON curator_activities
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid() OR 
        user_has_role(auth.uid(), ARRAY['dictionary_admin', 'super_admin'])
    );

CREATE POLICY "System can insert curator activities" ON curator_activities
    FOR INSERT TO authenticated
    WITH CHECK (true); -- Activities are inserted by triggers

-- Curator metrics policies
CREATE POLICY "View curator metrics" ON curator_metrics
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid() OR 
        user_has_role(auth.uid(), ARRAY['dictionary_admin', 'super_admin']) OR
        (language_id IS NOT NULL AND user_has_role(auth.uid(), ARRAY['curator'], language_id))
    );

-- Language curation settings policies
CREATE POLICY "Anyone can view language settings" ON language_curation_settings
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "Dictionary admins can manage language settings" ON language_curation_settings
    FOR ALL TO authenticated
    USING (
        user_has_role(auth.uid(), ARRAY['super_admin']) OR
        user_has_role(auth.uid(), ARRAY['dictionary_admin'], language_id)
    )
    WITH CHECK (
        user_has_role(auth.uid(), ARRAY['super_admin']) OR
        user_has_role(auth.uid(), ARRAY['dictionary_admin'], language_id)
    );

-- Additional policies for existing tables

-- Allow curators to update word quality fields
CREATE POLICY "Curators can update word quality" ON words
    FOR UPDATE TO authenticated
    USING (
        user_has_role(auth.uid(), ARRAY['curator', 'dictionary_admin', 'super_admin'], language_id)
    )
    WITH CHECK (
        user_has_role(auth.uid(), ARRAY['curator', 'dictionary_admin', 'super_admin'], language_id)
    );

-- Function to check if user can perform action on language
CREATE OR REPLACE FUNCTION can_user_curate_language(user_uuid UUID, lang_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN user_has_role(user_uuid, ARRAY['curator', 'dictionary_admin', 'super_admin'], lang_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's role for a language
CREATE OR REPLACE FUNCTION get_user_language_role(user_uuid UUID, lang_id UUID)
RETURNS TEXT AS $$
DECLARE
    role_name TEXT;
BEGIN
    SELECT ur.name INTO role_name
    FROM user_role_assignments ura
    JOIN user_roles ur ON ura.role_id = ur.id
    WHERE ura.user_id = user_uuid
    AND (ura.language_id = lang_id OR ura.language_id IS NULL)
    AND ura.is_active = true
    AND (ura.expires_at IS NULL OR ura.expires_at > NOW())
    ORDER BY 
        CASE ur.name 
            WHEN 'super_admin' THEN 1
            WHEN 'dictionary_admin' THEN 2
            WHEN 'curator' THEN 3
            WHEN 'contributor' THEN 4
            ELSE 5
        END
    LIMIT 1;
    
    RETURN COALESCE(role_name, 'user');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;