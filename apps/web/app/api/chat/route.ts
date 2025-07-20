import { streamText, tool } from 'ai';
// @ts-expect-error - Known working implementation despite type errors
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  console.log('Chat API called');
  
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('Auth check:', { user: user?.id, authError });
    
    if (authError || !user) {
      console.error('Auth failed:', authError);
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    console.log('Request body:', { messageCount: body.messages?.length });
    
    const { messages } = body;

    // Check if OpenAI API key is set
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set in environment variables');
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }), 
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('OpenAI API key exists:', !!process.env.OPENAI_API_KEY);
    console.log('Creating stream with model: gpt-4o-mini');

    const result = await streamText({
      model: openai('gpt-4o-mini'),
      messages,
      system: `You are a helpful language learning assistant for a dictionary app. 
    You can help users learn vocabulary, translate words, check their progress, and provide language learning tips.
    The app currently supports multiple languages including Yupik and others.
    Be encouraging and helpful in the user's language learning journey.`,
    tools: {
      translateWord: tool({
        description: 'Translate a word across multiple languages',
        parameters: z.object({
          word: z.string().describe('The word to translate'),
          targetLanguages: z.array(z.string()).describe('Target language codes, or all if not specified').optional(),
        }),
        // @ts-ignore - execute function is valid in Vercel AI SDK
        execute: async ({ word, targetLanguages }) => {
          try {
            console.log('Executing translateWord tool for:', word);
            
            // Fetch translations from the database
            const { data: translations, error } = await supabase
              .from('words')
              .select(`
                word,
                language:languages(code, name),
                definitions(definition)
              `)
              .ilike('word', word)
              .limit(10);

            if (error) {
              console.error('Database error in translateWord:', error);
              return {
                word,
                translations: [{
                  language: 'Error',
                  translation: 'Database error occurred',
                  languageCode: 'error'
                }]
              };
            }

            if (!translations || translations.length === 0) {
              return {
                word,
                translations: [{
                  language: 'Not found',
                  translation: 'No translations found in the database',
                  languageCode: 'unknown'
                }]
              };
            }

            return {
              word,
              translations: translations.map(t => ({
                language: t.language?.name || 'Unknown',
                translation: t.definitions?.[0]?.definition || 'No definition available',
                languageCode: t.language?.code || 'unknown'
              }))
            };
          } catch (error) {
            console.error('Error in translateWord tool:', error);
            return {
              word,
              translations: [{
                language: 'Error',
                translation: 'An error occurred',
                languageCode: 'error'
              }]
            };
          }
        },
      }),
      
      getWordSuggestions: tool({
        description: 'Get word suggestions for learning based on a language or topic',
        parameters: z.object({
          languageCode: z.string().describe('Language code to get words from').optional(),
          topic: z.string().describe('Topic or category of words').optional(),
          count: z.number().describe('Number of suggestions').default(5),
        }),
        // @ts-ignore - execute function is valid in Vercel AI SDK
        execute: async ({ languageCode, topic, count = 5 }) => {
          try {
            console.log('Executing getWordSuggestions tool:', { languageCode, topic, count });
            
            let query = supabase
              .from('words')
              .select(`
                word,
                language:languages(code, name),
                definitions(definition)
              `)
              .limit(count);

            if (languageCode) {
              const { data: language } = await supabase
                .from('languages')
                .select('id')
                .eq('code', languageCode)
                .single();
              
              if (language) {
                query = query.eq('language_id', language.id);
              }
            }

            const { data: words, error } = await query;

            if (error) {
              console.error('Database error in getWordSuggestions:', error);
              return [{
                word: 'Error',
                meaning: 'Database error occurred',
                language: 'Error',
                languageCode: 'error'
              }];
            }

            if (!words || words.length === 0) {
              return [{
                word: 'No suggestions',
                meaning: 'No words found for the specified criteria',
                language: 'N/A',
                languageCode: 'unknown'
              }];
            }

            return words.map(w => ({
              word: w.word || 'Unknown',
              meaning: w.definitions?.[0]?.definition || 'No definition available',
              language: w.language?.name || 'Unknown',
              languageCode: w.language?.code || 'unknown'
            }));
          } catch (error) {
            console.error('Error in getWordSuggestions tool:', error);
            return [{
              word: 'Error',
              meaning: 'An error occurred',
              language: 'Error',
              languageCode: 'error'
            }];
          }
        },
      }),

      getUserStats: tool({
        description: 'Get the user\'s learning statistics and progress',
        parameters: z.object({
          languageCode: z.string().describe('Specific language to get stats for').optional(),
        }),
        // @ts-ignore - execute function is valid in Vercel AI SDK
        execute: async ({ languageCode }) => {
          try {
            console.log('Executing getUserStats tool:', { languageCode });
            
            // Get user stats using the database function
            const { data: statsData, error } = await supabase.rpc('get_user_stats', {
              p_user_id: user.id,
              p_language_code: languageCode || null
            });

            if (error) {
              console.error('Database error in getUserStats:', error);
              return {
                totalWords: 0,
                masteredWords: 0,
                accuracy: 0,
                languages: []
              };
            }

            if (!statsData) {
              return {
                totalWords: 0,
                masteredWords: 0,
                accuracy: 0,
                languages: []
              };
            }

            const stats = statsData as any;
            
            return {
              totalWords: stats.overall?.totalWords || 0,
              masteredWords: stats.overall?.masteredWords || 0,
              accuracy: Math.round(stats.overall?.accuracy || 0),
              languages: (stats.languages || []).map((lang: any) => ({
                name: lang.name || 'Unknown',
                code: lang.code || 'unknown',
                progress: lang.totalWords > 0 ? Math.round((lang.mastered / lang.totalWords) * 100) : 0,
                mastered: lang.mastered || 0,
                total: lang.totalWords || 0
              }))
            };
          } catch (error) {
            console.error('Error in getUserStats tool:', error);
            return {
              totalWords: 0,
              masteredWords: 0,
              accuracy: 0,
              languages: []
            };
          }
        },
      }),
    },
    maxSteps: 5,
    // @ts-expect-error - toolCallStreaming is valid but not in types
    toolCallStreaming: true,
  });

  console.log('Stream created successfully');
  return result.toDataStreamResponse({
    getErrorMessage: (error) => error?.message || 'Something went wrong',
  });
  
  } catch (error) {
    console.error('Chat API error:', error);
    console.error('Error details:', {
      name: (error as any)?.name,
      message: (error as any)?.message,
      stack: (error as any)?.stack
    });
    
    return new Response(
      JSON.stringify({ 
        error: (error as Error)?.message || 'Something went wrong' 
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}