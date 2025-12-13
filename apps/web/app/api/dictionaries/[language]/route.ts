import { NextRequest } from 'next/server';
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
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const search = searchParams.get('search') || '';
  const sortBy = searchParams.get('sortBy') || 'word';
  const sortOrder = searchParams.get('sortOrder') || 'asc';

  try {
    const { words, language: languageData, pagination } = await getWordsForLanguage({
      language,
      search: search || undefined,
      page,
      limit,
      sortBy: sortBy as 'word' | 'created_at' | 'frequency_score',
      sortOrder: sortOrder as 'asc' | 'desc',
    });

    // Transform words for UI compatibility
    const transformedWords = transformWordsForUI(words);

    return new Response(
      JSON.stringify({
        success: true,
        meta: {
          name: languageData.name,
          description: languageData.description || '',
          region: languageData.region || '',
          code: languageData.code
        },
        data: transformedWords,
        pagination: {
          total: pagination.total,
          page: pagination.page,
          limit: pagination.limit,
          totalPages: pagination.totalPages,
          hasNext: pagination.hasNext,
          hasPrev: pagination.hasPrev,
        },
        filters: {
          search,
          sortBy,
          sortOrder,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error(`Error fetching dictionary for ${language}:`, error);

    const errorMessage = error instanceof Error
      ? error.message
      : 'Unknown error fetching dictionary data';

    // Check if it's a "not found" error
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
        error: 'Failed to fetch dictionary data',
        details: errorMessage,
        language
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
