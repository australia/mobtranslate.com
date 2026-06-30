import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { and, asc, countDistinct, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/index'
import {
  definitions as definitionsT,
  languages as languagesT,
  usageExamples as usageExamplesT,
  words as wordsT,
} from '@/lib/db/schema'
import { cacheKey, SITE, WOTD_DIR } from '@/lib/word-image'
import { requestImage } from '@/lib/image-queue'

// Return the public URL of an already-cached image for (lang, word), or null.
// Non-blocking: only touches the filesystem, never generates.
async function peekCachedImage(lang: string, word: string): Promise<string | null> {
  const key = cacheKey(lang, word)
  for (const ext of ['jpg', 'png']) {
    try {
      await fs.access(path.join(WOTD_DIR, `${key}.${ext}`))
      return `${SITE}/wotd/${key}.${ext}`
    } catch {
      /* not present */
    }
  }
  return null
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Allow the (one-time, then cached) image generation to finish.
export const maxDuration = 300

type Wotd = {
  word: string
  pronunciation?: string | null
  meaning?: string | null
  example?: string | null
  imageUrl?: string | null
}

// ---------------------------------------------------------------------------
// Curated fallback content (a few words per language) — used only when the DB
// query is unavailable or returns nothing. Editorial content is acceptable.
// ---------------------------------------------------------------------------
const CURATED: Record<string, Array<{ word: string; meaning: string; example?: string }>> = {
  kuku_yalanji: [
    { word: 'bama', meaning: 'noun · person, Aboriginal person' },
    { word: 'minya', meaning: 'noun · meat, animal' },
    { word: 'jarba', meaning: 'noun · snake' },
    { word: 'wawu', meaning: 'noun · breath, spirit' },
    { word: 'bubu', meaning: 'noun · ground, country, place' },
  ],
  anindilyakwa: [
    { word: 'eka', meaning: 'noun · fire' },
    { word: 'akwalya', meaning: 'noun · fish' },
    { word: 'amburrkba', meaning: 'noun · star' },
  ],
  migmaq: [
    { word: 'wjit', meaning: 'preposition · for, on behalf of' },
    { word: 'nemitu', meaning: 'verb · to see it' },
    { word: 'samqwan', meaning: 'noun · water' },
  ],
  wbv: [
    { word: 'wardu', meaning: 'noun · water' },
    { word: 'mayu', meaning: 'noun · food' },
  ],
}

// Deterministic 32-bit hash of a string → non-negative integer.
function hashSeed(s: string): number {
  const h = crypto.createHash('sha256').update(s).digest()
  return h.readUInt32BE(0)
}

function utcDateString(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
}

// Clean a syllable hint: no doubled / leading / trailing hyphens, collapse
// repeats. Returns null rather than something ugly.
function cleanSyllableHint(word: string): string | null {
  const w = (word || '').trim()
  if (w.length < 4) return null
  const parts = w.match(/[^aeiouAEIOU]*[aeiouAEIOU]+(?:[^aeiouAEIOU]*$)?/g)
  if (!parts || parts.length < 2) return null
  const hint = parts
    .join('-')
    .replace(/-{2,}/g, '-') // collapse doubled hyphens
    .replace(/^-+|-+$/g, '') // strip leading/trailing hyphens
  // Guard against a degenerate result that didn't actually split anything useful.
  if (!hint || !hint.includes('-') || hint === w) return null
  return hint
}

// Choose a clean pronunciation: prefer a real phonetic/phonemic field from the
// DB; else a clean syllable hint; else omit (null) rather than show garbage.
function choosePronunciation(
  phonetic: string | null | undefined,
  phonemic: string | null | undefined,
  word: string,
): string | null {
  const p = (phonetic ?? '').trim()
  if (p) return p
  const ph = (phonemic ?? '').trim()
  if (ph) return ph
  return cleanSyllableHint(word)
}

// ---------------------------------------------------------------------------
// Pick the word of the day deterministically from the DB.
// Prefer words that HAVE a definition AND ideally a usage example, and avoid
// is_location place-name entries when a normal word is available.
// ---------------------------------------------------------------------------
async function pickFromDb(lang: string, seed: number): Promise<Wotd | null> {
  const langRows = await db
    .select({ id: languagesT.id })
    .from(languagesT)
    .where(and(eq(languagesT.code, lang), eq(languagesT.isActive, true)))
    .limit(1)
  const languageId = langRows[0]?.id
  if (!languageId) return null

  const hasDef = sql`EXISTS (SELECT 1 FROM ${definitionsT} d WHERE d.word_id = ${wordsT.id})`
  const hasExample = sql`EXISTS (SELECT 1 FROM ${usageExamplesT} u WHERE u.word_id = ${wordsT.id})`
  // is_location can be NULL or false; treat NULL as not-a-place.
  const notPlace = sql`(${wordsT.isLocation} IS NOT TRUE)`

  // Candidate tiers, strongest first: (1) def + example + not-place,
  // (2) def + not-place, (3) def only (last resort, may be a place name).
  const tiers = [
    and(eq(wordsT.languageId, languageId), eq(wordsT.obsolete, false), hasDef, hasExample, notPlace),
    and(eq(wordsT.languageId, languageId), eq(wordsT.obsolete, false), hasDef, notPlace),
    and(eq(wordsT.languageId, languageId), eq(wordsT.obsolete, false), hasDef),
  ]

  let baseWhere: any = null
  let total = 0
  for (const where of tiers) {
    const countRows = await db
      .select({ value: countDistinct(wordsT.id) })
      .from(wordsT)
      .where(where)
    total = countRows[0]?.value ?? 0
    if (total > 0) {
      baseWhere = where
      break
    }
  }
  if (!baseWhere || !total) return null

  const offset = seed % total

  const picked = await db
    .select({
      id: wordsT.id,
      word: wordsT.word,
      phonetic: wordsT.phoneticTranscription,
      phonemic: wordsT.phonemic,
    })
    .from(wordsT)
    .where(baseWhere)
    .orderBy(asc(wordsT.id))
    .limit(1)
    .offset(offset)

  const row = picked[0]
  if (!row) return null

  // Definition: prefer primary, else lowest definition_number / first.
  const defs = await db
    .select({
      definition: definitionsT.definition,
      isPrimary: definitionsT.isPrimary,
      num: definitionsT.definitionNumber,
    })
    .from(definitionsT)
    .where(eq(definitionsT.wordId, row.id))
  defs.sort((a, b) => {
    if (!!b.isPrimary !== !!a.isPrimary) return (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0)
    return (a.num ?? 999) - (b.num ?? 999)
  })
  const meaning = defs[0]?.definition ?? null

  // Example: first usage example with text.
  const examples = await db
    .select({ text: usageExamplesT.exampleText, translation: usageExamplesT.translation })
    .from(usageExamplesT)
    .where(eq(usageExamplesT.wordId, row.id))
    .limit(1)
  const ex = examples[0]
  const example = ex
    ? ex.translation
      ? `${ex.text} — ${ex.translation}`
      : ex.text
    : null

  return {
    word: row.word,
    pronunciation: choosePronunciation(row.phonetic, row.phonemic, row.word),
    meaning,
    example,
  }
}

function pickFromCurated(lang: string, seed: number): Wotd | null {
  const list = CURATED[lang]
  if (!list || list.length === 0) return null
  const item = list[seed % list.length]
  return {
    word: item.word,
    pronunciation: cleanSyllableHint(item.word),
    meaning: item.meaning,
    example: item.example ?? null,
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const lang = (request.nextUrl.searchParams.get('lang') || '').trim()
  if (!lang) {
    return NextResponse.json({ error: 'lang query parameter is required' }, { status: 400 })
  }

  const seed = hashSeed(`${utcDateString()}|${lang}`)

  let wotd: Wotd | null = null
  try {
    wotd = await pickFromDb(lang, seed)
  } catch (err: any) {
    console.error('[wotd] db pick failed', err?.message || err)
    wotd = null
  }
  if (!wotd) wotd = pickFromCurated(lang, seed)

  if (!wotd) {
    return NextResponse.json({ error: `No word available for language "${lang}"` }, { status: 404 })
  }

  // Best-effort image (cached forever after first generation). Uses the SAME
  // house-style + per-language prompt as /api/word-image, cached under public/wotd.
  //
  // If the image is ALREADY cached we return its URL immediately. If it is not
  // yet cached we kick off generation in the BACKGROUND and return without it:
  // gpt-image-2 at quality:"high" takes minutes, which exceeds the public edge
  // (Cloudflare) proxy timeout, so we must never block the response on a cold
  // generation. The image lands in the on-disk cache and is returned on the next
  // call. The mobile app already falls back to a bundled image when imageUrl is
  // absent, so this degrades gracefully. Still exactly ONE generation per word.
  const cached = await peekCachedImage(lang, wotd.word)
  if (cached) {
    wotd.imageUrl = cached
  } else {
    wotd.imageUrl = null
    void requestImage(lang, wotd.word, wotd.meaning ?? null, WOTD_DIR, '/wotd')
      .catch((err: any) => console.error('[wotd] background image gen failed', err?.message || err))
  }

  return NextResponse.json(wotd, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
}
