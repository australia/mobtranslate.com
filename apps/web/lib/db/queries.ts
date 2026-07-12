import { and, asc, count, desc, eq, ilike, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { db } from './index';
import {
  culturalContexts as culturalContextsT,
  definitions as definitionsT,
  languages as languagesT,
  synonyms as synonymsT,
  translations as translationsT,
  usageExamples as usageExamplesT,
  wordClasses as wordClassesT,
  words as wordsT,
} from './schema';
import type {
  DictionaryQueryParams,
  Language,
  Word,
  WordClass,
} from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Drizzle-backed dictionary queries (replaces lib/supabase/queries.ts).
//
// IMPORTANT: the UI consumers (pages + transformWordsForUI) expect snake_case,
// nested shapes (the old Supabase row shape). Drizzle returns camelCase, so we
// map every result back to the `Word`/`Language`/`WordClass` interfaces in
// lib/supabase/types.ts. Keep these return shapes identical to the old module.
// ---------------------------------------------------------------------------

type LangRow = typeof languagesT.$inferSelect;
type WordRow = typeof wordsT.$inferSelect;
type WordClassRow = typeof wordClassesT.$inferSelect;
type DefRow = typeof definitionsT.$inferSelect;
type TransRow = typeof translationsT.$inferSelect;
type UsageRow = typeof usageExamplesT.$inferSelect;

function mapLanguage(l: LangRow): Language {
  return {
    id: l.id,
    code: l.code,
    name: l.name,
    native_name: l.nativeName ?? '',
    description: l.description ?? undefined,
    region: l.region ?? undefined,
    country: l.country ?? undefined,
    status: l.status ?? undefined,
    family: l.family ?? undefined,
    writing_system: l.writingSystem ?? undefined,
    is_active: l.isActive ?? false,
  };
}

function mapWordClass(wc: WordClassRow): WordClass {
  return {
    id: wc.id,
    code: wc.code,
    name: wc.name,
    abbreviation: wc.abbreviation ?? undefined,
    description: wc.description ?? undefined,
    parent_id: wc.parentId ?? undefined,
    sort_order: wc.sortOrder ?? undefined,
  };
}

function mapTranslation(t: TransRow) {
  return {
    id: t.id,
    word_id: t.wordId,
    definition_id: t.definitionId ?? undefined,
    translation: t.translation,
    target_language: t.targetLanguage ?? undefined,
    translation_type: t.translationType ?? undefined,
    is_primary: t.isPrimary ?? undefined,
    notes: t.notes ?? undefined,
  };
}

function mapDefinition(d: DefRow, translations: TransRow[]) {
  return {
    id: d.id,
    word_id: d.wordId,
    definition: d.definition,
    definition_number: d.definitionNumber ?? undefined,
    context: d.context ?? undefined,
    register: d.register ?? undefined,
    domain: d.domain ?? undefined,
    is_primary: d.isPrimary ?? undefined,
    notes: d.notes ?? undefined,
    translations: translations.map(mapTranslation),
  };
}

function mapUsageExample(u: UsageRow) {
  return {
    id: u.id,
    word_id: u.wordId,
    definition_id: u.definitionId ?? undefined,
    example_text: u.exampleText,
    translation: u.translation ?? undefined,
    transliteration: u.transliteration ?? undefined,
    context: u.context ?? undefined,
    source: u.source ?? undefined,
    notes: u.notes ?? undefined,
  };
}

function mapWord(
  w: WordRow,
  opts: {
    wordClass?: WordClassRow | null;
    definitions?: ReturnType<typeof mapDefinition>[];
    usageExamples?: ReturnType<typeof mapUsageExample>[];
  } = {}
): Word {
  return {
    id: w.id,
    language_id: w.languageId,
    word: w.word,
    normalized_word: w.normalizedWord ?? undefined,
    phonetic_transcription: w.phoneticTranscription ?? undefined,
    word_class_id: w.wordClassId ?? undefined,
    word_type: w.wordType ?? undefined,
    gender: w.gender ?? undefined,
    number: w.number ?? undefined,
    stem: w.stem ?? undefined,
    is_loan_word: w.isLoanWord ?? undefined,
    loan_source_language: w.loanSourceLanguage ?? undefined,
    frequency_score: w.frequencyScore ?? undefined,
    register: w.register ?? undefined,
    domain: w.domain ?? undefined,
    dialectal_variation: w.dialectalVariation ?? undefined,
    obsolete: w.obsolete ?? undefined,
    sensitive_content: w.sensitiveContent ?? undefined,
    notes: w.notes ?? undefined,
    is_location: w.isLocation ?? undefined,
    latitude: w.latitude ?? undefined,
    longitude: w.longitude ?? undefined,
    metadata: (w.metadata as Record<string, any>) ?? undefined,
    created_at: w.createdAt ?? undefined,
    updated_at: w.updatedAt ?? undefined,
    word_class: opts.wordClass ? mapWordClass(opts.wordClass) : undefined,
    definitions: opts.definitions ?? [],
    usage_examples: opts.usageExamples ?? [],

    // Expanded linguistic fields.
    phonemic: w.phonemic ?? undefined,
    gloss: w.gloss ?? undefined,
    semantic_domain: w.semanticDomain ?? undefined,
    verb_class: w.verbClass ?? undefined,
    dialect: w.dialect ?? undefined,
    loanword_source: w.loanwordSource ?? undefined,
    entry_source: w.entrySource ?? undefined,
    commentary: toStringArray(w.commentary),
    usage_notes: toStringArray(w.usageNotes),
    // see_also entries are sometimes comma-joined ("a, b") — flatten to tokens.
    see_also: ((toStringArray(w.seeAlso) ?? []).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean)) || undefined,
    derivation: (w.derivation as Word['derivation']) ?? undefined,
    reduplication: (w.reduplication as Word['reduplication']) ?? undefined,
  };
}

