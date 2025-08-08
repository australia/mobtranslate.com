import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import Ajv from 'ajv';
import pino from 'pino';
import dotenv from 'dotenv';
import OpenAI from 'openai';

// Configure logger
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      levelFirst: true,
    },
  },
  level: process.env.LOG_LEVEL || 'info',
});

// Initialize environment and paths
dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DICTIONARY_PATH = path.join(__dirname, 'dictionary.json');
const OUTPUT_DIR = path.join(__dirname, 'output');

// Initialize OpenAI for grammar feature extraction
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

// Configuration
const CHUNK_SIZE = 100; // Process 100 entries at a time
const TEST_MODE = process.argv.includes('--test');
const TEST_LIMIT = 50; // Use first 50 entries for testing

// Ensure output directory exists
async function ensureOutputDir() {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    logger.info({ dir: OUTPUT_DIR }, 'Output directory ready');
  } catch (error) {
    logger.error({ err: error }, 'Error creating output directory');
    throw error;
  }
}

// Load dictionary data
async function loadDictionary() {
  try {
    logger.info('Loading Wajarri dictionary...');
    const data = await fs.readFile(DICTIONARY_PATH, 'utf8');
    const dictionary = JSON.parse(data);
    
    if (TEST_MODE) {
      logger.info(`Test mode: Using first ${TEST_LIMIT} entries`);
      return dictionary.slice(0, TEST_LIMIT);
    }
    
    logger.info(`Loaded ${dictionary.length} dictionary entries`);
    return dictionary;
  } catch (error) {
    logger.error({ err: error }, 'Error loading dictionary');
    throw error;
  }
}

// Chunk dictionary for processing
function chunkDictionary(dictionary, chunkSize = CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < dictionary.length; i += chunkSize) {
    chunks.push({
      index: Math.floor(i / chunkSize),
      start: i,
      end: Math.min(i + chunkSize, dictionary.length),
      entries: dictionary.slice(i, i + chunkSize)
    });
  }
  logger.info(`Created ${chunks.length} chunks of ${chunkSize} entries each`);
  return chunks;
}

// Convert to OntoLex-Lemon JSON-LD format
function convertToOntoLex(entries) {
  const lexicalEntries = entries.map((entry, index) => {
    const entryId = `wajarri:${entry.Wajarri.replace(/\s+/g, '_')}`;
    
    return {
      "@id": entryId,
      "@type": "ontolex:LexicalEntry",
      "ontolex:canonicalForm": {
        "ontolex:writtenRep": entry.Wajarri
      },
      "ontolex:sense": {
        "ontolex:definition": {
          "@language": "en",
          "@value": entry.description || entry.English
        }
      },
      "ex:translation": {
        "@language": "en",
        "@value": entry.English
      },
      "ex:audioFile": entry.sound || null,
      "ex:imageFile": entry.image || null
    };
  });

  return {
    "@context": "https://www.w3.org/ns/lemon/ontolex.json",
    "@graph": lexicalEntries
  };
}

// Convert to XIGT format with morphological analysis
async function convertToXIGT(entries, chunks) {
  if (!openai) {
    logger.warn('OpenAI not configured, creating basic XIGT format');
    return convertToBasicXIGT(entries);
  }

  const items = [];
  
  for (const chunk of chunks) {
    logger.info(`Analyzing morphology for chunk ${chunk.index + 1}/${chunks.length}`);
    
    const prompt = `Analyze these Wajarri dictionary entries and create morphological glosses.
For each entry, break down the word into morphemes if possible.

Output JSON array with this exact structure for each entry:
{
  "transcript": "original Wajarri word",
  "gloss": [
    {"morpheme": "part1", "gloss": "meaning1"},
    {"morpheme": "part2", "gloss": "meaning2"}
  ],
  "translation": "English translation",
  "source": "Wajarri Dictionary"
}

Rules:
- If word appears to be a compound (contains hyphen), split at hyphen
- If word has reduplication (repeated syllables), mark as REDUP
- If no clear morphemes, use single morpheme with full word
- Common patterns: -manha (verbal suffix), -bidi/-widi (directional), -rri/-li (locative)

Dictionary entries:
${JSON.stringify(chunk.entries, null, 2)}

Output ONLY a JSON array:`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an expert in Australian Aboriginal linguistics, specializing in morphological analysis.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 4000
      });

      const content = response.choices[0].message.content.trim();
      // Extract JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const morphAnalysis = JSON.parse(jsonMatch[0]);
        items.push(...morphAnalysis);
      }
    } catch (error) {
      logger.error({ err: error, chunk: chunk.index }, 'Error in morphological analysis');
      // Fallback to basic format for this chunk
      const basicItems = chunk.entries.map(entry => ({
        "transcript": entry.Wajarri,
        "gloss": [{"morpheme": entry.Wajarri, "gloss": entry.English}],
        "translation": entry.English,
        "source": "Wajarri Dictionary"
      }));
      items.push(...basicItems);
    }
  }

  return {
    "items": items
  };
}

