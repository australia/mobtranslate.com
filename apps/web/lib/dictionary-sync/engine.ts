import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as yaml from 'js-yaml';
import OpenAI from 'openai';
import { and, asc, eq, gt, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import {
  culturalContexts as culturalContextsT,
  definitions as definitionsT,
  dictionaryLocationCache as locationCacheT,
  dictionarySyncRuns as syncRunsT,
  dictionarySyncTasks as syncTasksT,
  languages as languagesT,
  synonyms as synonymsT,
  translations as translationsT,
  usageExamples as usageExamplesT,
  wordClasses as wordClassesT,
  words as wordsT,
} from '@/lib/db/schema';

// NOTE: this engine was migrated off the Supabase SDK onto Drizzle. The exported
// functions keep their original positional signatures (a leading `_supabase` arg)
// so existing callers (the admin route + the maintenance scripts) don't change;
// the argument is now IGNORED — all data access goes through the Drizzle `db`.
type IgnoredClient = unknown;

type SyncTaskType = 'yaml_sync' | 'location_enrichment';
type TriggerType = 'scheduler' | 'manual' | 'api' | 'cron';

interface RawDictionaryWord {
  word?: string;
  type?: string;
  definition?: string;
  definitions?: string[];
  translations?: string[];
  synonyms?: string[];
  example?: string;
  cultural_context?: string;
  // Legacy shape (objects) OR the enriched shape (plain strings = usage notes).
  usages?: Array<{ translation?: string; english?: string }> | string[];
  latitude?: number;
  longitude?: number;
  is_location?: boolean;
  // Academic enrichment fields (grounded in the Patz grammar; see
  // dictionaries/kuku_yalanji/SCHEMA.md). All optional and additive.
  phonemic?: string;
  gloss?: string;
  semantic_domain?: string;
  verb_class?: string;
  derivation?: { morpheme?: string; function?: string };
  reduplication?: { pattern?: string; base?: string };
  loanword?: { source?: string; reference?: string };
  dialect?: string;
  commentary?: string[];
  see_also?: string[];
  examples?: Array<{ kuku_yalanji?: string; english?: string }>;
  source?: string;
  [key: string]: unknown;
}

interface ParsedDictionaryFile {
  meta?: {
    name?: string;
    region?: string;
    country?: string;
    [key: string]: unknown;
  };
  words: RawDictionaryWord[];
}

interface NormalizedWord {
  sourceRef: string;
  yamlHash: string;
  word: string;
  normalizedWord: string;
  wordType: string | null;
  wordClassId: string | null;
  definitions: string[];
  translations: string[];
  synonyms: string[];
  usages: Array<{ example: string; translation: string | null }>;
  culturalContext: string | null;
  isLocation: boolean;
  latitude: number | null;
  longitude: number | null;
  // academic enrichment (see SCHEMA.md)
  phonemic: string | null;
  gloss: string | null;
  semanticDomain: string | null;
  verbClass: string | null;
  derivation: { morpheme?: string; function?: string } | null;
  reduplication: { pattern?: string; base?: string } | null;
  loanwordSource: string | null;
  dialect: string | null;
  commentary: string[];
  seeAlso: string[];
  usageNotes: string[];
  entrySource: string | null;
  needsReview: string | null;
}

interface SyncStats {
  words_scanned: number;
  words_upserted: number;
  words_deleted: number;
  definitions_upserted: number;
  translations_upserted: number;
  examples_upserted: number;
  location_candidates: number;
  locations_resolved: number;
  cache_hits: number;
  cache_misses: number;
  error_count: number;
  summary: Record<string, unknown>;
}

interface TaskConfig {
  batch_size?: number;
  prune_removed?: boolean;
  max_words_per_run?: number;
  max_candidates?: number;
  cache_ttl_days?: number;
  stale_after_days?: number;
  check_every_word?: boolean;
  ai_batch_size?: number;
  geocode_with_ai_fallback?: boolean;
  negative_cache_ttl_days?: number;
  max_geocode_queries_per_word?: number;
}

const DEFAULT_SYNC_CONFIG: Required<TaskConfig> = {
  batch_size: 500,
  prune_removed: true,
  max_words_per_run: 100000,
  max_candidates: 100000,
  cache_ttl_days: 36500,
  stale_after_days: 45,
  check_every_word: true,
  ai_batch_size: 200,
  geocode_with_ai_fallback: true,
  negative_cache_ttl_days: 14,
  max_geocode_queries_per_word: 6
};

const LOCATION_KEYWORDS = [
  'river',
  'creek',
  'beach',
  'island',
  'mountain',
  'hill',
  'bay',
  'lake',
  'cape',
  'valley',
  'country',
  'town',
  'city',
  'village',
  'place'
];

const COUNTRY_CODE_HINTS: Record<string, string> = {
  australia: 'au',
  canada: 'ca',
  usa: 'us',
  'united states': 'us',
  'united states of america': 'us'
};

function toCountryCode(country?: string | null): string | null {
  if (!country) {
    return null;
  }
  const key = country.trim().toLowerCase();
  return COUNTRY_CODE_HINTS[key] || null;
}

function isCoordinateInRoughCountryBounds(
  latitude: number,
  longitude: number,
  countryCode: string | null
): boolean {
  if (!countryCode) {
    return true;
  }

  if (countryCode === 'au') {
    return latitude >= -44.5 && latitude <= -10.0 && longitude >= 112.0 && longitude <= 154.0;
  }

  return true;
}

function chunk<T>(values: T[], size: number): T[][] {
  if (size <= 0) {
    return [values];
  }

  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ');
}

function titleizeFromCode(code: string): string {
  return code
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function hashString(value: string): string {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function cleanArray(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

function resolveDictionaryRoot(): string {
  const root = process.env.MOBTRANSLATE_DICTIONARIES_ROOT
    ? path.resolve(process.env.MOBTRANSLATE_DICTIONARIES_ROOT)
    : path.resolve(process.cwd(), '../../dictionaries');
  if (fs.existsSync(root) && fs.statSync(root).isDirectory()) {
    return root;
  }

  throw new Error('Unable to locate dictionaries folder');
}

function findDictionaryFile(languageCode: string, languageName?: string): string | null {
  const root = resolveDictionaryRoot();
  const candidates = [languageCode, languageName ? slugify(languageName) : null]
    .filter((entry): entry is string => !!entry)
    .map((entry) => path.join(/*turbopackIgnore: true*/ root, entry, 'dictionary.yaml'));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function discoverDictionaries(): Array<{ languageCode: string; filePath: string; sourceFile: string }> {
  const root = resolveDictionaryRoot();
  const subdirs = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const dictionaries: Array<{ languageCode: string; filePath: string; sourceFile: string }> = [];

  for (const dir of subdirs) {
    const filePath = path.join(/*turbopackIgnore: true*/ root, dir.name, 'dictionary.yaml');
    if (!fs.existsSync(filePath)) {
      continue;
    }
    dictionaries.push({
      languageCode: dir.name,
      filePath,
      sourceFile: `dictionaries/${dir.name}/dictionary.yaml`
    });
  }

  return dictionaries;
}

function parseDictionaryYaml(filePath: string): ParsedDictionaryFile {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = yaml.load(raw) as unknown;

  if (Array.isArray(parsed)) {
    return { words: parsed as RawDictionaryWord[] };
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid YAML dictionary format in ${filePath}`);
  }

  const maybeObject = parsed as ParsedDictionaryFile;
  const words = Array.isArray(maybeObject.words) ? maybeObject.words : [];

  return {
    meta: maybeObject.meta,
    words
  };
}

interface LanguageRow {
  id: string;
  code: string;
  name: string;
  region?: string | null;
  country?: string | null;
}

async function ensureLanguage(
  languageCode: string,
  metadata?: ParsedDictionaryFile['meta']
): Promise<LanguageRow> {
  const existing = await db
    .select({
      id: languagesT.id,
      code: languagesT.code,
      name: languagesT.name,
      region: languagesT.region,
      country: languagesT.country,
    })
    .from(languagesT)
    .where(eq(languagesT.code, languageCode))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  if (metadata?.name) {
    const byName = await db
      .select({
        id: languagesT.id,
        code: languagesT.code,
        name: languagesT.name,
        region: languagesT.region,
        country: languagesT.country,
      })
      .from(languagesT)
      .where(sql`${languagesT.name} ilike ${metadata.name}`)
      .limit(1);

    if (byName.length > 0) {
      return byName[0];
    }
  }

  const [inserted] = await db
    .insert(languagesT)
    .values({
      code: languageCode,
      name: metadata?.name || titleizeFromCode(languageCode),
      nativeName: metadata?.name || titleizeFromCode(languageCode),
      region: typeof metadata?.region === 'string' ? metadata.region : null,
      country: typeof metadata?.country === 'string' ? metadata.country : null,
      isActive: true,
    })
    .returning({
      id: languagesT.id,
      code: languagesT.code,
      name: languagesT.name,
      region: languagesT.region,
      country: languagesT.country,
    });

  if (!inserted) {
    throw new Error(`Failed to ensure language ${languageCode}`);
  }

  return inserted;
}

const WIKTIONARY_TIER = 'community-sourced (Wiktionary, CC-BY-SA-4.0)';

/**
 * Derive the source tier for a dictionary from its meta block. An explicit
 * `tier_id` wins; otherwise a CC-BY-SA + Wiktionary source is inferred as the
 * Wiktionary tier (so the 5 already-committed Wiktionary dicts light up without
 * being regenerated). Everything else is untiered (the hand-built rich dicts).
 */
export function inferTier(
  meta: Record<string, unknown> | undefined | null
): { tier?: string; tier_id?: string } {
  if (!meta) return {};
  if (typeof meta.tier_id === 'string' && meta.tier_id.trim()) {
    return {
      tier_id: meta.tier_id.trim(),
      tier: typeof meta.tier === 'string' ? meta.tier : undefined,
    };
  }
  const license = String(meta.license ?? '');
  const source = String(meta.source ?? '');
  if (/CC-BY-SA/i.test(license) && /wiktionary/i.test(source)) {
    return { tier: WIKTIONARY_TIER, tier_id: 'wiktionary' };
  }
  return {};
}

// Meta keys that belong in languages.metadata (jsonb) — the provenance/tier bag
// the UI reads to render tier badges, historical banners, and attribution.
const LANGUAGE_METADATA_KEYS = [
  'tier', 'tier_id', 'source', 'source_url', 'license', 'license_url',
  'attribution', 'austlang_codes', 'extracted', 'word_count', 'curr_number',
  'curr_volume', 'locality', 'locality_raw', 'language_link', 'candidates',
  'coordinates', 'other_sources',
];

/**
 * Persist a dictionary's meta block into the `languages` row: promote structured
 * fields to their columns (family, glottocode, iso, region…) and merge the
 * provenance/tier bag into languages.metadata. Only fields the meta actually
 * provides are written, so re-syncing a source never nulls out existing data.
 */
async function applyLanguageMeta(
  language: LanguageRow,
  meta?: ParsedDictionaryFile['meta']
): Promise<void> {
  if (!meta) return;
  const m = meta as Record<string, unknown>;
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined;

  const set: Record<string, unknown> = {};
  const desc = str(m.description); if (desc) set.description = desc;
  const region = str(m.region); if (region) set.region = region;
  const country = str(m.country); if (country) set.country = country;
  const family = str(m.family); if (family) set.family = family;
  const glotto = str(m.glottocode); if (glotto) set.glottocode = glotto;
  const iso = str(m.iso639_3) ?? str(m.iso6393); if (iso) set.iso6393 = iso;
  const ws = str(m.writing_system) ?? str(m.writingSystem); if (ws) set.writingSystem = ws;

  const tier = inferTier(m);
  const payload: Record<string, unknown> = {};
  for (const k of LANGUAGE_METADATA_KEYS) {
    if (m[k] !== undefined && m[k] !== null) payload[k] = m[k];
  }
  if (tier.tier_id) {
    payload.tier_id = tier.tier_id;
    if (tier.tier && payload.tier === undefined) payload.tier = tier.tier;
  }

  // Nothing to write? (a bare {name} meta) — skip the round-trip.
  if (Object.keys(set).length === 0 && Object.keys(payload).length === 0) return;

  set.updatedAt = new Date().toISOString();
  await db
    .update(languagesT)
    .set({
      ...set,
      metadata: sql`coalesce(${languagesT.metadata}, '{}'::jsonb) || ${JSON.stringify(payload)}::jsonb`,
    })
    .where(eq(languagesT.id, language.id));
}

async function loadWordClassMap(): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: wordClassesT.id, code: wordClassesT.code })
    .from(wordClassesT);
  return new Map(rows.map((row) => [String(row.code).toLowerCase(), row.id]));
}

function buildWordClassCode(type: string): string {
  return type
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

async function ensureWordClass(
  cache: Map<string, string>,
  type: string
): Promise<string | null> {
  const code = buildWordClassCode(type);
  if (!code) {
    return null;
  }

  const cached = cache.get(code);
  if (cached) {
    return cached;
  }

  const name = type
    .split(/[-_]/g)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');

  try {
    const [row] = await db
      .insert(wordClassesT)
      .values({
        code,
        name: name || type,
        sortOrder: 999,
      })
      .onConflictDoUpdate({
        target: wordClassesT.code,
        set: { code },
      })
      .returning({ id: wordClassesT.id, code: wordClassesT.code });

    if (!row) {
      return null;
    }

    cache.set(code, row.id);
    return row.id;
  } catch {
    return null;
  }
}

function normalizeWordRow(
  row: RawDictionaryWord,
  index: number,
  sourceFile: string,
  wordClassId: string | null
): NormalizedWord | null {
  if (!row.word || typeof row.word !== 'string') {
    return null;
  }

  // words.word / translations.translation / synonyms.synonym_text are varchar(500);
  // Wiktionary glosses can exceed that, so cap the varchar-bound fields (definitions
  // land in a TEXT column and stay full-length).
  const cap500 = (s: string) => (s.length > 500 ? s.slice(0, 499).trimEnd() : s);

  const word = cap500(row.word.trim());
  if (!word) {
    return null;
  }

  const definitions = cleanArray(row.definitions);
  if (definitions.length === 0 && typeof row.definition === 'string' && row.definition.trim().length > 0) {
    definitions.push(row.definition.trim());
  }

  const translations = cleanArray(row.translations).map(cap500);
  const synonyms = cleanArray(row.synonyms).map(cap500);

  const usages: Array<{ example: string; translation: string | null }> = [];
  const usageNotes: string[] = [];
  if (Array.isArray(row.usages)) {
    for (const usage of row.usages) {
      if (typeof usage === 'string') {
        // Enriched shape: a plain usage/register note.
        if (usage.trim()) {
          usageNotes.push(usage.trim());
        }
        continue;
      }
      if (!usage || typeof usage !== 'object') {
        continue;
      }
      const exampleText = typeof usage.translation === 'string' ? usage.translation.trim() : '';
      const english = typeof usage.english === 'string' && usage.english.trim() ? usage.english.trim() : null;
      if (exampleText) {
        usages.push({ example: exampleText, translation: english });
      }
    }
  }

  // Enriched `examples`: {kuku_yalanji, english} pairs -> usage_examples table.
  if (Array.isArray(row.examples)) {
    for (const ex of row.examples) {
      if (!ex || typeof ex !== 'object') {
        continue;
      }
      const ky = typeof ex.kuku_yalanji === 'string' ? ex.kuku_yalanji.trim() : '';
      const en = typeof ex.english === 'string' && ex.english.trim() ? ex.english.trim() : null;
      if (ky) {
        usages.push({ example: ky, translation: en });
      }
    }
  }

  if (typeof row.example === 'string' && row.example.trim()) {
    usages.push({ example: row.example.trim(), translation: null });
  }

  const sourceRef = `${sourceFile}#${index + 1}`;
  const wordType = typeof row.type === 'string' && row.type.trim() ? row.type.trim() : null;

  const cleanStr = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;
  const phonemic = cleanStr(row.phonemic);
  const gloss = cleanStr(row.gloss);
  const semanticDomain = cleanStr(row.semantic_domain);
  const verbClass = cleanStr(row.verb_class);
  const dialect = cleanStr(row.dialect);
  const entrySource = cleanStr(row.source);
  const needsReview = cleanStr(row.needs_review as string);
  const derivation = row.derivation && typeof row.derivation === 'object' ? row.derivation : null;
  const reduplication = row.reduplication && typeof row.reduplication === 'object' ? row.reduplication : null;
  const loanwordSource = row.loanword && typeof row.loanword === 'object' ? cleanStr(row.loanword.source) : null;
  const commentary = cleanArray(row.commentary as string[]);
  const seeAlso = cleanArray(row.see_also as string[]);

  const yamlHash = hashString(
    JSON.stringify({
      word,
      wordType,
      definitions,
      translations,
      synonyms,
      usages,
      usageNotes,
      phonemic,
      gloss,
      semanticDomain,
      verbClass,
      derivation,
      reduplication,
      loanwordSource,
      dialect,
      commentary,
      seeAlso,
      entrySource,
      needsReview
    })
  );

  const hasCoordinates = typeof row.latitude === 'number' && typeof row.longitude === 'number';

  return {
    sourceRef,
    yamlHash,
    word,
    normalizedWord: normalizeText(word),
    wordType,
    wordClassId,
    definitions,
    translations,
    synonyms,
    usages,
    culturalContext: typeof row.cultural_context === 'string' && row.cultural_context.trim() ? row.cultural_context.trim() : null,
    isLocation: row.is_location === true || hasCoordinates,
    latitude: hasCoordinates ? row.latitude! : null,
    longitude: hasCoordinates ? row.longitude! : null,
    phonemic,
    gloss,
    semanticDomain,
    verbClass,
    derivation,
    reduplication,
    loanwordSource,
    dialect,
    commentary,
    seeAlso,
    usageNotes,
    entrySource,
    needsReview
  };
}

async function deleteWordChildren(wordIds: string[]) {
  for (const ids of chunk(wordIds, 500)) {
    if (ids.length === 0) continue;
    await db.delete(translationsT).where(inArray(translationsT.wordId, ids));
    await db.delete(definitionsT).where(inArray(definitionsT.wordId, ids));
    await db.delete(usageExamplesT).where(inArray(usageExamplesT.wordId, ids));
    await db.delete(culturalContextsT).where(inArray(culturalContextsT.wordId, ids));
    await db.delete(synonymsT).where(inArray(synonymsT.wordId, ids));
  }
}

async function geocodeWithNominatim(
  query: string,
  countryCode?: string | null
): Promise<{ latitude: number; longitude: number } | null> {
  const countryParam = countryCode ? `&countrycodes=${encodeURIComponent(countryCode)}` : '';
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1${countryParam}&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'mobtranslate-dictionary-sync/1.0'
    }
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Array<{ lat?: string; lon?: string }>;
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const lat = Number(data[0].lat);
  const lon = Number(data[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return { latitude: lat, longitude: lon };
}

async function classifyLocationCandidatesWithAI(
  words: Array<{ id: string; word: string; word_type?: string | null; hint: string }>,
  languageName: string
): Promise<Map<string, { isLocation: boolean; score: number; query: string }>> {
  if (!process.env.OPENAI_API_KEY || words.length === 0) {
    return new Map();
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = [
    'Classify each dictionary entry as location or not and return strict JSON.',
    'Return an object with a results array.',
    'Each result item must contain id, is_location (boolean), score (0..1), and query.',
    `Language: ${languageName}`,
    `Entries: ${JSON.stringify(words)}`
  ].join('\n');

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content:
            'You classify location terms for map enrichment. Output only valid JSON with no markdown.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 900
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return new Map();
    }

    const parsed = JSON.parse(content) as {
      results?: Array<{ id?: string; is_location?: boolean; score?: number; query?: string }>;
    };

    const result = new Map<string, { isLocation: boolean; score: number; query: string }>();
    for (const item of parsed.results || []) {
      if (!item?.id || typeof item.query !== 'string') {
        continue;
      }
      const score = typeof item.score === 'number' ? item.score : 0;
      result.set(item.id, { isLocation: item.is_location === true, score, query: item.query });
    }
    return result;
  } catch {
    return new Map();
  }
}

async function geocodeWithAI(
  query: string,
  languageName: string,
  regionHint: string,
  countryCode?: string | null
): Promise<{ latitude: number; longitude: number; confidence: number } | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = [
    'Resolve a place query into latitude and longitude.',
    'If unsure, return null values with low confidence.',
    'Return strict JSON object with latitude, longitude, confidence.',
    `Language: ${languageName}`,
    `Country code hint: ${countryCode || 'unknown'}`,
    `Region hint: ${regionHint || 'unknown'}`,
    `Query: ${query}`
  ].join('\n');

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a geocoding assistant. Output only valid JSON. Never output markdown.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 220
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return null;
    }

    const parsed = JSON.parse(content) as {
      latitude?: number | null;
      longitude?: number | null;
      confidence?: number;
    };

    const lat = typeof parsed.latitude === 'number' ? parsed.latitude : NaN;
    const lon = typeof parsed.longitude === 'number' ? parsed.longitude : NaN;
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }
    return { latitude: lat, longitude: lon, confidence };
  } catch {
    return null;
  }
}

function buildHeuristicLocationSignal(
  row: { word: string; word_type?: string | null; definitions?: Array<{ definition?: string | null }>; translations?: Array<{ translation?: string | null }> },
  languageRegion: string
): { isCandidate: boolean; query: string; score: number } {
  const definitionText = (row.definitions || [])
    .map((entry) => (typeof entry.definition === 'string' ? entry.definition : ''))
    .join(' ')
    .toLowerCase();

  const translationText = (row.translations || [])
    .map((entry) => (typeof entry.translation === 'string' ? entry.translation : ''))
    .join(' ')
    .toLowerCase();

  const joined = `${row.word} ${row.word_type || ''} ${definitionText} ${translationText}`.toLowerCase();
  const keywordMatch = LOCATION_KEYWORDS.some((keyword) => joined.includes(keyword));
  const typeHint = (row.word_type || '').toLowerCase().includes('direction') || (row.word_type || '').toLowerCase().includes('place');

  const isCandidate = keywordMatch || typeHint;
  const baseQuery =
    (row.translations || []).find((entry) => entry.translation && entry.translation.trim())?.translation?.trim() ||
    (row.definitions || []).find((entry) => entry.definition && entry.definition.trim())?.definition?.trim() ||
    row.word;

  return {
    isCandidate,
    query: `${baseQuery} ${languageRegion}`.trim(),
    score: typeHint ? 0.75 : keywordMatch ? 0.6 : 0.1
  };
}

async function getLocationFromCache(
  cacheKey: string,
  negativeCacheTtlDays: number
): Promise<{ kind: 'hit'; location: { latitude: number; longitude: number } } | { kind: 'negative' } | { kind: 'none' }> {
  const nowIso = new Date().toISOString();
  const rows = await db
    .select({
      id: locationCacheT.id,
      latitude: locationCacheT.latitude,
      longitude: locationCacheT.longitude,
      hit_count: locationCacheT.hitCount,
      created_at: locationCacheT.createdAt,
    })
    .from(locationCacheT)
    .where(and(eq(locationCacheT.cacheKey, cacheKey), gt(locationCacheT.expiresAt, nowIso)))
    .limit(1);

  const data = rows[0];
  if (!data) {
    return { kind: 'none' };
  }

  if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
    await db
      .update(locationCacheT)
      .set({
        lastHitAt: nowIso,
        hitCount: data.hit_count ? Number(data.hit_count) + 1 : 1,
      })
      .where(eq(locationCacheT.id, data.id));
    return { kind: 'hit', location: { latitude: data.latitude, longitude: data.longitude } };
  }

  const createdAt = data.created_at ? new Date(data.created_at).getTime() : Date.now();
  const retryCutoff = Date.now() - Math.max(0, negativeCacheTtlDays) * 24 * 60 * 60 * 1000;
  if (createdAt < retryCutoff) {
    return { kind: 'none' };
  }

  await db
    .update(locationCacheT)
    .set({
      lastHitAt: nowIso,
      hitCount: data.hit_count ? Number(data.hit_count) + 1 : 1,
    })
    .where(eq(locationCacheT.id, data.id));

  return { kind: 'negative' };
}

async function cacheLocationResult(
  cacheKey: string,
  queryText: string,
  ttlDays: number,
  negativeTtlDays: number,
  location: { latitude: number; longitude: number } | null,
  source: 'nominatim' | 'ai',
  confidence?: number,
  metadata?: Record<string, unknown>
) {
  const effectiveTtlDays = location ? ttlDays : Math.max(1, negativeTtlDays);
  const expiresAt =
    effectiveTtlDays >= 36500
      ? '9999-12-31T23:59:59.999Z'
      : new Date(Date.now() + effectiveTtlDays * 24 * 60 * 60 * 1000).toISOString();
  const lastHitAt = new Date().toISOString();
  const values = {
    cacheKey,
    provider: source,
    queryText,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    confidence: (location ? confidence ?? 0.7 : 0.0).toString(),
    metadata: location ? { source, ...(metadata || {}) } : { miss: true, source, ...(metadata || {}) },
    expiresAt,
    lastHitAt,
  };
  await db
    .insert(locationCacheT)
    .values(values)
    .onConflictDoUpdate({
      target: locationCacheT.cacheKey,
      set: {
        provider: values.provider,
        queryText: values.queryText,
        latitude: values.latitude,
        longitude: values.longitude,
        confidence: values.confidence,
        metadata: values.metadata,
        expiresAt: values.expiresAt,
        lastHitAt: values.lastHitAt,
      },
    });
}

function buildGeocodeQueries(
  row: {
    word: string;
    definitions?: Array<{ definition?: string | null }>;
    translations?: Array<{ translation?: string | null }>;
  },
  aiQuery: string | undefined,
  languageName: string,
  regionHint: string,
  maxQueries: number
): string[] {
  const queries: string[] = [];
  const push = (value?: string | null) => {
    if (!value || typeof value !== 'string') {
      return;
    }
    const cleaned = value.trim().replace(/\s+/g, ' ');
    if (!cleaned) {
      return;
    }
    if (!queries.includes(cleaned)) {
      queries.push(cleaned);
    }
  };

  push(aiQuery);
  if (aiQuery && regionHint) {
    push(`${aiQuery} ${regionHint}`.trim());
  }

  const firstTranslation = row.translations?.find((entry) => entry.translation && entry.translation.trim())?.translation?.trim();
  if (firstTranslation) {
    push(firstTranslation);
    if (regionHint) {
      push(`${firstTranslation} ${regionHint}`.trim());
    }
  }

  const firstDefinition = row.definitions?.find((entry) => entry.definition && entry.definition.trim())?.definition?.trim();
  if (firstDefinition) {
    push(firstDefinition);
    if (regionHint) {
      push(`${firstDefinition} ${regionHint}`.trim());
    }
  }

  push(row.word);
  if (regionHint) {
    push(`${row.word} ${regionHint}`.trim());
  }
  push(`${row.word} ${languageName}`.trim());

  return queries.slice(0, Math.max(1, maxQueries));
}

export async function runYamlSyncForLanguage(
  _supabase: IgnoredClient,
  languageCode: string,
  sourceFilePath: string,
  config: TaskConfig = {}
): Promise<SyncStats> {
  const cfg = { ...DEFAULT_SYNC_CONFIG, ...config };
  const dictionariesRoot = resolveDictionaryRoot();
  const relativeSource = path.relative(dictionariesRoot, sourceFilePath).replace(/\\/g, '/');
  const sourceFile = `dictionaries/${relativeSource}`;
  const parsed = parseDictionaryYaml(sourceFilePath);
  const language = await ensureLanguage(languageCode, parsed.meta);
  await applyLanguageMeta(language, parsed.meta);
  const wordClassMap = await loadWordClassMap();

  const allRows = parsed.words.slice(0, cfg.max_words_per_run);
  const normalizedRows: NormalizedWord[] = [];

  for (let i = 0; i < allRows.length; i += 1) {
    const row = allRows[i];
    const classId = row.type ? await ensureWordClass(wordClassMap, row.type) : null;
    const normalized = normalizeWordRow(row, i, sourceFile, classId);
    if (normalized) {
      normalizedRows.push(normalized);
    }
  }

  const stats: SyncStats = {
    words_scanned: normalizedRows.length,
    words_upserted: 0,
    words_deleted: 0,
    definitions_upserted: 0,
    translations_upserted: 0,
    examples_upserted: 0,
    location_candidates: 0,
    locations_resolved: 0,
    cache_hits: 0,
    cache_misses: 0,
    error_count: 0,
    summary: {
      language: language.code,
      source_file: sourceFile
    }
  };

  if (normalizedRows.length === 0) {
    return stats;
  }

  const nowIso = new Date().toISOString();
  const upsertPayload = normalizedRows.map((row) => ({
    languageId: language.id,
    word: row.word,
    normalizedWord: row.normalizedWord,
    wordClassId: row.wordClassId,
    wordType: row.wordType,
    managedByYamlSync: true,
    yamlSourceFile: sourceFile,
    yamlSourceRef: row.sourceRef,
    yamlContentHash: row.yamlHash,
    syncUpdatedAt: nowIso,
    isLocation: row.isLocation,
    latitude: row.latitude,
    longitude: row.longitude,
    locationSource: row.latitude != null && row.longitude != null ? 'yaml' : null,
    locationUpdatedAt: row.latitude != null && row.longitude != null ? nowIso : null,
    // academic enrichment fields (see SCHEMA.md)
    phonemic: row.phonemic,
    gloss: row.gloss,
    semanticDomain: row.semanticDomain,
    verbClass: row.verbClass,
    derivation: row.derivation,
    reduplication: row.reduplication,
    loanwordSource: row.loanwordSource,
    isLoanWord: row.loanwordSource != null,
    dialect: row.dialect,
    dialectalVariation: row.dialect != null,
    commentary: row.commentary.length ? row.commentary : null,
    seeAlso: row.seeAlso.length ? row.seeAlso : null,
    usageNotes: row.usageNotes.length ? row.usageNotes : null,
    entrySource: row.entrySource,
    needsReview: row.needsReview,
  }));

  const sourceRefToWordId = new Map<string, string>();
  for (const rows of chunk(upsertPayload, cfg.batch_size)) {
    let data: Array<{ id: string; yaml_source_ref: string | null }> = [];
    try {
      data = await db
        .insert(wordsT)
        .values(rows)
        .onConflictDoUpdate({
          target: [wordsT.languageId, wordsT.yamlSourceRef],
          set: buildWordUpsertSet(),
        })
        .returning({ id: wordsT.id, yaml_source_ref: wordsT.yamlSourceRef });
    } catch (error: any) {
      // The (language_id, word, word_class_id) unique key can collide; retry with
      // a null word_class_id, mirroring the original Supabase behaviour.
      if (error?.message?.includes('words_language_id_word_word_class_id_key')) {
        const retryRows = rows.map((row) => ({ ...row, wordClassId: null }));
        data = await db
          .insert(wordsT)
          .values(retryRows)
          .onConflictDoUpdate({
            target: [wordsT.languageId, wordsT.yamlSourceRef],
            set: buildWordUpsertSet(),
          })
          .returning({ id: wordsT.id, yaml_source_ref: wordsT.yamlSourceRef });
      } else {
        throw new Error(`Failed to upsert words: ${error?.message ?? 'unknown error'}`);
      }
    }

    for (const row of data) {
      if (row.yaml_source_ref) {
        sourceRefToWordId.set(row.yaml_source_ref, row.id);
      }
    }
    stats.words_upserted += rows.length;
  }

  const wordIds = Array.from(sourceRefToWordId.values());
  await deleteWordChildren(wordIds);

  const definitionsToInsert: Array<{ wordId: string; definition: string; definitionNumber: number; isPrimary: boolean }> = [];
  const translationsToInsert: Array<{ wordId: string; definitionId: string | null; translation: string; targetLanguage: string; isPrimary: boolean }> = [];
  const examplesToInsert: Array<{ wordId: string; exampleText: string; translation: string | null }> = [];
  const culturalToInsert: Array<{ wordId: string; contextDescription: string }> = [];
  const synonymsToInsert: Array<{ wordId: string; synonymWordId: string | null; synonymText: string }> = [];

  for (const row of normalizedRows) {
    const wordId = sourceRefToWordId.get(row.sourceRef);
    if (!wordId) {
      continue;
    }

    for (let i = 0; i < row.definitions.length; i += 1) {
      definitionsToInsert.push({
        wordId,
        definition: row.definitions[i],
        definitionNumber: i + 1,
        isPrimary: i === 0,
      });
    }

    for (const usage of row.usages) {
      examplesToInsert.push({
        wordId,
        exampleText: usage.example,
        translation: usage.translation,
      });
    }

    if (row.culturalContext) {
      culturalToInsert.push({
        wordId,
        contextDescription: row.culturalContext,
      });
    }

    for (const synonym of row.synonyms) {
      synonymsToInsert.push({
        wordId,
        synonymWordId: null,
        synonymText: synonym,
      });
    }
  }

  const definitionMap = new Map<string, string>();
  for (const rows of chunk(definitionsToInsert, cfg.batch_size)) {
    if (rows.length === 0) continue;
    const data = await db
      .insert(definitionsT)
      .values(rows)
      .returning({ id: definitionsT.id, word_id: definitionsT.wordId, definition_number: definitionsT.definitionNumber });

    for (const row of data) {
      if (row.definition_number === 1) {
        definitionMap.set(row.word_id, row.id);
      }
    }
    stats.definitions_upserted += rows.length;
  }

  for (const row of normalizedRows) {
    const wordId = sourceRefToWordId.get(row.sourceRef);
    if (!wordId) {
      continue;
    }
    const primaryDefinitionId = definitionMap.get(wordId) ?? null;
    for (let i = 0; i < row.translations.length; i += 1) {
      translationsToInsert.push({
        wordId,
        definitionId: primaryDefinitionId,
        translation: row.translations[i],
        targetLanguage: 'en',
        isPrimary: i === 0,
      });
    }
  }

  for (const rows of chunk(translationsToInsert, cfg.batch_size)) {
    if (rows.length === 0) continue;
    await db.insert(translationsT).values(rows);
    stats.translations_upserted += rows.length;
  }

  for (const rows of chunk(examplesToInsert, cfg.batch_size)) {
    if (rows.length === 0) continue;
    await db.insert(usageExamplesT).values(rows);
    stats.examples_upserted += rows.length;
  }

  for (const rows of chunk(culturalToInsert, cfg.batch_size)) {
    if (rows.length === 0) continue;
    await db.insert(culturalContextsT).values(rows);
  }

  for (const rows of chunk(synonymsToInsert, cfg.batch_size)) {
    if (rows.length === 0) continue;
    await db.insert(synonymsT).values(rows);
  }

  if (cfg.prune_removed) {
    const existingWords = await db
      .select({ id: wordsT.id, yaml_source_ref: wordsT.yamlSourceRef })
      .from(wordsT)
      .where(
        and(
          eq(wordsT.languageId, language.id),
          eq(wordsT.managedByYamlSync, true),
          eq(wordsT.yamlSourceFile, sourceFile)
        )
      );

    const activeRefs = new Set(normalizedRows.map((row) => row.sourceRef));
    const idsToDelete = existingWords
      .filter((row) => row.yaml_source_ref && !activeRefs.has(row.yaml_source_ref))
      .map((row) => row.id);

    for (const ids of chunk(idsToDelete, cfg.batch_size)) {
      if (ids.length === 0) continue;
      await db.delete(wordsT).where(inArray(wordsT.id, ids));
    }
    stats.words_deleted = idsToDelete.length;
  }

  return stats;
}

// Shared upsert SET for the words table — re-applied on (language_id, yaml_source_ref)
// conflict so an existing sync-managed row is refreshed (matches Supabase upsert).
function buildWordUpsertSet() {
  return {
    word: sql`excluded.word`,
    normalizedWord: sql`excluded.normalized_word`,
    wordClassId: sql`excluded.word_class_id`,
    wordType: sql`excluded.word_type`,
    managedByYamlSync: sql`excluded.managed_by_yaml_sync`,
    yamlSourceFile: sql`excluded.yaml_source_file`,
    yamlContentHash: sql`excluded.yaml_content_hash`,
    syncUpdatedAt: sql`excluded.sync_updated_at`,
    isLocation: sql`excluded.is_location`,
    latitude: sql`excluded.latitude`,
    longitude: sql`excluded.longitude`,
    locationSource: sql`excluded.location_source`,
    locationUpdatedAt: sql`excluded.location_updated_at`,
    phonemic: sql`excluded.phonemic`,
    gloss: sql`excluded.gloss`,
    semanticDomain: sql`excluded.semantic_domain`,
    verbClass: sql`excluded.verb_class`,
    derivation: sql`excluded.derivation`,
    reduplication: sql`excluded.reduplication`,
    loanwordSource: sql`excluded.loanword_source`,
    isLoanWord: sql`excluded.is_loan_word`,
    dialect: sql`excluded.dialect`,
    dialectalVariation: sql`excluded.dialectal_variation`,
    commentary: sql`excluded.commentary`,
    seeAlso: sql`excluded.see_also`,
    usageNotes: sql`excluded.usage_notes`,
    entrySource: sql`excluded.entry_source`,
    needsReview: sql`excluded.needs_review`,
  };
}

export async function runLocationEnrichmentForLanguage(
  _supabase: IgnoredClient,
  languageCode: string,
  config: TaskConfig = {}
): Promise<SyncStats> {
  const cfg = { ...DEFAULT_SYNC_CONFIG, ...config };

  const languageRows = await db
    .select({
      id: languagesT.id,
      code: languagesT.code,
      name: languagesT.name,
      region: languagesT.region,
      country: languagesT.country,
    })
    .from(languagesT)
    .where(eq(languagesT.code, languageCode))
    .limit(1);
  const language = languageRows[0];

  if (!language) {
    throw new Error(`Language ${languageCode} not found`);
  }

  const staleCutoff = new Date(Date.now() - cfg.stale_after_days * 24 * 60 * 60 * 1000).toISOString();
  const rows: any[] = [];
  const pageSize = Math.max(100, Math.min(cfg.max_candidates, 1000));
  const maxRows = Math.max(1, cfg.max_candidates);
  for (let from = 0; from < maxRows; from += pageSize) {
    const limit = Math.min(pageSize, maxRows - from);
    const filters = [eq(wordsT.languageId, language.id)];
    if (!cfg.check_every_word) {
      filters.push(
        or(isNull(wordsT.locationUpdatedAt), lt(wordsT.locationUpdatedAt, staleCutoff))!
      );
    }

    // Page of words (id-ordered) with their definitions + translations.
    const pageWords = await db
      .select({
        id: wordsT.id,
        word: wordsT.word,
        word_type: wordsT.wordType,
        is_location: wordsT.isLocation,
        latitude: wordsT.latitude,
        longitude: wordsT.longitude,
        location_updated_at: wordsT.locationUpdatedAt,
      })
      .from(wordsT)
      .where(and(...filters))
      .orderBy(asc(wordsT.id))
      .limit(limit)
      .offset(from);

    if (pageWords.length === 0) {
      break;
    }

    const ids = pageWords.map((w) => w.id);
    const [defs, trans] = await Promise.all([
      db
        .select({ word_id: definitionsT.wordId, definition: definitionsT.definition })
        .from(definitionsT)
        .where(inArray(definitionsT.wordId, ids)),
      db
        .select({ word_id: translationsT.wordId, translation: translationsT.translation })
        .from(translationsT)
        .where(inArray(translationsT.wordId, ids)),
    ]);

    const defsByWord = new Map<string, Array<{ definition: string }>>();
    for (const d of defs) {
      const arr = defsByWord.get(d.word_id) ?? [];
      arr.push({ definition: d.definition });
      defsByWord.set(d.word_id, arr);
    }
    const transByWord = new Map<string, Array<{ translation: string }>>();
    for (const t of trans) {
      const arr = transByWord.get(t.word_id) ?? [];
      arr.push({ translation: t.translation });
      transByWord.set(t.word_id, arr);
    }

    for (const w of pageWords) {
      rows.push({
        ...w,
        definitions: defsByWord.get(w.id) ?? [],
        translations: transByWord.get(w.id) ?? [],
      });
    }

    if (pageWords.length < pageSize) {
      break;
    }
  }

  const regionHint = [language.region, language.country].filter(Boolean).join(' ');
  const countryCode = toCountryCode(language.country || null);
  const aiCandidates = new Map<string, { isLocation: boolean; score: number; query: string }>();
  const aiBatchSize = Math.max(20, Math.min(cfg.ai_batch_size, 500));
  for (const aiBatch of chunk(rows as any[], aiBatchSize)) {
    const aiInput = aiBatch.map((row: any) => {
      const hint =
        row.translations?.[0]?.translation ||
        row.definitions?.[0]?.definition ||
        row.word;
      return {
        id: row.id,
        word: row.word,
        word_type: row.word_type,
        hint
      };
    });
    const batchResults = await classifyLocationCandidatesWithAI(aiInput, language.name);
    for (const [key, value] of Array.from(batchResults.entries())) {
      aiCandidates.set(key, value);
    }
  }

  const stats: SyncStats = {
    words_scanned: rows.length,
    words_upserted: 0,
    words_deleted: 0,
    definitions_upserted: 0,
    translations_upserted: 0,
    examples_upserted: 0,
    location_candidates: 0,
    locations_resolved: 0,
    cache_hits: 0,
    cache_misses: 0,
    error_count: 0,
    summary: {
      language: language.code,
      source: 'location_enrichment'
    }
  };

  for (const row of rows as any[]) {
    const ai = aiCandidates.get(row.id);
    const heuristic = buildHeuristicLocationSignal(row, regionHint);
    const score = ai ? ai.score : heuristic.score;
    const isCandidate = ai ? ai.isLocation && ai.score >= 0.5 : heuristic.isCandidate && heuristic.score >= 0.55;
    if (!isCandidate) {
      continue;
    }

    try {
      await db
        .update(wordsT)
        .set({
          isLocation: true,
          locationSource: ai ? 'ai' : 'heuristic',
          locationConfidence: score.toString(),
        })
        .where(eq(wordsT.id, row.id));
    } catch {
      stats.error_count += 1;
      continue;
    }

    stats.words_upserted += 1;
    stats.location_candidates += 1;
    const geocodeQueries = buildGeocodeQueries(
      row,
      ai?.query || heuristic.query,
      language.name,
      regionHint,
      cfg.max_geocode_queries_per_word
    );

    let location: { latitude: number; longitude: number } | null = null;
    for (const query of geocodeQueries) {
      const cacheKey = hashString(`${language.code}:${query.toLowerCase()}`);
      const cacheResult = await getLocationFromCache(cacheKey, cfg.negative_cache_ttl_days);
      if (cacheResult.kind === 'hit') {
        stats.cache_hits += 1;
        location = cacheResult.location;
        break;
      }
      if (cacheResult.kind === 'negative') {
        stats.cache_hits += 1;
        continue;
      }

      stats.cache_misses += 1;
      location = await geocodeWithNominatim(query, countryCode);
      if (!location && cfg.geocode_with_ai_fallback) {
        const aiLocation = await geocodeWithAI(query, language.name, regionHint, countryCode);
        if (aiLocation) {
          location = { latitude: aiLocation.latitude, longitude: aiLocation.longitude };
          await cacheLocationResult(
            cacheKey,
            query,
            cfg.cache_ttl_days,
            cfg.negative_cache_ttl_days,
            location,
            'ai',
            aiLocation.confidence,
            { language_code: language.code }
          );
        } else {
          await cacheLocationResult(
            cacheKey,
            query,
            cfg.cache_ttl_days,
            cfg.negative_cache_ttl_days,
            null,
            'ai',
            0,
            { language_code: language.code }
          );
        }
      } else {
        await cacheLocationResult(
          cacheKey,
          query,
          cfg.cache_ttl_days,
          cfg.negative_cache_ttl_days,
          location,
          'nominatim',
          0.7,
          { language_code: language.code }
        );
      }

      if (
        location &&
        !isCoordinateInRoughCountryBounds(location.latitude, location.longitude, countryCode)
      ) {
        location = null;
      }

      if (location) {
        break;
      }
    }

    if (!location) {
      continue;
    }

    try {
      await db
        .update(wordsT)
        .set({
          isLocation: true,
          latitude: location.latitude,
          longitude: location.longitude,
          locationSource: ai ? 'ai-classified+geocoded' : 'heuristic+geocoded',
          locationConfidence: score.toString(),
          locationUpdatedAt: new Date().toISOString(),
        })
        .where(eq(wordsT.id, row.id));
    } catch {
      stats.error_count += 1;
      continue;
    }

    stats.locations_resolved += 1;
  }

  return stats;
}

async function beginRun(
  task: any,
  triggeredBy: TriggerType
): Promise<{ runId: string; startedAt: number }> {
  const startedAt = Date.now();
  const [data] = await db
    .insert(syncRunsT)
    .values({
      taskId: task.id,
      languageId: task.language_id,
      taskType: task.task_type,
      triggeredBy,
      status: 'running',
    })
    .returning({ id: syncRunsT.id });

  if (!data) {
    throw new Error('Failed to create sync run');
  }

  return { runId: data.id, startedAt };
}

async function finalizeRun(
  task: any,
  runId: string,
  startedAt: number,
  status: 'success' | 'failed',
  stats: SyncStats,
  errorMessage?: string
) {
  const finishedAtIso = new Date().toISOString();
  const durationMs = Date.now() - startedAt;

  await db
    .update(syncRunsT)
    .set({
      status,
      finishedAt: finishedAtIso,
      durationMs,
      wordsScanned: stats.words_scanned,
      wordsUpserted: stats.words_upserted,
      wordsDeleted: stats.words_deleted,
      definitionsUpserted: stats.definitions_upserted,
      translationsUpserted: stats.translations_upserted,
      examplesUpserted: stats.examples_upserted,
      locationCandidates: stats.location_candidates,
      locationsResolved: stats.locations_resolved,
      cacheHits: stats.cache_hits,
      cacheMisses: stats.cache_misses,
      errorCount: stats.error_count,
      summary: stats.summary,
      errorDetails: errorMessage || null,
    })
    .where(eq(syncRunsT.id, runId));

  const nextRun = new Date(Date.now() + (task.interval_minutes || 360) * 60 * 1000).toISOString();
  await db
    .update(syncTasksT)
    .set({
      isRunning: false,
      lockExpiresAt: null,
      lastRunAt: finishedAtIso,
      lastStatus: status,
      lastError: errorMessage || null,
      nextRunAt: nextRun,
    })
    .where(eq(syncTasksT.id, task.id));
}

async function lockTask(taskId: string): Promise<any | null> {
  const now = new Date();
  const lockExpiry = new Date(Date.now() + 20 * 60 * 1000).toISOString();

  const currentRows = await db
    .select({
      id: syncTasksT.id,
      is_running: syncTasksT.isRunning,
      lock_expires_at: syncTasksT.lockExpiresAt,
    })
    .from(syncTasksT)
    .where(eq(syncTasksT.id, taskId))
    .limit(1);
  const currentTask = currentRows[0];

  if (!currentTask) {
    return null;
  }

  const lockExpiresAt = currentTask.lock_expires_at ? new Date(currentTask.lock_expires_at) : null;
  if (currentTask.is_running && lockExpiresAt && lockExpiresAt > now) {
    return null;
  }

  const [data] = await db
    .update(syncTasksT)
    .set({
      isRunning: true,
      lockExpiresAt: lockExpiry,
      lastStatus: 'running',
    })
    .where(eq(syncTasksT.id, taskId))
    .returning();

  if (!data) {
    return null;
  }

  // Return snake_case keys so downstream task-record access (task_type,
  // interval_minutes, config, language_id) matches the original Supabase rows.
  return {
    ...data,
    task_type: data.taskType,
    language_id: data.languageId,
    interval_minutes: data.intervalMinutes,
    config: data.config,
  };
}

async function runTask(task: any, triggeredBy: TriggerType): Promise<{ runId: string; status: string; stats: SyncStats; error?: string }> {
  const lockedTask = await lockTask(task.id);
  if (!lockedTask) {
    return {
      runId: '',
      status: 'skipped',
      stats: {
        words_scanned: 0,
        words_upserted: 0,
        words_deleted: 0,
        definitions_upserted: 0,
        translations_upserted: 0,
        examples_upserted: 0,
        location_candidates: 0,
        locations_resolved: 0,
        cache_hits: 0,
        cache_misses: 0,
        error_count: 0,
        summary: {}
      }
    };
  }

  const taskRecord = {
    ...task,
    ...lockedTask,
    languages: task.languages
  };

  const { runId, startedAt } = await beginRun(taskRecord, triggeredBy);
  try {
    const languageCode = taskRecord.languages?.code as string | undefined;
    const languageName = taskRecord.languages?.name as string | undefined;
    if (!languageCode) {
      throw new Error(`Task ${taskRecord.id} is missing language relation`);
    }

    let stats: SyncStats;
    if (taskRecord.task_type === 'yaml_sync') {
      const filePath = findDictionaryFile(languageCode, languageName);
      if (!filePath) {
        throw new Error(`Dictionary YAML not found for language ${languageCode}`);
      }
      stats = await runYamlSyncForLanguage(null, languageCode, filePath, taskRecord.config || {});
    } else {
      stats = await runLocationEnrichmentForLanguage(null, languageCode, taskRecord.config || {});
    }

    await finalizeRun(taskRecord, runId, startedAt, 'success', stats);
    return { runId, status: 'success', stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown task failure';
    const failedStats: SyncStats = {
      words_scanned: 0,
      words_upserted: 0,
      words_deleted: 0,
      definitions_upserted: 0,
      translations_upserted: 0,
      examples_upserted: 0,
      location_candidates: 0,
      locations_resolved: 0,
      cache_hits: 0,
      cache_misses: 0,
      error_count: 1,
      summary: {}
    };
    await finalizeRun(taskRecord, runId, startedAt, 'failed', failedStats, message);
    return { runId, status: 'failed', stats: failedStats, error: message };
  }
}

/**
 * Bulk, idempotent YAML sync over EVERY dictionary discovered on disk. Runs the
 * yaml_sync path directly (no task rows, no OpenAI location enrichment). By default
 * only tiered sources (Wiktionary / Curr, i.e. meta with an explicit or inferable
 * tier) are synced, so the hand-built rich dictionaries (kuku_yalanji, migmaq,
 * anindilyakwa, wajarri) — already imported by their own scripts — are left exactly
 * as they are. Content-hash upserts make re-runs a no-op.
 */
export async function runYamlSyncForAllDictionaries(
  opts: { onlyTiered?: boolean; includeCodes?: string[]; excludeCodes?: string[] } = {}
): Promise<Array<{ code: string; words?: number; skipped?: string; error?: string }>> {
  const onlyTiered = opts.onlyTiered !== false;
  const include = opts.includeCodes ? new Set(opts.includeCodes) : null;
  const exclude = new Set(opts.excludeCodes ?? []);
  const dictionaries = discoverDictionaries();
  const results: Array<{ code: string; words?: number; skipped?: string; error?: string }> = [];

  for (const dictionary of dictionaries) {
    const code = dictionary.languageCode;
    if (exclude.has(code) || (include && !include.has(code))) {
      results.push({ code, skipped: 'filtered' });
      continue;
    }
    try {
      const parsed = parseDictionaryYaml(dictionary.filePath);
      const tier = inferTier((parsed.meta ?? undefined) as Record<string, unknown> | undefined);
      if (onlyTiered && !tier.tier_id) {
        results.push({ code, skipped: 'untiered' });
        continue;
      }
      const stats = await runYamlSyncForLanguage(null, code, dictionary.filePath, {
        prune_removed: true,
      });
      results.push({ code, words: stats.words_upserted });
    } catch (error) {
      results.push({ code, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return results;
}

export async function ensureSyncTasksForAllDictionaries(_supabase?: IgnoredClient) {
  const dictionaries = discoverDictionaries();

  for (const dictionary of dictionaries) {
    const parsed = parseDictionaryYaml(dictionary.filePath);
    const language = await ensureLanguage(dictionary.languageCode, parsed.meta);

    const taskRows = [
      {
        languageId: language.id,
        taskType: 'yaml_sync',
        name: `${language.name} YAML Sync`,
        enabled: true,
        intervalMinutes: 360,
        nextRunAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        config: {
          batch_size: DEFAULT_SYNC_CONFIG.batch_size,
          prune_removed: true,
          max_words_per_run: DEFAULT_SYNC_CONFIG.max_words_per_run
        }
      },
      {
        languageId: language.id,
        taskType: 'location_enrichment',
        name: `${language.name} Location Enrichment`,
        enabled: true,
        intervalMinutes: 720,
        nextRunAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        config: {
          cache_ttl_days: DEFAULT_SYNC_CONFIG.cache_ttl_days,
          max_candidates: DEFAULT_SYNC_CONFIG.max_candidates,
          stale_after_days: DEFAULT_SYNC_CONFIG.stale_after_days,
          check_every_word: DEFAULT_SYNC_CONFIG.check_every_word,
          ai_batch_size: DEFAULT_SYNC_CONFIG.ai_batch_size,
          geocode_with_ai_fallback: DEFAULT_SYNC_CONFIG.geocode_with_ai_fallback
        }
      }
    ];

    for (const row of taskRows) {
      // Mirror the original Supabase upsert (update on the (language_id, task_type)
      // conflict) so re-ensuring refreshes the task's name/schedule/config.
      await db
        .insert(syncTasksT)
        .values(row as any)
        .onConflictDoUpdate({
          target: [syncTasksT.languageId, syncTasksT.taskType],
          set: {
            name: row.name,
            enabled: row.enabled,
            intervalMinutes: row.intervalMinutes,
            nextRunAt: row.nextRunAt,
            config: row.config,
          },
        });
    }
  }
}

export async function runDueDictionaryTasks(
  _supabase: IgnoredClient,
  triggeredBy: TriggerType = 'scheduler'
) {
  await ensureSyncTasksForAllDictionaries();

  const nowIso = new Date().toISOString();
  const dueTasks = await db
    .select({
      id: syncTasksT.id,
      task_type: syncTasksT.taskType,
      language_id: syncTasksT.languageId,
      interval_minutes: syncTasksT.intervalMinutes,
      config: syncTasksT.config,
      language_code: languagesT.code,
      language_name: languagesT.name,
    })
    .from(syncTasksT)
    .leftJoin(languagesT, eq(syncTasksT.languageId, languagesT.id))
    .where(and(eq(syncTasksT.enabled, true), lte(syncTasksT.nextRunAt, nowIso)))
    .orderBy(asc(syncTasksT.nextRunAt))
    .limit(20);

  const results: any[] = [];
  for (const task of dueTasks) {
    const taskWithRel = {
      ...task,
      languages: task.language_code ? { code: task.language_code, name: task.language_name } : null,
    };
    const result = await runTask(taskWithRel, triggeredBy);
    if (result.status !== 'skipped') {
      results.push({
        task_id: task.id,
        run_id: result.runId,
        task_type: task.task_type,
        language_code: task.language_code,
        status: result.status,
        error: result.error || null
      });
    }
  }

  return results;
}

export async function runManualDictionaryTasks(
  _supabase: IgnoredClient,
  options: {
    taskType?: SyncTaskType;
    languageCode?: string;
    limit?: number;
    triggeredBy?: TriggerType;
  } = {}
) {
  await ensureSyncTasksForAllDictionaries();

  let languageIdFilter: string | null = null;
  if (options.languageCode) {
    const langRows = await db
      .select({ id: languagesT.id })
      .from(languagesT)
      .where(eq(languagesT.code, options.languageCode))
      .limit(1);
    languageIdFilter = langRows[0]?.id ?? null;
    if (!languageIdFilter) {
      return [];
    }
  }

  const filters = [eq(syncTasksT.enabled, true)];
  if (options.taskType) {
    filters.push(eq(syncTasksT.taskType, options.taskType));
  }
  if (languageIdFilter) {
    filters.push(eq(syncTasksT.languageId, languageIdFilter));
  }

  const tasks = await db
    .select({
      id: syncTasksT.id,
      task_type: syncTasksT.taskType,
      language_id: syncTasksT.languageId,
      interval_minutes: syncTasksT.intervalMinutes,
      config: syncTasksT.config,
      language_code: languagesT.code,
      language_name: languagesT.name,
    })
    .from(syncTasksT)
    .leftJoin(languagesT, eq(syncTasksT.languageId, languagesT.id))
    .where(and(...filters))
    .orderBy(asc(syncTasksT.nextRunAt))
    .limit(options.limit ?? 20);

  const results: any[] = [];
  for (const task of tasks) {
    const taskWithRel = {
      ...task,
      languages: task.language_code ? { code: task.language_code, name: task.language_name } : null,
    };
    const result = await runTask(taskWithRel, options.triggeredBy || 'manual');
    if (result.status !== 'skipped') {
      results.push({
        task_id: task.id,
        run_id: result.runId,
        task_type: task.task_type,
        language_code: task.language_code,
        status: result.status,
        error: result.error || null
      });
    }
  }
  return results;
}
