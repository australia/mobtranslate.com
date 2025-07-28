# MobTranslate Curation System Plan

## Overview

The MobTranslate Curation System will enable community-driven dictionary improvement through collaborative editing, commenting, and document processing. This system will support multiple user roles, automated content extraction from documents, and intelligent word management.

## Table of Contents

1. [User Roles & Permissions](#user-roles--permissions)
2. [Database Schema](#database-schema)
3. [Core Features](#core-features)
4. [Document Processing Pipeline](#document-processing-pipeline)
5. [API Endpoints](#api-endpoints)
6. [UI/UX Workflows](#uiux-workflows)
7. [Security & Moderation](#security--moderation)
8. [Implementation Phases](#implementation-phases)

## User Roles & Permissions

### Role Hierarchy

```
Super Admin
    ↓
Dictionary Admin
    ↓
Curator/Maintainer
    ↓
Contributor
    ↓
Registered User
```

### Permission Matrix

| Action | Registered User | Contributor | Curator | Dict Admin | Super Admin |
|--------|----------------|-------------|---------|------------|-------------|
| View dictionaries | ✓ | ✓ | ✓ | ✓ | ✓ |
| Comment on words | ✓ | ✓ | ✓ | ✓ | ✓ |
| Submit word improvements | ✓ | ✓ | ✓ | ✓ | ✓ |
| Approve improvements | ✗ | ✗ | ✓ | ✓ | ✓ |
| Upload documents | ✗ | ✓ | ✓ | ✓ | ✓ |
| Edit words directly | ✗ | ✗ | ✓ | ✓ | ✓ |
| Manage curators | ✗ | ✗ | ✗ | ✓ | ✓ |
| Create dictionaries | ✗ | ✗ | ✗ | ✗ | ✓ |
| Manage all dictionaries | ✗ | ✗ | ✗ | ✗ | ✓ |
| Access analytics | ✗ | ✓ | ✓ | ✓ | ✓ |
| Delete content | ✗ | ✗ | ✓ | ✓ | ✓ |

## Database Schema

### New Tables

```sql
-- User roles and permissions
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE, -- super_admin, dict_admin, curator, contributor
    permissions JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dictionary team members
CREATE TABLE dictionary_team (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dictionary_id UUID REFERENCES dictionaries(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES user_roles(id),
    assigned_by UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(dictionary_id, user_id)
);

-- Word comments
CREATE TABLE word_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    word_id UUID REFERENCES words(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    parent_id UUID REFERENCES word_comments(id) ON DELETE CASCADE, -- for threaded comments
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ -- soft delete
);

-- Word improvement suggestions
CREATE TABLE word_improvements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    word_id UUID REFERENCES words(id) ON DELETE CASCADE,
    submitted_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    improvement_type TEXT NOT NULL, -- 'definition', 'translation', 'example', 'pronunciation', 'complete'
    current_value JSONB,
    suggested_value JSONB NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending', -- pending, approved, rejected, implemented
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document uploads for processing
CREATE TABLE document_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dictionary_id UUID REFERENCES dictionaries(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL, -- pdf, txt, docx, etc
    file_url TEXT NOT NULL, -- Supabase storage URL
    file_size INTEGER,
    processing_status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    processing_error TEXT,
    extracted_data JSONB, -- structured data from processing
    words_extracted INTEGER DEFAULT 0,
    words_added INTEGER DEFAULT 0,
    words_updated INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document processing logs
CREATE TABLE document_processing_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES document_uploads(id) ON DELETE CASCADE,
    stage TEXT NOT NULL, -- extraction, parsing, validation, import
    status TEXT NOT NULL, -- started, completed, failed
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Word sources (track where words came from)
CREATE TABLE word_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    word_id UUID REFERENCES words(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL, -- manual, document, api, import
    source_id UUID, -- references document_uploads(id) if from document
    source_details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Curator activity logs
CREATE TABLE curator_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    dictionary_id UUID REFERENCES dictionaries(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL, -- approve_word, reject_word, edit_word, delete_comment, etc
    target_type TEXT NOT NULL, -- word, comment, improvement, document
    target_id UUID NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dictionary settings and metadata
CREATE TABLE dictionary_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dictionary_id UUID REFERENCES dictionaries(id) ON DELETE CASCADE UNIQUE,
    allow_comments BOOLEAN DEFAULT true,
    allow_improvements BOOLEAN DEFAULT true,
    require_approval BOOLEAN DEFAULT true,
    auto_approve_threshold INTEGER DEFAULT 3, -- auto-approve after N curator approvals
    custom_fields JSONB DEFAULT '[]', -- additional fields for this dictionary
    import_settings JSONB DEFAULT '{}', -- rules for document processing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Updated Tables

```sql
-- Add fields to existing words table
ALTER TABLE words ADD COLUMN IF NOT EXISTS 
    grammatical_info JSONB DEFAULT '{}', -- pos, gender, number, case, etc
    etymology TEXT,
    usage_notes TEXT,
    cultural_notes TEXT,
    audio_url TEXT,
    last_reviewed_at TIMESTAMPTZ,
    last_reviewed_by UUID REFERENCES auth.users(id),
    quality_score INTEGER DEFAULT 0, -- 0-100 based on completeness
    is_verified BOOLEAN DEFAULT false;

-- Add fields to dictionaries table
ALTER TABLE dictionaries ADD COLUMN IF NOT EXISTS
    created_by UUID REFERENCES auth.users(id),
    is_public BOOLEAN DEFAULT true,
    requires_approval BOOLEAN DEFAULT true,
    description_long TEXT,
    documentation_url TEXT,
    citation_format TEXT;
```

## Core Features

### 1. Word Comments System

- **Threaded comments** on individual words
- **Markdown support** for formatting
- **Mentions** (@username) with notifications
- **Comment moderation** tools for curators
- **Comment history** and edit tracking
- **Voting/reactions** on comments

### 2. Word Improvement Submissions

- **Structured improvement forms** based on improvement type
- **Diff view** showing current vs suggested changes
- **Bulk improvements** for multiple words
- **Improvement history** and tracking
- **Automatic validation** based on dictionary rules
- **Collaborative review** process

### 3. Curator Dashboard

```
/curator/[dictionary]
├── /overview          # Stats and recent activity
├── /pending          # Pending improvements to review
├── /comments         # Comment moderation queue
├── /documents        # Document upload management
├── /words           # Direct word editing interface
├── /team            # Team member management (dict admins only)
└── /settings        # Dictionary settings (dict admins only)
```

### 4. Super Admin Panel

```
/admin
├── /dictionaries     # Create/manage all dictionaries
├── /users           # User management and roles
├── /curators        # Assign curators to dictionaries
├── /documents       # Global document processing queue
├── /analytics       # Platform-wide analytics
├── /settings        # Platform settings
└── /logs           # System logs and audit trail
```

## Document Processing Pipeline

### Pipeline Architecture

```
Document Upload
      ↓
Validation & Storage
      ↓
Queue for Processing
      ↓
Text Extraction
      ↓
Language Detection
      ↓
Word Tokenization
      ↓
Grammatical Analysis
      ↓
Dictionary Matching
      ↓
Conflict Resolution
      ↓
Database Update
      ↓
Report Generation
```

### Processing Stages

#### 1. **Document Intake**
```typescript
interface DocumentIntake {
  validateFileType(file: File): boolean;
  scanForMalware(file: File): Promise<boolean>;
  uploadToStorage(file: File): Promise<string>;
  createProcessingJob(documentId: string): Promise<JobId>;
}
```

#### 2. **Text Extraction**
```typescript
interface TextExtractor {
  extractFromPDF(url: string): Promise<ExtractedText>;
  extractFromDOCX(url: string): Promise<ExtractedText>;
  extractFromTXT(url: string): Promise<ExtractedText>;
  cleanAndNormalize(text: string): string;
}
```

#### 3. **Linguistic Analysis**
```typescript
interface LinguisticAnalyzer {
  tokenizeWords(text: string, language: string): Word[];
  extractPOS(word: Word): PartOfSpeech;
  extractMorphology(word: Word): Morphology;
  extractContext(word: Word, text: string): Context[];
  identifyPhrases(tokens: Word[]): Phrase[];
}
```

#### 4. **Dictionary Integration**
```typescript
interface DictionaryIntegrator {
  matchExistingWords(words: Word[]): MatchResult[];
  identifyNewWords(words: Word[]): Word[];
  resolveConflicts(existing: Word, new: Word): Resolution;
  calculateConfidence(word: Word): number;
  generateUpdatePlan(words: Word[]): UpdatePlan;
}
```

### Conflict Resolution Rules

1. **Existing Word Match**
   - Compare definitions, translations, examples
   - If confidence > 90%, auto-merge non-conflicting data
   - If conflicts exist, create improvement suggestion
   - Preserve manual edits over automated imports

2. **New Word Detection**
   - Check against existing variations and spellings
   - Validate against dictionary language rules
   - Auto-create if confidence > 95%
   - Queue for curator review if confidence < 95%

3. **Quality Scoring**
   ```
   Quality Score = 
     (Has Definition × 20) +
     (Has Translation × 20) +
     (Has Examples × 15) +
     (Has Pronunciation × 15) +
     (Has Grammar Info × 10) +
     (Has Etymology × 10) +
     (Is Verified × 10)
   ```

## API Endpoints

### Curation APIs

```typescript
// Comments
POST   /api/v2/words/:wordId/comments
GET    /api/v2/words/:wordId/comments
PUT    /api/v2/comments/:commentId
DELETE /api/v2/comments/:commentId

// Improvements
POST   /api/v2/words/:wordId/improvements
GET    /api/v2/words/:wordId/improvements
GET    /api/v2/curator/improvements/pending
PUT    /api/v2/improvements/:id/review
POST   /api/v2/improvements/bulk

// Documents
POST   /api/v2/dictionaries/:dictId/documents
GET    /api/v2/documents/:documentId
GET    /api/v2/documents/:documentId/status
POST   /api/v2/documents/:documentId/reprocess

// Curator Management
GET    /api/v2/curator/dashboard/:dictId
POST   /api/v2/curator/words/:wordId
PUT    /api/v2/curator/words/:wordId
DELETE /api/v2/curator/words/:wordId

// Admin APIs
POST   /api/v2/admin/dictionaries
PUT    /api/v2/admin/dictionaries/:id
POST   /api/v2/admin/dictionaries/:id/curators
DELETE /api/v2/admin/dictionaries/:id/curators/:userId
GET    /api/v2/admin/analytics
```

## UI/UX Workflows

### 1. Word Page Enhancement

```
Word: "Nginda"
├── Definition & Translation
├── Pronunciation (with audio upload)
├── Grammar Information
├── Examples
├── Etymology
├── Comments Section
│   ├── Add Comment
│   └── Thread View
└── Improvement Suggestions
    ├── Submit Improvement
    └── View History
```

### 2. Curator Review Interface

```
Pending Review (24)
├── Improvement Suggestion
│   ├── Current Value (highlighted)
│   ├── Suggested Value (highlighted)
│   ├── Diff View
│   ├── Submitter Info
│   ├── Confidence Score
│   └── Actions: [Approve] [Reject] [Modify]
```

### 3. Document Upload Flow

```
1. Select Dictionary
2. Choose File(s)
3. Configure Processing
   - Language confirmation
   - Import rules
   - Conflict handling
4. Upload & Preview
5. Start Processing
6. Review Results
   - New words found
   - Updates suggested
   - Conflicts to resolve
7. Approve Import
```

## Security & Moderation

### Access Control

```typescript
// Row Level Security Policies
CREATE POLICY "Users can comment" ON word_comments
  FOR INSERT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Curators can moderate" ON word_comments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dictionary_team
      WHERE user_id = auth.uid()
      AND dictionary_id = (
        SELECT dictionary_id FROM words WHERE id = word_comments.word_id
      )
      AND role_id IN (SELECT id FROM user_roles WHERE name IN ('curator', 'dict_admin', 'super_admin'))
    )
  );
```

### Content Moderation

1. **Automated Checks**
   - Profanity filter
   - Spam detection
   - Duplicate detection
   - Language validation

2. **Manual Review Queue**
   - Flagged content
   - Low confidence imports
   - Disputed changes
   - User reports

3. **Audit Trail**
   - All actions logged
   - Change history preserved
   - User activity tracking
   - Rollback capability

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- [ ] Database schema creation
- [ ] User role system
- [ ] Basic curator assignment
- [ ] API authentication & authorization

### Phase 2: Comments & Improvements (Weeks 3-4)
- [ ] Word comments system
- [ ] Improvement submission flow
- [ ] Curator review interface
- [ ] Email notifications

### Phase 3: Document Processing (Weeks 5-6)
- [ ] Document upload interface
- [ ] Basic text extraction (PDF, TXT)
- [ ] Word matching algorithm
- [ ] Import preview & approval

### Phase 4: Advanced Processing (Weeks 7-8)
- [ ] Linguistic analysis integration
- [ ] Grammatical feature extraction
- [ ] Conflict resolution system
- [ ] Batch processing queue

### Phase 5: Admin Panel (Weeks 9-10)
- [ ] Super admin dashboard
- [ ] Dictionary management
- [ ] User & role management
- [ ] Platform analytics

### Phase 6: Polish & Optimization (Weeks 11-12)
- [ ] Performance optimization
- [ ] UI/UX improvements
- [ ] Advanced moderation tools
- [ ] Documentation & training

## Technical Considerations

### Performance
- Implement caching for frequently accessed words
- Use database indexes on search fields
- Queue document processing jobs
- Paginate large result sets
- Optimize linguistic analysis algorithms

### Scalability
- Design for horizontal scaling
- Use edge functions for processing
- Implement rate limiting
- Cache processed document results
- Use CDN for uploaded documents

### Data Integrity
- Validate all user inputs
- Implement database constraints
- Regular backups of word data
- Version control for word changes
- Atomic transactions for imports

## Success Metrics

1. **Curator Engagement**
   - Number of active curators per dictionary
   - Average review time for improvements
   - Curator retention rate

2. **Content Quality**
   - Word quality scores improvement
   - Percentage of verified words
   - Number of complete word entries

3. **Community Participation**
   - Comments per word
   - Improvement suggestions submitted
   - Acceptance rate of suggestions

4. **Processing Efficiency**
   - Documents processed per day
   - Words extracted per document
   - Processing error rate

## Future Enhancements

1. **Machine Learning Integration**
   - Auto-categorization of words
   - Suggestion quality prediction
   - Duplicate detection improvement

2. **Advanced Collaboration**
   - Real-time collaborative editing
   - Curator chat system
   - Community challenges

3. **External Integrations**
   - Academic database connections
   - Library system integration
   - Research tool exports

4. **Mobile Apps**
   - Curator mobile app
   - Offline document processing
   - Field recording tools