import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';

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
  usages?: Array<{
    translation?: string;
    english?: string;
  }>;
  latitude?: number;
  longitude?: number;
  is_location?: boolean;
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
  const candidates = [
    path.resolve(process.cwd(), '../../dictionaries'),
    path.resolve(process.cwd(), '../dictionaries'),
    path.resolve(process.cwd(), 'dictionaries')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  throw new Error('Unable to locate dictionaries folder');
}

function findDictionaryFile(languageCode: string, languageName?: string): string | null {
  const root = resolveDictionaryRoot();
  const candidates = [languageCode, languageName ? slugify(languageName) : null]
    .filter((entry): entry is string => !!entry)
    .map((entry) => path.join(root, entry, 'dictionary.yaml'));

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
    const filePath = path.join(root, dir.name, 'dictionary.yaml');
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

async function ensureLanguage(
  supabase: SupabaseClient,
  languageCode: string,
  metadata?: ParsedDictionaryFile['meta']
): Promise<{ id: string; code: string; name: string; region?: string | null; country?: string | null }> {
  const { data: existing, error: existingError } = await supabase
    .from('languages')
    .select('id, code, name, region, country')
    .eq('code', languageCode)
    .single();

  if (!existingError && existing) {
    return existing;
  }

  if (metadata?.name) {
    const { data: byName, error: byNameError } = await supabase
      .from('languages')
      .select('id, code, name, region, country')
      .ilike('name', metadata.name)
      .limit(1)
      .single();

    if (!byNameError && byName) {
      return byName;
    }
  }

  const insertPayload = {
    code: languageCode,
    name: metadata?.name || titleizeFromCode(languageCode),
    native_name: metadata?.name || titleizeFromCode(languageCode),
    region: typeof metadata?.region === 'string' ? metadata.region : null,
    country: typeof metadata?.country === 'string' ? metadata.country : null,
    is_active: true
  };

  const { data: inserted, error: insertError } = await supabase
    .from('languages')
    .insert(insertPayload)
    .select('id, code, name, region, country')
    .single();

  if (insertError || !inserted) {
    throw new Error(`Failed to ensure language ${languageCode}: ${insertError?.message ?? 'unknown error'}`);
  }

  return inserted;
}

async function loadWordClassMap(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('word_classes').select('id, code');
  if (error) {
    throw new Error(`Failed to load word classes: ${error.message}`);
  }
  return new Map((data || []).map((row: any) => [String(row.code).toLowerCase(), row.id]));
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
  supabase: SupabaseClient,
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

  const { data, error } = await supabase
    .from('word_classes')
    .upsert(
      {
        code,
        name: name || type,
        sort_order: 999
      },
      { onConflict: 'code' }
    )
    .select('id, code')
    .single();

  if (error || !data) {
    return null;
  }

  cache.set(code, data.id);
  return data.id;
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

  const word = row.word.trim();
  if (!word) {
    return null;
  }

  const definitions = cleanArray(row.definitions);
  if (definitions.length === 0 && typeof row.definition === 'string' && row.definition.trim().length > 0) {
    definitions.push(row.definition.trim());
  }

  const translations = cleanArray(row.translations);
  const synonyms = cleanArray(row.synonyms);

  const usages: Array<{ example: string; translation: string | null }> = [];
  if (Array.isArray(row.usages)) {
    for (const usage of row.usages) {
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

  if (typeof row.example === 'string' && row.example.trim()) {
    usages.push({ example: row.example.trim(), translation: null });
  }

  const sourceRef = `${sourceFile}#${index + 1}`;
  const wordType = typeof row.type === 'string' && row.type.trim() ? row.type.trim() : null;
  const yamlHash = hashString(
    JSON.stringify({
      word,
      wordType,
      definitions,
      translations,
      synonyms,
      usages
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
    longitude: hasCoordinates ? row.longitude! : null
  };
}

async function deleteWordChildren(supabase: SupabaseClient, wordIds: string[]) {
  for (const ids of chunk(wordIds, 500)) {
    await supabase.from('translations').delete().in('word_id', ids);
    await supabase.from('definitions').delete().in('word_id', ids);
    await supabase.from('usage_examples').delete().in('word_id', ids);
    await supabase.from('cultural_contexts').delete().in('word_id', ids);
    await supabase.from('synonyms').delete().in('word_id', ids);
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
  supabase: SupabaseClient,
  cacheKey: string,
  negativeCacheTtlDays: number
): Promise<{ kind: 'hit'; location: { latitude: number; longitude: number } } | { kind: 'negative' } | { kind: 'none' }> {
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from('dictionary_location_cache')
    .select('id, latitude, longitude, hit_count, created_at')
    .eq('cache_key', cacheKey)
    .gt('expires_at', nowIso)
    .single();

  if (!data) {
    return { kind: 'none' };
  }

  if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
    await supabase
      .from('dictionary_location_cache')
      .update({
        last_hit_at: nowIso,
        hit_count: data.hit_count ? Number(data.hit_count) + 1 : 1
      })
      .eq('id', data.id);
    return { kind: 'hit', location: { latitude: data.latitude, longitude: data.longitude } };
  }

  const createdAt = data.created_at ? new Date(data.created_at).getTime() : Date.now();
  const retryCutoff = Date.now() - Math.max(0, negativeCacheTtlDays) * 24 * 60 * 60 * 1000;
  if (createdAt < retryCutoff) {
    return { kind: 'none' };
  }

  await supabase
    .from('dictionary_location_cache')
    .update({
      last_hit_at: nowIso,
      hit_count: data.hit_count ? Number(data.hit_count) + 1 : 1
    })
    .eq('id', data.id);

  return { kind: 'negative' };
}

async function cacheLocationResult(
  supabase: SupabaseClient,
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
  await supabase.from('dictionary_location_cache').upsert(
    {
      cache_key: cacheKey,
      provider: source,
      query_text: queryText,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      confidence: location ? confidence ?? 0.7 : 0.0,
      metadata: location ? { source, ...(metadata || {}) } : { miss: true, source, ...(metadata || {}) },
      expires_at: expiresAt,
      last_hit_at: new Date().toISOString()
    },
    { onConflict: 'cache_key' }
  );
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
  supabase: SupabaseClient,
  languageCode: string,
  sourceFilePath: string,
  config: TaskConfig = {}
): Promise<SyncStats> {
  const cfg = { ...DEFAULT_SYNC_CONFIG, ...config };
  const dictionariesRoot = resolveDictionaryRoot();
  const relativeSource = path.relative(dictionariesRoot, sourceFilePath).replace(/\\/g, '/');
  const sourceFile = `dictionaries/${relativeSource}`;
  const parsed = parseDictionaryYaml(sourceFilePath);
  const language = await ensureLanguage(supabase, languageCode, parsed.meta);
  const wordClassMap = await loadWordClassMap(supabase);

  const allRows = parsed.words.slice(0, cfg.max_words_per_run);
  const normalizedRows: NormalizedWord[] = [];

  for (let i = 0; i < allRows.length; i += 1) {
    const row = allRows[i];
    const classId = row.type ? await ensureWordClass(supabase, wordClassMap, row.type) : null;
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

  const upsertPayload = normalizedRows.map((row) => ({
    language_id: language.id,
    word: row.word,
    normalized_word: row.normalizedWord,
    word_class_id: row.wordClassId,
    word_type: row.wordType,
    managed_by_yaml_sync: true,
    yaml_source_file: sourceFile,
    yaml_source_ref: row.sourceRef,
    yaml_content_hash: row.yamlHash,
    sync_updated_at: new Date().toISOString(),
    is_location: row.isLocation,
    latitude: row.latitude,
    longitude: row.longitude,
    location_source: row.latitude != null && row.longitude != null ? 'yaml' : null,
    location_updated_at: row.latitude != null && row.longitude != null ? new Date().toISOString() : null
  }));

  const sourceRefToWordId = new Map<string, string>();
  for (const rows of chunk(upsertPayload, cfg.batch_size)) {
    let { data, error } = await supabase
      .from('words')
      .upsert(rows, { onConflict: 'language_id,yaml_source_ref' })
      .select('id, yaml_source_ref');

    if (error && error.message.includes('words_language_id_word_word_class_id_key')) {
      const retryRows = rows.map((row) => ({ ...row, word_class_id: null }));
      const retryResult = await supabase
        .from('words')
        .upsert(retryRows, { onConflict: 'language_id,yaml_source_ref' })
        .select('id, yaml_source_ref');
      data = retryResult.data;
      error = retryResult.error;
    }

    if (error) {
      throw new Error(`Failed to upsert words: ${error.message}`);
    }

    for (const row of data || []) {
      if (row.yaml_source_ref) {
        sourceRefToWordId.set(row.yaml_source_ref, row.id);
      }
    }
    stats.words_upserted += rows.length;
  }

  const wordIds = Array.from(sourceRefToWordId.values());
  await deleteWordChildren(supabase, wordIds);

  const definitionsToInsert: any[] = [];
  const translationsToInsert: any[] = [];
  const examplesToInsert: any[] = [];
  const culturalToInsert: any[] = [];
  const synonymsToInsert: any[] = [];

  for (const row of normalizedRows) {
    const wordId = sourceRefToWordId.get(row.sourceRef);
    if (!wordId) {
      continue;
    }

    for (let i = 0; i < row.definitions.length; i += 1) {
      definitionsToInsert.push({
        word_id: wordId,
        definition: row.definitions[i],
        definition_number: i + 1,
        is_primary: i === 0
      });
    }

    for (const usage of row.usages) {
      examplesToInsert.push({
        word_id: wordId,
        example_text: usage.example,
        translation: usage.translation
      });
    }

    if (row.culturalContext) {
      culturalToInsert.push({
        word_id: wordId,
        context_description: row.culturalContext
      });
    }

    for (const synonym of row.synonyms) {
      synonymsToInsert.push({
        word_id: wordId,
        synonym_word_id: null,
        synonym_text: synonym
      });
    }
  }

  const definitionMap = new Map<string, string>();
  for (const rows of chunk(definitionsToInsert, cfg.batch_size)) {
    const { data, error } = await supabase
      .from('definitions')
      .insert(rows)
      .select('id, word_id, definition_number');

    if (error) {
      throw new Error(`Failed to insert definitions: ${error.message}`);
    }

    for (const row of data || []) {
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
        word_id: wordId,
        definition_id: primaryDefinitionId,
        translation: row.translations[i],
        target_language: 'en',
        is_primary: i === 0
      });
    }
  }

  for (const rows of chunk(translationsToInsert, cfg.batch_size)) {
    const { error } = await supabase.from('translations').insert(rows);
    if (error) {
      throw new Error(`Failed to insert translations: ${error.message}`);
    }
    stats.translations_upserted += rows.length;
  }

  for (const rows of chunk(examplesToInsert, cfg.batch_size)) {
    const { error } = await supabase.from('usage_examples').insert(rows);
    if (error) {
      throw new Error(`Failed to insert usage examples: ${error.message}`);
    }
    stats.examples_upserted += rows.length;
  }

  for (const rows of chunk(culturalToInsert, cfg.batch_size)) {
    const { error } = await supabase.from('cultural_contexts').insert(rows);
    if (error) {
      throw new Error(`Failed to insert cultural contexts: ${error.message}`);
    }
  }

  for (const rows of chunk(synonymsToInsert, cfg.batch_size)) {
    const { error } = await supabase.from('synonyms').insert(rows);
    if (error) {
      throw new Error(`Failed to insert synonyms: ${error.message}`);
    }
  }

  if (cfg.prune_removed) {
    const { data: existingWords, error } = await supabase
      .from('words')
      .select('id, yaml_source_ref')
      .eq('language_id', language.id)
      .eq('managed_by_yaml_sync', true)
      .eq('yaml_source_file', sourceFile);

    if (error) {
      throw new Error(`Failed to load existing sync-managed words: ${error.message}`);
    }

    const activeRefs = new Set(normalizedRows.map((row) => row.sourceRef));
    const idsToDelete = (existingWords || [])
      .filter((row) => row.yaml_source_ref && !activeRefs.has(row.yaml_source_ref))
      .map((row) => row.id);

    for (const ids of chunk(idsToDelete, cfg.batch_size)) {
      const { error: deleteError } = await supabase.from('words').delete().in('id', ids);
      if (deleteError) {
        throw new Error(`Failed to delete removed words: ${deleteError.message}`);
      }
    }
    stats.words_deleted = idsToDelete.length;
  }

  return stats;
}

export async function runLocationEnrichmentForLanguage(
  supabase: SupabaseClient,
  languageCode: string,
  config: TaskConfig = {}
): Promise<SyncStats> {
  const cfg = { ...DEFAULT_SYNC_CONFIG, ...config };

  const { data: language, error: languageError } = await supabase
    .from('languages')
    .select('id, code, name, region, country')
    .eq('code', languageCode)
    .single();

  if (languageError || !language) {
    throw new Error(`Language ${languageCode} not found`);
  }

  const staleCutoff = new Date(Date.now() - cfg.stale_after_days * 24 * 60 * 60 * 1000).toISOString();
  const rows: any[] = [];
  const pageSize = Math.max(100, Math.min(cfg.max_candidates, 1000));
  const maxRows = Math.max(1, cfg.max_candidates);
  for (let from = 0; from < maxRows; from += pageSize) {
    let query = supabase
      .from('words')
      .select(`
        id,
        word,
        word_type,
        is_location,
        latitude,
        longitude,
        location_updated_at,
        definitions(definition),
        translations(translation)
      `)
      .eq('language_id', language.id)
      .order('id', { ascending: true })
      .range(from, Math.min(from + pageSize - 1, maxRows - 1));

    if (!cfg.check_every_word) {
      query = query.or(`location_updated_at.is.null,location_updated_at.lt.${staleCutoff}`);
    }

    const { data: pageRows, error } = await query;
    if (error) {
      throw new Error(`Failed to load words for enrichment: ${error.message}`);
    }

    if (!pageRows || pageRows.length === 0) {
      break;
    }

    rows.push(...pageRows);
    if (pageRows.length < pageSize) {
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

    const { error: classifyError } = await supabase
      .from('words')
      .update({
        is_location: true,
        location_source: ai ? 'ai' : 'heuristic',
        location_confidence: score
      })
      .eq('id', row.id);

    if (classifyError) {
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
      const cacheResult = await getLocationFromCache(supabase, cacheKey, cfg.negative_cache_ttl_days);
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
            supabase,
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
            supabase,
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
          supabase,
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

    const { error: updateError } = await supabase
      .from('words')
      .update({
        is_location: true,
        latitude: location.latitude,
        longitude: location.longitude,
        location_source: ai ? 'ai-classified+geocoded' : 'heuristic+geocoded',
        location_confidence: score,
        location_updated_at: new Date().toISOString()
      })
      .eq('id', row.id);

    if (updateError) {
      stats.error_count += 1;
      continue;
    }

    stats.locations_resolved += 1;
  }

  return stats;
}

async function beginRun(
  supabase: SupabaseClient,
  task: any,
  triggeredBy: TriggerType
): Promise<{ runId: string; startedAt: number }> {
  const startedAt = Date.now();
  const { data, error } = await supabase
    .from('dictionary_sync_runs')
    .insert({
      task_id: task.id,
      language_id: task.language_id,
      task_type: task.task_type,
      triggered_by: triggeredBy,
      status: 'running'
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create sync run: ${error?.message ?? 'unknown error'}`);
  }

  return { runId: data.id, startedAt };
}

async function finalizeRun(
  supabase: SupabaseClient,
  task: any,
  runId: string,
  startedAt: number,
  status: 'success' | 'failed',
  stats: SyncStats,
  errorMessage?: string
) {
  const finishedAtIso = new Date().toISOString();
  const durationMs = Date.now() - startedAt;

  await supabase
    .from('dictionary_sync_runs')
    .update({
      status,
      finished_at: finishedAtIso,
      duration_ms: durationMs,
      words_scanned: stats.words_scanned,
      words_upserted: stats.words_upserted,
      words_deleted: stats.words_deleted,
      definitions_upserted: stats.definitions_upserted,
      translations_upserted: stats.translations_upserted,
      examples_upserted: stats.examples_upserted,
      location_candidates: stats.location_candidates,
      locations_resolved: stats.locations_resolved,
      cache_hits: stats.cache_hits,
      cache_misses: stats.cache_misses,
      error_count: stats.error_count,
      summary: stats.summary,
      error_details: errorMessage || null
    })
    .eq('id', runId);

  const nextRun = new Date(Date.now() + (task.interval_minutes || 360) * 60 * 1000).toISOString();
  await supabase
    .from('dictionary_sync_tasks')
    .update({
      is_running: false,
      lock_expires_at: null,
      last_run_at: finishedAtIso,
      last_status: status,
      last_error: errorMessage || null,
      next_run_at: nextRun
    })
    .eq('id', task.id);
}

async function lockTask(supabase: SupabaseClient, taskId: string): Promise<any | null> {
  const now = new Date();
  const lockExpiry = new Date(Date.now() + 20 * 60 * 1000).toISOString();

  const { data: currentTask, error: readError } = await supabase
    .from('dictionary_sync_tasks')
    .select('id, is_running, lock_expires_at')
    .eq('id', taskId)
    .single();

  if (readError || !currentTask) {
    return null;
  }

  const lockExpiresAt = currentTask.lock_expires_at ? new Date(currentTask.lock_expires_at) : null;
  if (currentTask.is_running && lockExpiresAt && lockExpiresAt > now) {
    return null;
  }

  const { data, error } = await supabase
    .from('dictionary_sync_tasks')
    .update({
      is_running: true,
      lock_expires_at: lockExpiry,
      last_status: 'running'
    })
    .eq('id', taskId)
    .select('*')
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

async function runTask(supabase: SupabaseClient, task: any, triggeredBy: TriggerType): Promise<{ runId: string; status: string; stats: SyncStats; error?: string }> {
  const lockedTask = await lockTask(supabase, task.id);
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

  const { runId, startedAt } = await beginRun(supabase, taskRecord, triggeredBy);
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
      stats = await runYamlSyncForLanguage(supabase, languageCode, filePath, taskRecord.config || {});
    } else {
      stats = await runLocationEnrichmentForLanguage(supabase, languageCode, taskRecord.config || {});
    }

    await finalizeRun(supabase, taskRecord, runId, startedAt, 'success', stats);
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
    await finalizeRun(supabase, taskRecord, runId, startedAt, 'failed', failedStats, message);
    return { runId, status: 'failed', stats: failedStats, error: message };
  }
}

export async function ensureSyncTasksForAllDictionaries(supabase: SupabaseClient) {
  const dictionaries = discoverDictionaries();

  for (const dictionary of dictionaries) {
    const parsed = parseDictionaryYaml(dictionary.filePath);
    const language = await ensureLanguage(supabase, dictionary.languageCode, parsed.meta);

    const taskRows = [
      {
        language_id: language.id,
        task_type: 'yaml_sync',
        name: `${language.name} YAML Sync`,
        enabled: true,
        interval_minutes: 360,
        next_run_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        config: {
          batch_size: DEFAULT_SYNC_CONFIG.batch_size,
          prune_removed: true,
          max_words_per_run: DEFAULT_SYNC_CONFIG.max_words_per_run
        }
      },
      {
        language_id: language.id,
        task_type: 'location_enrichment',
        name: `${language.name} Location Enrichment`,
        enabled: true,
        interval_minutes: 720,
        next_run_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
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
      await supabase.from('dictionary_sync_tasks').upsert(row, {
        onConflict: 'language_id,task_type'
      });
    }
  }
}

export async function runDueDictionaryTasks(
  supabase: SupabaseClient,
  triggeredBy: TriggerType = 'scheduler'
) {
  await ensureSyncTasksForAllDictionaries(supabase);

  const nowIso = new Date().toISOString();
  const { data: dueTasks, error } = await supabase
    .from('dictionary_sync_tasks')
    .select(`
      *,
      languages!dictionary_sync_tasks_language_id_fkey(code, name)
    `)
    .eq('enabled', true)
    .lte('next_run_at', nowIso)
    .order('next_run_at', { ascending: true })
    .limit(20);

  if (error) {
    throw new Error(`Failed to load due tasks: ${error.message}`);
  }

  const results: any[] = [];
  for (const task of dueTasks || []) {
    const result = await runTask(supabase, task, triggeredBy);
    if (result.status !== 'skipped') {
      results.push({
        task_id: task.id,
        run_id: result.runId,
        task_type: task.task_type,
        language_code: task.languages?.code,
        status: result.status,
        error: result.error || null
      });
    }
  }

  return results;
}

export async function runManualDictionaryTasks(
  supabase: SupabaseClient,
  options: {
    taskType?: SyncTaskType;
    languageCode?: string;
    limit?: number;
    triggeredBy?: TriggerType;
  } = {}
) {
  await ensureSyncTasksForAllDictionaries(supabase);

  let languageIdFilter: string | null = null;
  if (options.languageCode) {
    const { data: language } = await supabase
      .from('languages')
      .select('id')
      .eq('code', options.languageCode)
      .single();
    languageIdFilter = language?.id ?? null;
    if (!languageIdFilter) {
      return [];
    }
  }

  let query = supabase
    .from('dictionary_sync_tasks')
    .select(`
      *,
      languages!dictionary_sync_tasks_language_id_fkey(code, name)
    `)
    .eq('enabled', true)
    .order('next_run_at', { ascending: true })
    .limit(options.limit ?? 20);

  if (options.taskType) {
    query = query.eq('task_type', options.taskType);
  }

  if (languageIdFilter) {
    query = query.eq('language_id', languageIdFilter);
  }

  const { data: tasks, error } = await query;
  if (error) {
    throw new Error(`Failed to load tasks: ${error.message}`);
  }

  const results: any[] = [];
  for (const task of tasks || []) {
    const result = await runTask(supabase, task, options.triggeredBy || 'manual');
    if (result.status !== 'skipped') {
      results.push({
        task_id: task.id,
        run_id: result.runId,
        task_type: task.task_type,
        language_code: task.languages?.code,
        status: result.status,
        error: result.error || null
      });
    }
  }
  return results;
}
