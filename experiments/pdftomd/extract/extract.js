// extract.js - Extract linguistics-aware formats from grammar research paper
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import strip from 'strip-markdown';
import OpenAI from 'openai';
import Papa from 'papaparse';
import Ajv from 'ajv';
import dotenv from 'dotenv';

// Initialize environment and paths
dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRAMMAR_PATH =
  process.argv[2] || path.join(__dirname, '..', 'grammar_complete.md');
const OUTPUT_DIR = path.join(__dirname, 'output');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Set default model
const DEFAULT_MODEL = 'gpt-4o-mini';

// Ensure output directory exists
async function ensureOutputDir() {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`Output directory created: ${OUTPUT_DIR}`);
  } catch (error) {
    console.error('Error creating output directory:', error.message);
    throw error;
  }
}

// Load and chunk the markdown file
async function loadAndChunkMarkdown(filePath) {
  try {
    console.log(`Loading markdown from ${filePath}`);
    const md = await fs.readFile(filePath, 'utf8');

    // Parse markdown into an AST
    const processor = unified().use(remarkParse);
    const tree = processor.parse(md);

    // Extract chunks based on headings
    const chunks = [];
    let currentChunk = {
      heading: '',
      content: '',
      level: 0,
      headingNode: null,
    };
    let inChunk = false;

    // Walk through the AST
    function visit(node, parent) {
      if (node.type === 'heading' && node.depth <= 3) {
        // If we were already in a chunk, save it
        if (inChunk && currentChunk.content.trim()) {
          chunks.push({ ...currentChunk });
        }

        // Start a new chunk
        const headingText = getTextFromNode(node);
        currentChunk = {
          heading: headingText,
          content: headingText + '\n\n',
          level: node.depth,
          headingNode: node,
          sectionId: getSectionId(headingText, node.depth),
        };
        inChunk = true;
      } else if (
        inChunk &&
        (node.type === 'paragraph' ||
          node.type === 'code' ||
          node.type === 'table')
      ) {
        // Add content to current chunk
        currentChunk.content += getTextFromNode(node) + '\n\n';
      }

      // Visit children
      if (node.children) {
        node.children.forEach((child) => visit(child, node));
      }
    }

    // Start visiting from the root
    visit(tree);

    // Add the last chunk if it exists
    if (inChunk && currentChunk.content.trim()) {
      chunks.push({ ...currentChunk });
    }

    console.log(`Extracted ${chunks.length} chunks from markdown`);
    return chunks;
  } catch (error) {
    console.error('Error loading and chunking markdown:', error.message);
    throw error;
  }
}

// Helper to extract text from a node
function getTextFromNode(node) {
  if (node.type === 'text') {
    return node.value;
  } else if (node.type === 'heading') {
    return node.children.map((child) => getTextFromNode(child)).join('');
  } else if (node.type === 'paragraph' || node.type === 'tableCell') {
    return node.children.map((child) => getTextFromNode(child)).join('');
  } else if (node.type === 'table') {
    return node.children
      .map((row) =>
        row.children.map((cell) => getTextFromNode(cell)).join(' | '),
      )
      .join('\n');
  } else if (node.type === 'code') {
    return '```' + (node.lang || '') + '\n' + node.value + '\n```';
  } else if (node.children) {
    return node.children.map((child) => getTextFromNode(child)).join('');
  }
  return '';
}

// Generate a section ID from heading text
function getSectionId(headingText, level) {
  // Extract section numbers if they exist (e.g., "3.2.1 Case marking")
  const match = headingText.match(/^(\d+(\.\d+)*)/);
  if (match) {
    return match[1];
  }

  // Otherwise, generate a slug from the heading text
  return headingText
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .substring(0, 30);
}

