import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import pino from 'pino';
import dotenv from 'dotenv';
import OpenAI from 'openai';

// Configure logger with more detail
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
  level: 'debug', // More verbose logging
});

// Initialize environment and paths
dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DICTIONARY_PATH = path.join(__dirname, 'dictionary.json');
const OUTPUT_DIR = path.join(__dirname, 'output-enhanced');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configuration
const CHUNK_SIZE = 50; // Smaller chunks for better API processing
const TEST_MODE = process.argv.includes('--test');
const TEST_LIMIT = 20; // Smaller test for faster verification
const MODEL = 'gpt-4o-mini'; // Using faster model for efficient processing

// API call counter
let apiCallCount = 0;
let totalTokensUsed = 0;

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
      logger.warn(`TEST MODE: Using first ${TEST_LIMIT} entries`);
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
  logger.info(`Created ${chunks.length} chunks of up to ${chunkSize} entries each`);
  return chunks;
}

// Make API call with logging
async function makeAPICall(prompt, systemPrompt, purpose) {
  apiCallCount++;
  const startTime = Date.now();
  
  logger.debug(`API Call #${apiCallCount} for: ${purpose}`);
  logger.debug(`Using model: ${MODEL}`);
  
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4000
    });
    
    const duration = Date.now() - startTime;
    const tokensUsed = response.usage?.total_tokens || 0;
    totalTokensUsed += tokensUsed;
    
    logger.info({
      apiCall: apiCallCount,
      purpose,
      duration: `${duration}ms`,
      tokensUsed,
      totalTokens: totalTokensUsed,
      model: MODEL
    }, `✓ API call completed`);
    
    return response.choices[0].message.content.trim();
  } catch (error) {
    logger.error({ 
      apiCall: apiCallCount, 
      purpose, 
      error: error.message 
    }, '✗ API call failed');
    throw error;
  }
}

// Convert to OntoLex with AI enhancement
async function convertToOntoLexWithAI(chunks) {
  logger.info('=== Starting OntoLex conversion with AI ===');
  const allEntries = [];
  
  for (const chunk of chunks) {
    logger.info(`Processing OntoLex chunk ${chunk.index + 1}/${chunks.length}`);
    
    const prompt = `Convert these Wajarri dictionary entries to OntoLex-Lemon JSON-LD format.

For each entry, create a lexical entry with:
- @id: "wajarri:WORD" (replace spaces with underscores)
- @type: "ontolex:LexicalEntry"
- Canonical form with written representation
- Sense with definition
- Preserve audio and image files

Input entries:
${JSON.stringify(chunk.entries, null, 2)}

Output ONLY a JSON array of OntoLex entries:`;

    const systemPrompt = 'You are an expert in linguistic data formats, specializing in OntoLex-Lemon RDF representation.';
    
    try {
      const response = await makeAPICall(prompt, systemPrompt, 'OntoLex conversion');
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const entries = JSON.parse(jsonMatch[0]);
        allEntries.push(...entries);
      }
    } catch (error) {
      logger.error({ chunk: chunk.index }, 'Failed to convert chunk to OntoLex');
      // Fallback to basic conversion
      const basicEntries = chunk.entries.map(entry => ({
        "@id": `wajarri:${entry.Wajarri.replace(/\s+/g, '_')}`,
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
        "ex:audioFile": entry.sound,
        "ex:imageFile": entry.image
      }));
      allEntries.push(...basicEntries);
    }
  }
  
  return {
    "@context": "https://www.w3.org/ns/lemon/ontolex.json",
    "@graph": allEntries
  };
}

// Convert to XIGT with morphological analysis
async function convertToXIGTWithAI(chunks) {
  logger.info('=== Starting XIGT conversion with morphological analysis ===');
  const allItems = [];
  
  for (const chunk of chunks) {
    logger.info(`Processing XIGT chunk ${chunk.index + 1}/${chunks.length}`);
    
    const prompt = `Analyze these Wajarri dictionary entries and create detailed morphological glosses.

For each entry, provide:
1. Break down words into morphemes
2. Identify reduplication (mark as REDUP)
3. Analyze suffixes: -manha (verbal), -bidi/-widi (directional), -rri/-li (locative), -nya, -pa
4. Split compounds at hyphens

Output format for each entry:
{
  "transcript": "original word",
  "gloss": [
    {"morpheme": "part1", "gloss": "meaning1"},
    {"morpheme": "part2", "gloss": "meaning2"}
  ],
  "translation": "English",
  "source": "Wajarri Dictionary"
}

Entries to analyze:
${JSON.stringify(chunk.entries, null, 2)}

Output ONLY a JSON array:`;

    const systemPrompt = 'You are an expert in Australian Aboriginal linguistics, specializing in Wajarri morphological analysis.';
    
    try {
      const response = await makeAPICall(prompt, systemPrompt, 'XIGT morphological analysis');
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const items = JSON.parse(jsonMatch[0]);
        allItems.push(...items);
      }
    } catch (error) {
      logger.error({ chunk: chunk.index }, 'Failed to analyze morphology');
      // Basic fallback
      const basicItems = chunk.entries.map(entry => ({
        "transcript": entry.Wajarri,
        "gloss": [{"morpheme": entry.Wajarri, "gloss": entry.English}],
        "translation": entry.English,
        "source": "Wajarri Dictionary"
      }));
      allItems.push(...basicItems);
    }
  }
  
  return {
    "items": allItems,
    "metadata": {
      "language": "Wajarri",
      "iso639-3": "wbv",
      "totalEntries": allItems.length,
      "processedWithAI": true,
      "model": MODEL,
      "date": new Date().toISOString()
    }
  };
}

