import { asc, count, eq } from 'drizzle-orm'
import { db } from '@/lib/db/index'
import { languages as languagesT } from '@/lib/db/schema'
import { snakeRows } from '@/lib/db/case'
import { createSuccessResponse, createErrorResponse, corsHeaders } from '../../middleware'
import { NextRequest } from 'next/server'

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders() })
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const offset = (page - 1) * limit

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(languagesT)
        .where(eq(languagesT.isActive, true))
        .orderBy(asc(languagesT.name))
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(languagesT).where(eq(languagesT.isActive, true)),
    ])

    const total = totalRows[0]?.value ?? 0
    const snaked = snakeRows(rows)

    const dictionaries = snaked.map(lang => ({
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

    const totalPages = total ? Math.ceil(total / limit) : 0

    return createSuccessResponse({
      dictionaries,
      pagination: {
        page,
        limit,
        total: total || 0,
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
