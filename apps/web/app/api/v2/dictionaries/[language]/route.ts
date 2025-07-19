import { NextRequest, NextResponse } from 'next/server';
import { getWordsForLanguage } from '@/lib/supabase/queries';
import type { DictionaryQueryParams } from '@/lib/supabase/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { language: string } }
) {
  const { language } = params;
  const searchParams = request.nextUrl.searchParams;
  
  const queryParams: DictionaryQueryParams = {
    language,
    search: searchParams.get('search') || undefined,
    page: parseInt(searchParams.get('page') || '1', 10),
    limit: parseInt(searchParams.get('limit') || '50', 10),
    sortBy: (searchParams.get('sortBy') as DictionaryQueryParams['sortBy']) || 'word',
    sortOrder: (searchParams.get('sortOrder') as DictionaryQueryParams['sortOrder']) || 'asc',
    wordClass: searchParams.get('wordClass') || undefined,
    letter: searchParams.get('letter') || undefined,
  };

  try {
    const data = await getWordsForLanguage(queryParams);
    
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error(`Error fetching dictionary for ${language}:`, error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        { error: `Dictionary for language '${language}' not found` },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch dictionary data' },
      { status: 500 }
    );
  }
}