// Basic XIGT without morphological analysis
function convertToBasicXIGT(entries) {
  const items = entries.map(entry => ({
    "transcript": entry.Wajarri,
    "gloss": [{"morpheme": entry.Wajarri, "gloss": entry.English}],
    "translation": entry.English,
    "source": "Wajarri Dictionary"
  }));

  return { "items": items };
}

// Extract grammar features using GPT-4o-mini
async function extractGrammarFeatures(chunks) {
  if (!openai) {
    logger.warn('OpenAI API key not configured, skipping grammar feature extraction');
    return [];
  }

  const allFeatures = [];
  
  for (const chunk of chunks) {
    logger.info(`Extracting grammar features from chunk ${chunk.index + 1}/${chunks.length}`);
    
    const prompt = `Analyze these Wajarri dictionary entries and extract linguistic features.
Output CSV rows with this EXACT format (no headers):
ID,Parameter_ID,Language_ID,Value,Source

Examples of good output:
wajarri-redup-1,reduplication,wbv,full-reduplication,Wajarri Dictionary
wajarri-compound-2,word-formation,wbv,compound-hyphenated,Wajarri Dictionary
wajarri-suffix-3,derivational-morphology,wbv,-manha,Wajarri Dictionary
wajarri-semantic-4,semantic-field,wbv,body-part,Wajarri Dictionary

Focus on:
1. Morphological patterns:
   - Reduplication (e.g., ganggaly-ganggaly)
   - Compounds with hyphens
   - Common suffixes: -manha, -bidi, -widi, -rri, -li, -nya, -pa
   - Prefixes if any

2. Semantic categories:
   - Body parts, kinship terms, flora, fauna
   - Natural phenomena (water, fire, wind)
   - Cultural items, tools, actions

3. Phonological patterns:
   - Initial consonant clusters
   - Final syllable patterns

Dictionary entries to analyze:
${JSON.stringify(chunk.entries, null, 2)}

Output ONLY CSV rows:`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an expert linguist specializing in Australian Aboriginal languages.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 2000
      });

      const csvContent = response.choices[0].message.content.trim();
      if (csvContent) {
        const lines = csvContent.split('\n').filter(line => line.trim());
        allFeatures.push(...lines);
      }
    } catch (error) {
      logger.error({ err: error, chunk: chunk.index }, 'Error extracting grammar features');
    }
  }

  return allFeatures;
}

// Create basic grammar features from patterns
function extractBasicGrammarFeatures(entries) {
  const features = [];
  const patterns = {
    reduplication: /^(\w+)-\1$/,
    compound: /-/,
    loanword: /\b(track|station|horse|sheep|money)\b/i
  };

  entries.forEach((entry, idx) => {
    // Check for reduplication
    if (patterns.reduplication.test(entry.Wajarri)) {
      features.push([
        `reduplication-${idx}`,
        'morphological-process',
        'wbv',
        'reduplication',
        'Wajarri Dictionary'
      ]);
    }

    // Check for compounds
    if (patterns.compound.test(entry.Wajarri) && !patterns.reduplication.test(entry.Wajarri)) {
      features.push([
        `compound-${idx}`,
        'word-formation',
        'wbv',
        'compound',
        'Wajarri Dictionary'
      ]);
    }

    // Semantic categories from descriptions
    const description = (entry.description || entry.English).toLowerCase();
    
    if (description.includes('person') || description.includes('people')) {
      features.push([
        `semantic-person-${idx}`,
        'semantic-field',
        'wbv',
        'person/human',
        'Wajarri Dictionary'
      ]);
    }
    
    if (description.includes('body') || description.includes('head') || description.includes('hand')) {
      features.push([
        `semantic-body-${idx}`,
        'semantic-field',
        'wbv',
        'body-part',
        'Wajarri Dictionary'
      ]);
    }

    if (description.includes('water') || description.includes('rain') || description.includes('river')) {
      features.push([
        `semantic-water-${idx}`,
        'semantic-field',
        'wbv',
        'water/liquid',
        'Wajarri Dictionary'
      ]);
    }
  });

  return features;
}