// Call OpenAI API to process chunks with retry logic
async function callLLM(
  systemPrompt,
  userContent,
  maxTokens = 2048,
  examples = [],
) {
  const MAX_RETRIES = 2;
  let retries = 0;

  // Build messages array with optional few-shot examples
  const messages = [{ role: 'system', content: systemPrompt }];

  // Add few-shot examples if provided
  for (const example of examples) {
    if (example.user) messages.push({ role: 'user', content: example.user });
    if (example.assistant)
      messages.push({ role: 'assistant', content: example.assistant });
  }

  // Add the actual user content
  messages.push({ role: 'user', content: userContent });

  while (true) {
    try {
      console.log(`Calling LLM with ${messages.length} messages...`);

      const response = await openai.chat.completions.create({
        model: process.env.MODEL || DEFAULT_MODEL,
        temperature: 0.1,
        messages: messages,
        max_tokens: maxTokens,
      });

      const content = response.choices[0].message.content;

      // Print the response in a nicely formatted way
      console.log('\n' + '='.repeat(50));
      console.log(`LLM RESPONSE (${process.env.MODEL || DEFAULT_MODEL})`);
      console.log('-'.repeat(50));

      // Try to detect and format JSON responses
      if (content.includes('{') && content.includes('}')) {
        try {
          // Extract JSON content if it's wrapped in markdown code blocks
          let jsonContent = content;
          if (content.includes('```json')) {
            jsonContent = content.split('```json')[1].split('```')[0].trim();
          } else if (content.includes('```')) {
            jsonContent = content.split('```')[1].split('```')[0].trim();
          }

          // Try to parse and pretty print the JSON
          const parsed = JSON.parse(jsonContent);
          console.log(JSON.stringify(parsed, null, 2));
        } catch (e) {
          // If JSON parsing fails, just print the raw content
          console.log(content);
        }
      } else if (content.includes('ID,Parameter_ID')) {
        // Format CSV content
        console.log(
          content
            .split('\n')
            .map((line) => '  ' + line)
            .join('\n'),
        );
      } else {
        // Regular text content
        console.log(content);
      }

      console.log('='.repeat(50) + '\n');

      return content;
    } catch (error) {
      if (retries < MAX_RETRIES) {
        retries++;
        console.warn(
          `API error, retrying (${retries}/${MAX_RETRIES}): ${error.message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
      } else {
        console.error('Error calling OpenAI API after retries:', error.message);
        throw error;
      }
    }
  }
}

// Extract CLDF grammar features
async function extractCLDF(chunk) {
  // Few-shot examples to improve extraction quality
  const examples = [
    {
      user: '3.2.3 Case system\n\nKuku Yalanji has an ergative-absolutive case marking system. The ergative case can be optional in certain contexts. There are 9 morphological cases in total.',
      assistant:
        'ID,Parameter_ID,Language_ID,Value,Source\ncase-system-type,ergative-absolutive,gvn,present,§3.2.3\nergative-case-optionality,ergative-optional,gvn,true,§3.2.3\nmorphological-case-count,case-count,gvn,9,§3.2.3',
    },
  ];

  const systemPrompt = `
You are an expert computational linguist. Extract grammatical features from the text into CLDF StructureTable format.

Output ONLY a CSV with this header:
ID,Parameter_ID,Language_ID,Value,Source

Where:
- ID: unique identifier (use kebab-case)
- Parameter_ID: linguistic feature in kebab-case (e.g., "ergative-case", "noun-classes")
- Language_ID: use "gvn" for Kuku Yalanji language
- Value: the value of the feature (e.g., "optional", "yes", "no", or a more specific value)
- Source: reference to the section (e.g., "§3.2.1")

Be precise and focused. Extract ONLY grammatical features that are explicitly stated in the text.
If none are present, return ONLY the header row.
`;

  try {
    console.log(`Extracting CLDF features from: ${chunk.heading}`);
    const result = await callLLM(systemPrompt, chunk.content, 1024, examples);

    // Validate result is CSV
    if (!result.includes('ID,Parameter_ID,Language_ID,Value,Source')) {
      console.warn(
        `Invalid CLDF output for ${chunk.heading}. Using header only.`,
      );
      return 'ID,Parameter_ID,Language_ID,Value,Source\n';
    }
    
    // Clean up the result - strip any leading spaces from each line
    // This handles cases where the LLM adds indentation to the CSV output
    const cleanedResult = result
      .split('\n')
      .map(line => line.trim())
      .join('\n');

    // Basic CSV validation
    try {
      const parsed = Papa.parse(cleanedResult, { header: true });
      if (parsed.errors.length > 0) {
        console.warn(`CSV parsing issues for ${chunk.heading}:`, parsed.errors);
      }
    } catch (parseError) {
      console.warn(
        `CSV validation failed for ${chunk.heading}:`,
        parseError.message,
      );
    }

    return cleanedResult;
  } catch (error) {
    console.error(
      `Error extracting CLDF from ${chunk.heading}:`,
      error.message,
    );
    return 'ID,Parameter_ID,Language_ID,Value,Source\n';
  }
}

// Extract interlinear glossed text examples (IGT)
async function extractIGT(chunk) {
  // Process all chunks regardless of content

  const systemPrompt = `
You are an expert computational linguist specializing in Interlinear Glossed Text (IGT).

Extract all linguistic examples from the provided content and format them as XIGT (eXtensible Interlinear Glossed Text).

For each example, identify:
1. The original transcript in the source language
2. Word-by-word or morpheme-by-morpheme glosses
3. The free translation in English
4. The source reference (section number, page, etc.)

Return a JSON object with this structure:
{
  "items": [
    {
      "transcript": "Original text in source language",
      "gloss": ["Word1", "Word2", "Word3"],
      "translation": "English translation",
      "source": "Section reference"
    }
  ]
}

If no examples are found, return {"items": []}.
`;

  const examples = [
    {
      role: 'user',
      content: 'Extract IGT examples from: "In example (1), we see the ergative case marker -ngku: Bama-ngku bubu nyajil. (person-ERG ground see) \'The person sees the ground.\'"',
    },
    {
      role: 'assistant',
      content: '```json\n{\n  "items": [\n    {\n      "transcript": "Bama-ngku bubu nyajil.",\n      "gloss": ["person-ERG", "ground", "see"],\n      "translation": "The person sees the ground.",\n      "source": "example (1)"\n    }\n  ]\n}\n```',
    },
  ];

  try {
    console.log(`Extracting IGT examples from: ${chunk.heading}`);
    const result = await callLLM(systemPrompt, chunk.content, 2048, examples);

    // Extract and parse JSON
    let jsonStr = result;
    
    // Check for markdown code blocks with json
    if (result.includes('```json')) {
      const parts = result.split('```json');
      if (parts.length > 1) {
        jsonStr = parts[1].split('```')[0].trim();
      }
    } else if (result.includes('```')) {
      const parts = result.split('```');
      if (parts.length > 1) {
        const codePart = parts[1].trim();
        if (codePart.includes('"items"')) {
          jsonStr = codePart;
        }
      }
    }
    
    // If we couldn't extract from code blocks, try to find JSON pattern
    if (!jsonStr.includes('"items"')) {
      const jsonMatch = result.match(/\{\s*"items"\s*:\s*\[.*?\]\s*\}/s);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
    }
    
    // Parse the JSON
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed.items)) {
        // Validate with schema
        try {
          const ajv = new Ajv();
          const xigtSchema = JSON.parse(
            await fs.readFile(
              path.join(__dirname, 'schemas/xigt.json'),
              'utf8',
            ),
          );
          const validateIGT = ajv.compile(xigtSchema);

          if (!validateIGT({ items: parsed.items })) {
            console.warn(
              `IGT validation failed for ${chunk.heading}:`,
              validateIGT.errors,
            );
          }
        } catch (schemaError) {
          console.warn(
            `Schema validation error for ${chunk.heading}:`,
            schemaError.message,
          );
        }
        return parsed.items;
      }
    } catch (parseError) {
      console.warn(`JSON parse failed: ${parseError.message}. Trying direct parsing...`);
      try {
        const parsed = JSON.parse(result);
        if (Array.isArray(parsed.items)) {
          return parsed.items;
        }
      } catch (directError) {
        console.warn(`Direct JSON parse also failed: ${directError.message}`);
      }
    }
    
    return [];
  } catch (error) {
    console.error(`Error extracting IGT from ${chunk.heading}:`, error.message);
    return [];
  }
}

