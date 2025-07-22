# From PDF to Linguistic Data: Extraction Pipeline

Below is a "from-PDF-to-production" blueprint that lets you pour the entire Grammar of Kuku Yalanji into a single modern stack – relational tables for precision, a vector index for AI search, and a graph/RDF layer for linked-data reuse.

**Executive Summary**: This project converts our Kuku Yalanji grammar PDF into structured linguistic data formats that can power translation tools, search interfaces, and cross-linguistic research. The immediate focus is on extraction using LLMs, with future phases for database integration and user interfaces.

## 0. Extraction Strategy Overview

Before diving into the technical layers, we need to extract structured linguistic data from our markdown content. We already have the raw text in Markdown format thanks to our PDF conversion process. Now we'll transform this unstructured content into standardized linguistic formats using LLMs. This extraction process is critical and follows these key principles:

| Step | Why it matters | How to maximize accuracy |
|------|----------------|---------------------------|
| **Pre-chunk by heading** | 2–4k token windows keep context coherent | Use the Markdown `##` / `###` structure already in the document |
| **Pre-tag text** | Regex annotations help the LLM identify examples | Mark interlinear blocks with consistent patterns like `KY:` / `EN:` |
| **Provide explicit schemas** | LLMs hallucinate less with literal field names | Include JSON Schema / CSV headers directly in system prompts |
| **Few-shot examples** | Concrete examples improve output consistency | Include 1-2 hand-crafted gold examples for each format |
| **Request only structured output** | Makes post-processing simpler | Use sentinel tokens like `<START_JSON>` and `<END_JSON>` |
| **Validate and retry** | Catch and fix hallucinations | Use schema validation; retry with correction prompts |

The extraction process will convert our markdown into three specialized linguistic formats:

## 1. Why three layers?

| Layer | What it gives you | Typical tech |
|-------|------------------|-------------|
| Relational / JSON B | Loss-less storage of paradigms, rules, example IDs; fast SQL & GraphQL | PostgreSQL 16 |
| Vector index | Semantic retrieval for RAG ("find the paragraph that explains ergative case") | pgvector inside Postgres OR an external DB like Weaviate |
| Graph / RDF | Publish to web standards, link lemmas → rules → examples, interoperate with Wikidata | OntoLex-Lemon in a triple-store or Neo4j |

A single Postgres instance with the pgvector extension lets you keep both SQL tables and ANN search, but you can swap in Weaviate or Qdrant if you prefer a dedicated vector DB.

## 2. Extraction pipeline (ETL)

Our complete data pipeline consists of these key steps:

```
grammar.pdf ──► 1. PDF extraction (pdftomd.js)  →  Markdown document
                2. Chunk parser (extract.js)   →  Structured formats
                3. (Future) db_loader.py       →  POSTGRES
```

We've completed step 1 and are now implementing step 2. Database loading will come later.

### Chunking strategy
One heading = one chunk (use the TOC you pasted). Store section_id, parent_id, title, level, page_start, page_end, markdown.

### Tables (simplified):

```sql
SECTION(id, parent_id, title, level, pg_start, pg_end, md_text, embedding VECTOR)
GRAM_FEATURE(id, section_id, tag, value, note_json)
PARADIGM_CELL(id, lemma, tags_json, form, source_page)
IGT_EXAMPLE(id, section_id, src_text, gloss_json, translation)
```

### Embeddings

```sql
ALTER TABLE section ADD COLUMN embedding vector(1536);
UPDATE section
  SET embedding = openai_embed(md_text);
CREATE INDEX ON section USING hnsw (embedding vector_cosine_ops);
```

The openai_embed() call is pseudocode – wrap the OpenAI (or local) API inside a PL/Python function or push the vectors to Weaviate.

## 3. Add linguistics-aware formats

### 3.1 CLDF "Grammar Profiles"
Store feature/value pairs in the Cross-Linguistic Data Formats (CLDF) StructureTable – already a CSV+JSON spec used by Glottobank.

Your extraction script will emit:

```csv
ID, Parameter_ID, Language_ID, Value, Source
erg-optional,kuku,gvn,optional,"Patz §4.1.4"
case-stacking,kuku,gvn,yes,"Patz §3.2.3.3"
```

