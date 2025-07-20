import { streamText, tool } from 'ai';
// @ts-expect-error - Known working implementation despite type errors
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { AnalyzeImageToolSchema, ImageAnalysisSchema } from '@/lib/tools/image-analysis';

export async function POST(req: Request) {
  console.log('[DEBUG] Chat API POST called');
  
  try {
    const supabase = createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('[DEBUG] Auth check:', { user: user?.id, authError });
    
    if (authError || !user) {
      console.error('[DEBUG] Auth failed:', authError);
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    console.log('[DEBUG] Request body:', { 
      messageCount: body.messages?.length,
      hasMessages: !!body.messages,
      lastMessage: body.messages?.[body.messages.length - 1]
    });
    
    // Log if last message has attachments
    const lastMessage = body.messages?.[body.messages.length - 1];
    if (lastMessage) {
      const attachments = lastMessage.attachments || lastMessage.experimental_attachments;
      console.log('[DEBUG] Last message details:', {
        role: lastMessage.role,
        content: lastMessage.content?.substring(0, 100) + '...',
        hasAttachments: !!attachments,
        attachmentCount: attachments?.length || 0,
        attachments: attachments?.map((a: any) => ({
          name: a.name,
          contentType: a.contentType,
          url: a.url?.substring(0, 50) + '...'
        }))
      });
      
      // If there are image attachments, add them to the message content for the AI
      if (attachments?.length > 0) {
        const imageAttachments = attachments.filter((a: any) => a.contentType?.startsWith('image/'));
        if (imageAttachments.length > 0) {
          console.log('[DEBUG] Found image attachments, will process them');
        }
      }
    }
    
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

    // Process messages to handle image attachments
    const processedMessages = messages.map((message: any) => {
      const attachments = message.attachments || message.experimental_attachments;
      
      if (message.role === 'user' && attachments?.length > 0) {
        const imageAttachments = attachments.filter((a: any) => a.contentType?.startsWith('image/'));
        
        if (imageAttachments.length > 0) {
          // Convert to OpenAI's expected format with image content
          const content = [
            { type: 'text', text: message.content },
            ...imageAttachments.map((img: any) => ({
              type: 'image_url',
              image_url: {
                url: img.url,
                detail: 'auto'
              }
            }))
          ];
          
          console.log('[DEBUG] Converted message with images:', {
            role: message.role,
            contentTypes: content.map(c => c.type),
            imageCount: imageAttachments.length
          });
          
          return {
            ...message,
            content
          };
        }
      }
      
      return message;
    });

    console.log('[DEBUG] OpenAI API key exists:', !!process.env.OPENAI_API_KEY);
    console.log('[DEBUG] Creating stream with model: gpt-4o-mini');
    console.log('[DEBUG] Messages being sent to OpenAI:', processedMessages.map((m: any) => ({
      role: m.role,
      contentPreview: typeof m.content === 'string' ? m.content.substring(0, 100) + '...' : 'Complex content with images',
      hasAttachments: !!(m.attachments || m.experimental_attachments),
      contentType: typeof m.content
    })));

    const result = await streamText({
      model: openai('gpt-4o-mini'),
      messages: processedMessages,
      system: `You are a helpful language learning assistant for Mob Translate, a dictionary app for Aboriginal languages. 

USER CONTEXT:
- Name: ${userContext.username}
- Learning Languages: ${userContext.languages.map(l => `${l.name} (${l.code}, ${l.accuracy}% accuracy, ${l.sessions} sessions)`).join(', ') || 'None yet'}
- Liked Words: ${userContext.likedWords.slice(0, 5).map(w => `"${w.word}" (${w.language})`).join(', ')}${userContext.likedWords.length > 5 ? ` and ${userContext.likedWords.length - 5} more` : ''}
- Mastered Words: ${userContext.masteredWords.slice(0, 5).map(w => `"${w.word}" (${w.language})`).join(', ')}${userContext.masteredWords.length > 5 ? ` and ${userContext.masteredWords.length - 5} more` : ''}
- Recent Practice: ${userContext.recentWords.slice(0, 5).map(w => `"${w.word}" (${w.language}, ${w.correct ? '✓' : '✗'})`).join(', ')}

Use this context to personalize your responses. Reference their specific progress, congratulate them on mastered words, suggest practicing words they struggled with, and recommend new words based on their liked words and learning languages.

You can help users learn vocabulary, translate words, check their progress, and provide language learning tips.
Be encouraging and supportive, acknowledging their specific achievements and progress.

IMPORTANT: When a message contains an image attachment:
1. First, carefully identify ALL specific objects visible in the image (e.g., "chicken", "salad", "vegetables", "plate", "orange", etc.)
2. Then immediately use the analyzeImage tool with a detailed description that lists each specific object
3. By default, translate to the user's learning languages (${userContext.languages.map(l => l.name).join(', ') || 'all available languages'})
4. If the user mentions a specific language (like "in Yalanji"), pass it in the userRequestedLanguage parameter to override the default
5. The analyzeImage tool will automatically use the user's learning languages if no language is specified
6. Focus on translating the actual objects you can see, not general descriptions
7. Example tool calls:
   - Default (uses user's languages): analyzeImage({ description: "I see chicken, vegetables, salad, plate, orange" })
   - Specific language: analyzeImage({ description: "I see chicken, vegetables, salad, plate, orange", userRequestedLanguage: "Yalanji" })`,
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
        description: 'Analyze an image to detect objects and translate them to Aboriginal languages. Automatically uses the user\'s learning languages unless a specific language is requested. This tool is automatically triggered when a user sends an image.',
        parameters: z.object({
          description: z.string().describe('The description listing ALL specific objects visible in the image'),
          languages: z.array(z.string()).optional().describe('Specific language codes to translate to (defaults to user\'s learning languages)'),
          includeContext: z.boolean().default(true).describe('Include cultural context'),
          userRequestedLanguage: z.string().optional().describe('Language name mentioned by the user (e.g., "Yalanji") - overrides default languages')
        }),
        // @ts-ignore - execute function is valid in Vercel AI SDK
        execute: async ({ description, languages, includeContext = true, userRequestedLanguage }) => {
          try {
            console.log('[DEBUG] analyzeImage tool called with:', { description, languages, includeContext, userRequestedLanguage });
            
            // Parse the description to extract key objects mentioned
            const detectedItems: string[] = [];
            
            // Common food items
            const foodItems = ['chicken', 'beef', 'fish', 'rice', 'bread', 'salad', 'vegetables', 'fruit', 'meat', 'egg', 'cheese', 'soup', 'sandwich'];
            // Common objects
            const commonObjects = ['plate', 'bowl', 'cup', 'fork', 'knife', 'spoon', 'table', 'chair', 'glass'];
            // Nature items
            const natureItems = ['tree', 'water', 'sky', 'sun', 'mountain', 'river', 'rock', 'grass', 'flower', 'cloud'];
            // Specific vegetables/fruits
            const produceItems = ['lettuce', 'tomato', 'onion', 'carrot', 'potato', 'orange', 'apple', 'banana', 'lemon'];
            
            // Combine all possible objects
            const allObjects = [...foodItems, ...commonObjects, ...natureItems, ...produceItems];
            
            // Find objects mentioned in the description
            allObjects.forEach(obj => {
              if (description.toLowerCase().includes(obj)) {
                detectedItems.push(obj);
              }
            });
            
            // Also extract any quoted items or items after "see" or "contains"
            const quotedItems = description.match(/"([^"]+)"/g) || [];
            quotedItems.forEach(item => {
              detectedItems.push(item.replace(/"/g, '').toLowerCase());
            });
            
            // Extract items from patterns like "I see X, Y, and Z"
            const seePattern = /(?:see|contains?|includes?|shows?|displays?|features?)\s+(?:a |an |the )?([^,.]+(?:,\s*[^,.]+)*)/gi;
            const matches = description.matchAll(seePattern);
            for (const match of matches) {
              const items = match[1].split(/,\s*|\s+and\s+/);
              items.forEach(item => {
                const cleaned = item.trim().toLowerCase().replace(/^(a|an|the)\s+/, '');
                if (cleaned && !detectedItems.includes(cleaned)) {
                  detectedItems.push(cleaned);
                }
              });
            }


            console.log('[DEBUG] Detected items from description:', detectedItems);

            // Determine which languages to use
            let targetLanguages = languages || [];
            
            // DEFAULT: Always use user's learning languages if no specific languages provided
            if (targetLanguages.length === 0 && userContext.languages.length > 0) {
              // Use ALL of user's learning languages, prioritized by accuracy
              targetLanguages = userContext.languages
                .sort((a, b) => b.accuracy - a.accuracy)
                .map(l => l.code);
              console.log('[DEBUG] Using ALL user\'s learning languages:', targetLanguages);
            }
            
            // If still no languages, check if user requested a specific language
            if (targetLanguages.length === 0 && userRequestedLanguage) {
              // Get the language code for this language
              const { data: langData } = await supabase
                .from('languages')
                .select('code')
                .ilike('name', `%${userRequestedLanguage}%`)
                .single();
              
              if (langData) {
                targetLanguages = [langData.code];
                console.log('[DEBUG] Using user requested language:', userRequestedLanguage, 'code:', langData.code);
              }
            }
            
            // If still no languages, check if description mentions a specific language
            if (targetLanguages.length === 0) {
              const languageNames = ['yalanji', 'yupik', 'inuktitut', 'ojibwe', 'cree', 'navajo'];
              for (const lang of languageNames) {
                if (description.toLowerCase().includes(lang)) {
                  // Get the language code for this language
                  const { data: langData } = await supabase
                    .from('languages')
                    .select('code')
                    .ilike('name', `%${lang}%`)
                    .single();
                  
                  if (langData) {
                    targetLanguages = [langData.code];
                    console.log('[DEBUG] Found language in description:', lang, 'code:', langData.code);
                    break;
                  }
                }
              }
            }
            
            // If STILL no languages (user has no learning history), show translations from multiple languages
            if (targetLanguages.length === 0) {
              console.log('[DEBUG] No target languages specified, will show all available translations');
              // Don't filter by language - show all available translations
            }

            // Fetch translations for detected objects
            const translationPromises = detectedItems.map(async (item) => {
              let query = supabase
                .from('words')
                .select(`
                  word,
                  language_id,
                  languages(code, name),
                  definitions(definition)
                `)
                .ilike('word', item);

              // Filter by target languages if specified
              if (targetLanguages.length > 0) {
                const { data: langIds } = await supabase
                  .from('languages')
                  .select('id')
                  .in('code', targetLanguages);
                
                if (langIds && langIds.length > 0) {
                  query = query.in('language_id', langIds.map(l => l.id));
                }
              }

              const { data: translations } = await query.limit(10);

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
            let languageNote = '';
            if (userRequestedLanguage) {
              languageNote = `Showing translations in ${userRequestedLanguage}`;
            } else if (targetLanguages.length > 0) {
              const langNames = userContext.languages
                .filter(l => targetLanguages.includes(l.code))
                .map(l => l.name);
              languageNote = `Showing translations in your learning languages: ${langNames.join(', ')}`;
            } else {
              languageNote = 'Showing translations from all available Aboriginal languages';
            }
            
            const result = {
              imageDescription: `${description || 'Image analyzed successfully'}. ${languageNote}`,
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

  console.log('[DEBUG] Stream created successfully');
  const response = result.toDataStreamResponse({
    getErrorMessage: (error) => error?.message || 'Something went wrong',
  });
  console.log('[DEBUG] Returning response');
  return response;
  
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