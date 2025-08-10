# Wajarri Dictionary Project - MobTranslate.com

## Project Overview
This is a Wajarri language dictionary conversion project for MobTranslate.com, an online platform for Indigenous Australian language dictionaries. The project involves converting and processing Wajarri language lexical data into structured formats suitable for web-based dictionary applications.

## Language Context
Wajarri is an Indigenous Australian language from Western Australia. This project preserves and makes accessible the Wajarri lexicon through digital transformation.

## Data Sources
The project processes a source `dictionary.json` file containing 1,684 Wajarri lexical entries, including:
- Word forms (canonical representations)
- English translations and definitions
- Audio files (MP3 format for pronunciation)
- Associated images

## Processing Pipeline
The conversion process uses Node.js scripts with AI-powered analysis (GPT-4o-mini) to:
1. Parse raw dictionary data
2. Extract linguistic features and morphological analysis
3. Generate structured outputs in multiple formats

## Output Formats

### 1. Lexicon Data (lexicon.jsonld)
- JSON-LD format using W3C OntoLex vocabulary
- Structured lexical entries with:
  - Canonical forms
  - Sense definitions
  - English translations
  - Media references (audio/images)

### 2. Grammar Features (grammar_features.csv)
- CSV format capturing grammatical parameters
- Links lexical items to linguistic features

### 3. Examples (examples.xigt.json)
- Interlinear glossed text format
- Morphological breakdowns with:
  - Transcripts
  - Morpheme-by-morpheme glosses
  - Full translations

### 4. Metadata (metadata.json)
- Processing statistics
- API usage metrics
- Timestamp information

## Database Requirements
The SQLite database should support:
- Full lexicon storage with multimedia references
- Morphological analysis data
- Example sentences with glossing
- Efficient search across Wajarri and English
- Support for linguistic annotations

## Integration Points
- Web frontend for dictionary search and display
- Audio playback for pronunciation
- Visual aids through associated images
- Cross-referencing between related entries

## Technical Stack
- Node.js for data processing
- AI/ML for linguistic analysis
- SQLite for data storage
- JSON-LD for semantic web compatibility
- CSV for tabular data exchange

## Database Setup & Usage

### Installation
```bash
npm install  # Install dependencies including sqlite3
```

### Database Management
```bash
npm run import-db  # Create and populate the SQLite database
npm run query-db   # Interactive query tool
```

### Direct SQL Queries
```bash
# Search in Wajarri
sqlite3 wajarri_dictionary.db "SELECT * FROM lexical_entries_fts WHERE lexical_entries_fts MATCH 'water';"

# Search in English
sqlite3 wajarri_dictionary.db "SELECT * FROM lexical_entries WHERE definition_en LIKE '%bird%';"

# Get statistics
sqlite3 wajarri_dictionary.db "SELECT COUNT(*) FROM lexical_entries;"
```

### Database Structure
- **lexical_entries**: Main dictionary entries (1632 records)
- **examples**: Usage examples with morphological glosses (170 records)
- **grammar_features**: Grammatical parameters (374 records)
- **media_files**: Audio and image references
- **lexical_entries_fts**: Full-text search index

## Commands
- Database import: `npm run import-db`
- Interactive query: `npm run query-db`
- Lint: Check with `npm run lint` if available
- Type checking: Run `npm run typecheck` if configured