/** Normalize a jsonb value that should be a string[] (tolerates string / null). */
function toStringArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return undefined;
}

export async function getLanguageByCode(code: string): Promise<Language> {
  const rows = await db
    .select()
    .from(languagesT)
    .where(and(eq(languagesT.code, code), eq(languagesT.isActive, true)))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(`Language '${code}' not found`);
  }
  return mapLanguage(rows[0]);
}

export async function getActiveLanguages(): Promise<Language[]> {
  const rows = await db
    .select()
    .from(languagesT)
    .where(eq(languagesT.isActive, true))
    .orderBy(asc(languagesT.name));
  return rows.map(mapLanguage);
}

// ---------------------------------------------------------------------------
// Dictionaries index — one efficient query that surfaces the source/provenance
// TIER for every active language plus its word count, in a single round-trip
// (avoids the per-language N+1 that getLanguageStats does). Used by the
// /dictionaries list so it can honestly separate curated community
// dictionaries, community-sourced (Wiktionary) wordlists, and the OCR'd
// E.M. Curr 1886-87 historical vocabularies.
// ---------------------------------------------------------------------------

/** Machine-readable trust tier for a dictionary's provenance. */
export type DictionaryTierId = 'curated' | 'wiktionary' | 'curr';

export interface DictionaryLanguage {
  code: string;
  name: string;
  description?: string;
  region?: string;
  family?: string;
  status?: string;
  wordCount: number;
  /** Normalized provenance tier. */
  tierId: DictionaryTierId;
  /** Raw metadata->>'tier' label, if any. */
  tierLabel?: string;
  /** Raw metadata->>'source' label, if any. */
  source?: string;
  /** metadata->>'source_url' when present (e.g. the archive.org scan). */
  sourceUrl?: string;
  /** For Curr entries, the raw locality string transcribed from the source. */
  locality?: string;
}

