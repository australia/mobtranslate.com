import { NextRequest, NextResponse } from 'next/server'
import { WORD_IMG_DIR } from '@/lib/word-image'
import { peekCached, requestImageSoft } from '@/lib/image-queue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const URL_PREFIX = '/word-img'

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
  const lang = (sp.get('lang') || '').trim()
  const word = (sp.get('word') || '').trim()
  const meaning = (sp.get('meaning') || '').trim() || null

  if (!lang || !word) {
    return NextResponse.json({ error: 'lang and word query parameters are required' }, { status: 400 })
  }

  try {
    const cached = await peekCached(lang, word, WORD_IMG_DIR, URL_PREFIX)
    if (cached) {
      return NextResponse.json({ imageUrl: cached, status: 'ready' }, { headers: { 'Cache-Control': 'public, max-age=86400' } })
    }
    // Enqueue + wait a short soft cap (keeps us under the edge proxy limit).
    const url = await requestImageSoft(lang, word, meaning, WORD_IMG_DIR, URL_PREFIX, 30_000)
    // Re-peek so the returned URL carries the ?v=<mtime> cache-buster.
    const versioned = url ? (await peekCached(lang, word, WORD_IMG_DIR, URL_PREFIX)) ?? url : null
    return NextResponse.json(
      { imageUrl: versioned, status: versioned ? 'ready' : 'pending' },
      { headers: { 'Cache-Control': versioned ? 'public, max-age=86400' : 'no-store' } },
    )
  } catch (err: any) {
    console.error('[word-image] route error', err?.message || err)
    return NextResponse.json({ imageUrl: null, status: 'error' }, { status: 200 })
  }
}
