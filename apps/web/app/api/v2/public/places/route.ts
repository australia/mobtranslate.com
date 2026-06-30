import { NextRequest } from 'next/server'
import { and, asc, eq, inArray, or } from 'drizzle-orm'
import { db } from '@/lib/db/index'
import {
  definitions as definitionsT,
  languages as languagesT,
  translations as translationsT,
  words as wordsT,
} from '@/lib/db/schema'
import { createSuccessResponse, createErrorResponse, corsHeaders } from '../../middleware'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CAP = 500

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders() })
}

/**
 * GET /api/v2/public/places?lang=<code>
 *
 * Place names are regular `words` with is_location=true plus latitude/longitude.
 * Returns every place for the language (lat/lon may be null — included anyway),
 * with a meaning (primary definition, else primary english translation), plus
 * `count` and `withCoords` so the map knows whether to drop pins or just list.
 */
export async function GET(request: NextRequest) {
  try {
    const lang = (request.nextUrl.searchParams.get('lang') || '').trim()
    if (!lang) return createErrorResponse('lang query parameter is required', 400)

    const idOrCode = UUID_RE.test(lang)
      ? or(eq(languagesT.id, lang), eq(languagesT.code, lang))!
      : eq(languagesT.code, lang)

    const langRows = await db
      .select({ id: languagesT.id })
      .from(languagesT)
      .where(and(idOrCode, eq(languagesT.isActive, true)))
      .limit(1)

    const language = langRows[0]
    if (!language) return createErrorResponse('Language not found', 404)

    const rows = await db
      .select({
        id: wordsT.id,
        word: wordsT.word,
        latitude: wordsT.latitude,
        longitude: wordsT.longitude,
      })
      .from(wordsT)
      .where(and(eq(wordsT.languageId, language.id), eq(wordsT.isLocation, true)))
      .orderBy(asc(wordsT.word))
      .limit(CAP)

    const wordIds = rows.map((r) => r.id)

    // Meaning: prefer the primary definition, else the primary english translation.
    const meaningByWord = new Map<string, string>()
    if (wordIds.length > 0) {
      const [defs, trans] = await Promise.all([
        db
          .select({
            wordId: definitionsT.wordId,
            definition: definitionsT.definition,
            isPrimary: definitionsT.isPrimary,
            num: definitionsT.definitionNumber,
          })
          .from(definitionsT)
          .where(inArray(definitionsT.wordId, wordIds)),
        db
          .select({
            wordId: translationsT.wordId,
            translation: translationsT.translation,
            isPrimary: translationsT.isPrimary,
          })
          .from(translationsT)
          .where(inArray(translationsT.wordId, wordIds)),
      ])

      // Many place words are polysemous (e.g. "bajabaja" = blue-tongue lizard AND
      // a place). For the MAP we must show the PLACE sense, not the primary
      // (animal) sense — so a definition that describes a location wins.
      const PLACE_RE = /place\s?name|\bcreek\b|\briver\b|\bground\b|\bcamp\b|\bhill\b|\bpoint\b|island|spring|crossing|reaches|\bmouth\b|side of|\bnear\b|\babove\b|\bbelow\b|story site|\bcave\b|\bbeach\b|\bbay\b|falls|\bwhere\b|country|divide|watershed|confluence|\bcape\b|\bmount\b|\bmt\b|summit|coast|\bsea\b|crossing|reef/i
      const scoreDef = (text: string, primary: boolean, num: number) =>
        (PLACE_RE.test(text) ? 1000 : 0) + (primary ? 100 : 0) + (200 - Math.min(num, 200))
      const bestDef = new Map<string, { text: string; score: number }>()
      for (const d of defs) {
        if (!d.definition) continue
        const cur = bestDef.get(d.wordId)
        const score = scoreDef(d.definition, !!d.isPrimary, d.num ?? 999)
        if (!cur || score > cur.score) bestDef.set(d.wordId, { text: d.definition, score })
      }

      const bestTrans = new Map<string, { text: string; primary: boolean }>()
      for (const t of trans) {
        if (!t.translation) continue
        const cur = bestTrans.get(t.wordId)
        const cand = { text: t.translation, primary: !!t.isPrimary }
        if (!cur || (cand.primary && !cur.primary)) bestTrans.set(t.wordId, cand)
      }

      for (const id of wordIds) {
        const def = bestDef.get(id)
        if (def) {
          meaningByWord.set(id, def.text)
          continue
        }
        const tr = bestTrans.get(id)
        if (tr) meaningByWord.set(id, tr.text)
      }
    }

    const places = rows.map((r) => ({
      id: r.id,
      word: r.word,
      meaning: meaningByWord.get(r.id) ?? null,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
    }))

    const withCoords = places.filter((p) => p.latitude != null && p.longitude != null).length

    return createSuccessResponse({
      places,
      count: places.length,
      withCoords,
    })
  } catch (error) {
    console.error('[places] unexpected error', error)
    return createErrorResponse('Internal server error', 500)
  }
}