export async function getDictionaryLanguages(): Promise<DictionaryLanguage[]> {
  const rows = await db
    .select({
      id: languagesT.id,
      code: languagesT.code,
      name: languagesT.name,
      description: languagesT.description,
      region: languagesT.region,
      family: languagesT.family,
      status: languagesT.status,
      metadata: languagesT.metadata,
    })
    .from(languagesT)
    .where(eq(languagesT.isActive, true))
    .orderBy(asc(languagesT.name));

  // Word counts via a single GROUP BY, merged in JS. (A correlated subquery of
  // the form `WHERE w.language_id = <languages.id>` mis-resolved through
  // Drizzle's column interpolation — the unqualified `id` bound to words.id and
  // every count came back 0. GROUP BY + map is unambiguous and one round-trip.)
  const counts = await db
    .select({ languageId: wordsT.languageId, n: count() })
    .from(wordsT)
    .groupBy(wordsT.languageId);
  const countMap = new Map<string, number>();
  for (const c of counts) {
    if (c.languageId) countMap.set(c.languageId as string, Number(c.n));
  }

  return rows.map((r) => {
    const md = (r.metadata as Record<string, any> | null) ?? {};
    const rawTierId = typeof md.tier_id === 'string' ? md.tier_id : '';
    const tierId: DictionaryTierId =
      rawTierId === 'curr' ? 'curr' : rawTierId === 'wiktionary' ? 'wiktionary' : 'curated';
    return {
      code: r.code,
      name: r.name,
      description: r.description ?? undefined,
      region: r.region ?? undefined,
      family: r.family ?? undefined,
      status: r.status ?? undefined,
      wordCount: countMap.get(r.id as string) ?? 0,
      tierId,
      tierLabel: typeof md.tier === 'string' && md.tier ? md.tier : undefined,
      source: typeof md.source === 'string' && md.source ? md.source : undefined,
      sourceUrl: typeof md.source_url === 'string' && md.source_url ? md.source_url : undefined,
      locality: typeof md.locality === 'string' && md.locality ? md.locality : undefined,
    };
  });
}

export async function getWordsForLanguage({
  language,
  search,
  page = 1,
  limit = 50,
  sortBy = 'word',
  sortOrder = 'asc',
  wordClass,
  letter,
}: DictionaryQueryParams) {
  const languageData = await getLanguageByCode(language!);

  // Build filters
  const filters = [eq(wordsT.languageId, languageData.id)];

  if (search) {
    const like = `%${search}%`;
    filters.push(
      or(ilike(wordsT.word, like), ilike(wordsT.normalizedWord, like))!
    );
  }

  if (wordClass) {
    const wc = await db
      .select({ id: wordClassesT.id })
      .from(wordClassesT)
      .where(eq(wordClassesT.code, wordClass))
      .limit(1);
    if (wc.length > 0) {
      filters.push(eq(wordsT.wordClassId, wc[0].id));
    }
  }

  if (letter) {
    filters.push(ilike(wordsT.word, `${letter}%`));
  }

  const where = and(...filters);
  const dir = sortOrder === 'asc' ? asc : desc;
  const orderCol =
    sortBy === 'created_at'
      ? wordsT.createdAt
      : sortBy === 'frequency_score'
        ? wordsT.frequencyScore
        : wordsT.normalizedWord;

  const offset = (page - 1) * limit;

  // Page of words + their word_class (left join), plus exact total count.
  const [rows, totalRows] = await Promise.all([
    db
      .select({ word: wordsT, wordClass: wordClassesT })
      .from(wordsT)
      .leftJoin(wordClassesT, eq(wordsT.wordClassId, wordClassesT.id))
      .where(where)
      .orderBy(dir(orderCol))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(wordsT).where(where),
  ]);

  const totalCount = totalRows[0]?.value ?? 0;

  const pagination = {
    total: totalCount,
    page,
    limit,
    totalPages: Math.ceil(totalCount / limit),
    hasNext: page * limit < totalCount,
    hasPrev: page > 1,
  };

  if (rows.length === 0) {
    return { words: [] as Word[], pagination, language: languageData };
  }

  const wordIds = rows.map((r) => r.word.id);

  // Definitions (+ their translations) and usage examples for this page.
  const [defs, defTranslations, usages] = await Promise.all([
    db.select().from(definitionsT).where(inArray(definitionsT.wordId, wordIds)),
    db
      .select()
      .from(translationsT)
      .where(inArray(translationsT.wordId, wordIds)),
    db
      .select()
      .from(usageExamplesT)
      .where(inArray(usageExamplesT.wordId, wordIds)),
  ]);

  const transByDef = new Map<string, TransRow[]>();
  for (const t of defTranslations) {
    if (!t.definitionId) continue;
    const arr = transByDef.get(t.definitionId) ?? [];
    arr.push(t);
    transByDef.set(t.definitionId, arr);
  }

  const defsByWord = new Map<string, ReturnType<typeof mapDefinition>[]>();
  for (const d of defs) {
    const arr = defsByWord.get(d.wordId) ?? [];
    arr.push(mapDefinition(d, transByDef.get(d.id) ?? []));
    defsByWord.set(d.wordId, arr);
  }

  const usagesByWord = new Map<string, ReturnType<typeof mapUsageExample>[]>();
  for (const u of usages) {
    const arr = usagesByWord.get(u.wordId) ?? [];
    arr.push(mapUsageExample(u));
    usagesByWord.set(u.wordId, arr);
  }

  const words = rows.map((r) =>
    mapWord(r.word, {
      wordClass: r.wordClass,
      definitions: defsByWord.get(r.word.id) ?? [],
      usageExamples: usagesByWord.get(r.word.id) ?? [],
    })
  );

  return { words, pagination, language: languageData };
}

