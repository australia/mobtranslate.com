import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/index'
import {
  antonyms as antonymsT,
  audioPronunciations as audioPronunciationsT,
  culturalContexts as culturalContextsT,
  definitions as definitionsT,
  etymologies as etymologiesT,
  languages as languagesT,
  synonyms as synonymsT,
  translations as translationsT,
  usageExamples as usageExamplesT,
  wordClasses as wordClassesT,
  wordDialects as wordDialectsT,
  wordRelationships as wordRelationshipsT,
  words as wordsT,
} from '@/lib/db/schema'
import { createSuccessResponse, createErrorResponse, corsHeaders } from '../../../middleware'
import { NextRequest } from 'next/server'

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders() })
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params

    const wordRows = await db
      .select({ word: wordsT, wordClass: wordClassesT, language: languagesT })
      .from(wordsT)
      .leftJoin(wordClassesT, eq(wordsT.wordClassId, wordClassesT.id))
      .leftJoin(languagesT, eq(wordsT.languageId, languagesT.id))
      .where(eq(wordsT.id, id))
      .limit(1)

    const row = wordRows[0]
    if (!row) {
      return createErrorResponse('Word not found', 404)
    }
    const word = row.word
    const wc = row.wordClass
    const lang = row.language

    const [defs, trans, usages, syns, ants, etys, audios, cultural, dialects, rels] =
      await Promise.all([
        db.select().from(definitionsT).where(eq(definitionsT.wordId, id)),
        db.select().from(translationsT).where(eq(translationsT.wordId, id)),
        db.select().from(usageExamplesT).where(eq(usageExamplesT.wordId, id)),
        db
          .select({ syn: synonymsT, related: wordsT })
          .from(synonymsT)
          .leftJoin(wordsT, eq(synonymsT.synonymWordId, wordsT.id))
          .where(eq(synonymsT.wordId, id)),
        db
          .select({ ant: antonymsT, related: wordsT })
          .from(antonymsT)
          .leftJoin(wordsT, eq(antonymsT.antonymWordId, wordsT.id))
          .where(eq(antonymsT.wordId, id)),
        db.select().from(etymologiesT).where(eq(etymologiesT.wordId, id)),
        db.select().from(audioPronunciationsT).where(eq(audioPronunciationsT.wordId, id)),
        db.select().from(culturalContextsT).where(eq(culturalContextsT.wordId, id)),
        db.select().from(wordDialectsT).where(eq(wordDialectsT.wordId, id)),
        db
          .select({ rel: wordRelationshipsT, related: wordsT })
          .from(wordRelationshipsT)
          .leftJoin(wordsT, eq(wordRelationshipsT.relatedWordId, wordsT.id))
          .where(eq(wordRelationshipsT.parentWordId, id)),
      ])

    const formattedWord = {
      id: word.id,
      word: word.word,
      normalized_word: word.normalizedWord,
      phonetic_transcription: word.phoneticTranscription,
      language: lang ? {
        id: lang.id,
        code: lang.code,
        name: lang.name,
        native_name: lang.nativeName
      } : null,
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
      metadata: word.metadata,
      is_verified: word.isVerified,
      quality_score: word.qualityScore,
      quality_flags: word.qualityFlags,
      created_at: word.createdAt,
      updated_at: word.updatedAt,
      verified_at: word.verifiedAt,
      last_reviewed_at: word.lastReviewedAt,
      review_count: word.reviewCount,
      community_notes: word.communityNotes,
      definitions: defs.map((d) => ({
        id: d.id,
        definition: d.definition,
        definition_number: d.definitionNumber,
        context: d.context,
        register: d.register,
        domain: d.domain,
        is_primary: d.isPrimary,
        notes: d.notes,
        created_at: d.createdAt,
      })),
      translations: trans.map((t) => ({
        id: t.id,
        translation: t.translation,
        target_language: t.targetLanguage,
        is_primary: t.isPrimary,
        notes: t.notes,
        created_at: t.createdAt,
      })),
      usage_examples: usages.map((u) => ({
        id: u.id,
        example: u.exampleText,
        translation: u.translation,
        context: u.context,
        source: u.source,
        created_at: u.createdAt,
      })),
      synonyms: syns.map((s) => ({
        id: s.related?.id,
        word: s.related?.word,
        normalized_word: s.related?.normalizedWord
      })),
      antonyms: ants.map((a) => ({
        id: a.related?.id,
        word: a.related?.word,
        normalized_word: a.related?.normalizedWord
      })),
      etymologies: etys.map((e) => ({
        id: e.id,
        origin_language: e.originLanguage,
        origin_word: e.originWord,
        description: e.etymologyDescription,
        period: e.borrowedDate,
        created_at: e.createdAt,
      })),
      audio_pronunciations: audios.map((a) => ({
        id: a.id,
        audio_url: a.audioUrl,
        dialect: a.dialect,
        created_at: a.createdAt,
      })),
      cultural_contexts: cultural.map((c) => ({
        id: c.id,
        description: c.contextDescription,
        usage_notes: c.usageRestrictions,
        created_at: c.createdAt,
      })),
      dialects: dialects.map((d) => ({
        id: d.id,
        variant: d.dialectalForm,
        pronunciation: d.pronunciationDifference,
        notes: d.notes,
      })),
      relationships: rels.map((r) => ({
        id: r.rel.id,
        type: r.rel.relationshipType,
        related_word: r.related ? {
          id: r.related.id,
          word: r.related.word,
          normalized_word: r.related.normalizedWord
        } : null,
        notes: r.rel.relationshipDescription
      }))
    }

    return createSuccessResponse(formattedWord)
  } catch (error) {
    console.error('Unexpected error:', error)
    return createErrorResponse('Internal server error', 500)
  }
}
