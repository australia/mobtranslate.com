import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createClient();
  
  const { searchParams } = new URL(request.url);
  const languageCode = searchParams.get('language');

  try {
    // Get language
    const { data: language, error: langError } = await supabase
      .from('languages')
      .select('id, code, name')
      .eq('code', languageCode)
      .eq('is_active', true)
      .single();

    if (langError || !language) {
      return NextResponse.json({ 
        error: 'Language not found',
        languageCode,
        langError 
      }, { status: 404 });
    }

    // Get words for this language
    const { data: words, error: wordsError } = await supabase
      .from('words')
      .select(`
        id,
        word,
        language_id,
        definitions(id, definition),
        word_class:word_classes(name)
      `)
      .eq('language_id', language.id)
      .limit(10);

    if (wordsError) {
      return NextResponse.json({ 
        error: 'Failed to fetch words',
        wordsError 
      }, { status: 500 });
    }

    // Count total words
    const { count, error: _countError } = await supabase
      .from('words')
      .select('*', { count: 'exact', head: true })
      .eq('language_id', language.id);

    return NextResponse.json({
      language,
      totalWords: count || 0,
      sampleWords: words || [],
      wordsWithDefinitions: words?.filter(w => w.definitions && w.definitions.length > 0).length || 0
    });

  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}