export async function getWordClasses() {
  const rows = await db
    .select()
    .from(wordClassesT)
    .orderBy(asc(wordClassesT.sortOrder));
  return rows.map(mapWordClass);
}

// ---------------------------------------------------------------------------
// Single-word + search + stats helpers (ported from lib/supabase/queries.ts).
// ---------------------------------------------------------------------------

type CulturalContextRow = typeof culturalContextsT.$inferSelect;

function mapCulturalContext(c: CulturalContextRow) {
  return {
    id: c.id,
    word_id: c.wordId,
    context_description: c.contextDescription,
    cultural_significance: c.culturalSignificance ?? undefined,
    usage_restrictions: c.usageRestrictions ?? undefined,
    ceremonial_use: c.ceremonialUse ?? undefined,
    gender_specific: c.genderSpecific ?? undefined,
    age_specific: c.ageSpecific ?? undefined,
    sacred_or_taboo: c.sacredOrTaboo ?? undefined,
    notes: c.notes ?? undefined,
  };
}

// Assemble the nested definitions/translations/usage-examples/cultural-contexts
// for a set of words in bulk (one query per relation), mirroring the old
// Supabase embed shape.
async function attachRelationsToWords(
  rows: { word: WordRow; wordClass: WordClassRow | null }[]
): Promise<Word[]> {
  if (rows.length === 0) return [];
  const wordIds = rows.map((r) => r.word.id);

  const [defs, defTranslations, usages, cultural] = await Promise.all([
    db.select().from(definitionsT).where(inArray(definitionsT.wordId, wordIds)),
    db.select().from(translationsT).where(inArray(translationsT.wordId, wordIds)),
    db.select().from(usageExamplesT).where(inArray(usageExamplesT.wordId, wordIds)),
    db
      .select()
      .from(culturalContextsT)
      .where(inArray(culturalContextsT.wordId, wordIds)),
  ]);

  const transByDef = new Map<string, TransRow[]>();
  for (const t of defTranslations) {
    if (!t.definitionId) continue;
    const arr = transByDef.get(t.definitionId) ?? [];
    arr.push(t);
    transByDef.set(t.definitionId, arr);
  }

  const defsByWord = new Map<string, ReturnType<typeof mapDefinition>[]>();
  for (const d of defs) {
    const arr = defsByWord.get(d.wordId) ?? [];
    arr.push(mapDefinition(d, transByDef.get(d.id) ?? []));
    defsByWord.set(d.wordId, arr);
  }

  const usagesByWord = new Map<string, ReturnType<typeof mapUsageExample>[]>();
  for (const u of usages) {
    const arr = usagesByWord.get(u.wordId) ?? [];
    arr.push(mapUsageExample(u));
    usagesByWord.set(u.wordId, arr);
  }

  const culturalByWord = new Map<string, ReturnType<typeof mapCulturalContext>[]>();
  for (const c of cultural) {
    const arr = culturalByWord.get(c.wordId) ?? [];
    arr.push(mapCulturalContext(c));
    culturalByWord.set(c.wordId, arr);
  }

  return rows.map((r) => {
    const w = mapWord(r.word, {
      wordClass: r.wordClass,
      definitions: defsByWord.get(r.word.id) ?? [],
      usageExamples: usagesByWord.get(r.word.id) ?? [],
    });
    w.cultural_contexts = culturalByWord.get(r.word.id) ?? [];
    return w;
  });
}

export async function getWordById(wordId: string): Promise<Word | null> {
  const rows = await db
    .select({ word: wordsT, wordClass: wordClassesT })
    .from(wordsT)
    .leftJoin(wordClassesT, eq(wordsT.wordClassId, wordClassesT.id))
    .where(eq(wordsT.id, wordId))
    .limit(1);

  if (rows.length === 0) return null;

  const [assembled] = await attachRelationsToWords(rows);
  const lang = await db
    .select()
    .from(languagesT)
    .where(eq(languagesT.id, assembled.language_id))
    .limit(1);
  if (lang.length > 0) {
    (assembled as any).language = mapLanguage(lang[0]);
  }
  return assembled;
}

