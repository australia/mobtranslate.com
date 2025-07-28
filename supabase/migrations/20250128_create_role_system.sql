-- Create role system for curation

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User roles table
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default roles
INSERT INTO user_roles (name, display_name, description, permissions) VALUES
('super_admin', 'Super Admin', 'Full system access', '{"all": true}'),
('dictionary_admin', 'Dictionary Admin', 'Can manage all dictionaries and curators', '{"manage_dictionaries": true, "manage_curators": true, "approve_documents": true}'),
('curator', 'Curator', 'Can review and approve word submissions for assigned languages', '{"review_words": true, "moderate_comments": true, "review_improvements": true}'),
('contributor', 'Contributor', 'Can submit words and upload documents', '{"submit_words": true, "upload_documents": true, "suggest_improvements": true}'),
('user', 'User', 'Basic user with comment and suggestion privileges', '{"comment": true, "suggest": true}');

-- User role assignments
CREATE TABLE IF NOT EXISTS user_role_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES user_roles(id) ON DELETE CASCADE,
    language_id UUID REFERENCES languages(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id, role_id, language_id)
);

-- Create indexes for performance
CREATE INDEX idx_user_role_assignments_user_id ON user_role_assignments(user_id);
CREATE INDEX idx_user_role_assignments_role_id ON user_role_assignments(role_id);
CREATE INDEX idx_user_role_assignments_language_id ON user_role_assignments(language_id);
CREATE INDEX idx_user_role_assignments_active ON user_role_assignments(is_active) WHERE is_active = true;

-- Comments system
CREATE TABLE IF NOT EXISTS word_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    word_id UUID REFERENCES words(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES word_comments(id) ON DELETE CASCADE,
    comment_text TEXT NOT NULL,
    comment_type TEXT DEFAULT 'general' CHECK (comment_type IN ('general', 'pronunciation', 'usage', 'cultural', 'grammar')),
    is_edited BOOLEAN DEFAULT false,
    edited_at TIMESTAMPTZ,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES auth.users(id),
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comment votes
CREATE TABLE IF NOT EXISTS comment_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    comment_id UUID REFERENCES word_comments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    vote_type TEXT NOT NULL CHECK (vote_type IN ('up', 'down')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(comment_id, user_id)
);

-- Create indexes for comments
CREATE INDEX idx_word_comments_word_id ON word_comments(word_id);
CREATE INDEX idx_word_comments_user_id ON word_comments(user_id);
CREATE INDEX idx_word_comments_parent_id ON word_comments(parent_id);
CREATE INDEX idx_word_comments_created_at ON word_comments(created_at DESC);
CREATE INDEX idx_comment_votes_comment_id ON comment_votes(comment_id);

-- Word improvement suggestions
CREATE TABLE IF NOT EXISTS word_improvement_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    word_id UUID REFERENCES words(id) ON DELETE CASCADE,
    submitted_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    improvement_type TEXT NOT NULL CHECK (improvement_type IN ('definition', 'translation', 'example', 'pronunciation', 'grammar', 'cultural_context')),
    field_name TEXT,
    current_value JSONB,
    suggested_value JSONB NOT NULL,
    improvement_reason TEXT,
    supporting_references TEXT[],
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'implemented')),
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    review_comment TEXT,
    implemented_at TIMESTAMPTZ,
    implementation_notes TEXT,
    confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Improvement votes from other curators
CREATE TABLE IF NOT EXISTS improvement_votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    suggestion_id UUID REFERENCES word_improvement_suggestions(id) ON DELETE CASCADE,
    voter_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    vote TEXT NOT NULL CHECK (vote IN ('approve', 'reject', 'needs_work')),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(suggestion_id, voter_id)
);

-- Create indexes for improvements
CREATE INDEX idx_word_improvement_suggestions_word_id ON word_improvement_suggestions(word_id);
CREATE INDEX idx_word_improvement_suggestions_submitted_by ON word_improvement_suggestions(submitted_by);
CREATE INDEX idx_word_improvement_suggestions_status ON word_improvement_suggestions(status);
CREATE INDEX idx_word_improvement_suggestions_created_at ON word_improvement_suggestions(created_at DESC);

-- Curator activity logs
CREATE TABLE IF NOT EXISTS curator_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    language_id UUID REFERENCES languages(id),
    activity_type TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id UUID NOT NULL,
    activity_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for activity tracking
CREATE INDEX idx_curator_activities_user_id ON curator_activities(user_id);
CREATE INDEX idx_curator_activities_language_id ON curator_activities(language_id);
CREATE INDEX idx_curator_activities_created_at ON curator_activities(created_at DESC);
CREATE INDEX idx_curator_activities_activity_type ON curator_activities(activity_type);

-- Curator performance metrics
CREATE TABLE IF NOT EXISTS curator_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    language_id UUID REFERENCES languages(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    words_reviewed INTEGER DEFAULT 0,
    words_approved INTEGER DEFAULT 0,
    words_rejected INTEGER DEFAULT 0,
    improvements_reviewed INTEGER DEFAULT 0,
    comments_moderated INTEGER DEFAULT 0,
    documents_processed INTEGER DEFAULT 0,
    average_review_time_seconds INTEGER,
    quality_score FLOAT CHECK (quality_score >= 0 AND quality_score <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, language_id, period_start, period_end)
);

-- Language-specific curation settings
CREATE TABLE IF NOT EXISTS language_curation_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    language_id UUID REFERENCES languages(id) ON DELETE CASCADE UNIQUE,
    allow_public_comments BOOLEAN DEFAULT true,
    allow_public_improvements BOOLEAN DEFAULT true,
    require_approval_for_new_words BOOLEAN DEFAULT true,
    require_approval_for_edits BOOLEAN DEFAULT true,
    auto_approve_threshold INTEGER DEFAULT 3,
    minimum_curator_level INTEGER DEFAULT 1,
    custom_fields JSONB DEFAULT '[]',
    quality_guidelines TEXT,
    style_guide_url TEXT,
    import_rules JSONB DEFAULT '{}',
    notification_settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add quality and curation fields to words table
