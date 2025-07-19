import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createClient();

  try {
    // Get all active languages with words using a single query
    const { data: languageData, error } = await supabase
      .from('languages')
      .select(`
        id,
        code, 
        name,
        words!inner(id)
      `)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching languages:', error);
      return NextResponse.json({ error: 'Failed to fetch languages' }, { status: 500 });
    }

    // Process the query results properly
    const formattedLanguages = languageData?.reduce((acc: any[], item: any) => {
      // Each row represents a word, so we need to count unique languages
      const existing = acc.find(lang => lang.code === item.code);
      if (existing) {
        existing.wordCount++;
      } else {
        acc.push({
          code: item.code,
          name: item.name,
          wordCount: 1
        });
      }
      return acc;
    }, []) || [];

    // Sort by word count
    formattedLanguages.sort((a, b) => b.wordCount - a.wordCount);

    return NextResponse.json({
      languages: formattedLanguages,
      total: formattedLanguages.length
    });

  } catch (error) {
    console.error('Error fetching available languages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}