import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();

  try {
    const { data: langs, error } = await supabase
      .from('languages')
      .select('id, code, name')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching languages:', error);
      return NextResponse.json({ error: 'Failed to fetch languages' }, { status: 500 });
    }

    // Count words per language with a real COUNT (the previous version embedded
    // words!inner(id), which returns ONE row per language with words nested — so
    // the reduce always produced wordCount: 1).
    const counted = await Promise.all(
      (langs ?? []).map(async (l) => {
        const { count } = await supabase
          .from('words')
          .select('*', { count: 'exact', head: true })
          .eq('language_id', l.id);
        return { code: l.code, name: l.name, wordCount: count ?? 0 };
      })
    );

    const languages = counted
      .filter((l) => l.wordCount > 0)
      .sort((a, b) => b.wordCount - a.wordCount);

    return NextResponse.json({ languages, total: languages.length });
  } catch (error) {
    console.error('Error fetching available languages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
