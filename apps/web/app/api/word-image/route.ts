import { NextRequest, NextResponse } from 'next/server'
import { WORD_IMG_DIR } from '@/lib/word-image-cache'
import { peekCached, requestImageSoft } from '@/lib/image-queue'
import { and, asc, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/index'
import { definitions, languages, words } from '@/lib/db/schema'
import { getSessionUser } from '@/lib/auth-helpers'
import {
  apiGuardResponse,
  enforceImageProviderBudget,
  enforceImageRequestLimit,
} from '@/lib/api-rate-limit.server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const URL_PREFIX = '/word-img'
const QuerySchema = z.object({
  lang: z.string().trim().min(1).max(50),
  word: z.string().trim().min(1).max(500),
  id: z.string().uuid().optional(),
})

/**
 * GET /api/word-image?lang=<code>&id=<wordId|optional>&word=<text>&meaning=<text|optional>
 *
 * Server-cached, language-specific watercolour for a word. Cache key is
 * `<lang>-<slug(word)>`; an existing cache file is returned instantly. A cold
 * word is enqueued on the background generation worker and we wait only a short
 * soft cap (well under the edge proxy timeout) before returning — if it isn't
 * ready yet we return { imageUrl: null, status: 'pending' } and the worker keeps
 * generating + caches it; the client polls and picks it up. Always ONE
 * generation per word.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const parsed = QuerySchema.safeParse({
    lang: sp.get('lang'),
    word: sp.get('word'),
    id: sp.get('id') || undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'lang and word query parameters are required' }, { status: 400 })
  }

  try {
    const sessionUser = await getSessionUser().catch(() => null)
    await enforceImageRequestLimit(request, sessionUser?.id ?? null)

    // The client-supplied meaning is deliberately ignored. Only a real
    // dictionary record may seed an image prompt, which keeps this public route
    // finite and prevents arbitrary prompt injection into image generation.
    const recordRows = await db
      .select({
        id: words.id,
        word: words.word,
        sensitiveContent: words.sensitiveContent,
        languageCode: languages.code,
      })
      .from(words)
      .innerJoin(languages, eq(words.languageId, languages.id))
      .where(
        parsed.data.id
          ? and(eq(words.id, parsed.data.id), eq(languages.code, parsed.data.lang))
          : and(eq(words.word, parsed.data.word), eq(languages.code, parsed.data.lang)),
      )
      .limit(1)
    const record = recordRows[0]
    if (!record || record.word !== parsed.data.word) {
      return NextResponse.json({ error: 'Dictionary word not found' }, { status: 404 })
    }
    if (record.sensitiveContent) {
      return NextResponse.json({ imageUrl: null, status: 'unavailable' })
    }

    const cached = await peekCached(record.languageCode, record.word, WORD_IMG_DIR, URL_PREFIX)
    if (cached) {
      return NextResponse.json({ imageUrl: cached, status: 'ready' }, { headers: { 'Cache-Control': 'public, max-age=86400' } })
    }

    const definitionRows = await db
      .select({ definition: definitions.definition })
      .from(definitions)
      .where(eq(definitions.wordId, record.id))
      .orderBy(desc(definitions.isPrimary), asc(definitions.definitionNumber))
      .limit(1)
    const meaning = definitionRows[0]?.definition?.trim()
    if (!meaning) {
      return NextResponse.json({ imageUrl: null, status: 'unavailable' })
    }

    await enforceImageProviderBudget(request, sessionUser?.id ?? null)
    // Enqueue + wait a short soft cap (keeps us under the edge proxy limit).
    const url = await requestImageSoft(
      record.languageCode,
      record.word,
      meaning,
      WORD_IMG_DIR,
      URL_PREFIX,
      30_000,
    )
    // Re-peek so the returned URL carries the ?v=<mtime> cache-buster.
    const versioned = url
      ? (await peekCached(record.languageCode, record.word, WORD_IMG_DIR, URL_PREFIX)) ?? url
      : null
    return NextResponse.json(
      { imageUrl: versioned, status: versioned ? 'ready' : 'pending' },
      { headers: { 'Cache-Control': versioned ? 'public, max-age=86400' : 'no-store' } },
    )
  } catch (err: any) {
    const guardResponse = apiGuardResponse(err)
    if (guardResponse) return guardResponse
    console.error('[word-image] route error', err?.message || err)
    return NextResponse.json({ imageUrl: null, status: 'error' }, { status: 200 })
  }
}