ALTER TABLE words 
ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 0 CHECK (quality_score >= 0 AND quality_score <= 100),
ADD COLUMN IF NOT EXISTS quality_flags TEXT[],
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_reviewed_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS community_notes TEXT;

-- Add curator profile fields to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS languages_spoken TEXT[],
ADD COLUMN IF NOT EXISTS expertise_areas TEXT[],
ADD COLUMN IF NOT EXISTS contributor_level INTEGER DEFAULT 1 CHECK (contributor_level >= 1 AND contributor_level <= 10),
ADD COLUMN IF NOT EXISTS total_contributions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS reputation_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_verified_linguist BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_details JSONB;

-- Create function to update comment vote counts
CREATE OR REPLACE FUNCTION update_comment_vote_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        UPDATE word_comments
        SET upvotes = (SELECT COUNT(*) FROM comment_votes WHERE comment_id = NEW.comment_id AND vote_type = 'up'),
            downvotes = (SELECT COUNT(*) FROM comment_votes WHERE comment_id = NEW.comment_id AND vote_type = 'down')
        WHERE id = NEW.comment_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE word_comments
        SET upvotes = (SELECT COUNT(*) FROM comment_votes WHERE comment_id = OLD.comment_id AND vote_type = 'up'),
            downvotes = (SELECT COUNT(*) FROM comment_votes WHERE comment_id = OLD.comment_id AND vote_type = 'down')
        WHERE id = OLD.comment_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for comment votes
CREATE TRIGGER update_comment_votes_trigger
AFTER INSERT OR UPDATE OR DELETE ON comment_votes
FOR EACH ROW EXECUTE FUNCTION update_comment_vote_counts();

-- Create function to track curator activities
CREATE OR REPLACE FUNCTION track_curator_activity()
RETURNS TRIGGER AS $$
BEGIN
    -- Track different activities based on the table
    IF TG_TABLE_NAME = 'word_improvement_suggestions' THEN
        IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
            INSERT INTO curator_activities (user_id, language_id, activity_type, target_type, target_id, activity_data)
            SELECT NEW.reviewed_by, w.language_id, 
                   CASE NEW.status 
                       WHEN 'approved' THEN 'improvement_approved'
                       WHEN 'rejected' THEN 'improvement_rejected'
                       ELSE 'improvement_reviewed'
                   END,
                   'improvement', NEW.id, 
                   jsonb_build_object('status', NEW.status, 'type', NEW.improvement_type)
            FROM words w WHERE w.id = NEW.word_id;
        END IF;
    ELSIF TG_TABLE_NAME = 'words' THEN
        IF TG_OP = 'UPDATE' AND OLD.is_verified != NEW.is_verified AND NEW.is_verified = true THEN
            INSERT INTO curator_activities (user_id, language_id, activity_type, target_type, target_id, activity_data)
            VALUES (NEW.verified_by, NEW.language_id, 'word_verified', 'word', NEW.id, 
                    jsonb_build_object('word', NEW.word, 'quality_score', NEW.quality_score));
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for activity tracking
CREATE TRIGGER track_improvement_activity
AFTER UPDATE ON word_improvement_suggestions
FOR EACH ROW EXECUTE FUNCTION track_curator_activity();

CREATE TRIGGER track_word_verification_activity
AFTER UPDATE ON words
FOR EACH ROW EXECUTE FUNCTION track_curator_activity();

-- Create view for words needing review
CREATE OR REPLACE VIEW words_needing_review AS
SELECT 
    w.*,
    l.name as language_name,
    l.code as language_code,
    COUNT(DISTINCT d.id) as definition_count,
    COUNT(DISTINCT t.id) as translation_count,
    COUNT(DISTINCT ue.id) as example_count
FROM words w
JOIN languages l ON w.language_id = l.id
LEFT JOIN definitions d ON w.id = d.word_id
LEFT JOIN translations t ON w.id = t.word_id
LEFT JOIN usage_examples ue ON w.id = ue.word_id
WHERE 
    w.is_verified = false
    OR w.quality_score < 70
    OR (w.last_reviewed_at IS NULL OR w.last_reviewed_at < NOW() - INTERVAL '6 months')
GROUP BY w.id, l.id
ORDER BY w.quality_score ASC, w.created_at ASC;

-- Create view for curator dashboard stats
CREATE OR REPLACE VIEW curator_dashboard_stats AS
SELECT 
    ura.user_id,
    ura.language_id,
    l.name as language_name,
    COUNT(DISTINCT wis.id) FILTER (WHERE wis.status = 'pending') as pending_improvements,
    COUNT(DISTINCT wc.id) FILTER (WHERE wc.created_at > NOW() - INTERVAL '24 hours') as recent_comments,
    COUNT(DISTINCT w.id) FILTER (WHERE w.is_verified = false) as unverified_words
FROM user_role_assignments ura
JOIN languages l ON ura.language_id = l.id
JOIN user_roles ur ON ura.role_id = ur.id
LEFT JOIN word_improvement_suggestions wis ON wis.word_id IN (SELECT id FROM words WHERE language_id = ura.language_id)
LEFT JOIN word_comments wc ON wc.word_id IN (SELECT id FROM words WHERE language_id = ura.language_id)
LEFT JOIN words w ON w.language_id = ura.language_id
WHERE ura.is_active = true AND ur.name IN ('curator', 'dictionary_admin', 'super_admin')
GROUP BY ura.user_id, ura.language_id, l.id;