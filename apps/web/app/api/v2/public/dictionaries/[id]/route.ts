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

    const { data: language, error } = await supabase
      .from('languages')
      .select('*')
      .or(`id.eq.${id},code.eq.${id}`)
      .eq('is_active', true)
      .single()

    if (error || !language) {
      return createErrorResponse('Dictionary not found', 404)
    }

    const { count: wordCount } = await supabase
      .from('words')
      .select('*', { count: 'exact', head: true })
      .eq('language_id', language.id)

    return createSuccessResponse({
      id: language.id,
      code: language.code,
      name: language.name,
      native_name: language.native_name,
      description: language.description,
      region: language.region,
      country: language.country,
      speakers_count: language.speakers_count,
      status: language.status,
      family: language.family,
      iso_639_1: language.iso_639_1,
      iso_639_2: language.iso_639_2,
      iso_639_3: language.iso_639_3,
      glottocode: language.glottocode,
      writing_system: language.writing_system,
      orthography_notes: language.orthography_notes,
      metadata: language.metadata,
      created_at: language.created_at,
      updated_at: language.updated_at,
      stats: {
        total_words: wordCount || 0
      }
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return createErrorResponse('Internal server error', 500)
  }
}