// Extract OntoLex-Lemon lexical entries
async function extractOntoLex(chunk) {
  // Process all chunks regardless of content

  const systemPrompt = `
You are an expert computational linguist specializing in lexical resources.

Extract all lexical entries (words, morphemes, etc.) from the provided content into OntoLex-Lemon format.

For each lexical entry, identify:
1. The lemma (canonical form)
2. Part of speech
3. Definition or gloss in English
4. Any grammatical properties mentioned

Return a JSON-LD object with this structure:
{
  "@context": "https://www.w3.org/ns/lemon/ontolex.json",
  "@graph": [
    {
      "@id": "kuku_yalanji:lemma1",
      "@type": "ontolex:LexicalEntry",
      "ontolex:canonicalForm": {
        "ontolex:writtenRep": "word1"
      },
      "lexinfo:partOfSpeech": "lexinfo:Noun",
      "ontolex:sense": {
        "ontolex:definition": {
          "@language": "en",
          "@value": "English definition"
        }
      }
    }
  ]
}

If no lexical entries are found, return {"@graph": []}.
`;

  try {
    console.log(`Extracting OntoLex entries from: ${chunk.heading}`);
    const result = await callLLM(systemPrompt, chunk.content, 2048);

    // Try to parse the JSON
    try {
      // First, try to extract JSON from markdown code blocks if present
      let jsonStr = result;
      
      // Check for markdown code blocks with json
      if (result.includes('```json')) {
        const parts = result.split('```json');
        if (parts.length > 1) {
          const codePart = parts[1].split('```')[0].trim();
          jsonStr = codePart;
        }
      } 
      // Check for regular markdown code blocks
      else if (result.includes('```')) {
        const parts = result.split('```');
        if (parts.length > 1) {
          const codePart = parts[1].trim();
          if (codePart.includes('@context') && codePart.includes('@graph')) {
            jsonStr = codePart;
          }
        }
      }
      
      // If we couldn't extract from code blocks, try to find JSON pattern
      if (!jsonStr.includes('@context') || !jsonStr.includes('@graph')) {
        const jsonMatch = result.match(
          /\{\s*"@context".*?"@graph"\s*:\s*\[.*?\]\s*\}/s
        );
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }
      }
      
      // Try to parse the JSON
      try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed['@graph'])) {
          return parsed['@graph'];
        }
      } catch (innerError) {
        // If parsing fails, try to clean up the JSON string
        // Sometimes there might be extra characters or incomplete JSON
        console.warn(`Initial JSON parse failed: ${innerError.message}. Trying to clean up the JSON...`);
        
        // Try to extract just the @graph array
        const graphMatch = jsonStr.match(/"@graph"\s*:\s*\[(.*?)\]\s*\}/s);
        if (graphMatch) {
          try {
            const graphItems = JSON.parse(`[${graphMatch[1]}]`);
            return graphItems;
          } catch (graphError) {
            console.warn(`Graph extraction failed: ${graphError.message}`);
          }
        }
      }
    } catch (parseError) {
      console.warn(
        `Failed to parse OntoLex JSON from ${chunk.heading}:`,
        parseError.message,
      );
    }

    return [];
  } catch (error) {
    console.error(
      `Error extracting OntoLex from ${chunk.heading}:`,
      error.message,
    );
    return [];
  }
}

