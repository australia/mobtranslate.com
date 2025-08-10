# Wajarri Dictionary SQLite Database

## Quick Start
```bash
# Install dependencies
npm install

# Create and populate database
npm run import-db

# Interactive query tool
npm run query-db
```

## Database Schema

### Tables
1. **lexical_entries** - Core dictionary entries
   - lexical_id (unique identifier)
   - canonical_form (Wajarri word)
   - definition_en (English definition)
   - translation_en (English translation)

2. **examples** - Usage examples
   - transcript (Wajarri text)
   - translation (English translation)
   - Links to lexical_entries

3. **morpheme_glosses** - Linguistic analysis
   - Morpheme breakdowns
   - Glosses for each morpheme
   - Links to examples

4. **grammar_features** - Grammatical parameters
   - Parameter and language IDs
   - Values and sources

5. **media_files** - Associated media
   - Audio pronunciations (MP3)
   - Images
   - Links to lexical_entries

## Search Examples

### Using the Interactive Tool
```bash
npm run query-db
> search water      # Search for "water" in any field
> example ganggaly  # Get examples for a word
> stats            # Show database statistics
```

### Direct SQL Queries
```sql
-- Full-text search
SELECT * FROM lexical_entries_fts 
WHERE lexical_entries_fts MATCH 'bird';

-- Search by Wajarri word
SELECT * FROM lexical_entries 
WHERE canonical_form LIKE 'gang%';

-- Get word with examples
SELECT le.canonical_form, le.translation_en, e.transcript, e.translation
FROM lexical_entries le
LEFT JOIN examples e ON e.lexical_entry_id = le.id
WHERE le.canonical_form = 'ganggaly-ganggaly';
```

## Data Sources
- **output-final/lexicon.jsonld** - Main lexicon (1,684 entries)
- **output-final/examples.xigt.json** - Example sentences
- **output-final/grammar_features.csv** - Grammar data
- **output-final/metadata.json** - Processing metadata

## Integration with MobTranslate.com
This database is designed to power the Wajarri dictionary on MobTranslate.com, supporting:
- Fast lexical searches
- Audio pronunciation playback
- Morphological analysis display
- Cross-referencing between entries