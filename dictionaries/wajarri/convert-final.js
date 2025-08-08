import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
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
  level: 'info',
});

// Initialize environment and paths
dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DICTIONARY_PATH = path.join(__dirname, 'dictionary.json');
const OUTPUT_DIR = path.join(__dirname, 'output-final');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configuration
const CHUNK_SIZE = 100; // Larger chunks for fewer API calls
const TEST_MODE = process.argv.includes('--test');
const TEST_LIMIT = 50;
const MODEL = 'gpt-4o-mini';
const PARALLEL_LIMIT = 3; // Process 3 chunks in parallel

// Tracking
let stats = {
  apiCalls: 0,
  tokensUsed: 0,
  startTime: Date.now()
};

// Ensure output directory exists
async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  logger.info({ dir: OUTPUT_DIR }, 'Output directory ready');
}

// Load dictionary
async function loadDictionary() {
  const data = await fs.readFile(DICTIONARY_PATH, 'utf8');
  const dictionary = JSON.parse(data);
  
  if (TEST_MODE) {
    logger.warn(`TEST MODE: Using first ${TEST_LIMIT} entries`);
    return dictionary.slice(0, TEST_LIMIT);
  }
  
  logger.info(`Loaded ${dictionary.length} dictionary entries`);
  return dictionary;
}

// Chunk dictionary
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
  logger.info(`Created ${chunks.length} chunks of ${chunkSize} entries`);
  return chunks;
}

// Process chunks in parallel with limit
async function processInBatches(chunks, processor, limit = PARALLEL_LIMIT) {
  const results = [];
  
  for (let i = 0; i < chunks.length; i += limit) {
    const batch = chunks.slice(i, i + limit);
    logger.info(`Processing batch ${Math.floor(i/limit) + 1}/${Math.ceil(chunks.length/limit)}`);
    
    const batchResults = await Promise.all(
      batch.map(chunk => processor(chunk))
    );
    
    results.push(...batchResults);
  }
  
  return results;
}

// Simple OntoLex conversion (no AI needed for basic structure)
function convertToOntoLex(entries) {
  const lexicalEntries = entries.map(entry => ({
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
    "ex:translation": {
      "@language": "en",
      "@value": entry.English
    },
    "ex:audioFile": entry.sound,
    "ex:imageFile": entry.image
  }));

  return {
    "@context": "https://www.w3.org/ns/lemon/ontolex.json",
    "@graph": lexicalEntries
  };
}

// Process XIGT chunk with AI
async function processXIGTChunk(chunk) {
  const prompt = `Analyze these Wajarri words and create morphological glosses.
Break down each word into morphemes where possible.

Common patterns to identify:
- Reduplication: ganggaly-ganggaly (mark as REDUP)
- Suffixes: -manha (verbal), -bidi/-widi (directional), -nya, -pa, -yimanha
- Compounds: split at hyphens

For each entry, output JSON:
{
  "transcript": "word",
  "gloss": [{"morpheme": "part", "gloss": "meaning"}],
  "translation": "English",
  "source": "Wajarri Dictionary"
}

Entries: ${JSON.stringify(chunk.entries.slice(0, 10).map(e => ({
  Wajarri: e.Wajarri,
  English: e.English
})), null, 2)}

Output ONLY JSON array:`;

  try {
    stats.apiCalls++;
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: 'You are a linguist. Output only valid JSON arrays.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 2000
    });
    
    stats.tokensUsed += response.usage?.total_tokens || 0;
    const content = response.choices[0].message.content.trim();
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    logger.error({ chunk: chunk.index, error: error.message }, 'XIGT processing failed');
  }
  
  // Fallback
  return chunk.entries.map(entry => ({
    "transcript": entry.Wajarri,
    "gloss": [{"morpheme": entry.Wajarri, "gloss": entry.English}],
    "translation": entry.English,
    "source": "Wajarri Dictionary"
  }));
}

// Extract grammar features from chunk
async function extractGrammarFeatures(chunk) {
  const prompt = `Extract linguistic patterns from these Wajarri words.
Output CSV rows: ID,Parameter_ID,Language_ID,Value,Source

Focus on:
- Reduplication patterns (e.g., word-word)
- Common suffixes (-manha, -bidi, -nya, etc.)
- Semantic categories (body parts, kinship, nature)

Words: ${chunk.entries.slice(0, 20).map(e => e.Wajarri).join(', ')}

Output only CSV rows:`;

  try {
    stats.apiCalls++;
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: 'Output only CSV rows, no headers.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });
    
    stats.tokensUsed += response.usage?.total_tokens || 0;
    return response.choices[0].message.content
      .split('\n')
      .filter(line => line.trim() && line.includes(','));
  } catch (error) {
    logger.error({ chunk: chunk.index, error: error.message }, 'Grammar extraction failed');
    return [];
  }
}

// Main pipeline
async function main() {
  try {
    logger.info('🚀 Starting Final Wajarri Dictionary Conversion');
    logger.info({ model: MODEL, mode: TEST_MODE ? 'TEST' : 'FULL' });
    
    // Setup
    await ensureOutputDir();
    const dictionary = await loadDictionary();
    const chunks = chunkDictionary(dictionary);
    
    // 1. Convert to OntoLex (no AI needed)
    logger.info('Converting to OntoLex format...');
    const ontolex = convertToOntoLex(dictionary);
    const ontolexPath = path.join(OUTPUT_DIR, 'lexicon.jsonld');
    await fs.writeFile(ontolexPath, JSON.stringify(ontolex, null, 2));
    logger.info('✓ OntoLex saved');
    
    // 2. Process XIGT with morphological analysis
    logger.info('Processing XIGT morphological analysis...');
    const xigtResults = await processInBatches(chunks, processXIGTChunk);
    const xigt = {
      "items": xigtResults.flat(),
      "metadata": {
        "language": "Wajarri",
        "iso639-3": "wbv",
        "totalEntries": dictionary.length,
        "model": MODEL
      }
    };
    const xigtPath = path.join(OUTPUT_DIR, 'examples.xigt.json');
    await fs.writeFile(xigtPath, JSON.stringify(xigt, null, 2));
    logger.info('✓ XIGT saved');
    
    // 3. Extract grammar features
    logger.info('Extracting grammar features...');
    const grammarResults = await processInBatches(chunks, extractGrammarFeatures);
    const grammarFeatures = grammarResults.flat();
    
    if (grammarFeatures.length > 0) {
      const csvContent = ['ID,Parameter_ID,Language_ID,Value,Source', ...grammarFeatures].join('\n');
      const csvPath = path.join(OUTPUT_DIR, 'grammar_features.csv');
      await fs.writeFile(csvPath, csvContent);
      logger.info('✓ Grammar features saved');
    }
    
    // Save metadata
    const metadata = {
      entriesProcessed: dictionary.length,
      chunks: chunks.length,
      apiCalls: stats.apiCalls,
      tokensUsed: stats.tokensUsed,
      duration: Date.now() - stats.startTime,
      model: MODEL,
      timestamp: new Date().toISOString()
    };
    
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    // Summary
    logger.info('✅ CONVERSION COMPLETE!');
    logger.info({
      entries: dictionary.length,
      apiCalls: stats.apiCalls,
      tokens: stats.tokensUsed,
      duration: `${(Date.now() - stats.startTime) / 1000}s`
    });
    
  } catch (error) {
    logger.error({ err: error }, 'Pipeline failed');
    process.exit(1);
  }
}

main();