// Save results to files
async function saveResults(cldfRows, igtItems, ontolexEntries) {
  try {
    // Save CLDF CSV
    const cldfContent = cldfRows.join('\n');
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'grammar_features.csv'),
      cldfContent,
    );
    console.log(`Saved CLDF features to grammar_features.csv`);

    // Save IGT JSON
    const igtContent = JSON.stringify({ items: igtItems }, null, 2);
    await fs.writeFile(path.join(OUTPUT_DIR, 'examples.xigt.json'), igtContent);
    console.log(`Saved ${igtItems.length} IGT examples to examples.xigt.json`);

    // Save OntoLex JSON-LD
    const ontolexContent = JSON.stringify(
      {
        '@context': 'https://www.w3.org/ns/lemon/ontolex.json',
        '@graph': ontolexEntries,
      },
      null,
      2,
    );
    await fs.writeFile(path.join(OUTPUT_DIR, 'lexicon.jsonld'), ontolexContent);
    console.log(
      `Saved ${ontolexEntries.length} OntoLex entries to lexicon.jsonld`,
    );
  } catch (error) {
    console.error('Error saving results:', error.message);
    throw error;
  }
}

// Process a limited set of chunks for testing
async function processTestChunks(chunks, count = 5, startAt = 0) {
  try {
    // Always start from the beginning or specified startAt index
    let startIndex = startAt;

    console.log(
      `Processing ${count} test chunks starting from index ${startIndex}...`,
    );

    // Initialize arrays for results
    const cldfRows = ['ID,Parameter_ID,Language_ID,Value,Source'];
    const igtItems = [];
    const ontolexEntries = [];

    // Process only a specified number of chunks as a test
    const endIndex = Math.min(chunks.length, startIndex + count);
    for (let i = startIndex; i < endIndex; i++) {
      const chunk = chunks[i];
      console.log(
        `Processing test chunk ${i - startIndex + 1}/${Math.min(count, endIndex - startIndex)}: ${chunk.heading}`,
      );

      // Extract CLDF features
      const cldfResult = await extractCLDF(chunk);
      const cldfLines = cldfResult
        .split('\n')
        .filter(
          (line, index) => index > 0 && line.trim() && !line.startsWith('ID,'),
        );
      cldfRows.push(...cldfLines);

      // Extract IGT examples
      const igtResult = await extractIGT(chunk);
      if (igtResult.length > 0) {
        igtItems.push(...igtResult);
      }

      // Extract OntoLex entries
      const ontolexResult = await extractOntoLex(chunk);
      if (ontolexResult.length > 0) {
        ontolexEntries.push(...ontolexResult);
      }
    }

    // Save results with 'test_' prefix
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'test_grammar_features.csv'),
      cldfRows.join('\n'),
    );
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'test_examples.xigt.json'),
      JSON.stringify({ items: igtItems }, null, 2),
    );
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'test_lexicon.jsonld'),
      JSON.stringify(
        {
          '@context': 'https://www.w3.org/ns/lemon/ontolex.json',
          '@graph': ontolexEntries,
        },
        null,
        2,
      ),
    );

    console.log(
      `Test extraction complete! Extracted ${cldfRows.length - 1} CLDF features, ${igtItems.length} IGT examples, and ${ontolexEntries.length} OntoLex entries.`,
    );
  } catch (error) {
    console.error('Error in test processing:', error.message);
    throw error;
  }
}

