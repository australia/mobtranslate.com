import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { getWordsForLanguage } from '@/lib/supabase/queries';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface DictionaryMeta {
  name: string;
  description?: string;
  region?: string;
  code: string;
}

interface DictionaryWord {
  word: string;
  definition?: string;
  definitions?: string[];
}

interface Dictionary {
  meta: DictionaryMeta;
  words: DictionaryWord[];
}

/**
 * Rough estimate of token count for GPT models
 * This is an approximation; actual token count may vary
 */
function estimateTokenCount(text: string): number {
  // For English, a rough estimate is 4 characters per token
  // This is not perfect but provides a reasonable estimate
  return Math.ceil(text.length / 4);
}

/**
 * Log the token usage for monitoring
 */
function logTokenUsage(promptText: string, responseText: string = '') {
  const promptTokens = estimateTokenCount(promptText);
  const responseTokens = estimateTokenCount(responseText);
  const totalTokens = promptTokens + responseTokens;

  console.log(`[Token Usage] Estimated prompt tokens: ${promptTokens}`);
  if (responseText) {
    console.log(`[Token Usage] Estimated response tokens: ${responseTokens}`);
    console.log(`[Token Usage] Estimated total tokens: ${totalTokens}`);
  }

  return { promptTokens, responseTokens, totalTokens };
}

/**
 * Creates a translation prompt using the dictionary data
 */
const createTranslationPrompt = (text: string, dictionary: Dictionary) => {

  const neoPrompt = `
  You are a skilled translator and cultural expert specializing in ${dictionary.meta.name}, with a deep understanding of its cultural and linguistic nuances. Your goal is to respond appropriately to the user's input, whether it's a request for translation or a creative request.

  Context:
  - **Language**: ${dictionary.meta.name}
  - **Dictionary Reference**:

  ${dictionary.words.map(word =>
    `"${word.word}": ${word.definitions ? word.definitions.join(', ') : word.definition || ''}`
  ).join('\n')}

  User Input:
  "${text}"

  Guidelines:
  1. FIRST, determine if the user is requesting a translation or asking you to create something (like a poem, story, greeting, etc.).

  2. FOR TRANSLATIONS:
     - Use entries from the provided dictionary wherever applicable to ensure accuracy and consistency.
     - If a word or phrase lacks a direct translation, choose the most culturally and contextually appropriate alternative.
     - Strive to maintain the tone, meaning, and intent of the original text.
     - Where ambiguity exists, prioritize conveying the intended message rather than a literal translation.

  3. FOR CREATIVE REQUESTS (like "write me a love poem", "tell me a story", etc.):
     - Create the requested content directly in ${dictionary.meta.name}.
     - Use words from the dictionary as much as possible.
     - Include an English translation of your creation afterward.
     - Make the content culturally appropriate and respectful of ${dictionary.meta.name} traditions.
     - Format your response in markdown for readability.

  4. FOR QUESTIONS ABOUT THE LANGUAGE OR CULTURE:
     - Provide informative answers based on the dictionary and your knowledge.
     - If the dictionary doesn't contain relevant information, acknowledge the limitations.

  Output:
  For translations: Provide the translation as a standalone text in markdown format.
  For creative requests: Provide the created content in ${dictionary.meta.name} followed by an English translation, both in markdown format.
  For questions: Provide a helpful response with relevant information from the dictionary.

  ALWAYS include detailed notes after your translation or creative content that:
  1. Explain the specific word choices and their cultural significance
  2. Provide a word-by-word or phrase-by-phrase breakdown of key elements in the translation
  3. Highlight any linguistic features unique to ${dictionary.meta.name} that were used
  4. Explain any cultural context necessary to fully understand the translation
  5. Discuss any challenges in the translation process and how they were resolved
  6. If substitutions were made for words not in the dictionary, explain your reasoning

  Format these notes under a "### Translation Notes:" heading and make them detailed and educational.
  `;

  return neoPrompt;
};

/**
 * POST /api/translate/[language]
 * Translates text to the specified language using the dictionary and OpenAI
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { language: string } }
) {
  try {
    const { language } = params;
    const { text, stream = false } = await request.json();

    if (!text) {
      return NextResponse.json({
        success: false,
        error: 'No text provided for translation'
      }, { status: 400 });
    }

    // Get the dictionary for this language from Supabase
    // Fetch up to 500 words for the translation context
    const { words, language: languageData } = await getWordsForLanguage({
      language,
      limit: 500
    });

    if (!words || words.length === 0) {
      return NextResponse.json({
        success: false,
        error: `Dictionary for language '${language}' not found or empty`
      }, { status: 404 });
    }

    // Transform to dictionary format for the prompt
    const dictionary: Dictionary = {
      meta: {
        name: languageData.name,
        description: languageData.description || '',
        region: languageData.region || '',
        code: languageData.code
      },
      words: words.map(w => ({
        word: w.word,
        definition: w.definitions?.[0]?.definition,
        definitions: w.definitions?.map(d => d.definition) || []
      }))
    };

    // Create the translation prompt
    const prompt = createTranslationPrompt(text, dictionary);

    // Log the estimated token usage
    console.log(`[Translation API] Request: ${text}`);
    console.log(`[Translation API] Language: ${language}`);
    console.log(`[Translation API] Stream mode: ${stream}`);
    const tokenInfo = logTokenUsage(prompt);
    console.log(`[Translation API] Dictionary word count: ${dictionary.words.length}`);
    console.log(`[Translation API] Estimated prompt tokens: ${tokenInfo.promptTokens}`);

    // Different response handling based on stream parameter
    if (stream) {
      // Create a streaming response
      const streamResponse = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: `You are a helpful translator specializing in ${dictionary.meta.name}. Use the provided dictionary entries to ensure accurate translations while maintaining cultural context.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        stream: true,
      });

      console.log(`[Translation API] Stream created, sending response to client`);

      // Track total response content for logging
      let totalResponse = '';

      // Convert the OpenAI stream to a readable stream for the client
      const readable = new ReadableStream({
        async start(controller) {
          for await (const chunk of streamResponse) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              totalResponse += content;
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode(content));
            }
          }
          controller.close();

          // Log the estimated token usage for the complete response
          console.log(`[Translation API] Stream completed`);
          logTokenUsage(prompt, totalResponse);
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      // Non-streaming response
      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: `You are a helpful translator specializing in ${dictionary.meta.name}. Use the provided dictionary entries to ensure accurate translations while maintaining cultural context.`
          },
          {
            role: "user",
            content: prompt
          }
        ]
      });

      // Log the full completion object for debugging
      console.log(`[Translation API] Full completion object:`);
      console.log(JSON.stringify(completion, null, 2));

      const translation = completion.choices[0].message.content || '';

      // Log token usage from the actual API response if available
      if (completion.usage) {
        console.log(`[Token Usage] Actual prompt tokens: ${completion.usage.prompt_tokens}`);
        console.log(`[Token Usage] Actual completion tokens: ${completion.usage.completion_tokens}`);
        console.log(`[Token Usage] Actual total tokens: ${completion.usage.total_tokens}`);
      } else {
        // Fall back to our estimation if the API doesn't provide usage stats
        logTokenUsage(prompt, translation);
      }

      console.log(`[Translation API] Completed translation`);

      return NextResponse.json({
        success: true,
        translation,
      });
    }
  } catch (error) {
    console.error('Translation error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('not found')) {
      return NextResponse.json({
        success: false,
        error: `Dictionary for language not found`
      }, { status: 404 });
    }

    return NextResponse.json({
      success: false,
      error: 'Translation error occurred'
    }, { status: 500 });
  }
}
