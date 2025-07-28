-- Document processing tables for curation system

-- Document uploads table
CREATE TABLE IF NOT EXISTS document_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    language_id UUID REFERENCES languages(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT,
    file_url TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    document_type TEXT CHECK (document_type IN ('dictionary', 'story', 'grammar_guide', 'academic_paper', 'other')),
    source_attribution TEXT,
    processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'queued', 'processing', 'completed', 'failed', 'cancelled')),
    processing_priority INTEGER DEFAULT 5 CHECK (processing_priority >= 1 AND processing_priority <= 10),
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    processing_error JSONB,
    extraction_config JSONB,
    extraction_results JSONB,
    words_found INTEGER DEFAULT 0,
    words_new INTEGER DEFAULT 0,
    words_updated INTEGER DEFAULT 0,
    definitions_added INTEGER DEFAULT 0,
    examples_added INTEGER DEFAULT 0,
    approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Processing pipeline logs
CREATE TABLE IF NOT EXISTS document_processing_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES document_uploads(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('started', 'in_progress', 'completed', 'failed', 'skipped')),
    stage_data JSONB,
    error_details JSONB,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track word sources
CREATE TABLE IF NOT EXISTS word_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    word_id UUID REFERENCES words(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'document', 'api', 'import', 'community')),
    source_id UUID,
    source_page INTEGER,
    source_line INTEGER,
    confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
    extraction_metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_document_uploads_language_id ON document_uploads(language_id);
CREATE INDEX idx_document_uploads_uploaded_by ON document_uploads(uploaded_by);
CREATE INDEX idx_document_uploads_processing_status ON document_uploads(processing_status);
CREATE INDEX idx_document_uploads_approval_status ON document_uploads(approval_status);
CREATE INDEX idx_document_uploads_created_at ON document_uploads(created_at DESC);

CREATE INDEX idx_document_processing_logs_document_id ON document_processing_logs(document_id);
CREATE INDEX idx_document_processing_logs_stage ON document_processing_logs(stage);
CREATE INDEX idx_document_processing_logs_status ON document_processing_logs(status);

CREATE INDEX idx_word_sources_word_id ON word_sources(word_id);
CREATE INDEX idx_word_sources_source_type ON word_sources(source_type);
CREATE INDEX idx_word_sources_source_id ON word_sources(source_id);

-- Enable RLS
ALTER TABLE document_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_processing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_sources ENABLE ROW LEVEL SECURITY;

-- Document uploads policies
CREATE POLICY "Contributors can view documents" ON document_uploads
    FOR SELECT TO authenticated
    USING (
        uploaded_by = auth.uid() OR
        user_has_role(auth.uid(), ARRAY['contributor', 'curator', 'dictionary_admin', 'super_admin'], language_id)
    );

CREATE POLICY "Contributors can upload documents" ON document_uploads
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = uploaded_by AND
        user_has_role(auth.uid(), ARRAY['contributor', 'curator', 'dictionary_admin', 'super_admin'], language_id)
    );

CREATE POLICY "Curators can update document status" ON document_uploads
    FOR UPDATE TO authenticated
    USING (
        user_has_role(auth.uid(), ARRAY['curator', 'dictionary_admin', 'super_admin'], language_id)
    );

-- Processing logs policies
CREATE POLICY "Document uploaders and curators can view logs" ON document_processing_logs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM document_uploads du
            WHERE du.id = document_id
            AND (
                du.uploaded_by = auth.uid() OR
                user_has_role(auth.uid(), ARRAY['curator', 'dictionary_admin', 'super_admin'], du.language_id)
            )
        )
    );

-- Word sources policies
CREATE POLICY "Anyone can view word sources" ON word_sources
    FOR SELECT TO authenticated
    USING (true);

-- Function to update document processing status
CREATE OR REPLACE FUNCTION update_document_processing_status(
    doc_id UUID,
    new_status TEXT,
    stage_name TEXT DEFAULT NULL,
    stage_status TEXT DEFAULT NULL,
    stage_data JSONB DEFAULT NULL,
    error_details JSONB DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    start_time TIMESTAMPTZ;
BEGIN
    -- Update document status
    UPDATE document_uploads
    SET 
        processing_status = new_status,
        processing_started_at = CASE 
            WHEN new_status = 'processing' AND processing_started_at IS NULL 
            THEN NOW() 
            ELSE processing_started_at 
        END,
        processing_completed_at = CASE 
            WHEN new_status IN ('completed', 'failed', 'cancelled') 
            THEN NOW() 
            ELSE processing_completed_at 
        END,
        processing_error = CASE 
            WHEN new_status = 'failed' 
            THEN error_details 
            ELSE processing_error 
        END,
        updated_at = NOW()
    WHERE id = doc_id;
    
    -- Log the stage if provided
    IF stage_name IS NOT NULL AND stage_status IS NOT NULL THEN
        INSERT INTO document_processing_logs (
            document_id, 
            stage, 
            status, 
            stage_data, 
            error_details
        )
        VALUES (
            doc_id, 
            stage_name, 
            stage_status, 
            stage_data, 
            error_details
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to track word source from document
CREATE OR REPLACE FUNCTION add_word_source_from_document(
    word_uuid UUID,
    document_uuid UUID,
    page_num INTEGER DEFAULT NULL,
    line_num INTEGER DEFAULT NULL,
    confidence FLOAT DEFAULT 1.0,
    metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    source_id UUID;
BEGIN
    INSERT INTO word_sources (
        word_id,
        source_type,
        source_id,
        source_page,
        source_line,
        confidence_score,
        extraction_metadata
    )
    VALUES (
        word_uuid,
        'document',
        document_uuid,
        page_num,
        line_num,
        confidence,
        metadata
    )
    RETURNING id INTO source_id;
    
    RETURN source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update document stats after processing
CREATE OR REPLACE FUNCTION update_document_extraction_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- This would be called after document processing completes
    -- Update the extraction_results field with summary statistics
    NEW.extraction_results = jsonb_build_object(
        'total_words_found', NEW.words_found,
        'new_words_added', NEW.words_new,
        'existing_words_updated', NEW.words_updated,
        'definitions_added', NEW.definitions_added,
        'examples_added', NEW.examples_added,
        'processing_duration_ms', 
        EXTRACT(EPOCH FROM (NEW.processing_completed_at - NEW.processing_started_at)) * 1000
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_document_stats_trigger
BEFORE UPDATE ON document_uploads
FOR EACH ROW
WHEN (OLD.processing_status != 'completed' AND NEW.processing_status = 'completed')
EXECUTE FUNCTION update_document_extraction_stats();