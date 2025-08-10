import { NextResponse } from 'next/server';
import { getRandomWords, searchWords } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limit = searchParams.get('limit');
    
    if (query) {
      const results = await searchWords(query);
      return NextResponse.json(results);
    } else {
      const words = await getRandomWords(limit ? parseInt(limit) : 10);
      return NextResponse.json(words);
    }
  } catch (error) {
    console.error('Error fetching words:', error);
    return NextResponse.json(
      { error: 'Failed to fetch words' },
      { status: 500 }
    );
  }
}