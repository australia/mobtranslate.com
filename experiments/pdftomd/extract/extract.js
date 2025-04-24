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
const PROCESSED_CHUNKS_FILE = path.join(OUTPUT_DIR, 'processed_chunks.json');

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
  dummyMaxTokens,
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

  // const maxTokens = 40048;
  const maxTokens = 12048;
  while (true) {
    try {
      console.log(`Calling LLM with ${messages.length} messages...`);

      // // Log the system prompt and a sample of the user content
      // console.log('\n===== SYSTEM PROMPT =====');
      // console.log(systemPrompt + '...');
      // console.log('\n===== USER CONTENT SAMPLE =====');
      // console.log(userContent + '...');
      // console.log('\n===== END PROMPTS =====');

      const response = await openai.chat.completions.create({
        model: 'o3-mini',
        // model: process.env.MODEL || DEFAULT_MODEL,
        // temperature: 0.2,
        messages: messages,
        // max_available_tokens: maxTokens,
        // max_tokens: maxTokens,
        max_completion_tokens: maxTokens,
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
    const result = await callLLM(systemPrompt, chunk.content, 20000, examples);

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
      .map((line) => line.trim())
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

  // Few-shot examples to improve extraction quality
  const examples = [
    {
      user: "Example (12):\nNyulu jalbu-ngku karrkay kawa-ny\n3SG.NOM woman-ERG child.ABS look.after-PAST\n'The woman looked after the child.'\n\nThis shows ergative case marking on the agent.",
      assistant:
        '{"items":[{"transcript":"Nyulu jalbu-ngku karrkay kawa-ny","gloss":[{"morpheme":"nyulu","gloss":"3SG.NOM"},{"morpheme":"jalbu-ngku","gloss":"woman-ERG"},{"morpheme":"karrkay","gloss":"child.ABS"},{"morpheme":"kawa-ny","gloss":"look.after-PAST"}],"translation":"The woman looked after the child.","source":"Example (12)"}]}',
    },
    {
      user: 'No examples of interlinear glossed text in this section.',
      assistant: '{"items":[]}',
    },
  ];

  const systemPrompt = `
You are an expert computational linguist specializing in interlinear glossed text (IGT).

Identify all examples of interlinear glossed text in the provided content. These might appear as:
1. Numbered examples (e.g., "Example (12):" or just "(12)") with language text, morpheme-by-morpheme glosses, and translations
2. Text marked with "KY:" or "Kuku Yalanji:" followed by glosses and translations

For each example, extract:
1. transcript: The original Kuku Yalanji text
2. gloss: An array of objects with "morpheme" and "gloss" for each morpheme
3. translation: The English translation
4. source: Reference to the section (e.g., "§3.2.1" or the example number)

IMPORTANT: Your entire response must be ONLY a valid JSON object with no additional text, comments, or characters before or after. The JSON must follow this exact structure:
{
  "items": [
    {
      "transcript": "Original text in Kuku Yalanji",
      "gloss": [
        {"morpheme": "word1", "gloss": "GLOSS1"},
        {"morpheme": "word2", "gloss": "GLOSS2"}
      ],
      "translation": "English translation",
      "source": "§X.Y.Z"
    }
  ]
}

Be precise in separating morphemes and their glosses. If no examples are found, return exactly {"items":[]} with no additional characters or text.

Do not include any explanation, markdown formatting, or extra characters in your response - ONLY the JSON object.
`;

  try {
    console.log(`Extracting IGT examples from: ${chunk.heading}`);

    // Log a sample of the chunk content to see if it contains IGT examples
    console.log('\n===== CHUNK CONTENT SAMPLE =====');
    console.log(chunk.content.substring(0, 300) + '...');
    console.log(`Content length: ${chunk.content.length} characters`);

    const result = await callLLM(systemPrompt, chunk.content, 20048, examples);

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

      // Try to parse the JSON
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
          const validate = ajv.compile(xigtSchema);
          const valid = validate(parsed);
          if (!valid) {
            console.warn(
              `IGT validation failed for ${chunk.heading}:`,
              validate.errors,
            );
          }
        } catch (schemaError) {
          console.warn(
            `Error validating IGT schema for ${chunk.heading}:`,
            schemaError.message,
          );
        }

        return parsed.items;
      }
    } catch (parseError) {
      console.warn(
        `JSON parse failed: ${parseError.message}. Trying direct parsing...`,
      );
      try {
        // Try to clean the entire result and find a valid JSON object
        const jsonMatches = result.match(
          /\{[\s\S]*?"items"[\s\S]*?\}\s*(?:[^\s{}[\]]*)?$/g,
        );
        if (jsonMatches && jsonMatches.length > 0) {
          // Clean up any trailing characters after the JSON
          let cleanJson = jsonMatches[0].replace(/}\s*[^\s{}[\]]*$/g, '}');
          const parsed = JSON.parse(cleanJson);
          if (Array.isArray(parsed.items)) {
            console.log('Successfully parsed JSON after cleanup');
            return parsed.items;
          }
        }

        // If we still can't find a valid JSON, try parsing the original result
        const parsed = JSON.parse(result);
        if (Array.isArray(parsed.items)) {
          return parsed.items;
        }
      } catch (directError) {
        console.warn(`Direct JSON parse also failed: ${directError.message}`);

        // Last resort: try to manually fix common issues
        try {
          // Check if there's a trailing character like '}}}' that needs to be fixed
          if (result.includes('"items":[]')) {
            // If it's an empty items array, just return an empty array
            console.log('Found empty items array, returning empty result');
            return [];
          }
        } catch (e) {
          console.error('All JSON parsing attempts failed');
        }
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
    const result = await callLLM(systemPrompt, chunk.content, 20000);

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
          /\{\s*"@context".*?"@graph"\s*:\s*\[.*?\]\s*\}/s,
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
        console.warn(
          `Initial JSON parse failed: ${innerError.message}. Trying to clean up the JSON...`,
        );

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

// Ensure output files exist with proper structure
async function ensureOutputFilesExist() {
  try {
    // File paths
    const cldfPath = path.join(OUTPUT_DIR, 'grammar_features.csv');
    const igtPath = path.join(OUTPUT_DIR, 'examples.xigt.json');
    const ontolexPath = path.join(OUTPUT_DIR, 'lexicon.jsonld');

    // Check if CLDF CSV file exists, create with header if not
    try {
      await fs.access(cldfPath);
      console.log(`Grammar features file exists: ${cldfPath}`);
    } catch (error) {
      await fs.writeFile(cldfPath, 'ID,Parameter_ID,Language_ID,Value,Source\n');
      console.log(`Created grammar_features.csv with header`);
    }

    // Check if IGT JSON file exists, create empty structure if not
    try {
      await fs.access(igtPath);
      console.log(`IGT examples file exists: ${igtPath}`);
    } catch (error) {
      await fs.writeFile(igtPath, JSON.stringify({ items: [] }, null, 2));
      console.log(`Created examples.xigt.json with empty structure`);
    }

    // Check if OntoLex JSON-LD file exists, create empty structure if not
    try {
      await fs.access(ontolexPath);
      console.log(`Lexicon file exists: ${ontolexPath}`);
    } catch (error) {
      await fs.writeFile(
        ontolexPath,
        JSON.stringify(
          {
            '@context': 'https://www.w3.org/ns/lemon/ontolex.json',
            '@graph': [],
          },
          null,
          2,
        ),
      );
      console.log(`Created lexicon.jsonld with empty structure`);
    }
    
    // Check if processed chunks tracking file exists, create if not
    try {
      await fs.access(PROCESSED_CHUNKS_FILE);
      console.log(`Processed chunks file exists: ${PROCESSED_CHUNKS_FILE}`);
    } catch (error) {
      await fs.writeFile(PROCESSED_CHUNKS_FILE, JSON.stringify([], null, 2));
      console.log(`Created processed_chunks.json tracking file`);
    }
  } catch (error) {
    console.error('Error ensuring output files exist:', error.message);
    throw error;
  }
}

// Save results to files, appending new data
async function saveResults(cldfRows, igtItems, ontolexEntries) {
  try {
    // File paths
    const cldfPath = path.join(OUTPUT_DIR, 'grammar_features.csv');
    const igtPath = path.join(OUTPUT_DIR, 'examples.xigt.json');
    const ontolexPath = path.join(OUTPUT_DIR, 'lexicon.jsonld');

    // 1. Handle CLDF CSV (grammar_features.csv)
    try {
      // Check if file exists
      await fs.access(cldfPath);

      // Read existing content
      const existingCldfContent = await fs.readFile(cldfPath, 'utf8');
      const existingRows = existingCldfContent
        .split('\n')
        .filter((row) => row.trim());

      if (existingRows.length > 0) {
        // Extract header (first row) from existing content
        const header = existingRows[0];

        // Create a set of existing IDs to avoid duplicates
        const existingIds = new Set();
        for (let i = 1; i < existingRows.length; i++) {
          const id = existingRows[i].split(',')[0];
          existingIds.add(id);
        }

        // Filter out new rows that have duplicate IDs
        const newUniqueRows = cldfRows.slice(1).filter((row) => {
          const id = row.split(',')[0];
          return !existingIds.has(id);
        });

        // Append new unique rows to existing content
        if (newUniqueRows.length > 0) {
          const newContent =
            existingCldfContent.trim() + '\n' + newUniqueRows.join('\n');
          await fs.writeFile(cldfPath, newContent);
          console.log(
            `Appended ${newUniqueRows.length} new CLDF features to grammar_features.csv`,
          );
        } else {
          console.log('No new unique CLDF features to append');
        }
      } else {
        // File exists but is empty or invalid, write new content
        await fs.writeFile(cldfPath, cldfRows.join('\n'));
        console.log(
          `Wrote ${cldfRows.length - 1} CLDF features to grammar_features.csv`,
        );
      }
    } catch (error) {
      // File doesn't exist, write new content
      await fs.writeFile(cldfPath, cldfRows.join('\n'));
      console.log(
        `Created grammar_features.csv with ${cldfRows.length - 1} entries`,
      );
    }

    // 2. Handle IGT JSON (examples.xigt.json)
    try {
      // Check if file exists
      await fs.access(igtPath);

      // Read existing content
      const existingIgtContent = await fs.readFile(igtPath, 'utf8');
      let existingIgtData;

      try {
        existingIgtData = JSON.parse(existingIgtContent);

        if (
          existingIgtData &&
          existingIgtData.items &&
          Array.isArray(existingIgtData.items)
        ) {
          // Create a set of existing example identifiers (using transcript+translation as a composite key)
          const existingExamples = new Set();
          existingIgtData.items.forEach((item) => {
            const key = `${item.transcript}|${item.translation}`;
            existingExamples.add(key);
          });

          // Filter out duplicates from new items
          const newUniqueItems = igtItems.filter((item) => {
            const key = `${item.transcript}|${item.translation}`;
            return !existingExamples.has(key);
          });

          // Append new unique items to existing items
          if (newUniqueItems.length > 0) {
            const updatedItems = [...existingIgtData.items, ...newUniqueItems];
            await fs.writeFile(
              igtPath,
              JSON.stringify({ items: updatedItems }, null, 2),
            );
            console.log(
              `Appended ${newUniqueItems.length} new IGT examples to examples.xigt.json`,
            );
          } else {
            console.log('No new unique IGT examples to append');
          }
        } else {
          // Invalid format, write new content
          await fs.writeFile(
            igtPath,
            JSON.stringify({ items: igtItems }, null, 2),
          );
          console.log(
            `Replaced invalid examples.xigt.json with ${igtItems.length} IGT examples`,
          );
        }
      } catch (parseError) {
        // Invalid JSON, write new content
        await fs.writeFile(
          igtPath,
          JSON.stringify({ items: igtItems }, null, 2),
        );
        console.log(
          `Replaced invalid examples.xigt.json with ${igtItems.length} IGT examples`,
        );
      }
    } catch (error) {
      // File doesn't exist, write new content
      await fs.writeFile(igtPath, JSON.stringify({ items: igtItems }, null, 2));
      console.log(
        `Created examples.xigt.json with ${igtItems.length} IGT examples`,
      );
    }

    // 3. Handle OntoLex JSON-LD (lexicon.jsonld)
    try {
      // Check if file exists
      await fs.access(ontolexPath);

      // Read existing content
      const existingOntolexContent = await fs.readFile(ontolexPath, 'utf8');
      let existingOntolexData;

      try {
        existingOntolexData = JSON.parse(existingOntolexContent);

        if (
          existingOntolexData &&
          existingOntolexData['@graph'] &&
          Array.isArray(existingOntolexData['@graph'])
        ) {
          // Create a set of existing entry IDs
          const existingEntryIds = new Set();
          existingOntolexData['@graph'].forEach((entry) => {
            if (entry['@id']) {
              existingEntryIds.add(entry['@id']);
            }
          });

          // Filter out duplicates from new entries
          const newUniqueEntries = ontolexEntries.filter((entry) => {
            return entry['@id'] && !existingEntryIds.has(entry['@id']);
          });

          // Append new unique entries to existing entries
          if (newUniqueEntries.length > 0) {
            const updatedEntries = [
              ...existingOntolexData['@graph'],
              ...newUniqueEntries,
            ];
            await fs.writeFile(
              ontolexPath,
              JSON.stringify(
                {
                  '@context': 'https://www.w3.org/ns/lemon/ontolex.json',
                  '@graph': updatedEntries,
                },
                null,
                2,
              ),
            );
            console.log(
              `Appended ${newUniqueEntries.length} new OntoLex entries to lexicon.jsonld`,
            );
          } else {
            console.log('No new unique OntoLex entries to append');
          }
        } else {
          // Invalid format, write new content
          await fs.writeFile(
            ontolexPath,
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
            `Replaced invalid lexicon.jsonld with ${ontolexEntries.length} OntoLex entries`,
          );
        }
      } catch (parseError) {
        // Invalid JSON, write new content
        await fs.writeFile(
          ontolexPath,
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
          `Replaced invalid lexicon.jsonld with ${ontolexEntries.length} OntoLex entries`,
        );
      }
    } catch (error) {
      // File doesn't exist, write new content
      await fs.writeFile(
        ontolexPath,
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
        `Created lexicon.jsonld with ${ontolexEntries.length} OntoLex entries`,
      );
    }
  } catch (error) {
    console.error('Error saving results:', error.message);
    throw error;
  }
}

// Load processed chunks from tracking file
async function loadProcessedChunks() {
  try {
    await fs.access(PROCESSED_CHUNKS_FILE);
    const content = await fs.readFile(PROCESSED_CHUNKS_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    // If file doesn't exist or can't be parsed, return empty array
    console.log('No processed chunks file found or error parsing it, starting fresh');
    return [];
  }
}

// Save chunk index to processed chunks file
async function markChunkAsProcessed(chunkIndex) {
  try {
    const processedChunks = await loadProcessedChunks();
    if (!processedChunks.includes(chunkIndex)) {
      processedChunks.push(chunkIndex);
      await fs.writeFile(
        PROCESSED_CHUNKS_FILE, 
        JSON.stringify(processedChunks, null, 2)
      );
      console.log(`Marked chunk ${chunkIndex} as processed`);
    }
  } catch (error) {
    console.error(`Error marking chunk ${chunkIndex} as processed:`, error.message);
  }
}

// Process a limited set of chunks for testing
async function processTestChunks(chunks, count = 5, startAt = 0) {
  try {
    // Always start from the beginning or specified startAt index
    let startIndex = startAt;
    // Maximum number of chunks to process if we can't find IGT examples
    const maxChunksToProcess = Math.min(chunks.length, startIndex + 50); // Increased from count to 50

    console.log(
      `Processing up to ${maxChunksToProcess - startIndex} chunks starting from index ${startIndex}, looking for IGT examples...`,
    );

    // Load already processed chunks
    const processedChunks = await loadProcessedChunks();
    console.log(`Found ${processedChunks.length} previously processed chunks`);

    // Initialize arrays for results
    const cldfRows = ['ID,Parameter_ID,Language_ID,Value,Source'];
    const igtItems = [];
    const ontolexEntries = [];

    // Keep track of how many chunks we've processed
    let processedCount = 0;
    let foundIGT = false;

    // Process chunks until we find IGT examples or reach the maximum
    for (let i = startIndex; i < maxChunksToProcess; i++) {
      // Skip already processed chunks
      if (processedChunks.includes(i)) {
        console.log(`Skipping already processed chunk ${i}: ${chunks[i].heading}`);
        continue;
      }
      
      processedCount++;
      const chunk = chunks[i];
      console.log(
        `Processing test chunk ${processedCount}/${maxChunksToProcess - startIndex} (${i}/${chunks.length - 1}): ${chunk.heading}`,
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
        foundIGT = true;
        console.log(
          `Found ${igtResult.length} IGT examples in chunk: ${chunk.heading}`,
        );

        // If we've found IGT examples and processed at least the requested number of chunks, we can stop
        if (processedCount >= count) {
          console.log(
            `Found IGT examples and processed ${processedCount} chunks, stopping...`,
          );
          break;
        }
      }

      // Extract OntoLex entries
      const ontolexResult = await extractOntoLex(chunk);
      if (ontolexResult.length > 0) {
        ontolexEntries.push(...ontolexResult);
      }

      // If we've processed the requested number of chunks and haven't found IGT examples yet,
      // continue processing more chunks
      if (processedCount >= count && !foundIGT) {
        console.log(
          `Processed ${processedCount} chunks but no IGT examples found yet, continuing...`,
        );
      }

      // Save intermediate results after each chunk to ensure we're capturing data
      await saveResults([...cldfRows], [...igtItems], [...ontolexEntries]);
      
      // Mark this chunk as processed
      await markChunkAsProcessed(i);
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

    // Ensure output files exist with proper structure
    await ensureOutputFilesExist();

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

    // Check for command-line flags
    const isTestMode = process.argv.includes('--test');
    const forceReprocessAll = process.argv.includes('--force');
    if (isTestMode) {
      // Parse number of chunks to process if specified
      let testChunkCount = 10; // Default to 10 chunks
      const countArg = process.argv.find((arg) => arg.startsWith('--chunks='));
      if (countArg) {
        testChunkCount = parseInt(countArg.split('=')[1]) || 10;
      }

      // Ensure test output files exist
      const testCldfPath = path.join(OUTPUT_DIR, 'test_grammar_features.csv');
      const testIgtPath = path.join(OUTPUT_DIR, 'test_examples.xigt.json');
      const testOntolexPath = path.join(OUTPUT_DIR, 'test_lexicon.jsonld');
      
      // Check if test files exist, create them if not
      try {
        await fs.access(testCldfPath);
        console.log(`Test grammar features file exists: ${testCldfPath}`);
      } catch (error) {
        await fs.writeFile(
          testCldfPath,
          'ID,Parameter_ID,Language_ID,Value,Source\n',
        );
        console.log(`Created test_grammar_features.csv with header`);
      }
      
      try {
        await fs.access(testIgtPath);
        console.log(`Test IGT examples file exists: ${testIgtPath}`);
      } catch (error) {
        await fs.writeFile(testIgtPath, JSON.stringify({ items: [] }, null, 2));
        console.log(`Created test_examples.xigt.json with empty structure`);
      }
      
      try {
        await fs.access(testOntolexPath);
        console.log(`Test lexicon file exists: ${testOntolexPath}`);
      } catch (error) {
        await fs.writeFile(
          testOntolexPath,
          JSON.stringify(
            {
              '@context': 'https://www.w3.org/ns/lemon/ontolex.json',
              '@graph': [],
            },
            null,
            2,
          ),
        );
        console.log(`Created test_lexicon.jsonld with empty structure`);
      }
      
      console.log(`Running in test mode with ${testChunkCount} chunks...`);
      await processTestChunks(chunks, testChunkCount);
      console.log('Test mode completed. Run without --test flag for full processing.');
      return;
    }

    // Initialize arrays for results
    const cldfRows = ['ID,Parameter_ID,Language_ID,Value,Source'];
    const igtItems = [];
    const ontolexEntries = [];

    // Load already processed chunks
    const processedChunks = await loadProcessedChunks();
    console.log(`Found ${processedChunks.length} previously processed chunks`);
    
    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      // Skip already processed chunks
      if (processedChunks.includes(i)) {
        console.log(`Skipping already processed chunk ${i}: ${chunks[i].heading}`);
        continue;
      }
      
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

      // Save results after each chunk to ensure we're capturing data
      await saveResults(
        [...cldfRows], // Make copies to avoid reference issues
        [...igtItems],
        [...ontolexEntries],
      );

      // Mark this chunk as processed
      await markChunkAsProcessed(i);
      
      // Also log progress more frequently
      console.log(
        `Saved results after chunk ${i + 1}. Current totals: ${cldfRows.length - 1} CLDF features, ${igtItems.length} IGT examples, and ${ontolexEntries.length} OntoLex entries.`,
      );
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
