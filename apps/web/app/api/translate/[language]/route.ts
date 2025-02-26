import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import getDictionary from '@dictionaries';
import { Dictionary } from '@dictionaries';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
  You are a skilled translator specializing in ${dictionary.meta.name}, with a deep understanding of its cultural and linguistic nuances. Your goal is to accurately translate the provided text while preserving its meaning, tone, and cultural context.
  
  Context:
  - **Language**: ${dictionary.meta.name}
  - **Dictionary Reference**: 
  
  ${dictionary.words.map(word => 
    `"${word.word}": ${word.definitions ? word.definitions.join(', ') : word.definition || ''}`
  ).join('\n')}
  
  Task:
  Translate the following text:
  "${text}"
  
  Guidelines:
  1. Use entries from the provided dictionary wherever applicable to ensure accuracy and consistency.  
  2. If a word or phrase lacks a direct translation, choose the most culturally and contextually appropriate alternative based on the dictionary and your expertise.  
  3. Strive to maintain the tone, meaning, and intent of the original text.  
  4. Where ambiguity exists, prioritize conveying the intended message rather than a literal translation.
  
  Output:
  Provide the translation as a standalone text. If relevant, include brief annotations explaining significant translation choices, especially for culturally nuanced terms.
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

    // Get the dictionary for this language
    const dictionary = await getDictionary(language);
    
    if (!dictionary) {
      return NextResponse.json({ 
        success: false, 
        error: `Dictionary for language '${language}' not found` 
      }, { status: 404 });
    }

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
      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
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
          for await (const chunk of stream) {
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
        model: "gpt-4o-mini",
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
    return NextResponse.json({
      success: false,
      error: 'Translation error occurred'
    }, { status: 500 });
  }
}
