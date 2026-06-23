import { and, asc, count, eq, ilike, inArray, or } from 'drizzle-orm'
import { db } from '@/lib/db/index'
import {
  antonyms as antonymsT,
  audioPronunciations as audioPronunciationsT,
  definitions as definitionsT,
  etymologies as etymologiesT,
  languages as languagesT,
  synonyms as synonymsT,
  translations as translationsT,
  usageExamples as usageExamplesT,
  wordClasses as wordClassesT,
  words as wordsT,
} from '@/lib/db/schema'
import { createSuccessResponse, createErrorResponse, corsHeaders } from '../../../../middleware'
import { NextRequest } from 'next/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders() })
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params
    const searchParams = request.nextUrl.searchParams

    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = (page - 1) * limit
    const search = searchParams.get('search') || ''
    const word_class = searchParams.get('word_class') || ''
    const verified_only = searchParams.get('verified_only') === 'true'

    const idOrCode = UUID_RE.test(id)
      ? or(eq(languagesT.id, id), eq(languagesT.code, id))!
      : eq(languagesT.code, id)

    const langRows = await db
      .select({ id: languagesT.id })
      .from(languagesT)
      .where(and(idOrCode, eq(languagesT.isActive, true)))
      .limit(1)

    const language = langRows[0]
    if (!language) {
      return createErrorResponse('Dictionary not found', 404)
    }

    const filters = [eq(wordsT.languageId, language.id)]
    if (search) {
      filters.push(or(ilike(wordsT.word, `%${search}%`), ilike(wordsT.normalizedWord, `%${search}%`))!)
    }
    if (word_class) {
      filters.push(eq(wordsT.wordClassId, word_class))
    }
    if (verified_only) {
      filters.push(eq(wordsT.isVerified, true))
    }
    const where = and(...filters)

    const [rows, totalRows] = await Promise.all([
      db
        .select({ word: wordsT, wordClass: wordClassesT })
        .from(wordsT)
        .leftJoin(wordClassesT, eq(wordsT.wordClassId, wordClassesT.id))
        .where(where)
        .orderBy(asc(wordsT.word))
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(wordsT).where(where),
    ])

    const wordIds = rows.map(r => r.word.id)

    const [defs, trans, usages, syns, ants, etys, audios] = wordIds.length > 0
      ? await Promise.all([
          db.select().from(definitionsT).where(inArray(definitionsT.wordId, wordIds)),
          db.select().from(translationsT).where(inArray(translationsT.wordId, wordIds)),
          db.select().from(usageExamplesT).where(inArray(usageExamplesT.wordId, wordIds)),
          db
            .select({ syn: synonymsT, related: wordsT })
            .from(synonymsT)
            .leftJoin(wordsT, eq(synonymsT.synonymWordId, wordsT.id))
            .where(inArray(synonymsT.wordId, wordIds)),
          db
            .select({ ant: antonymsT, related: wordsT })
            .from(antonymsT)
            .leftJoin(wordsT, eq(antonymsT.antonymWordId, wordsT.id))
            .where(inArray(antonymsT.wordId, wordIds)),
          db.select().from(etymologiesT).where(inArray(etymologiesT.wordId, wordIds)),
          db.select().from(audioPronunciationsT).where(inArray(audioPronunciationsT.wordId, wordIds)),
        ])
      : [[], [], [], [], [], [], []] as any

    const group = <T,>(items: T[], key: (t: T) => string | null | undefined) => {
      const m = new Map<string, T[]>()
      for (const it of items) {
        const k = key(it)
        if (!k) continue
        const arr = m.get(k) ?? []
        arr.push(it)
        m.set(k, arr)
      }
      return m
    }

    const defsByWord = group(defs, (d: any) => d.wordId)
    const transByWord = group(trans, (t: any) => t.wordId)
    const usagesByWord = group(usages, (u: any) => u.wordId)
    const synsByWord = group(syns, (s: any) => s.syn.wordId)
    const antsByWord = group(ants, (a: any) => a.ant.wordId)
    const etysByWord = group(etys, (e: any) => e.wordId)
    const audiosByWord = group(audios, (a: any) => a.wordId)

    const formattedWords = rows.map(r => {
      const word = r.word
      const wc = r.wordClass
      return {
        id: word.id,
        word: word.word,
        normalized_word: word.normalizedWord,
        phonetic_transcription: word.phoneticTranscription,
        word_class: wc ? {
          id: wc.id,
          name: wc.name,
          abbreviation: wc.abbreviation
        } : null,
        word_type: word.wordType,
        gender: word.gender,
        number: word.number,
        stem: word.stem,
        is_loan_word: word.isLoanWord,
        loan_source_language: word.loanSourceLanguage,
        frequency_score: word.frequencyScore,
        register: word.register,
        domain: word.domain,
        dialectal_variation: word.dialectalVariation,
        obsolete: word.obsolete,
        sensitive_content: word.sensitiveContent,
        notes: word.notes,
        is_verified: word.isVerified,
        quality_score: word.qualityScore,
        created_at: word.createdAt,
        updated_at: word.updatedAt,
        definitions: (defsByWord.get(word.id) ?? []).map((d: any) => ({
          id: d.id,
          definition: d.definition,
          definition_number: d.definitionNumber,
          context: d.context,
          register: d.register,
          domain: d.domain,
          is_primary: d.isPrimary,
          notes: d.notes,
        })),
        translations: (transByWord.get(word.id) ?? []).map((t: any) => ({
          id: t.id,
          translation: t.translation,
          target_language: t.targetLanguage,
          is_primary: t.isPrimary,
          notes: t.notes,
        })),
        usage_examples: (usagesByWord.get(word.id) ?? []).map((u: any) => ({
          id: u.id,
          example: u.exampleText,
          translation: u.translation,
          context: u.context,
          source: u.source,
        })),
        synonyms: (synsByWord.get(word.id) ?? []).map((s: any) => ({
          id: s.related?.id,
          word: s.related?.word
        })),
        antonyms: (antsByWord.get(word.id) ?? []).map((a: any) => ({
          id: a.related?.id,
          word: a.related?.word
        })),
        etymologies: (etysByWord.get(word.id) ?? []).map((e: any) => ({
          id: e.id,
          origin_language: e.originLanguage,
          origin_word: e.originWord,
          description: e.etymologyDescription,
          period: e.borrowedDate,
        })),
        audio_pronunciations: (audiosByWord.get(word.id) ?? []).map((a: any) => ({
          id: a.id,
          audio_url: a.audioUrl,
          dialect: a.dialect,
        })),
      }
    })

    const total = totalRows[0]?.value ?? 0
    const totalPages = total ? Math.ceil(total / limit) : 0

    return createSuccessResponse({
      words: formattedWords,
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