// Main function
async function main() {
  try {
    console.log('Starting extraction process...');

    // Ensure schemas directory exists
    try {
      await fs.access(path.join(__dirname, 'schemas'));
    } catch (error) {
      console.log('Creating schemas directory...');
      await fs.mkdir(path.join(__dirname, 'schemas'), { recursive: true });

      // Create basic XIGT schema if it doesn't exist
      const xigtSchemaPath = path.join(__dirname, 'schemas/xigt.json');
      try {
        await fs.access(xigtSchemaPath);
      } catch (schemaError) {
        console.log('Creating basic XIGT schema...');
        const basicSchema = {
          $schema: 'http://json-schema.org/draft-07/schema#',
          type: 'object',
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['transcript', 'translation'],
                properties: {
                  transcript: { type: 'string' },
                  gloss: { type: 'array' },
                  translation: { type: 'string' },
                  source: { type: 'string' },
                },
              },
            },
          },
        };
        await fs.writeFile(
          xigtSchemaPath,
          JSON.stringify(basicSchema, null, 2),
        );
      }
    }

    // Ensure output directory exists
    await ensureOutputDir();

    // Load and chunk the markdown
    const chunks = await loadAndChunkMarkdown(GRAMMAR_PATH);

    // Process test chunks first if in development mode
    const isTestMode = process.argv.includes('--test');
    if (isTestMode) {
      // Parse number of chunks to process if specified
      let testChunkCount = 10; // Default to 10 chunks
      const countArg = process.argv.find((arg) => arg.startsWith('--chunks='));
      if (countArg) {
        testChunkCount = parseInt(countArg.split('=')[1]) || 10;
      }

      await processTestChunks(chunks, testChunkCount); // Process chunks as a test
      console.log(
        'Test mode completed. Run without --test flag for full processing.',
      );
      return;
    }

    // Initialize arrays for results
    const cldfRows = ['ID,Parameter_ID,Language_ID,Value,Source'];
    const igtItems = [];
    const ontolexEntries = [];

    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(
        `Processing chunk ${i + 1}/${chunks.length}: ${chunk.heading}`,
      );

      // Extract CLDF features
      const cldfResult = await extractCLDF(chunk);
      const cldfLines = cldfResult
        .split('\n')
        .filter(
          (line, index) => index > 0 && line.trim() && !line.startsWith('ID,'),
        );
      cldfRows.push(...cldfLines);

      // Extract IGT examples
      const igtResult = await extractIGT(chunk);
      if (igtResult.length > 0) {
        igtItems.push(...igtResult);
      }

      // Extract OntoLex entries
      const ontolexResult = await extractOntoLex(chunk);
      if (ontolexResult.length > 0) {
        ontolexEntries.push(...ontolexResult);
      }

      // Save intermediate results every 10 chunks to avoid losing progress
      if (i > 0 && i % 10 === 0) {
        console.log(`Saving intermediate results at chunk ${i}...`);
        await saveResults(
          [...cldfRows], // Make copies to avoid reference issues
          [...igtItems],
          [...ontolexEntries],
        );
      }
    }

    // Save results
    await saveResults(cldfRows, igtItems, ontolexEntries);

    console.log('Extraction complete!');
    console.log(
      `Extracted ${cldfRows.length - 1} CLDF features, ${igtItems.length} IGT examples, and ${ontolexEntries.length} OntoLex entries.`,
    );
  } catch (error) {
    console.error('Error in main process:', error.message);
    process.exit(1);
  }
}

// Run the main function
main();
