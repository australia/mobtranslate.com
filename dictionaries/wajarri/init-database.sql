-- Wajarri Dictionary Database Schema
-- SQLite database for storing lexicon data from MobTranslate.com

-- Drop existing tables if they exist
DROP TABLE IF EXISTS morpheme_glosses;
DROP TABLE IF EXISTS examples;
DROP TABLE IF EXISTS grammar_features;
DROP TABLE IF EXISTS media_files;
DROP TABLE IF EXISTS lexical_entries;

-- Main lexical entries table
CREATE TABLE lexical_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lexical_id TEXT UNIQUE NOT NULL,
    canonical_form TEXT NOT NULL,
    definition_en TEXT,
    translation_en TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for searching
CREATE INDEX idx_canonical_form ON lexical_entries(canonical_form);
CREATE INDEX idx_definition ON lexical_entries(definition_en);
CREATE INDEX idx_translation ON lexical_entries(translation_en);

-- Media files associated with lexical entries
CREATE TABLE media_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lexical_entry_id INTEGER NOT NULL,
    file_type TEXT CHECK(file_type IN ('audio', 'image')) NOT NULL,
    file_path TEXT NOT NULL,
    description TEXT,
    FOREIGN KEY (lexical_entry_id) REFERENCES lexical_entries(id) ON DELETE CASCADE
);

-- Grammar features table
CREATE TABLE grammar_features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parameter_id INTEGER,
    language_id INTEGER,
    value TEXT,
    source TEXT,
    lexical_entry_id INTEGER,
    FOREIGN KEY (lexical_entry_id) REFERENCES lexical_entries(id) ON DELETE SET NULL
);

-- Examples table for sentences and usage
CREATE TABLE examples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lexical_entry_id INTEGER,
    transcript TEXT NOT NULL,
    translation TEXT,
    source TEXT,
    FOREIGN KEY (lexical_entry_id) REFERENCES lexical_entries(id) ON DELETE CASCADE
);

-- Morpheme glosses for linguistic analysis
CREATE TABLE morpheme_glosses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    example_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    morpheme TEXT NOT NULL,
    gloss TEXT NOT NULL,
    FOREIGN KEY (example_id) REFERENCES examples(id) ON DELETE CASCADE
);

-- Full-text search virtual table for efficient searching
CREATE VIRTUAL TABLE lexical_entries_fts USING fts5(
    canonical_form, 
    definition_en, 
    translation_en,
    content=lexical_entries,
    content_rowid=id
);

-- Triggers to keep FTS index updated
CREATE TRIGGER lexical_entries_ai AFTER INSERT ON lexical_entries BEGIN
    INSERT INTO lexical_entries_fts(rowid, canonical_form, definition_en, translation_en)
    VALUES (new.id, new.canonical_form, new.definition_en, new.translation_en);
END;

CREATE TRIGGER lexical_entries_ad AFTER DELETE ON lexical_entries BEGIN
    DELETE FROM lexical_entries_fts WHERE rowid = old.id;
END;

CREATE TRIGGER lexical_entries_au AFTER UPDATE ON lexical_entries BEGIN
    DELETE FROM lexical_entries_fts WHERE rowid = old.id;
    INSERT INTO lexical_entries_fts(rowid, canonical_form, definition_en, translation_en)
    VALUES (new.id, new.canonical_form, new.definition_en, new.translation_en);
END;

-- Update timestamp trigger
CREATE TRIGGER update_lexical_entries_timestamp 
AFTER UPDATE ON lexical_entries
BEGIN
    UPDATE lexical_entries SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;