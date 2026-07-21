import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import { WORD_IMG_DIR, SITE, cacheKey, cachePath } from '@/lib/word-image-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/word-images?lang=<code>&words=<comma-separated list>
 *
 * PEEK-ONLY: returns the cached image URL for each word that ALREADY has one
 * (generated previously when its detail was opened). It NEVER generates — so the
 * dictionary list can show thumbnails for words that have art, without triggering
 * mass generation. Returns { images: { "<word>": "<url>" | null } }.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const lang = (sp.get('lang') || '').trim()
  const words = (sp.get('words') || '').split(',').map((w) => w.trim()).filter(Boolean).slice(0, 80)
  if (!lang || words.length === 0) return NextResponse.json({ images: {} })

  const images: Record<string, string | null> = {}
  await Promise.all(words.map(async (word) => {
    const key = cacheKey(lang, word)
    for (const ext of ['jpg', 'png']) {
      try {
        const st = await fs.stat(cachePath(WORD_IMG_DIR, `${key}.${ext}`))
        images[word] = `${SITE}/word-img/${key}.${ext}?v=${Math.round(st.mtimeMs)}`
        return
      } catch { /* miss */ }
    }
    images[word] = null
  }))

  return NextResponse.json({ images }, { headers: { 'Cache-Control': 'public, max-age=300' } })
}
