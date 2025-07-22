import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables from .env
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim();
      process.env[key.trim()] = value.startsWith('"') && value.endsWith('"') 
        ? value.slice(1, -1) 
        : value;
    }
  });
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables');
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error('Missing OpenAI API key');
}

// Use service role key for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface WordData {
  id: number;
  word: string;
  language_id: number;
  languages?: {
    name: string;
    code: string;
  };
  definitions?: Array<{
    definition: string;
  }>;
  translations?: Array<{
    translation: string;
    target_language?: {
      name: string;
    };
  }>;
}

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    
    return response.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

function createWordContext(word: WordData): string {
  // Create a comprehensive text representation of the word
  const parts: string[] = [
    `Word: ${word.word}`,
    `Language: ${word.languages?.name || 'Unknown'} (${word.languages?.code || 'unknown'})`,
  ];

  // Add definitions
  if (word.definitions && word.definitions.length > 0) {
    parts.push(`Definitions: ${word.definitions.map(d => d.definition).join('; ')}`);
  }


  // Add translations to other languages
  if (word.translations && word.translations.length > 0) {
    const translationText = word.translations.map(t => 
      `${t.target_language?.name || 'Unknown'}: ${t.translation}`
    ).join(', ');
    parts.push(`Translations: ${translationText}`);
  }

  return parts.join('\n');
}

async function processWords(batchSize: number = 50) {
  console.log('Starting embedding generation process...');
  
  let offset = 0;
  let totalProcessed = 0;
  let totalErrors = 0;

  while (true) {
    // Fetch a batch of words without embeddings
    const { data: words, error } = await supabase
      .from('words')
      .select(`
        id,
        word,
        language_id,
        languages (
          name,
          code
        ),
        definitions (
          definition
        )
      `)
      .is('embedding', null)
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('Error fetching words:', error);
      break;
    }

    if (!words || words.length === 0) {
      console.log('No more words to process');
      break;
    }

    console.log(`Processing batch: ${offset} to ${offset + words.length}`);

    // Process each word in the batch
    for (const word of words) {
      try {
        // Create comprehensive context for the word
        const context = createWordContext(word as WordData);
        console.log(`\nProcessing: ${word.word} (${word.languages?.name})`);
        console.log('Context:', context.substring(0, 200) + '...');

        // Generate embedding
        const embedding = await generateEmbedding(context);

        // Update the word with its embedding
        const { error: updateError } = await supabase
          .from('words')
          .update({ embedding: JSON.stringify(embedding) })
          .eq('id', word.id);

        if (updateError) {
          console.error(`Error updating word ${word.id}:`, updateError);
          totalErrors++;
        } else {
          console.log(`✓ Successfully generated embedding for: ${word.word}`);
          totalProcessed++;
        }

        // Rate limiting - OpenAI has limits on embeddings API
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay between requests
      } catch (error) {
        console.error(`Error processing word ${word.id}:`, error);
        totalErrors++;
      }
    }

    offset += batchSize;

    // Progress update
    console.log(`\n--- Progress: ${totalProcessed} processed, ${totalErrors} errors ---\n`);
  }

  console.log('\n=== Embedding generation complete ===');
  console.log(`Total processed: ${totalProcessed}`);
  console.log(`Total errors: ${totalErrors}`);
}

// Also fetch related words through translations
async function enrichWordData(wordId: number): Promise<string[]> {
  // Get words that share translations
  const { data: relatedWords } = await supabase
    .from('translations')
    .select(`
      word_id,
      target_word_id,
      source_word:words!translations_word_id_fkey (
        word,
        languages (name)
      ),
      target_word:words!translations_target_word_id_fkey (
        word,
        languages (name)
      )
    `)
    .or(`word_id.eq.${wordId},target_word_id.eq.${wordId}`)
    .limit(10);

  const related: string[] = [];
  if (relatedWords) {
    relatedWords.forEach(r => {
      if (r.source_word && r.word_id !== wordId) {
        related.push(`Related: ${r.source_word.word} (${r.source_word.languages?.name})`);
      }
      if (r.target_word && r.target_word_id !== wordId) {
        related.push(`Related: ${r.target_word.word} (${r.target_word.languages?.name})`);
      }
    });
  }

  return related;
}

// Run the script
if (require.main === module) {
  processWords()
    .then(() => {
      console.log('Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export { generateEmbedding, createWordContext };