The CLDF format captures grammatical features as discrete, queryable facts. Each row represents a single grammatical property of Kuku Yalanji, with standardized parameter IDs that enable cross-linguistic comparison.

**Extraction prompt strategy:**
```
You are an expert linguist. Output a CSV with header:
ID,Parameter_ID,Language_ID,Value,Source
where each row captures ONE grammatical fact of Kuku Yalanji.
Use Parameter_ID = short kebab-case label (e.g. "ergative-optional"),
Language_ID = "gvn",
Source = "Patz §"+section heading if available.
Return ONLY CSV rows.
```

### 3.2 Interlinear examples (IGT)
Encode every glossed text in XIGT JSON (or Xigt XML) – an extensible standard for IGT that loads cleanly into Python. This format preserves the linguistic alignment between original text, morpheme-by-morpheme glosses, and translations.

**Example XIGT JSON structure:**
```json
{
  "items": [
    {
      "transcript": "Nyulu jalbu-ngku karrkay kawa-ny.",
      "gloss": [
        {"morpheme": "nyulu", "gloss": "3SG.NOM"},
        {"morpheme": "jalbu-ngku", "gloss": "woman-ERG"},
        {"morpheme": "karrkay", "gloss": "child.ABS"},
        {"morpheme": "kawa-ny", "gloss": "look.after-PAST"}
      ],
      "translation": "The woman looked after the child.",
      "source": "§4.1.4"
    }
  ]
}
```

**Extraction prompt strategy:**
```
Identify all examples of interlinear glossed text in the provided content.
For each example, extract:
1. transcript: The original Kuku Yalanji text
2. gloss: An array of objects with "morpheme" and "gloss" for each morpheme
3. translation: The English translation
4. source: Reference to the section

Return a JSON object with "items" array containing these examples.
```

### 3.3 Lexical entries (OntoLex-Lemon)
Extract lexical entries into OntoLex-Lemon JSON-LD format – a W3C standard for representing lexical resources as linked data. This format connects each word to its grammatical properties, definitions, and related concepts.

**Example OntoLex-Lemon structure:**
```json
{
  "@context": "https://www.w3.org/ns/lemon/ontolex.json",
  "@graph": [
    {
      "@id": "kuku:jalbu",
      "@type": "ontolex:LexicalEntry",
      "ontolex:canonicalForm": {
        "ontolex:writtenRep": "jalbu"
      },
      "lexinfo:partOfSpeech": "lexinfo:Noun",
      "ontolex:sense": {
        "ontolex:definition": {
          "@language": "en",
          "@value": "woman"
        }
      }
    }
  ]
}
```

**Extraction prompt strategy:**
```
Extract all lexical entries (words, morphemes) from the provided content.
For each entry, identify:
1. The lemma (canonical form)
2. Part of speech
3. Definition or gloss in English
4. Any grammatical properties mentioned

Return a JSON-LD object with "@graph" array containing these entries.
```

## 4. GraphQL / API layer
Use Hasura or PostGraphile on Postgres:

```graphql
query  {
  section_by_pk(id: "3.2.1") {
    title
    md_text
    nearest (limit: 3, query: "case alignment") {
      id title
    }
  }
}
```

That nearest field is a custom function wrapping pgvector similarity search.

## 5. RAG workflow for MobTranslate

```
User English sentence
        │
        ├─►  Keyword scan → GRAM_FEATURE + PARADIGM_CELL
        ├─►  Vector search → SECTION.embedding (top-k)
        │
        ▼
Prompt:  dictionary snippets + grammar chunks + user text
        │
        ▼
     LLM / GPT-4
        │
        ▼
  Kuku Yalanji output + cite_ids
```

Each cited section_id lets the UI show "Source: §3.8.4.2 Functions of verbal inflections" with a pop-up of the paragraph.

## 6. Modern tooling starter kit

| Task | Open-source tool |
|------|------------------|
| PDF → MD/OCR | pandoc, pymupdf, tesserocr |
| Postgres+vectors | pgvector (ACID & SQL joins) |
| Vector-native alt | Weaviate cloud/self-host |
| CLDF helpers | cldfbench – generates StructureTables |
| IGT parsing | xigt library |
| Graph export | pyrdf + OntoLex, or RDFLib |
| RAG glue | LangChain + langchain-postgresql-pgvector example repo |

