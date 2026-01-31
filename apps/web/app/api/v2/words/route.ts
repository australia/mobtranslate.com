import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const searchParams = request.nextUrl.searchParams
    const languageCode = searchParams.get('language')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!languageCode) {
      return NextResponse.json({ error: 'Language code is required' }, { status: 400 })
    }

    // Get language ID from code
    const { data: language, error: langError } = await supabase
      .from('languages')
      .select('id')
      .eq('code', languageCode)
      .eq('is_active', true)
      .single()

    if (langError || !language) {
      return NextResponse.json({ error: 'Language not found' }, { status: 404 })
    }

    // Fetch words with definitions and translations
    const { data: words, error, count } = await supabase
      .from('words')
      .select(`
        id,
        word,
        word_type,
        word_classes (
          id,
          name
        ),
        definitions (
          definition
        ),
        translations (
          translation
        )
      `, { count: 'exact' })
      .eq('language_id', language.id)
      .order('word', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error fetching words:', error)
      return NextResponse.json({ error: 'Failed to fetch words' }, { status: 500 })
    }

    const formattedWords = words?.map(word => ({
      id: word.id,
      word: word.word,
      word_class: word.word_classes,
      definitions: word.definitions || [],
      translations: word.translations || [],
    })) || []

    return NextResponse.json({
      words: formattedWords,
      total: count || 0,
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
