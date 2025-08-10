import { createClient } from '@supabase/supabase-js'
import { createSuccessResponse, createErrorResponse, corsHeaders } from '../../../middleware'
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

    const { data: word, error } = await supabase
      .from('words')
      .select(`
        *,
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
          definition_number,
          context,
          register,
          domain,
          is_primary,
          notes,
          created_at
        ),
        translations (
          id,
          translation,
          target_language,
          is_primary,
          notes,
          created_at
        ),
        usage_examples (
          id,
          example,
          translation,
          context,
          source,
          created_at
        ),
        synonyms (
          id,
          synonym_word_id,
          synonym_word:words!synonyms_synonym_word_id_fkey (
            id,
            word,
            normalized_word
          )
        ),
        antonyms (
          id,
          antonym_word_id,
          antonym_word:words!antonyms_antonym_word_id_fkey (
            id,
            word,
            normalized_word
          )
        ),
        etymologies (
          id,
          origin_language,
          origin_word,
          description,
          period,
          created_at
        ),
        audio_pronunciations (
          id,
          audio_url,
          speaker_info,
          dialect,
          created_at
        ),
        cultural_contexts (
          id,
          context_type,
          description,
          usage_notes,
          examples,
          created_at
        ),
        word_dialects (
          id,
          dialect_name,
          variant,
          pronunciation,
          notes,
          region
        ),
        word_relationships (
          id,
          relationship_type,
          related_word_id,
          related_word:words!word_relationships_related_word_id_fkey (
            id,
            word,
            normalized_word
          ),
          notes
        )
      `)
      .eq('id', id)
      .single()

    if (error || !word) {
      return createErrorResponse('Word not found', 404)
    }

    const formattedWord = {
      id: word.id,
      word: word.word,
      normalized_word: word.normalized_word,
      phonetic_transcription: word.phonetic_transcription,
      language: word.languages ? {
        id: word.languages.id,
        code: word.languages.code,
        name: word.languages.name,
        native_name: word.languages.native_name
      } : null,
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
      metadata: word.metadata,
      is_verified: word.is_verified,
      quality_score: word.quality_score,
      quality_flags: word.quality_flags,
      created_at: word.created_at,
      updated_at: word.updated_at,
      verified_at: word.verified_at,
      last_reviewed_at: word.last_reviewed_at,
      review_count: word.review_count,
      community_notes: word.community_notes,
      definitions: word.definitions || [],
      translations: word.translations || [],
      usage_examples: word.usage_examples || [],
      synonyms: word.synonyms?.map((s: any) => ({
        id: s.synonym_word?.id,
        word: s.synonym_word?.word,
        normalized_word: s.synonym_word?.normalized_word
      })) || [],
      antonyms: word.antonyms?.map((a: any) => ({
        id: a.antonym_word?.id,
        word: a.antonym_word?.word,
        normalized_word: a.antonym_word?.normalized_word
      })) || [],
      etymologies: word.etymologies || [],
      audio_pronunciations: word.audio_pronunciations || [],
      cultural_contexts: word.cultural_contexts || [],
      dialects: word.word_dialects || [],
      relationships: word.word_relationships?.map((r: any) => ({
        id: r.id,
        type: r.relationship_type,
        related_word: r.related_word ? {
          id: r.related_word.id,
          word: r.related_word.word,
          normalized_word: r.related_word.normalized_word
        } : null,
        notes: r.notes
      })) || []
    }

    return createSuccessResponse(formattedWord)
  } catch (error) {
    console.error('Unexpected error:', error)
    return createErrorResponse('Internal server error', 500)
  }
}