export async function searchWords(
  searchTerm: string,
  languageCode?: string
): Promise<Word[]> {
  const like = `%${searchTerm}%`;
  const filters = [
    or(ilike(wordsT.word, like), ilike(wordsT.normalizedWord, like))!,
  ];

  if (languageCode) {
    const languageData = await getLanguageByCode(languageCode);
    filters.push(eq(wordsT.languageId, languageData.id));
  }

  const rows = await db
    .select({ word: wordsT, wordClass: wordClassesT })
    .from(wordsT)
    .leftJoin(wordClassesT, eq(wordsT.wordClassId, wordClassesT.id))
    .where(and(...filters))
    .limit(20);

  const assembled = await attachRelationsToWords(rows);

  // Old query also embedded language:languages(*); attach per-word.
  const langIds = Array.from(new Set(assembled.map((w) => w.language_id)));
  if (langIds.length > 0) {
    const langs = await db
      .select()
      .from(languagesT)
      .where(inArray(languagesT.id, langIds));
    const langById = new Map(langs.map((l) => [l.id, mapLanguage(l)]));
    for (const w of assembled) {
      const l = langById.get(w.language_id);
      if (l) (w as any).language = l;
    }
  }

  return assembled;
}

export async function getLanguageStats() {
  const langs = await db
    .select({ id: languagesT.id, name: languagesT.name, code: languagesT.code })
    .from(languagesT)
    .where(eq(languagesT.isActive, true));

  const totalRows = await db.select({ value: count() }).from(wordsT);
  const totalWords = totalRows[0]?.value ?? 0;

  const languageCounts: Record<string, number> = {};
  for (const lang of langs) {
    const c = await db
      .select({ value: count() })
      .from(wordsT)
      .where(eq(wordsT.languageId, lang.id));
    languageCounts[lang.code] = c[0]?.value ?? 0;
  }

  return {
    totalLanguages: langs.length,
    totalWords,
    wordsByLanguage: languageCounts,
  };
}

export async function getLocationWordsForLanguage(languageCode: string) {
  const languageData = await getLanguageByCode(languageCode);

  const rows = await db
    .select({ word: wordsT, wordClass: wordClassesT })
    .from(wordsT)
    .leftJoin(wordClassesT, eq(wordsT.wordClassId, wordClassesT.id))
    .where(
      and(
        eq(wordsT.languageId, languageData.id),
        eq(wordsT.isLocation, true),
        isNotNull(wordsT.latitude),
        isNotNull(wordsT.longitude)
      )
    )
    .orderBy(asc(wordsT.word));

  const wordIds = rows.map((r) => r.word.id);
  const defs =
    wordIds.length > 0
      ? await db
          .select({ wordId: definitionsT.wordId, definition: definitionsT.definition })
          .from(definitionsT)
          .where(inArray(definitionsT.wordId, wordIds))
      : [];
  const defsByWord = new Map<string, Array<{ definition: string }>>();
  for (const d of defs) {
    const arr = defsByWord.get(d.wordId) ?? [];
    arr.push({ definition: d.definition });
    defsByWord.set(d.wordId, arr);
  }

  const normalized = rows.map((r) => ({
    id: r.word.id,
    word: r.word.word,
    normalized_word: r.word.normalizedWord ?? undefined,
    is_location: r.word.isLocation as boolean,
    latitude: r.word.latitude as number,
    longitude: r.word.longitude as number,
    word_type: r.word.wordType ?? undefined,
    word_class: r.wordClass ? { name: r.wordClass.name } : undefined,
    definitions: defsByWord.get(r.word.id),
  }));

  return {
    words: normalized,
    language: languageData,
  };
}

/** Synonyms for a word (text + optional link to another entry). Detail-page only. */
export async function getWordSynonyms(wordId: string): Promise<{ text: string; word_id: string | null }[]> {
  const rows = await db
    .select({ text: synonymsT.synonymText, wordId: synonymsT.synonymWordId })
    .from(synonymsT)
    .where(eq(synonymsT.wordId, wordId));
  return rows
    .map((r) => ({ text: (r.text ?? '').trim(), word_id: r.wordId ?? null }))
    .filter((r) => r.text.length > 0);
}
