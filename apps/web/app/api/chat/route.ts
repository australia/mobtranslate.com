import { streamText, tool } from 'ai';
// @ts-expect-error - Known working implementation despite type errors
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { AnalyzeImageToolSchema, ImageAnalysisSchema } from '@/lib/tools/image-analysis';

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

    // Fetch comprehensive user context
    console.log('Fetching user context...');
    
    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, display_name')
      .eq('id', user.id)
      .single();
    
    // Get user's learning languages
    const { data: sessions } = await supabase
      .from('quiz_sessions')
      .select(`
        language_id,
        total_questions,
        correct_answers,
        languages(id, name, code)
      `)
      .eq('user_id', user.id)
      .not('completed_at', 'is', null);
    
    // Get unique languages and calculate stats
    const languageStats = new Map();
    sessions?.forEach(session => {
      if (session.languages) {
        const langId = session.language_id;
        const existing = languageStats.get(langId) || {
          name: session.languages.name,
          code: session.languages.code,
          totalQuestions: 0,
          correctAnswers: 0,
          sessions: 0
        };
        
        languageStats.set(langId, {
          ...existing,
          totalQuestions: existing.totalQuestions + (session.total_questions || 0),
          correctAnswers: existing.correctAnswers + (session.correct_answers || 0),
          sessions: existing.sessions + 1
        });
      }
    });
    
    // Get liked words
    const { data: likedWords } = await supabase
      .from('likes')
      .select(`
        words(
          id,
          word,
          languages(name, code)
        )
      `)
      .eq('user_id', user.id)
      .limit(20);
    
    // Get recently learned words
    const { data: recentWords } = await supabase
      .from('word_attempts')
      .select(`
        words(
          id,
          word,
          languages(name, code)
        ),
        is_correct,
        created_at
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    
    // Get spaced repetition states
    const { data: wordStates } = await supabase
      .from('spaced_repetition_states')
      .select(`
        bucket,
        words(
          word,
          languages(name, code)
        )
      `)
      .eq('user_id', user.id)
      .gte('bucket', 4); // Words that are well-learned
    
    // Build context string
    const userContext = {
      username: profile?.display_name || profile?.username || 'User',
      languages: Array.from(languageStats.values()).map(lang => ({
        name: lang.name,
        code: lang.code,
        accuracy: lang.totalQuestions > 0 ? Math.round((lang.correctAnswers / lang.totalQuestions) * 100) : 0,
        sessions: lang.sessions
      })),
      likedWords: likedWords?.map(l => ({
        word: l.words?.word,
        language: l.words?.languages?.name
      })).filter(w => w.word) || [],
      masteredWords: wordStates?.filter(w => w.bucket >= 5).map(w => ({
        word: w.words?.word,
        language: w.words?.languages?.name
      })).filter(w => w.word) || [],
      recentWords: [...new Map(recentWords?.map(r => [
        `${r.words?.word}-${r.words?.languages?.code}`,
        {
          word: r.words?.word,
          language: r.words?.languages?.name,
          correct: r.is_correct
        }
      ]) || []).values()].slice(0, 10)
    };

    console.log('User context loaded:', {
      username: userContext.username,
      languageCount: userContext.languages.length,
      likedWordsCount: userContext.likedWords.length,
      masteredWordsCount: userContext.masteredWords.length
    });

    console.log('OpenAI API key exists:', !!process.env.OPENAI_API_KEY);
    console.log('Creating stream with model: gpt-4o-mini');

    const result = await streamText({
      model: openai('gpt-4o-mini'),
      messages,
      system: `You are a helpful language learning assistant for Mob Translate, a dictionary app for Aboriginal languages. 

USER CONTEXT:
- Name: ${userContext.username}
- Learning Languages: ${userContext.languages.map(l => `${l.name} (${l.accuracy}% accuracy, ${l.sessions} sessions)`).join(', ') || 'None yet'}
- Liked Words: ${userContext.likedWords.slice(0, 5).map(w => `"${w.word}" (${w.language})`).join(', ')}${userContext.likedWords.length > 5 ? ` and ${userContext.likedWords.length - 5} more` : ''}
- Mastered Words: ${userContext.masteredWords.slice(0, 5).map(w => `"${w.word}" (${w.language})`).join(', ')}${userContext.masteredWords.length > 5 ? ` and ${userContext.masteredWords.length - 5} more` : ''}
- Recent Practice: ${userContext.recentWords.slice(0, 5).map(w => `"${w.word}" (${w.language}, ${w.correct ? '✓' : '✗'})`).join(', ')}

Use this context to personalize your responses. Reference their specific progress, congratulate them on mastered words, suggest practicing words they struggled with, and recommend new words based on their liked words and learning languages.

You can help users learn vocabulary, translate words, check their progress, and provide language learning tips.
Be encouraging and supportive, acknowledging their specific achievements and progress.

IMPORTANT: When a message contains an image attachment:
1. First, describe what you see in the image
2. Then use the analyzeImage tool with that description to find Aboriginal translations for objects in the image
3. The analyzeImage tool will return translations from the dictionary for the objects detected`,
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

      getUserLikedWords: tool({
        description: 'Get the words that the user has liked/favorited',
        parameters: z.object({
          languageCode: z.string().describe('Filter by specific language code').optional(),
          limit: z.number().describe('Maximum number of words to return').default(20),
        }),
        // @ts-ignore - execute function is valid in Vercel AI SDK
        execute: async ({ languageCode, limit = 20 }) => {
          try {
            console.log('Executing getUserLikedWords tool:', { languageCode, limit });
            
            let query = supabase
              .from('likes')
              .select(`
                created_at,
                words(
                  id,
                  word,
                  languages(name, code),
                  definitions(definition)
                )
              `)
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(limit);

            const { data: likedWords, error } = await query;

            if (error) {
              console.error('Database error in getUserLikedWords:', error);
              return {
                likedWords: [],
                totalCount: 0
              };
            }

            const filteredWords = languageCode 
              ? likedWords?.filter(l => l.words?.languages?.code === languageCode) || []
              : likedWords || [];

            return {
              likedWords: filteredWords.map(l => ({
                word: l.words?.word || 'Unknown',
                language: l.words?.languages?.name || 'Unknown',
                languageCode: l.words?.languages?.code || 'unknown',
                definition: l.words?.definitions?.[0]?.definition || 'No definition available',
                likedAt: l.created_at
              })),
              totalCount: filteredWords.length
            };
          } catch (error) {
            console.error('Error in getUserLikedWords tool:', error);
            return {
              likedWords: [],
              totalCount: 0
            };
          }
        },
      }),

      analyzeImage: tool({
        description: 'Analyze an image to detect objects and translate them to Aboriginal languages. This tool is automatically triggered when a user sends an image.',
        parameters: z.object({
          description: z.string().describe('The description of what should be analyzed in the image'),
          languages: z.array(z.string()).optional().describe('Specific language codes to translate to'),
          includeContext: z.boolean().default(true).describe('Include cultural context'),
        }),
        // @ts-ignore - execute function is valid in Vercel AI SDK
        execute: async ({ description, languages, includeContext = true }) => {
          try {
            console.log('Executing analyzeImage tool with description:', description);
            
            // Parse the description to extract key objects mentioned
            const commonObjects = ['dog', 'tree', 'water', 'sky', 'person', 'house', 'bird', 'fish', 'sun', 'mountain', 'car', 'food', 'animal', 'plant', 'building', 'landscape'];
            const detectedItems = commonObjects.filter(obj => 
              description.toLowerCase().includes(obj)
            );
            
            // If no specific objects found, extract from description
            if (detectedItems.length === 0) {
              const nouns = description.match(/\b(?:a|an|the)\s+(\w+)/gi) || [];
              detectedItems.push(...nouns.map(match => 
                match.replace(/^(?:a|an|the)\s+/i, '').toLowerCase()
              ));
            }


            console.log('Detected items:', detectedItems);

            // Fetch translations for detected objects
            const translationPromises = detectedItems.map(async (item) => {
              const { data: translations } = await supabase
                .from('words')
                .select(`
                  word,
                  languages(code, name),
                  definitions(definition)
                `)
                .ilike('word', item)
                .limit(10);

              return {
                object: item,
                confidence: 0.8, // Simplified confidence
                translations: translations?.map(t => ({
                  language: t.languages?.name || 'Unknown',
                  languageCode: t.languages?.code || 'unknown',
                  word: t.word,
                  definition: t.definitions?.[0]?.definition,
                  culturalContext: includeContext ? `The word "${t.word}" in ${t.languages?.name} reflects the cultural importance of ${item} in Aboriginal communities.` : undefined
                })) || []
              };
            });

            const detectedObjects = await Promise.all(translationPromises);

            // Get related words based on the user's liked words
            const relatedWords = [];
            if (userContext.likedWords.length > 0) {
              const likedCategories = new Set(userContext.likedWords.map(w => w.word.toLowerCase()));
              const natureWords = ['tree', 'water', 'sky', 'earth', 'wind'];
              const animalWords = ['dog', 'bird', 'fish', 'kangaroo', 'snake'];
              
              if (detectedItems.some(item => natureWords.includes(item))) {
                relatedWords.push({
                  word: 'nature',
                  language: 'Concept',
                  reason: 'Related to natural elements in the image'
                });
              }
              
              if (detectedItems.some(item => animalWords.includes(item))) {
                relatedWords.push({
                  word: 'animals',
                  language: 'Concept',
                  reason: 'Related to animals detected in the image'
                });
              }
            }

            // Build comprehensive response
            const result = {
              imageDescription: description || 'Image analyzed successfully',
              detectedObjects: detectedObjects.filter(obj => obj.translations.length > 0),
              culturalInsights: includeContext ? 
                'Aboriginal languages often have deep connections to the land and nature. Many words for natural objects carry cultural significance and traditional knowledge.' : 
                undefined,
              learningTips: [
                'Practice these words by finding similar objects in your environment',
                'Create visual associations between the objects and their Aboriginal names',
                'Learn the cultural stories associated with these words'
              ],
              relatedWords: relatedWords.length > 0 ? relatedWords : undefined
            };

            // Validate against schema
            const validated = ImageAnalysisSchema.parse(result);
            
            return {
              success: true,
              analysis: validated
            };
            
          } catch (error) {
            console.error('Error in analyzeImage tool:', error);
            return {
              success: false,
              error: 'Failed to analyze image',
              details: error instanceof Error ? error.message : 'Unknown error'
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