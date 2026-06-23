import { and, count, eq, or } from 'drizzle-orm'
import { db } from '@/lib/db/index'
import { languages as languagesT, words as wordsT } from '@/lib/db/schema'
import { snakeRow } from '@/lib/db/case'
import { createSuccessResponse, createErrorResponse, corsHeaders } from '../../../middleware'
import { NextRequest } from 'next/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders() })
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params

    // Match by code, or by id when the param is a valid UUID (avoids casting errors).
    const idOrCode = UUID_RE.test(id)
      ? or(eq(languagesT.id, id), eq(languagesT.code, id))!
      : eq(languagesT.code, id)

    const langRows = await db
      .select()
      .from(languagesT)
      .where(and(idOrCode, eq(languagesT.isActive, true)))
      .limit(1)

    const langRow = langRows[0]
    if (!langRow) {
      return createErrorResponse('Dictionary not found', 404)
    }
    const language = snakeRow(langRow)

    const wordCountRows = await db
      .select({ value: count() })
      .from(wordsT)
      .where(eq(wordsT.languageId, langRow.id))
    const wordCount = wordCountRows[0]?.value ?? 0

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
