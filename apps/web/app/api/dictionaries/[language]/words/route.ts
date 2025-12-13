import { NextRequest, NextResponse } from 'next/server';
import { getWordsForLanguage } from '@/lib/supabase/queries';
import { transformWordsForUI } from '@/lib/utils/dictionary-transform';

export async function GET(
  request: NextRequest,
  { params }: { params: { language: string } }
) {
  const { language } = params;
  const searchParams = request.nextUrl.searchParams;

  // Extract query parameters for pagination and filtering
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '100', 10);
  const letter = searchParams.get('letter') || '';
  const sortOrder = (searchParams.get('sortOrder') || 'asc') as 'asc' | 'desc';

  try {
    const { words, language: languageData, pagination } = await getWordsForLanguage({
      language,
      page,
      limit,
      letter: letter || undefined,
      sortOrder,
    });

    // Transform words for UI compatibility
    const transformedWords = transformWordsForUI(words);

    // Group words by first letter for alphabetical listing
    const wordsByLetter: Record<string, typeof transformedWords> = {};

    transformedWords.forEach(word => {
      const firstLetter = word.word.charAt(0).toUpperCase();
      if (!wordsByLetter[firstLetter]) {
        wordsByLetter[firstLetter] = [];
      }
      wordsByLetter[firstLetter].push(word);
    });

    // Get all available letters in the dictionary
    const availableLetters = Object.keys(wordsByLetter).sort();

    return NextResponse.json({
      success: true,
      meta: {
        name: languageData.name,
        description: languageData.description || '',
        region: languageData.region || '',
        code: languageData.code
      },
      data: transformedWords,
      wordsByLetter: letter ? wordsByLetter : undefined,
      availableLetters,
      pagination: {
        total: pagination.total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: pagination.totalPages,
        hasNext: pagination.hasNext,
        hasPrev: pagination.hasPrev,
      },
      filters: {
        letter,
        sortOrder,
      },
    }, { status: 200 });

  } catch (error) {
    console.error(`Error fetching words for ${language}:`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('not found')) {
      return NextResponse.json({
        success: false,
        error: `Dictionary for language '${language}' not found`
      }, { status: 404 });
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to fetch dictionary words',
    }, { status: 500 });
  }
}
