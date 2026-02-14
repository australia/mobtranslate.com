import { createClient } from '@supabase/supabase-js'
import { createSuccessResponse, createErrorResponse, corsHeaders } from '../../middleware'
import { NextRequest } from 'next/server'

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders() })
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q') || ''
    const dictionary_id = searchParams.get('dictionary_id') || ''
    const dictionary_code = searchParams.get('dictionary_code') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const offset = (page - 1) * limit
    const search_type = searchParams.get('type') || 'all' // all, word, definition, translation

    if (!query) {
      return createErrorResponse('Search query is required', 400)
    }

    let languageId: string | null = null

    if (dictionary_id || dictionary_code) {
      const { data: language } = await supabase
        .from('languages')
        .select('id')
        .or(`id.eq.${dictionary_id || ''},code.eq.${dictionary_code || ''}`)
        .eq('is_active', true)
        .single()

      if (language) {
        languageId = language.id
      }
    }

    let results: any[] = []
    let totalCount = 0

    if (search_type === 'all' || search_type === 'word') {
      let wordQuery = supabase
        .from('words')
        .select(`
          id,
          word,
          normalized_word,
          phonetic_transcription,
          language_id,
          languages (
            id,
            code,
            name,
            native_name
          ),
          word_classes (
            id,
            name,
            abbreviation
          ),
          definitions (
            id,
            definition,
            is_primary
          )
        `, { count: 'exact' })
        .or(`word.ilike.%${query}%,normalized_word.ilike.%${query}%`)

      if (languageId) {
        wordQuery = wordQuery.eq('language_id', languageId)
      }

      const { data: words, count } = await wordQuery
        .order('word', { ascending: true })
        .range(offset, offset + limit - 1)

      if (words) {
        results.push(...words.map(w => ({
          type: 'word',
          id: w.id,
          word: w.word,
          normalized_word: w.normalized_word,
          phonetic_transcription: w.phonetic_transcription,
          language: w.languages,
          word_class: w.word_classes,
          primary_definition: w.definitions?.find((d: any) => d.is_primary)?.definition || 
                             w.definitions?.[0]?.definition || null,
          match_score: calculateMatchScore(w.word, query)
        })))
        totalCount += count || 0
      }
    }

    if (search_type === 'all' || search_type === 'definition') {
      let defQuery = supabase
        .from('definitions')
        .select(`
          id,
          definition,
          word_id,
          words (
            id,
            word,
            normalized_word,
            language_id,
            languages (
              id,
              code,
              name,
              native_name
            ),
            word_classes (
              id,
              name,
              abbreviation
            )
          )
        `, { count: 'exact' })
        .ilike('definition', `%${query}%`)

      if (languageId) {
        defQuery = defQuery.eq('words.language_id', languageId)
      }

      const { data: definitions, count } = await defQuery
        .range(offset, offset + limit - 1)

      if (definitions) {
        results.push(...definitions.map(d => {
          const dw = d.words as any;
          return {
            type: 'definition',
            id: d.id,
            definition: d.definition,
            word: dw ? {
              id: dw.id,
              word: dw.word,
              normalized_word: dw.normalized_word,
              language: dw.languages,
              word_class: dw.word_classes
            } : null,
            match_score: calculateMatchScore(d.definition, query)
          };
        }))
        totalCount += count || 0
      }
    }

    if (search_type === 'all' || search_type === 'translation') {
      let transQuery = supabase
        .from('translations')
        .select(`
          id,
          translation,
          target_language,
          word_id,
          words (
            id,
            word,
            normalized_word,
            language_id,
            languages (
              id,
              code,
              name,
              native_name
            ),
            word_classes (
              id,
              name,
              abbreviation
            )
          )
        `, { count: 'exact' })
        .ilike('translation', `%${query}%`)

      if (languageId) {
        transQuery = transQuery.eq('words.language_id', languageId)
      }

      const { data: translations, count } = await transQuery
        .range(offset, offset + limit - 1)

      if (translations) {
        results.push(...translations.map(t => {
          const tw = t.words as any;
          return {
            type: 'translation',
            id: t.id,
            translation: t.translation,
            target_language: t.target_language,
            word: tw ? {
              id: tw.id,
              word: tw.word,
              normalized_word: tw.normalized_word,
              language: tw.languages,
              word_class: tw.word_classes
            } : null,
            match_score: calculateMatchScore(t.translation, query)
          };
        }))
        totalCount += count || 0
      }
    }

    results.sort((a, b) => b.match_score - a.match_score)

    const totalPages = Math.ceil(totalCount / limit)

    return createSuccessResponse({
      results: results.slice(0, limit),
      pagination: {
        page,
        limit,
        total: totalCount,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_previous: page > 1
      },
      search_params: {
        query,
        type: search_type,
        dictionary_id: dictionary_id || null,
        dictionary_code: dictionary_code || null
      }
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return createErrorResponse('Internal server error', 500)
  }
}

function calculateMatchScore(text: string, query: string): number {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  
  if (lowerText === lowerQuery) return 100
  if (lowerText.startsWith(lowerQuery)) return 90
  if (lowerText.includes(lowerQuery)) return 70
  
  const words = lowerText.split(/\s+/)
  if (words.some(w => w === lowerQuery)) return 80
  if (words.some(w => w.startsWith(lowerQuery))) return 60
  
  return 50
}