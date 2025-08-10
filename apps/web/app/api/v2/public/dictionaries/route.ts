import { createClient } from '@supabase/supabase-js'
import { createSuccessResponse, createErrorResponse, corsHeaders } from '../../middleware'
import { NextRequest } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders() })
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const offset = (page - 1) * limit

    const { data: languages, error, count } = await supabase
      .from('languages')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error fetching languages:', error)
      return createErrorResponse('Failed to fetch dictionaries', 500)
    }

    const dictionaries = languages?.map(lang => ({
      id: lang.id,
      code: lang.code,
      name: lang.name,
      native_name: lang.native_name,
      description: lang.description,
      region: lang.region,
      country: lang.country,
      speakers_count: lang.speakers_count,
      status: lang.status,
      family: lang.family,
      iso_639_1: lang.iso_639_1,
      iso_639_2: lang.iso_639_2,
      iso_639_3: lang.iso_639_3,
      glottocode: lang.glottocode,
      writing_system: lang.writing_system,
      created_at: lang.created_at,
      updated_at: lang.updated_at
    }))

    const totalPages = count ? Math.ceil(count / limit) : 0

    return createSuccessResponse({
      dictionaries,
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