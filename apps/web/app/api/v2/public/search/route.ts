import { and, asc, count, eq, ilike, inArray, or } from 'drizzle-orm'
import { db } from '@/lib/db/index'
import {
  definitions as definitionsT,
  languages as languagesT,
  translations as translationsT,
  wordClasses as wordClassesT,
  words as wordsT,
} from '@/lib/db/schema'
import { createSuccessResponse, createErrorResponse, corsHeaders } from '../../middleware'
import { NextRequest } from 'next/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders() })
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q') || ''
    const dictionary_id = searchParams.get('dictionary_id') || ''
    const dictionary_code = searchParams.get('dictionary_code') || ''
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const offset = (page - 1) * limit
    const search_type = searchParams.get('type') || 'all' // all, word, definition, translation

    if (!query) {
      return createErrorResponse('Search query is required', 400)
    }

    let languageId: string | null = null

    if (dictionary_id || dictionary_code) {
      const orParts = [] as any[]
      if (dictionary_id && UUID_RE.test(dictionary_id)) orParts.push(eq(languagesT.id, dictionary_id))
      if (dictionary_code) orParts.push(eq(languagesT.code, dictionary_code))
      if (orParts.length > 0) {
        const langRows = await db
          .select({ id: languagesT.id })
          .from(languagesT)
          .where(and(orParts.length > 1 ? or(...orParts)! : orParts[0], eq(languagesT.isActive, true)))
          .limit(1)
        if (langRows[0]) languageId = langRows[0].id
      }
    }

    const results: any[] = []
    let totalCount = 0

    const like = `%${query}%`

    if (search_type === 'all' || search_type === 'word') {
      const filters = [or(ilike(wordsT.word, like), ilike(wordsT.normalizedWord, like))!]
      if (languageId) filters.push(eq(wordsT.languageId, languageId))
      const where = and(...filters)

      const [wordRows, totalRows] = await Promise.all([
        db
          .select({ word: wordsT, wc: wordClassesT, lang: languagesT })
          .from(wordsT)
          .leftJoin(wordClassesT, eq(wordsT.wordClassId, wordClassesT.id))
          .leftJoin(languagesT, eq(wordsT.languageId, languagesT.id))
          .where(where)
          .orderBy(asc(wordsT.word))
          .limit(limit)
          .offset(offset),
        db.select({ value: count() }).from(wordsT).where(where),
      ])

      const wIds = wordRows.map(w => w.word.id)
      const defs = wIds.length > 0
        ? await db
            .select({ wordId: definitionsT.wordId, definition: definitionsT.definition, isPrimary: definitionsT.isPrimary })
            .from(definitionsT)
            .where(inArray(definitionsT.wordId, wIds))
        : []
      const defsByWord = new Map<string, Array<{ definition: string; is_primary: boolean | null }>>()
      for (const d of defs) {
        const arr = defsByWord.get(d.wordId) ?? []
        arr.push({ definition: d.definition, is_primary: d.isPrimary })
        defsByWord.set(d.wordId, arr)
      }

      results.push(...wordRows.map(w => {
        const wordDefs = defsByWord.get(w.word.id) ?? []
        return {
          type: 'word',
          id: w.word.id,
          word: w.word.word,
          normalized_word: w.word.normalizedWord,
          phonetic_transcription: w.word.phoneticTranscription,
          language: w.lang ? { id: w.lang.id, code: w.lang.code, name: w.lang.name, native_name: w.lang.nativeName } : null,
          word_class: w.wc ? { id: w.wc.id, name: w.wc.name, abbreviation: w.wc.abbreviation } : null,
          primary_definition: wordDefs.find(d => d.is_primary)?.definition || wordDefs[0]?.definition || null,
          match_score: calculateMatchScore(w.word.word, query)
        }
      }))
      totalCount += totalRows[0]?.value ?? 0
    }

    if (search_type === 'all' || search_type === 'definition') {
      // Filter definitions whose parent word matches the (optional) language.
      const baseWhere = languageId
        ? and(ilike(definitionsT.definition, like), eq(wordsT.languageId, languageId))
        : ilike(definitionsT.definition, like)

      const [defRows, totalRows] = await Promise.all([
        db
          .select({ def: definitionsT, word: wordsT, wc: wordClassesT, lang: languagesT })
          .from(definitionsT)
          .leftJoin(wordsT, eq(definitionsT.wordId, wordsT.id))
          .leftJoin(wordClassesT, eq(wordsT.wordClassId, wordClassesT.id))
          .leftJoin(languagesT, eq(wordsT.languageId, languagesT.id))
          .where(baseWhere)
          .limit(limit)
          .offset(offset),
        db
          .select({ value: count() })
          .from(definitionsT)
          .leftJoin(wordsT, eq(definitionsT.wordId, wordsT.id))
          .where(baseWhere),
      ])

      results.push(...defRows.map(d => ({
        type: 'definition',
        id: d.def.id,
        definition: d.def.definition,
        word: d.word ? {
          id: d.word.id,
          word: d.word.word,
          normalized_word: d.word.normalizedWord,
          language: d.lang ? { id: d.lang.id, code: d.lang.code, name: d.lang.name, native_name: d.lang.nativeName } : null,
          word_class: d.wc ? { id: d.wc.id, name: d.wc.name, abbreviation: d.wc.abbreviation } : null
        } : null,
        match_score: calculateMatchScore(d.def.definition, query)
      })))
      totalCount += totalRows[0]?.value ?? 0
    }

    if (search_type === 'all' || search_type === 'translation') {
      const baseWhere = languageId
        ? and(ilike(translationsT.translation, like), eq(wordsT.languageId, languageId))
        : ilike(translationsT.translation, like)

      const [transRows, totalRows] = await Promise.all([
        db
          .select({ trans: translationsT, word: wordsT, wc: wordClassesT, lang: languagesT })
          .from(translationsT)
          .leftJoin(wordsT, eq(translationsT.wordId, wordsT.id))
          .leftJoin(wordClassesT, eq(wordsT.wordClassId, wordClassesT.id))
          .leftJoin(languagesT, eq(wordsT.languageId, languagesT.id))
          .where(baseWhere)
          .limit(limit)
          .offset(offset),
        db
          .select({ value: count() })
          .from(translationsT)
          .leftJoin(wordsT, eq(translationsT.wordId, wordsT.id))
          .where(baseWhere),
      ])

      results.push(...transRows.map(t => ({
        type: 'translation',
        id: t.trans.id,
        translation: t.trans.translation,
        target_language: t.trans.targetLanguage,
        word: t.word ? {
          id: t.word.id,
          word: t.word.word,
          normalized_word: t.word.normalizedWord,
          language: t.lang ? { id: t.lang.id, code: t.lang.code, name: t.lang.name, native_name: t.lang.nativeName } : null,
          word_class: t.wc ? { id: t.wc.id, name: t.wc.name, abbreviation: t.wc.abbreviation } : null
        } : null,
        match_score: calculateMatchScore(t.trans.translation, query)
      })))
      totalCount += totalRows[0]?.value ?? 0
    }

    results.sort((a, b) => b.match_score - a.match_score)

    const totalPages = Math.ceil(totalCount / limit)

    return createSuccessResponse({
      results: results.slice(0, limit),
      pagination: {
        page,
        limit,
        total: totalCount,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_previous: page > 1
      },
      search_params: {
        query,
        type: search_type,
        dictionary_id: dictionary_id || null,
        dictionary_code: dictionary_code || null
      }
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return createErrorResponse('Internal server error', 500)
  }
}

function calculateMatchScore(text: string, query: string): number {
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()

  if (lowerText === lowerQuery) return 100
  if (lowerText.startsWith(lowerQuery)) return 90
  if (lowerText.includes(lowerQuery)) return 70

  const words = lowerText.split(/\s+/)
  if (words.some(w => w === lowerQuery)) return 80
  if (words.some(w => w.startsWith(lowerQuery))) return 60

  return 50
}
