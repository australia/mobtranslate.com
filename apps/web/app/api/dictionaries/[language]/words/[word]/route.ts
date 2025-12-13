import { NextRequest } from 'next/server';
import { getWordsForLanguage, searchWords } from '@/lib/supabase/queries';
import { transformWordsForUI } from '@/lib/utils/dictionary-transform';

export async function GET(
  request: NextRequest,
  { params }: { params: { language: string; word: string } }
) {
  const { language, word } = params;
  const decodedWord = decodeURIComponent(word);

  try {
    // Search for the specific word
    const { words, language: languageData } = await getWordsForLanguage({
      language,
      search: decodedWord,
      limit: 10
    });

    // Find exact match
    const wordData = words.find(w =>
      w.word.toLowerCase() === decodedWord.toLowerCase() ||
      w.normalized_word?.toLowerCase() === decodedWord.toLowerCase()
    );

    if (!wordData) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Word '${decodedWord}' not found in dictionary for language '${language}'`
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Transform word for UI compatibility
    const transformedWords = transformWordsForUI([wordData]);
    const transformedWord = transformedWords[0];

    // Find related words
    const relatedResults = await searchWords(wordData.stem || wordData.word, language);
    const relatedWords = transformWordsForUI(
      relatedResults.filter(w => w.id !== wordData.id).slice(0, 5)
    );

    return new Response(
      JSON.stringify({
        success: true,
        meta: {
          name: languageData.name,
          description: languageData.description || '',
          region: languageData.region || '',
          code: languageData.code
        },
        data: transformedWord,
        relatedWords,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error(`Error fetching word '${word}' for ${language}:`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('not found')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Dictionary for language '${language}' not found`
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to fetch word data',
        details: errorMessage
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
