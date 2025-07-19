import { NextResponse } from 'next/server';
import { getActiveLanguages } from '@/lib/supabase/queries';

export async function GET() {
  try {
    const languages = await getActiveLanguages();
    
    return NextResponse.json(languages, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    });
  } catch (error) {
    console.error('Error fetching languages:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch languages' },
      { status: 500 }
    );
  }
}