// Save processed chunks metadata
async function saveProcessedChunks(chunks) {
  const metadata = chunks.map(chunk => ({
    index: chunk.index,
    start: chunk.start,
    end: chunk.end,
    entryCount: chunk.entries.length,
    processed: new Date().toISOString()
  }));

  const outputPath = path.join(OUTPUT_DIR, 'processed_chunks.json');
  await fs.writeFile(outputPath, JSON.stringify(metadata, null, 2));
  logger.info({ file: outputPath }, 'Saved processed chunks metadata');
}

// Main conversion pipeline
async function main() {
  try {
    logger.info('Starting Wajarri dictionary conversion pipeline');
    
    // Setup
    await ensureOutputDir();
    const dictionary = await loadDictionary();
    const chunks = chunkDictionary(dictionary);
    
    // Convert to OntoLex format
    logger.info('Converting to OntoLex-Lemon format...');
    const ontolex = convertToOntoLex(dictionary);
    const ontolexPath = path.join(OUTPUT_DIR, TEST_MODE ? 'test_lexicon.jsonld' : 'lexicon.jsonld');
    await fs.writeFile(ontolexPath, JSON.stringify(ontolex, null, 2));
    logger.info({ file: ontolexPath }, 'Saved OntoLex lexicon');
    
    // Convert to XIGT format with morphological analysis
    logger.info('Converting to XIGT format with morphological analysis...');
    const xigt = await convertToXIGT(dictionary, chunks);
    const xigtPath = path.join(OUTPUT_DIR, TEST_MODE ? 'test_examples.xigt.json' : 'examples.xigt.json');
    await fs.writeFile(xigtPath, JSON.stringify(xigt, null, 2));
    logger.info({ file: xigtPath }, 'Saved XIGT examples');
    
    // Extract grammar features
    logger.info('Extracting grammar features...');
    let grammarFeatures = [];
    
    // Try AI extraction first
    if (openai) {
      const aiFeatures = await extractGrammarFeatures(chunks);
      if (aiFeatures.length > 0) {
        grammarFeatures.push(...aiFeatures);
      }
    }
    
    // Add basic pattern-based extraction
    const basicFeatures = extractBasicGrammarFeatures(dictionary);
    if (basicFeatures.length > 0) {
      // Convert to CSV format
      const csvRows = basicFeatures.map(f => f.join(','));
      grammarFeatures.push(...csvRows);
    }
    
    // Save grammar features as CSV
    if (grammarFeatures.length > 0) {
      const csvHeader = 'ID,Parameter_ID,Language_ID,Value,Source';
      const csvContent = [csvHeader, ...grammarFeatures].join('\n');
      const csvPath = path.join(OUTPUT_DIR, TEST_MODE ? 'test_grammar_features.csv' : 'grammar_features.csv');
      await fs.writeFile(csvPath, csvContent);
      logger.info({ file: csvPath, count: grammarFeatures.length }, 'Saved grammar features');
    }
    
    // Save processed chunks metadata
    await saveProcessedChunks(chunks);
    
    logger.info('Conversion pipeline completed successfully!');
    logger.info({
      totalEntries: dictionary.length,
      chunksProcessed: chunks.length,
      outputDir: OUTPUT_DIR,
      testMode: TEST_MODE
    }, 'Summary');
    
  } catch (error) {
    logger.error({ err: error }, 'Pipeline failed');
    process.exit(1);
  }
}

// Run the pipeline
main();