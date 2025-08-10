import { createClient } from '@supabase/supabase-js'
import { createSuccessResponse, createErrorResponse, corsHeaders } from '../../../../middleware'
import { NextRequest } from 'next/server'

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders() })
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    
    const { id } = params
    const searchParams = request.nextUrl.searchParams
    
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = (page - 1) * limit
    const search = searchParams.get('search') || ''
    const word_class = searchParams.get('word_class') || ''
    const verified_only = searchParams.get('verified_only') === 'true'

    const { data: language, error: langError } = await supabase
      .from('languages')
      .select('id')
      .or(`id.eq.${id},code.eq.${id}`)
      .eq('is_active', true)
      .single()

    if (langError || !language) {
      return createErrorResponse('Dictionary not found', 404)
    }

    let query = supabase
      .from('words')
      .select(`
        *,
        word_classes (
          id,
          name,
          abbreviation
        ),
        definitions (
          id,
          definition,
          definition_number,
          context,
          register,
          domain,
          is_primary,
          notes
        ),
        translations (
          id,
          translation,
          target_language,
          is_primary,
          notes
        ),
        usage_examples (
          id,
          example,
          translation,
          context,
          source
        ),
        synonyms (
          id,
          synonym_word_id,
          synonym_word:words!synonyms_synonym_word_id_fkey (
            id,
            word
          )
        ),
        antonyms (
          id,
          antonym_word_id,
          antonym_word:words!antonyms_antonym_word_id_fkey (
            id,
            word
          )
        ),
        etymologies (
          id,
          origin_language,
          origin_word,
          description,
          period
        ),
        audio_pronunciations (
          id,
          audio_url,
          speaker_info,
          dialect
        )
      `, { count: 'exact' })
      .eq('language_id', language.id)

    if (search) {
      query = query.or(`word.ilike.%${search}%,normalized_word.ilike.%${search}%`)
    }

    if (word_class) {
      query = query.eq('word_class_id', word_class)
    }

    if (verified_only) {
      query = query.eq('is_verified', true)
    }

    query = query
      .order('word', { ascending: true })
      .range(offset, offset + limit - 1)

    const { data: words, error, count } = await query

    if (error) {
      console.error('Error fetching words:', error)
      return createErrorResponse('Failed to fetch words', 500)
    }

    const formattedWords = words?.map(word => ({
      id: word.id,
      word: word.word,
      normalized_word: word.normalized_word,
      phonetic_transcription: word.phonetic_transcription,
      word_class: word.word_classes ? {
        id: word.word_classes.id,
        name: word.word_classes.name,
        abbreviation: word.word_classes.abbreviation
      } : null,
      word_type: word.word_type,
      gender: word.gender,
      number: word.number,
      stem: word.stem,
      is_loan_word: word.is_loan_word,
      loan_source_language: word.loan_source_language,
      frequency_score: word.frequency_score,
      register: word.register,
      domain: word.domain,
      dialectal_variation: word.dialectal_variation,
      obsolete: word.obsolete,
      sensitive_content: word.sensitive_content,
      notes: word.notes,
      is_verified: word.is_verified,
      quality_score: word.quality_score,
      created_at: word.created_at,
      updated_at: word.updated_at,
      definitions: word.definitions || [],
      translations: word.translations || [],
      usage_examples: word.usage_examples || [],
      synonyms: word.synonyms?.map((s: any) => ({
        id: s.synonym_word?.id,
        word: s.synonym_word?.word
      })) || [],
      antonyms: word.antonyms?.map((a: any) => ({
        id: a.antonym_word?.id,
        word: a.antonym_word?.word
      })) || [],
      etymologies: word.etymologies || [],
      audio_pronunciations: word.audio_pronunciations || []
    }))

    const totalPages = count ? Math.ceil(count / limit) : 0

    return createSuccessResponse({
      words: formattedWords,
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_previous: page > 1
      }
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return createErrorResponse('Internal server error', 500)
  }
}