## 7. What "modern" gives you
- One source of truth – everything lives in Postgres; vectors and JSON sidecars ride in the same DB.
- AI-ready – embeddings let you power search, chatbots, and translation prompts.
- Linked Data – linguists can harvest your OntoLex endpoint and cite individual rules.
- No lock-in – CLDF CSVs, XIGT JSON, RDF triples are all open standards.

With this setup you can ingest any new grammar or dictionary just by adding rows and re-embedding. Scrapes of contemporary Kuku texts, speech transcripts, or children's stories slot into the same schema and immediately become searchable for models and humans alike.

## 8. Immediate Next Steps (No Database Required)

### 8.1 Extraction Implementation

1. **Set up Node.js environment:**
   ```bash
   npm init -y
   npm i openai remark remark-parse strip-markdown ajv papaparse dotenv
   ```

2. **Create extraction script (`extract.js`):**
   - Load and chunk markdown by headings
   - Process each chunk with OpenAI to extract structured data
   - Validate outputs against schemas
   - Save results to files

3. **Optimize extraction quality:**
   - Use low temperature (0-0.2) for deterministic outputs
   - Implement validation and retry logic for failed chunks
   - Add few-shot examples for complex formats
   - Consider two-step extraction for challenging content

### 8.2 Output Validation and Refinement

1. **Automated validation:**
   - Use `ajv` to validate JSON against schemas
   - Use `papaparse` to validate CSV structure
   - Implement custom validators for linguistic correctness

2. **Manual spot-checking:**
   - Review a sample of outputs for accuracy
   - Identify patterns in extraction errors
   - Refine prompts based on error patterns

3. **Iterative improvement:**
   - Re-run extraction on problematic sections with refined prompts
   - Create a validation bot to fix common errors
   - Build a corpus of gold-standard examples

### 8.3 Deliverables (Pre-Database)

1. **Structured data files:**
   - `grammar_features.csv` - CLDF StructureTable
   - `examples.xigt.json` - Interlinear glossed examples
   - `lexicon.jsonld` - OntoLex-Lemon lexical entries

2. **Documentation:**
   - Schema descriptions and examples
   - Extraction methodology and accuracy metrics
   - Usage guidelines for downstream applications

3. **Visualization tools:**
   - Simple HTML viewers for each format
   - Interactive explorer for interlinear examples
   - Search interface for grammatical features

This approach lets you convert your grammar research into structured linguistic formats immediately, while laying the groundwork for future database integration when you're ready for that step.

## 9. Implementation TODO List

### Phase 1: Extraction Setup and Implementation
- [x] Convert PDF to markdown (completed with pdftomd.js)
- [ ] Set up extraction environment (Node.js, dependencies)
- [ ] Create schemas directory with validation schemas
- [ ] Implement basic chunking functionality
- [ ] Write extraction prompts for each format
- [ ] Test extraction on small sample sections

### Phase 2: Full Extraction and Refinement
- [ ] Run full extraction on complete grammar document
- [ ] Review and validate initial results
- [ ] Identify problem areas and refine prompts
- [ ] Re-run extraction with improved prompts
- [ ] Create validation scripts for each format
- [ ] Generate final output files

### Phase 3: Visualization and Exploration (Pre-Database)
- [ ] Create simple HTML viewer for CLDF features
- [ ] Build interactive explorer for interlinear examples
- [ ] Develop browsable interface for lexical entries
- [ ] Generate documentation for each format
- [ ] Create usage guide for downstream applications

### Future Phases
- [ ] Design database schema based on extracted data
- [ ] Implement database loading scripts
- [ ] Generate vector embeddings for sections
- [ ] Build API layer for data access
- [ ] Develop RAG system for translation assistance

## 10. Timeline and Resources

### Timeline (Tentative)
- **Week 1**: Setup, schema creation, initial extraction testing
- **Week 2**: Full extraction, validation, and refinement
- **Week 3**: Documentation and simple visualization tools
- **Week 4+**: Database design and implementation (future phase)

### Key Resources
- Grammar document: `grammar_complete.md` (250 pages)
- Extraction script: `extract.js`
- Schemas: `/schemas` directory
- Output: `/output` directory
