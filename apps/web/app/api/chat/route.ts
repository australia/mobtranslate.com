import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { and, eq, ilike, inArray, isNotNull, gte, desc, sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import {
  languages as languagesT,
  quizSessions as quizSessionsT,
  spacedRepetitionStates as srsT,
  words as wordsT,
  definitions as definitionsT,
} from '@/lib/db/schema';
import { getSessionUser } from '@/lib/auth-helpers';
import { ImageAnalysisSchema } from '@/lib/tools/image-analysis';
import { generateEmbedding } from '../../../scripts/generate-embeddings';

// Helper: run a query that may reference a relation absent from the new DB
// (e.g. the legacy `profiles`/`likes`/`word_attempts` tables never existed).
// Supabase silently returned { data: null } for those; mirror that here.
async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

// Fetch the primary definition string for a set of word ids, keyed by word id.
async function primaryDefinitions(wordIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (wordIds.length === 0) return out;
  const defs = await db
    .select({ wordId: definitionsT.wordId, definition: definitionsT.definition })
    .from(definitionsT)
    .where(inArray(definitionsT.wordId, wordIds))
    .orderBy(desc(definitionsT.isPrimary), definitionsT.definitionNumber);
  for (const d of defs) {
    if (!out.has(d.wordId)) out.set(d.wordId, d.definition);
  }
  return out;
}

export async function POST(req: Request) {
  try {
    // Check authentication
    const user = await getSessionUser();

    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await req.json();

    // Check for image attachments in last message
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

    // Construct the OpenAI provider lazily so the build doesn't need the key.
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Fetch comprehensive user context

    // Get user profile (legacy `profiles` table — absent here, so null like before)
    const profile = await safe(async () => null as { username?: string; display_name?: string } | null);

    // Get user's learning languages (completed quiz sessions joined to languages)
    const sessions = await safe(async () => {
      const rows = await db
        .select({
          language_id: quizSessionsT.languageId,
          total_questions: quizSessionsT.totalQuestions,
          correct_answers: quizSessionsT.correctAnswers,
          lang_id: languagesT.id,
          lang_name: languagesT.name,
          lang_code: languagesT.code,
        })
        .from(quizSessionsT)
        .leftJoin(languagesT, eq(quizSessionsT.languageId, languagesT.id))
        .where(and(eq(quizSessionsT.userId, user.id), isNotNull(quizSessionsT.completedAt)));
      return rows.map(r => ({
        language_id: r.language_id,
        total_questions: r.total_questions,
        correct_answers: r.correct_answers,
        languages: r.lang_id ? { id: r.lang_id, name: r.lang_name, code: r.lang_code } : null,
      }));
    });

    // Get unique languages and calculate stats
    const languageStats = new Map();
    sessions?.forEach(session => {
      const lang = session.languages as any;
      if (lang && lang.id) {
        const langId = session.language_id;
        const existing = languageStats.get(langId) || {
          name: lang.name,
          code: lang.code,
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

    // Get liked words (legacy `likes` table — absent here, so null like before)
    const likedWords = await safe(async () => null as any[] | null);

    // Get recently learned words (legacy `word_attempts` table — absent here)
    const recentWords = await safe(async () => null as any[] | null);

    // Get spaced repetition states (well-learned words)
    const wordStates = await safe(async () => {
      const rows = await db
        .select({
          bucket: srsT.bucket,
          word: wordsT.word,
          lang_name: languagesT.name,
          lang_code: languagesT.code,
        })
        .from(srsT)
        .innerJoin(wordsT, eq(srsT.wordId, wordsT.id))
        .leftJoin(languagesT, eq(wordsT.languageId, languagesT.id))
        .where(and(eq(srsT.userId, user.id), gte(srsT.bucket, 4)));
      return rows.map(r => ({
        bucket: r.bucket,
        words: { word: r.word, languages: { name: r.lang_name, code: r.lang_code } },
      }));
    });

    // Build context string
    const userContext = {
      username: profile?.display_name || profile?.username || 'User',
      languages: Array.from(languageStats.values()).map(lang => ({
        name: lang.name,
        code: lang.code,
        accuracy: lang.totalQuestions > 0 ? Math.round((lang.correctAnswers / lang.totalQuestions) * 100) : 0,
        sessions: lang.sessions
      })),
      likedWords: likedWords?.map(l => {
        const w = l.words as any;
        return { word: w?.word, language: w?.languages?.name };
      }).filter(w => w.word) || [],
      masteredWords: wordStates?.filter(w => w.bucket >= 5).map(w => {
        const wd = w.words as any;
        return { word: wd?.word, language: wd?.languages?.name };
      }).filter(w => w.word) || [],
      recentWords: Array.from(new Map(recentWords?.map(r => {
        const rw = r.words as any;
        return [
          `${rw?.word}-${rw?.languages?.code}`,
          {
            word: rw?.word,
            language: rw?.languages?.name,
            correct: r.is_correct
          }
        ] as [string, { word: any; language: any; correct: any }];
      }) || []).values()).slice(0, 10)
    };

    // AI SDK v5+: the client sends UI messages (with parts, incl. file/image
    // parts). convertToModelMessages turns them into model messages, handling
    // image attachments without the manual image_url shaping we did under v4.
    const processedMessages = await convertToModelMessages(messages);

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
        inputSchema: z.object({
          word: z.string().describe('The word to translate'),
          targetLanguages: z.array(z.string()).describe('Target language codes, or all if not specified').optional(),
        }),
        // @ts-ignore - execute function is valid in Vercel AI SDK
        execute: async ({ word }) => {
          try {

            // Fetch translations from the database
            const raw = await db
              .select({
                id: wordsT.id,
                word: wordsT.word,
                lang_code: languagesT.code,
                lang_name: languagesT.name,
              })
              .from(wordsT)
              .leftJoin(languagesT, eq(wordsT.languageId, languagesT.id))
              .where(ilike(wordsT.word, word))
              .limit(10);
            const rows = raw.map(r => ({
              id: r.id,
              word: r.word,
              language: { code: r.lang_code, name: r.lang_name },
            }));

            if (!rows || rows.length === 0) {
              return {
                word,
                translations: [{
                  language: 'Not found',
                  translation: 'No translations found in the database',
                  languageCode: 'unknown'
                }]
              };
            }

            const defMap = await primaryDefinitions(rows.map(r => r.id));

            return {
              word,
              translations: rows.map(t => ({
                language: (t.language as any)?.name || 'Unknown',
                translation: defMap.get(t.id) || 'No definition available',
                languageCode: (t.language as any)?.code || 'unknown'
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
        inputSchema: z.object({
          languageCode: z.string().describe('Language code to get words from').optional(),
          topic: z.string().describe('Topic or category of words').optional(),
          count: z.number().describe('Number of suggestions').default(5),
        }),
        // @ts-ignore - execute function is valid in Vercel AI SDK
        execute: async ({ languageCode, count = 5 }) => {
          try {

            let languageId: string | null = null;
            if (languageCode) {
              const lang = await db
                .select({ id: languagesT.id })
                .from(languagesT)
                .where(eq(languagesT.code, languageCode))
                .limit(1);
              if (lang[0]) languageId = lang[0].id;
            }

            const wordRows = await db
              .select({
                id: wordsT.id,
                word: wordsT.word,
                lang_code: languagesT.code,
                lang_name: languagesT.name,
              })
              .from(wordsT)
              .leftJoin(languagesT, eq(wordsT.languageId, languagesT.id))
              .where(languageId ? eq(wordsT.languageId, languageId) : undefined)
              .limit(count);
            const words = wordRows.map(r => ({
              id: r.id,
              word: r.word,
              language: { code: r.lang_code, name: r.lang_name },
            }));

            if (!words || words.length === 0) {
              return [{
                word: 'No suggestions',
                meaning: 'No words found for the specified criteria',
                language: 'N/A',
                languageCode: 'unknown'
              }];
            }

            const defMap = await primaryDefinitions(words.map(w => w.id));

            return words.map(w => ({
              word: w.word || 'Unknown',
              meaning: defMap.get(w.id) || 'No definition available',
              language: (w.language as any)?.name || 'Unknown',
              languageCode: (w.language as any)?.code || 'unknown'
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
        inputSchema: z.object({
          languageCode: z.string().describe('Specific language to get stats for').optional(),
        }),
        // @ts-ignore - execute function is valid in Vercel AI SDK
        execute: async ({ languageCode }) => {
          try {

            // Get user stats using the database function
            const res: any = await db.execute(
              sql`select public.get_user_stats(${user.id}::uuid, ${languageCode || null}) as stats`
            );
            const statsRows = Array.isArray(res) ? res : res?.rows;
            const statsData = statsRows?.[0]?.stats;

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
        inputSchema: z.object({
          languageCode: z.string().describe('Filter by specific language code').optional(),
          limit: z.number().describe('Maximum number of words to return').default(20),
        }),
        // @ts-ignore - execute function is valid in Vercel AI SDK
        execute: async ({ languageCode }) => {
          try {

            // Legacy `likes` table is absent in this DB (Supabase returned null);
            // preserve the empty-result behavior.
            const likedWords: any[] | null = await safe(async () => null as any[] | null);

            const filteredWords = languageCode
              ? likedWords?.filter(l => (l.words as any)?.languages?.code === languageCode) || []
              : likedWords || [];

            return {
              likedWords: filteredWords.map(l => {
                const w = l.words as any;
                return {
                  word: w?.word || 'Unknown',
                  language: w?.languages?.name || 'Unknown',
                  languageCode: w?.languages?.code || 'unknown',
                  definition: w?.definitions?.[0]?.definition || 'No definition available',
                  likedAt: l.created_at
                };
              }),
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
        inputSchema: z.object({
          description: z.string().describe('The description listing ALL specific objects visible in the image'),
          languages: z.array(z.string()).optional().describe('Specific language codes to translate to (defaults to user\'s learning languages)'),
          includeContext: z.boolean().default(true).describe('Include cultural context'),
          userRequestedLanguage: z.string().optional().describe('Language name mentioned by the user (e.g., "Yalanji") - overrides default languages')
        }),
        // @ts-ignore - execute function is valid in Vercel AI SDK
        execute: async ({ description, languages, includeContext = true, userRequestedLanguage }) => {
          try {

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
            const quotedItems: string[] = description.match(/"([^"]+)"/g) || [];
            quotedItems.forEach((item: string) => {
              detectedItems.push(item.replace(/"/g, '').toLowerCase());
            });

            // Extract items from patterns like "I see X, Y, and Z"
            const seePattern = /(?:see|contains?|includes?|shows?|displays?|features?)\s+(?:a |an |the )?([^,.]+(?:,\s*[^,.]+)*)/gi;
            const matches = Array.from(description.matchAll(seePattern)) as RegExpMatchArray[];
            for (const match of matches) {
              const items = match[1].split(/,\s*|\s+and\s+/);
              items.forEach((item: any) => {
                const cleaned = item.trim().toLowerCase().replace(/^(a|an|the)\s+/, '');
                if (cleaned && !detectedItems.includes(cleaned)) {
                  detectedItems.push(cleaned);
                }
              });
            }


            // Determine which languages to use
            let targetLanguages = languages || [];

            // DEFAULT: Always use user's learning languages if no specific languages provided
            if (targetLanguages.length === 0 && userContext.languages.length > 0) {
              // Use ALL of user's learning languages, prioritized by accuracy
              targetLanguages = userContext.languages
                .sort((a, b) => b.accuracy - a.accuracy)
                .map(l => l.code);
            }

            // If still no languages, check if user requested a specific language
            if (targetLanguages.length === 0 && userRequestedLanguage) {
              // Get the language code for this language
              const langData = await db
                .select({ code: languagesT.code })
                .from(languagesT)
                .where(ilike(languagesT.name, `%${userRequestedLanguage}%`))
                .limit(1);

              if (langData[0]) {
                targetLanguages = [langData[0].code];
              }
            }

            // If still no languages, check if description mentions a specific language
            if (targetLanguages.length === 0) {
              const languageNames = ['yalanji', 'yupik', 'inuktitut', 'ojibwe', 'cree', 'navajo'];
              for (const lang of languageNames) {
                if (description.toLowerCase().includes(lang)) {
                  // Get the language code for this language
                  const langData = await db
                    .select({ code: languagesT.code })
                    .from(languagesT)
                    .where(ilike(languagesT.name, `%${lang}%`))
                    .limit(1);

                  if (langData[0]) {
                    targetLanguages = [langData[0].code];
                    break;
                  }
                }
              }
            }

            // If STILL no languages (user has no learning history), show translations from multiple languages
            if (targetLanguages.length === 0) {
              // Don't filter by language - show all available translations
            }

            // Resolve target language codes → ids once (used to filter words).
            let targetLanguageIds: string[] = [];
            if (targetLanguages.length > 0) {
              const langIds = await db
                .select({ id: languagesT.id })
                .from(languagesT)
                .where(inArray(languagesT.code, targetLanguages));
              targetLanguageIds = langIds.map(l => l.id);
            }

            // Fetch translations for detected objects
            const translationPromises = detectedItems.map(async (item) => {
              // First try exact match
              const conditions = [ilike(wordsT.word, item)];
              if (targetLanguageIds.length > 0) {
                conditions.push(inArray(wordsT.languageId, targetLanguageIds));
              }

              const exactRows = await db
                .select({
                  id: wordsT.id,
                  word: wordsT.word,
                  language_id: wordsT.languageId,
                  lang_code: languagesT.code,
                  lang_name: languagesT.name,
                })
                .from(wordsT)
                .leftJoin(languagesT, eq(wordsT.languageId, languagesT.id))
                .where(and(...conditions))
                .limit(10);

              const exactDefs = await primaryDefinitions(exactRows.map(r => r.id));
              let translations: any[] = exactRows.map(r => ({
                word: r.word,
                languages: { code: r.lang_code, name: r.lang_name },
                definitions: [{ definition: exactDefs.get(r.id) }],
              }));
              let searchMethod = 'exact';

              if ((!translations || translations.length === 0) && process.env.OPENAI_API_KEY) {
                try {
                  // Generate embedding for the search term
                  const searchContext = `Word: ${item}\nLanguage: English\nDefinitions: A ${item} (object or concept)`;
                  const embedding = await generateEmbedding(searchContext);

                  // Search for similar words using the database function
                  const res: any = await db.execute(
                    sql`select * from public.search_similar_words(${JSON.stringify(embedding)}::vector, ${5}, ${0.6})`
                  );
                  const similarWords = Array.isArray(res) ? res : res?.rows;

                  if (similarWords && similarWords.length > 0) {
                    searchMethod = 'similarity';
                    translations = similarWords.map((w: any) => ({
                      word: w.word,
                      languages: { name: w.language_name, code: w.language_code },
                      definitions: [{ definition: w.definition }]
                    }));
                  }
                } catch {
                  // Vector search failed, continue with available results
                }
              }

              return {
                object: item,
                confidence: searchMethod === 'exact' ? 0.9 : 0.7,
                searchMethod,
                translations: translations?.map(t => {
                  const tl = (t as any).languages;
                  return {
                    language: tl?.name || 'Unknown',
                    languageCode: tl?.code || 'unknown',
                    word: t.word,
                    definition: t.definitions?.[0]?.definition,
                    culturalContext: includeContext ? `The word "${t.word}" in ${tl?.name} ${searchMethod === 'similarity' ? 'is semantically related to' : 'reflects the cultural importance of'} ${item} in Aboriginal communities.` : undefined
                  };
                }) || []
              };
            });

            const detectedObjects = await Promise.all(translationPromises);

            // Get related words based on the user's liked words
            const relatedWords = [];
            if (userContext.likedWords.length > 0) {
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

            // Check if any objects used similarity search
            const usedSimilaritySearch = detectedObjects.some(obj => obj.searchMethod === 'similarity');

            const result = {
              imageDescription: `${description || 'Image analyzed successfully'}. ${languageNote}${usedSimilaritySearch ? ' (Some translations found using semantic similarity)' : ''}`,
              detectedObjects: detectedObjects.filter(obj => obj.translations.length > 0),
              culturalInsights: includeContext ?
                'Aboriginal languages often have deep connections to the land and nature. Many words for natural objects carry cultural significance and traditional knowledge.' :
                undefined,
              learningTips: [
                'Practice these words by finding similar objects in your environment',
                'Create visual associations between the objects and their Aboriginal names',
                'Learn the cultural stories associated with these words',
                ...(usedSimilaritySearch ? ['Some words shown are semantically related concepts when exact translations were not found'] : [])
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
    stopWhen: stepCountIs(5),
  });

  const response = result.toUIMessageStreamResponse({
    onError: (error) => (error as any)?.message || 'Something went wrong',
  });
  return response;

  } catch (error) {
    console.error('Chat API error:', error);

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
