import { NextRequest, NextResponse } from 'next/server';
import { getWordById } from '@/lib/supabase/queries';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const word = await getWordById(id);
    
    if (!word) {
      return NextResponse.json(
        { error: 'Word not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(word, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error(`Error fetching word ${id}:`, error);
    
    return NextResponse.json(
      { error: 'Failed to fetch word data' },
      { status: 500 }
    );
  }
}