import { NextRequest, NextResponse } from 'next/server';
import { searchWords } from '@/lib/supabase/queries';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  const language = searchParams.get('language');

  if (!query || query.length < 2) {
    return NextResponse.json(
      { error: 'Search query must be at least 2 characters' },
      { status: 400 }
    );
  }

  try {
    const results = await searchWords(query, language || undefined);
    
    return NextResponse.json(results, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('Error searching words:', error);
    
    return NextResponse.json(
      { error: 'Failed to search words' },
      { status: 500 }
    );
  }
}