// Extract grammar features with AI
async function extractGrammarFeaturesWithAI(chunks) {
  logger.info('=== Starting grammar feature extraction ===');
  const allFeatures = [];
  
  for (const chunk of chunks) {
    logger.info(`Extracting features from chunk ${chunk.index + 1}/${chunks.length}`);
    
    const prompt = `Extract detailed linguistic features from these Wajarri entries.

Generate CSV rows (no header) with format:
ID,Parameter_ID,Language_ID,Value,Source

Focus on:
1. Morphological patterns:
   - Reduplication (full or partial)
   - Compounds (hyphenated or space-separated)
   - Common suffixes: -manha, -bidi, -widi, -rri, -li, -nya, -pa, -yimanha, -gunmanha
   - Prefixes if any

2. Semantic categories:
   - Body parts, kinship terms, flora, fauna
   - Natural phenomena (water, fire, wind, earth)
   - Cultural items, tools, weapons
   - Actions, states, qualities

3. Phonological patterns:
   - Initial consonant clusters (ng-, ny-, th-, etc.)
   - Final syllable patterns
   - Vowel patterns

4. Word formation:
   - Derivational processes
   - Nominalization patterns
   - Verbalization patterns

Entries to analyze:
${JSON.stringify(chunk.entries, null, 2)}

Output ONLY CSV rows (no headers):`;

    const systemPrompt = 'You are an expert computational linguist specializing in Australian Aboriginal languages.';
    
    try {
      const response = await makeAPICall(prompt, systemPrompt, 'Grammar feature extraction');
      const lines = response.split('\n').filter(line => line.trim() && line.includes(','));
      allFeatures.push(...lines);
    } catch (error) {
      logger.error({ chunk: chunk.index }, 'Failed to extract grammar features');
    }
  }
  
  return allFeatures;
}

// Save all outputs
async function saveOutputs(ontolex, xigt, grammarFeatures, chunks) {
  logger.info('=== Saving output files ===');
  
  // Save OntoLex
  const ontolexPath = path.join(OUTPUT_DIR, TEST_MODE ? 'test_lexicon.jsonld' : 'lexicon.jsonld');
  await fs.writeFile(ontolexPath, JSON.stringify(ontolex, null, 2));
  logger.info({ 
    file: ontolexPath, 
    entries: ontolex['@graph'].length 
  }, '✓ Saved OntoLex lexicon');
  
  // Save XIGT
  const xigtPath = path.join(OUTPUT_DIR, TEST_MODE ? 'test_examples.xigt.json' : 'examples.xigt.json');
  await fs.writeFile(xigtPath, JSON.stringify(xigt, null, 2));
  logger.info({ 
    file: xigtPath, 
    entries: xigt.items.length 
  }, '✓ Saved XIGT examples');
  
  // Save grammar features
  if (grammarFeatures.length > 0) {
    const csvHeader = 'ID,Parameter_ID,Language_ID,Value,Source';
    const csvContent = [csvHeader, ...grammarFeatures].join('\n');
    const csvPath = path.join(OUTPUT_DIR, TEST_MODE ? 'test_grammar_features.csv' : 'grammar_features.csv');
    await fs.writeFile(csvPath, csvContent);
    logger.info({ 
      file: csvPath, 
      features: grammarFeatures.length 
    }, '✓ Saved grammar features');
  }
  
  // Save processing metadata
  const metadata = {
    chunks: chunks.map(c => ({
      index: c.index,
      start: c.start,
      end: c.end,
      entryCount: c.entries.length
    })),
    apiCalls: apiCallCount,
    totalTokensUsed,
    model: MODEL,
    processed: new Date().toISOString()
  };
  const metaPath = path.join(OUTPUT_DIR, 'processing_metadata.json');
  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
  logger.info({ file: metaPath }, '✓ Saved processing metadata');
}

// Main pipeline
async function main() {
  try {
    logger.info('🚀 Starting Enhanced Wajarri Dictionary Conversion Pipeline');
    logger.info(`Model: ${MODEL}`);
    logger.info(`Mode: ${TEST_MODE ? 'TEST' : 'FULL'}`);
    
    // Setup
    await ensureOutputDir();
    const dictionary = await loadDictionary();
    const chunks = chunkDictionary(dictionary);
    
    // Process with AI
    logger.info(`\n📊 Processing ${dictionary.length} entries in ${chunks.length} chunks...\n`);
    
    // 1. OntoLex conversion with AI
    const ontolex = await convertToOntoLexWithAI(chunks);
    
    // 2. XIGT morphological analysis with AI
    const xigt = await convertToXIGTWithAI(chunks);
    
    // 3. Grammar feature extraction with AI
    const grammarFeatures = await extractGrammarFeaturesWithAI(chunks);
    
    // Save all outputs
    await saveOutputs(ontolex, xigt, grammarFeatures, chunks);
    
    // Final summary
    logger.info('\n' + '='.repeat(60));
    logger.info('✅ CONVERSION COMPLETE!');
    logger.info('='.repeat(60));
    logger.info({
      totalEntries: dictionary.length,
      chunksProcessed: chunks.length,
      apiCallsMade: apiCallCount,
      totalTokensUsed,
      model: MODEL,
      outputDir: OUTPUT_DIR,
      testMode: TEST_MODE
    }, 'Pipeline Summary');
    
  } catch (error) {
    logger.error({ err: error }, '❌ Pipeline failed');
    process.exit(1);
  }
}

// Run the pipeline
main();