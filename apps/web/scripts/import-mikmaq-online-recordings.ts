import { constants as fsConstants } from 'node:fs';
import { access, copyFile, link, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import postgres, { type Sql } from 'postgres';
import {
  MIKMAQ_ONLINE_BASE_URL,
  MIKMAQ_ONLINE_SOURCE_SLUG,
  MIKMAQ_RESEARCH_ROOT,
  canonicalMikmaqOrthography,
  entryAudio,
  normalizeMikmaqText,
  parseMikmaqIndexAudioUrls,
  sha256,
  type MikmaqAudioReference,
  type MikmaqEntry,
  type MikmaqExample,
} from './lib/mikmaq-online';

type Command = 'plan' | 'import' | 'verify';
type MappingStatus = 'exact_existing' | 'create_from_source' | 'review_required';

interface CliOptions {
  command: Command;
  limit: number | null;
  allowPartial: boolean;
  createMissing: boolean;
}

interface ExistingWord {
  id: string;
  word: string;
  normalized_word: string | null;
  word_type: string | null;
  word_class_id: string | null;
  created_at: string | null;
  is_verified: boolean | null;
  definition_count: number;
  translation_count: number;
  example_count: number;
  enrichment_count: number;
}

interface MappingPlan {
  externalEntryId: string;
  sourceUrl: string;
  sourceHeadword: string;
  normalizedHeadword: string;
  status: MappingStatus;
  reason: string;
  wordId: string | null;
  candidateWordIds: string[];
  candidateScores: Array<ReturnType<typeof wordScore>>;
  sourceGroupKey: string;
  sourceGroupLeader: string;
  wordRecordingCount: number;
  sentenceRecordingCount: number;
}

interface AudioDownload {
  sourceAudioUrl: string;
  archiveRelativePath: string;
  contentSha256: string;
  fileSizeBytes: number;
  contentType: string | null;
  fetchedAt: string;
  codecName?: string;
  durationMs?: number;
  durationSeconds?: number;
  sampleRate?: number;
  channels?: number;
  probedAt?: string;
  qualityStatus?: 'usable' | 'unusable_too_short';
  qualityNote?: string;
}

interface ImportSummary {
  entriesProcessed: number;
  exactExisting: number;
  wordsCreated: number;
  reviewRequired: number;
  examplesCreated: number;
  recordingsCreated: number;
  recordingsReused: number;
  recordingsSkippedUnusable: number;
  errors: number;
}

const LANGUAGE_CODE = 'migmaq';
const SOURCE_NAME = "Mi'gmaq/Mi'kmaq Online Talking Dictionary";
const SOURCE_ATTRIBUTION = "Mi'gmaq/Mi'kmaq Online Talking Dictionary (mikmaqonline.org)";
const LICENSE_NAME = 'Creative Commons Attribution-NonCommercial 4.0 International';
const LICENSE_URL = 'https://creativecommons.org/licenses/by-nc/4.0/';
const STORAGE_ROOT = process.env.RECORDING_STORAGE_ROOT ?? '/mnt/donto-data/mobtranslate-storage/recordings';
const ENTRY_MANIFEST_PATH = join(MIKMAQ_RESEARCH_ROOT, 'manifests/entries.jsonl');
const ENTRY_ERROR_PATH = join(MIKMAQ_RESEARCH_ROOT, 'manifests/entry-errors.jsonl');
const AUDIO_DOWNLOAD_PATH = join(MIKMAQ_RESEARCH_ROOT, 'manifests/audio-downloads.jsonl');
const AUDIO_ERROR_PATH = join(MIKMAQ_RESEARCH_ROOT, 'manifests/audio-errors.jsonl');
const AUDIO_PROBE_ERROR_PATH = join(MIKMAQ_RESEARCH_ROOT, 'manifests/audio-probe-errors.jsonl');
const INDEX_MANIFEST_PATH = join(MIKMAQ_RESEARCH_ROOT, 'manifests/index.json');
const RAW_INDEX_PATH = join(MIKMAQ_RESEARCH_ROOT, 'raw/index/all-words.html');
const PLAN_PATH = join(MIKMAQ_RESEARCH_ROOT, 'manifests/import-plan.jsonl');
const PLAN_SUMMARY_PATH = join(MIKMAQ_RESEARCH_ROOT, 'reports/import-plan-summary.json');
const IMPORT_REPORT_PATH = join(MIKMAQ_RESEARCH_ROOT, 'reports/import-report.json');
const VERIFY_REPORT_PATH = join(MIKMAQ_RESEARCH_ROOT, 'reports/verification-report.json');

function parseOptions(argv: string[]): CliOptions {
  const command = (argv[0] ?? 'plan') as Command;
  if (!['plan', 'import', 'verify'].includes(command)) {
    throw new Error(`Unknown command '${command}'. Use plan, import, or verify.`);
  }
  const options: CliOptions = { command, limit: null, allowPartial: false, createMissing: true };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--allow-partial') options.allowPartial = true;
    else if (arg === '--review-missing') options.createMissing = false;
    else if (arg === '--limit') {
      const limit = Number(argv[++index]);
      if (!Number.isInteger(limit) || limit <= 0) throw new Error('--limit must be a positive integer');
      options.limit = limit;
    } else throw new Error(`Unknown option '${arg}'`);
  }
  return options;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonl<T>(path: string): Promise<T[]> {
  const text = await readFile(path, 'utf8');
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

async function preserveGeneratedFile(path: string): Promise<void> {
  if (!(await pathExists(path))) return;
  const relativePath = relative(MIKMAQ_RESEARCH_ROOT, path);
  if (relativePath.startsWith('..')) throw new Error(`Refusing to archive a path outside the research root: ${path}`);
  const bytes = await readFile(path);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const historyPath = join(
    MIKMAQ_RESEARCH_ROOT,
    'history',
    dirname(relativePath),
    `${basename(path)}.${timestamp}.${sha256(bytes).slice(0, 12)}`,
  );
  await mkdir(dirname(historyPath), { recursive: true });
  try {
    await link(path, historyPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    await copyFile(path, historyPath);
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await preserveGeneratedFile(path);
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, path);
}

async function writeJsonl(path: string, rows: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await preserveGeneratedFile(path);
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, rows.length > 0 ? `${rows.map((row) => JSON.stringify(row)).join('\n')}\n` : '');
  await rename(temporaryPath, path);
}

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function wordScore(word: ExistingWord) {
  return {
    wordId: word.id,
    verified: word.is_verified === true ? 1 : 0,
    childRows: word.definition_count + word.translation_count + word.example_count,
    definitions: word.definition_count,
    translations: word.translation_count,
    examples: word.example_count,
    enrichment: word.enrichment_count,
    createdAt: word.created_at,
  };
}

function compareWords(left: ExistingWord, right: ExistingWord): number {
  const a = wordScore(left);
  const b = wordScore(right);
  return (
    b.verified - a.verified ||
    b.childRows - a.childRows ||
    b.enrichment - a.enrichment ||
    String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')) ||
    a.wordId.localeCompare(b.wordId)
  );
}

function selectionReason(candidates: ExistingWord[], canonical: ExistingWord): string {
  const score = wordScore(canonical);
  return (
    `selected ${canonical.id} from ${candidates.length} candidate(s) ` +
    `by verified, related-row count, enrichment, recency, then UUID. ` +
    `Selected score: verified=${score.verified}, childRows=${score.childRows}, enrichment=${score.enrichment}.`
  );
}

async function loadExistingWords(sql: Sql, languageId: string): Promise<ExistingWord[]> {
  const rows = await sql<ExistingWord[]>`
    select
      w.id,
      w.word,
      w.normalized_word,
      w.word_type,
      w.word_class_id,
      w.created_at,
      w.is_verified,
      count(distinct d.id)::int as definition_count,
      count(distinct t.id)::int as translation_count,
      count(distinct ue.id)::int as example_count,
      (
        (w.phonemic is not null)::int +
        (w.gloss is not null)::int +
        (w.semantic_domain is not null)::int +
        (w.verb_class is not null)::int +
        (w.dialect is not null)::int +
        (w.entry_source is not null)::int +
        (w.notes is not null)::int
      )::int as enrichment_count
    from public.words w
    left join public.definitions d on d.word_id = w.id
    left join public.translations t on t.word_id = w.id
    left join public.usage_examples ue on ue.word_id = w.id
    where w.language_id = ${languageId}::uuid
    group by w.id
  `;
  return rows.map((row) => ({
    ...row,
    definition_count: asNumber(row.definition_count),
    translation_count: asNumber(row.translation_count),
    example_count: asNumber(row.example_count),
    enrichment_count: asNumber(row.enrichment_count),
  }));
}

function buildPlan(entries: MikmaqEntry[], words: ExistingWord[], createMissing: boolean): MappingPlan[] {
  const wordsByNormalized = new Map<string, ExistingWord[]>();
  const wordsByOrthography = new Map<string, ExistingWord[]>();
  for (const word of words) {
    const orthography = canonicalMikmaqOrthography(word.word);
    const orthographicValues = wordsByOrthography.get(orthography) ?? [];
    orthographicValues.push(word);
    wordsByOrthography.set(orthography, orthographicValues);
    const keys = new Set([
      normalizeMikmaqText(word.word),
      word.normalized_word ? normalizeMikmaqText(word.normalized_word) : '',
    ]);
    for (const key of keys) {
      if (!key) continue;
      const values = wordsByNormalized.get(key) ?? [];
      if (!values.some((candidate) => candidate.id === word.id)) values.push(word);
      wordsByNormalized.set(key, values);
    }
  }

  const sourceOrthographiesByNormalized = new Map<string, Set<string>>();
  const sourceGroupLeader = new Map<string, string>();
  const groupKeyFor = (entry: MikmaqEntry) =>
    `${canonicalMikmaqOrthography(entry.sourceHeadword)}\n${normalizeMikmaqText(entry.partOfSpeech ?? '')}`;
  for (const entry of entries) {
    const orthography = canonicalMikmaqOrthography(entry.sourceHeadword);
    const orthographies = sourceOrthographiesByNormalized.get(entry.normalizedHeadword) ?? new Set<string>();
    orthographies.add(orthography);
    sourceOrthographiesByNormalized.set(entry.normalizedHeadword, orthographies);
    const sourceGroupKey = groupKeyFor(entry);
    if (!sourceGroupLeader.has(sourceGroupKey)) sourceGroupLeader.set(sourceGroupKey, entry.externalEntryId);
  }

  return entries.map((entry) => {
    const orthography = canonicalMikmaqOrthography(entry.sourceHeadword);
    const exactOrthographicCandidates = wordsByOrthography.get(orthography) ?? [];
    const sourceOrthographies = sourceOrthographiesByNormalized.get(entry.normalizedHeadword) ?? new Set<string>();
    const initialCandidates = exactOrthographicCandidates.length > 0
        ? exactOrthographicCandidates
        : sourceOrthographies.size === 1
          ? wordsByNormalized.get(entry.normalizedHeadword) ?? []
          : [];
    const partOfSpeechMatches = entry.partOfSpeech
      ? initialCandidates.filter(
          (candidate) => candidate.word_type &&
            normalizeMikmaqText(candidate.word_type) === normalizeMikmaqText(entry.partOfSpeech ?? ''),
        )
      : [];
    const candidates = [...(partOfSpeechMatches.length > 0 ? partOfSpeechMatches : initialCandidates)].sort(compareWords);
    const wordRecordingCount = entry.wordRecordings.length;
    const sentenceRecordingCount = entry.examples.reduce((sum, example) => sum + example.recordings.length, 0);
    const sourceGroupKey = groupKeyFor(entry);
    const groupLeader = sourceGroupLeader.get(sourceGroupKey) ?? entry.externalEntryId;
    if (candidates.length > 0) {
      const matchKind = exactOrthographicCandidates.length > 0
        ? 'Exact orthographic headword match'
        : 'Exact normalized headword match with one source orthography';
      return {
        externalEntryId: entry.externalEntryId,
        sourceUrl: entry.sourceUrl,
        sourceHeadword: entry.sourceHeadword,
        normalizedHeadword: entry.normalizedHeadword,
        status: 'exact_existing',
        reason: `${matchKind}; ${selectionReason(candidates, candidates[0])}`,
        wordId: candidates[0].id,
        candidateWordIds: candidates.map((candidate) => candidate.id),
        candidateScores: candidates.map(wordScore),
        sourceGroupKey,
        sourceGroupLeader: groupLeader,
        wordRecordingCount,
        sentenceRecordingCount,
      };
    }

    const canCreate = createMissing;
    return {
      externalEntryId: entry.externalEntryId,
      sourceUrl: entry.sourceUrl,
      sourceHeadword: entry.sourceHeadword,
      normalizedHeadword: entry.normalizedHeadword,
      status: canCreate ? 'create_from_source' : 'review_required',
      reason: canCreate
        ? groupLeader === entry.externalEntryId
          ? 'No exact MobTranslate headword exists; create one source-attributed, unverified entry.'
          : `No exact MobTranslate headword exists; reuse the word created for source-group leader ${groupLeader}.`
        : 'No exact MobTranslate headword exists and missing-entry creation was disabled.',
      wordId: null,
      candidateWordIds: [],
      candidateScores: [],
      sourceGroupKey,
      sourceGroupLeader: groupLeader,
      wordRecordingCount,
      sentenceRecordingCount,
    };
  });
}

async function manifestContext() {
  const [entryBytes, audioBytes, indexBytes] = await Promise.all([
    readFile(ENTRY_MANIFEST_PATH),
    readFile(AUDIO_DOWNLOAD_PATH),
    readFile(INDEX_MANIFEST_PATH),
  ]);
  return {
    entryManifestSha256: sha256(entryBytes),
    audioManifestSha256: sha256(audioBytes),
    indexManifest: JSON.parse(indexBytes.toString('utf8')) as {
      totalEntryCount: number;
      selectedEntryCount: number;
    },
  };
}

async function assertArchiveComplete(entries: MikmaqEntry[], downloads: AudioDownload[], allowPartial: boolean) {
  const context = await manifestContext();
  const entryErrors = await readJsonl<Record<string, unknown>>(ENTRY_ERROR_PATH);
  const audioErrors = await readJsonl<Record<string, unknown>>(AUDIO_ERROR_PATH);
  const audioProbeErrors = (await pathExists(AUDIO_PROBE_ERROR_PATH))
    ? await readJsonl<Record<string, unknown>>(AUDIO_PROBE_ERROR_PATH)
    : [{ error: 'audio-probe-errors.jsonl is missing; run the probe phase' }];
  const expectedAudio = new Set(entries.flatMap(entryAudio).map((recording) => recording.sourceAudioUrl));
  const indexAudioUrls = parseMikmaqIndexAudioUrls(await readFile(RAW_INDEX_PATH, 'utf8'));
  const indexAudioMissingFromEntries = indexAudioUrls.filter((url) => !expectedAudio.has(url));
  const downloadedAudio = new Set(downloads.map((download) => download.sourceAudioUrl));
  const missingAudio = [...expectedAudio].filter((url) => !downloadedAudio.has(url));
  const missingProbeMetadata = downloads.filter(
    (download) =>
      download.codecName !== 'mp3' ||
      typeof download.durationMs !== 'number' || download.durationMs < 0 ||
      !download.sampleRate ||
      !download.channels ||
      !download.probedAt ||
      !['usable', 'unusable_too_short'].includes(download.qualityStatus ?? ''),
  );
  const unclassifiedAudio = entries.flatMap((entry) =>
    entry.unclassifiedAudioUrls.map((url) => ({ externalEntryId: entry.externalEntryId, url })),
  );
  const fullSelection =
    context.indexManifest.selectedEntryCount === context.indexManifest.totalEntryCount &&
    entries.length === context.indexManifest.selectedEntryCount;

  if (!allowPartial && !fullSelection) {
    throw new Error(
      `Refusing partial import: ${entries.length}/${context.indexManifest.totalEntryCount} source entries are manifest-complete.`,
    );
  }
  if (
    entryErrors.length > 0 ||
    audioErrors.length > 0 ||
    audioProbeErrors.length > 0 ||
    missingAudio.length > 0 ||
    missingProbeMetadata.length > 0 ||
    indexAudioMissingFromEntries.length > 0 ||
    unclassifiedAudio.length > 0
  ) {
    throw new Error(
      `Archive is incomplete: entry errors=${entryErrors.length}, audio errors=${audioErrors.length}, ` +
        `probe errors=${audioProbeErrors.length}, missing audio=${missingAudio.length}, ` +
        `missing probe metadata=${missingProbeMetadata.length}, missing index audio=${indexAudioMissingFromEntries.length}, ` +
        `unclassified audio=${unclassifiedAudio.length}.`,
    );
  }
  return {
    ...context,
    expectedAudioCount: expectedAudio.size,
    fullSelection,
    unclassifiedAudioCount: 0,
    probeErrorCount: 0,
    missingProbeMetadataCount: 0,
    unusableAudioCount: downloads.filter((download) => download.qualityStatus !== 'usable').length,
    indexAudioCount: indexAudioUrls.length,
    indexAudioMissingFromEntriesCount: 0,
  };
}

async function languageId(sql: Sql): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    select id from public.languages where code = ${LANGUAGE_CODE} and is_active = true limit 1
  `;
  if (rows.length === 0) throw new Error(`Active language '${LANGUAGE_CODE}' was not found`);
  return rows[0].id;
}

async function plan(sql: Sql, options: CliOptions) {
  const allEntries = await readJsonl<MikmaqEntry>(ENTRY_MANIFEST_PATH);
  const entries = options.limit === null ? allEntries : allEntries.slice(0, options.limit);
  const langId = await languageId(sql);
  const words = await loadExistingWords(sql, langId);
  const mappingPlan = buildPlan(entries, words, options.createMissing);
  const summary = {
    generatedAt: new Date().toISOString(),
    languageCode: LANGUAGE_CODE,
    languageId: langId,
    sourceEntryCount: entries.length,
    existingWordCount: words.length,
    exactExisting: mappingPlan.filter((item) => item.status === 'exact_existing').length,
    createFromSource: mappingPlan.filter((item) => item.status === 'create_from_source').length,
    reviewRequired: mappingPlan.filter((item) => item.status === 'review_required').length,
    duplicateCandidateEntries: mappingPlan.filter((item) => item.candidateWordIds.length > 1).length,
    wordRecordings: mappingPlan.reduce((sum, item) => sum + item.wordRecordingCount, 0),
    sentenceRecordings: mappingPlan.reduce((sum, item) => sum + item.sentenceRecordingCount, 0),
    canonicalSelectionRule:
      'Exact orthography first; normalized fallback only for a single source orthography; prefer exact part of speech, then verified, related-row count, enrichment, recency, UUID. No fuzzy match is auto-imported.',
  };
  await writeJsonl(PLAN_PATH, mappingPlan);
  await writeJson(PLAN_SUMMARY_PATH, summary);
  console.log(JSON.stringify(summary, null, 2));
  return { entries, mappingPlan, langId, summary };
}

async function assertSchema(sql: Sql): Promise<void> {
  const rows = await sql<{ present: boolean }[]>`
    select to_regclass('public.recording_external_refs') is not null as present
  `;
  if (!rows[0]?.present) {
    throw new Error('Recording provenance migration is not applied (recording_external_refs is missing)');
  }
}

async function upsertSource(sql: Sql): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    insert into public.recording_sources (
      slug, name, source_url, attribution_text, license_name, license_url,
      commercial_use_allowed, terms_checked_at, metadata
    ) values (
      ${MIKMAQ_ONLINE_SOURCE_SLUG}, ${SOURCE_NAME}, ${MIKMAQ_ONLINE_BASE_URL},
      ${SOURCE_ATTRIBUTION}, ${LICENSE_NAME}, ${LICENSE_URL}, false,
      ${'2026-07-12T00:00:00.000Z'}::timestamptz,
      ${sql.json({
        languageCode: LANGUAGE_CODE,
        reuseScope: 'noncommercial',
        sourceIndex: 'https://mikmaqonline.org/all-words.html',
      })}
    )
    on conflict (slug) do update set
      name = excluded.name,
      source_url = excluded.source_url,
      attribution_text = excluded.attribution_text,
      license_name = excluded.license_name,
      license_url = excluded.license_url,
      commercial_use_allowed = excluded.commercial_use_allowed,
      terms_checked_at = excluded.terms_checked_at,
      metadata = excluded.metadata,
      updated_at = now()
    returning id
  `;
  return rows[0].id;
}

async function classByWordType(sql: Sql, langId: string): Promise<Map<string, string>> {
  const rows = await sql<{ word_type: string; word_class_id: string; uses: number }[]>`
    select word_type, word_class_id, count(*)::int as uses
    from public.words
    where language_id = ${langId}::uuid and word_type is not null and word_class_id is not null
    group by word_type, word_class_id
    order by word_type, uses desc, word_class_id
  `;
  const result = new Map<string, string>();
  for (const row of rows) {
    const key = normalizeMikmaqText(row.word_type);
    if (!result.has(key)) result.set(key, row.word_class_id);
  }
  return result;
}

async function createSourceWord(
  tx: Sql,
  entry: MikmaqEntry,
  langId: string,
  wordClasses: Map<string, string>,
): Promise<string> {
  const wordClassId = entry.partOfSpeech
    ? wordClasses.get(normalizeMikmaqText(entry.partOfSpeech)) ?? null
    : null;
  const rows = await tx<{ id: string }[]>`
    insert into public.words (
      language_id, word, normalized_word, word_class_id, word_type, metadata,
      entry_source, needs_review, is_verified
    ) values (
      ${langId}::uuid,
      ${entry.sourceHeadword},
      ${entry.normalizedHeadword},
      ${wordClassId}::uuid,
      ${entry.partOfSpeech},
      ${tx.json({
        importedFrom: entry.sourceUrl,
        importedAt: new Date().toISOString(),
        sourceLicense: LICENSE_NAME,
        sourceLicenseUrl: LICENSE_URL,
        pronunciationGuide: entry.pronunciationGuide,
        alternateForms: entry.alternateForms,
      })},
      ${SOURCE_NAME},
      ${'review source import'},
      false
    )
    returning id
  `;
  const wordId = rows[0].id;
  const definitions = [...new Set(entry.meanings.length > 0 ? entry.meanings : [entry.translation].filter(Boolean))] as string[];
  let primaryDefinitionId: string | null = null;
  for (let index = 0; index < definitions.length; index += 1) {
    const inserted = await tx<{ id: string }[]>`
      insert into public.definitions (
        word_id, definition, definition_number, is_primary, notes
      ) values (
        ${wordId}::uuid, ${definitions[index]}, ${index + 1}, ${index === 0},
        ${`Source: ${entry.sourceUrl} (${LICENSE_NAME})`}
      ) returning id
    `;
    if (index === 0) primaryDefinitionId = inserted[0].id;
  }
  if (entry.translation) {
    await tx`
      insert into public.translations (
        word_id, definition_id, translation, target_language, translation_type, is_primary, notes
      ) values (
        ${wordId}::uuid, ${primaryDefinitionId}::uuid, ${entry.translation}, 'en', 'source_translation', true,
        ${`Source: ${entry.sourceUrl} (${LICENSE_NAME})`}
      )
    `;
  }
  return wordId;
}

async function upsertImportEntry(
  tx: Sql,
  sourceId: string,
  entry: MikmaqEntry,
  planItem: MappingPlan,
  wordId: string | null,
) {
  const status = planItem.status === 'create_from_source' ? 'created_from_source' : planItem.status;
  const rows = await tx<{ id: string }[]>`
    insert into public.recording_import_entries (
      source_id, external_entry_id, source_headword, normalized_headword,
      source_entry_url, mapping_status, mapping_reason, word_id,
      candidate_word_ids, source_payload, imported_at
    ) values (
      ${sourceId}::uuid, ${entry.externalEntryId}, ${entry.sourceHeadword}, ${entry.normalizedHeadword},
      ${entry.sourceUrl}, ${status}, ${planItem.reason}, ${wordId}::uuid,
      ${tx.array(planItem.candidateWordIds)}::uuid[], ${tx.json(entry)},
      ${wordId ? new Date().toISOString() : null}::timestamptz
    )
    on conflict (source_id, external_entry_id) do update set
      source_headword = excluded.source_headword,
      normalized_headword = excluded.normalized_headword,
      source_entry_url = excluded.source_entry_url,
      mapping_status = excluded.mapping_status,
      mapping_reason = excluded.mapping_reason,
      word_id = excluded.word_id,
      candidate_word_ids = excluded.candidate_word_ids,
      source_payload = excluded.source_payload,
      last_seen_at = now(),
      imported_at = coalesce(public.recording_import_entries.imported_at, excluded.imported_at)
    returning id
  `;
  return rows[0].id;
}

async function findOrCreateExample(
  tx: Sql,
  wordId: string,
  entry: MikmaqEntry,
  example: MikmaqExample,
): Promise<{ id: string; created: boolean }> {
  const rows = await tx<{ id: string; example_text: string }[]>`
    select id, example_text from public.usage_examples where word_id = ${wordId}::uuid order by created_at, id
  `;
  const normalized = canonicalMikmaqOrthography(example.text);
  const existing = rows.find((row) => canonicalMikmaqOrthography(row.example_text) === normalized);
  if (existing) return { id: existing.id, created: false };

  const inserted = await tx<{ id: string }[]>`
    insert into public.usage_examples (
      word_id, example_text, translation, source, notes
    ) values (
      ${wordId}::uuid, ${example.text}, ${example.translation}, ${entry.sourceUrl},
      ${`Imported from ${SOURCE_NAME}; ${LICENSE_NAME}.`}
    ) returning id
  `;
  return { id: inserted[0].id, created: true };
}

function productionStoragePath(download: AudioDownload): string {
  return `imports/mikmaq-online/${download.contentSha256.slice(0, 3)}/${download.contentSha256}.mp3`;
}

function versionedExternalRecordingId(
  reference: MikmaqAudioReference,
  download: AudioDownload,
): string {
  return sha256(`${reference.externalRecordingId}\n${download.contentSha256}`);
}

async function ensureProductionAudio(download: AudioDownload): Promise<string> {
  const sourcePath = join(MIKMAQ_RESEARCH_ROOT, download.archiveRelativePath);
  const storagePath = productionStoragePath(download);
  const targetPath = join(STORAGE_ROOT, storagePath);
  await mkdir(dirname(targetPath), { recursive: true });
  if (await pathExists(targetPath)) {
    const targetBytes = await readFile(targetPath);
    if (sha256(targetBytes) !== download.contentSha256) {
      throw new Error(`Existing production audio checksum mismatch: ${targetPath}`);
    }
    return storagePath;
  }
  try {
    await link(sourcePath, targetPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') return storagePath;
    if (code !== 'EXDEV' && code !== 'EPERM' && code !== 'EOPNOTSUPP') throw error;
    await copyFile(sourcePath, targetPath, fsConstants.COPYFILE_EXCL);
  }
  const targetStat = await stat(targetPath);
  if (targetStat.size !== download.fileSizeBytes) {
    throw new Error(`Production audio size mismatch after linking: ${targetPath}`);
  }
  return storagePath;
}

async function insertRecording(
  tx: Sql,
  options: {
    sourceId: string;
    importEntryId: string;
    langId: string;
    wordId: string;
    exampleId: string | null;
    entry: MikmaqEntry;
    reference: MikmaqAudioReference;
    download: AudioDownload;
    sourceSpeakerCodes: string[];
    isPrimary: boolean;
  },
): Promise<'created' | 'reused'> {
  const storagePath = await ensureProductionAudio(options.download);
  const versionedExternalId = versionedExternalRecordingId(options.reference, options.download);
  const clientId = `${MIKMAQ_ONLINE_SOURCE_SLUG}:${versionedExternalId}`;
  const unambiguousSpeakerCode = options.sourceSpeakerCodes.length === 1 ? options.sourceSpeakerCodes[0] : null;
  const inserted = await tx<{ id: string }[]>`
    insert into public.recordings (
      language_id, word_id, example_id, kind, label, gloss, storage_path,
      master_url, master_format, mime_type, duration_ms, sample_rate, channels,
      file_size_bytes, status,
      is_primary, client_id
    ) values (
      ${options.langId}::uuid, ${options.wordId}::uuid, ${options.exampleId}::uuid,
      ${options.reference.kind},
      ${options.reference.kind === 'word'
        ? options.entry.sourceHeadword
        : options.entry.examples[options.reference.exampleIndex ?? 0]?.text ?? options.entry.sourceHeadword},
      ${options.entry.translation ?? options.entry.meanings[0] ?? null},
      ${storagePath}, ${`/api/storage/recordings/${storagePath}`}, 'mp3', 'audio/mpeg',
      ${options.download.durationMs}, ${options.download.sampleRate}, ${options.download.channels},
      ${options.download.fileSizeBytes}, 'active', ${options.isPrimary}, ${clientId}
    )
    on conflict (client_id) do nothing
    returning id
  `;
  const recordingRows =
    inserted.length > 0
      ? inserted
      : await tx<{ id: string }[]>`select id from public.recordings where client_id = ${clientId} limit 1`;
  if (recordingRows.length === 0) throw new Error(`Could not resolve recording ${clientId}`);
  await tx`
    update public.recordings
    set duration_ms = coalesce(duration_ms, ${options.download.durationMs}),
        sample_rate = coalesce(sample_rate, ${options.download.sampleRate}),
        channels = coalesce(channels, ${options.download.channels}),
        file_size_bytes = coalesce(file_size_bytes, ${options.download.fileSizeBytes}),
        mime_type = coalesce(mime_type, 'audio/mpeg'),
        updated_at = now()
    where id = ${recordingRows[0].id}::uuid
      and (
        duration_ms is null or sample_rate is null or channels is null
        or file_size_bytes is null or mime_type is null
      )
  `;
  await tx`
    insert into public.recording_external_refs (
      recording_id, source_id, import_entry_id, external_recording_id,
      source_entry_url, source_audio_url, speaker_code, content_sha256,
      fetched_at, metadata
    ) values (
      ${recordingRows[0].id}::uuid, ${options.sourceId}::uuid, ${options.importEntryId}::uuid,
      ${versionedExternalId}, ${options.reference.sourceEntryUrl}, ${options.reference.sourceAudioUrl},
      ${unambiguousSpeakerCode}, ${options.download.contentSha256},
      ${options.download.fetchedAt}::timestamptz,
      ${tx.json({
        originalExternalRecordingId: options.reference.externalRecordingId,
        sourceSpeakerCodes: options.sourceSpeakerCodes,
        archiveRelativePath: options.download.archiveRelativePath,
        sourceAudioFileName: options.reference.audioFileName,
        exampleIndex: options.reference.exampleIndex,
        codecName: options.download.codecName,
        probedAt: options.download.probedAt,
      })}
    )
    on conflict (source_id, external_recording_id) do update set
      speaker_code = excluded.speaker_code,
      metadata = public.recording_external_refs.metadata || excluded.metadata
  `;
  return inserted.length > 0 ? 'created' : 'reused';
}

async function recordEvent(
  sql: Sql,
  runId: string,
  eventType: string,
  externalEntryId: string | null,
  importEntryId: string | null,
  detail: unknown,
) {
  await sql`
    insert into public.recording_import_events (
      run_id, import_entry_id, external_entry_id, event_type, detail
    ) values (
      ${runId}::uuid, ${importEntryId}::uuid, ${externalEntryId}, ${eventType}, ${sql.json(detail as never)}
    )
  `;
}

async function runImport(sql: Sql, options: CliOptions): Promise<void> {
  await assertSchema(sql);
  const allEntries = await readJsonl<MikmaqEntry>(ENTRY_MANIFEST_PATH);
  const allDownloads = await readJsonl<AudioDownload>(AUDIO_DOWNLOAD_PATH);
  const archive = await assertArchiveComplete(allEntries, allDownloads, options.allowPartial);
  const planned = await plan(sql, options);
  const entriesById = new Map(planned.entries.map((entry) => [entry.externalEntryId, entry]));
  const downloadsByUrl = new Map(allDownloads.map((download) => [download.sourceAudioUrl, download]));
  const speakerCodesByRecordingIdentity = new Map<string, Set<string>>();
  for (const entry of planned.entries) {
    for (const reference of entryAudio(entry)) {
      const download = downloadsByUrl.get(reference.sourceAudioUrl);
      if (!download || download.qualityStatus !== 'usable' || !reference.speakerCode) continue;
      const identity = versionedExternalRecordingId(reference, download);
      const codes = speakerCodesByRecordingIdentity.get(identity) ?? new Set<string>();
      codes.add(reference.speakerCode);
      speakerCodesByRecordingIdentity.set(identity, codes);
    }
  }
  const sourceSpeakerAmbiguityCount = [...speakerCodesByRecordingIdentity.values()].filter(
    (codes) => codes.size > 1,
  ).length;
  const sourceId = await upsertSource(sql);
  const wordClasses = await classByWordType(sql, planned.langId);
  const runRows = await sql<{ id: string }[]>`
    insert into public.recording_import_runs (
      source_id, operation, status, entry_manifest_sha256, audio_manifest_sha256, configuration
    ) values (
      ${sourceId}::uuid, 'import', 'running', ${archive.entryManifestSha256}, ${archive.audioManifestSha256},
      ${sql.json({
        allowPartial: options.allowPartial,
        createMissing: options.createMissing,
        limit: options.limit,
        researchRoot: MIKMAQ_RESEARCH_ROOT,
        storageRoot: STORAGE_ROOT,
        sourceSpeakerAmbiguityCount,
        canonicalSelectionRule:
          'exact orthography; guarded normalized fallback; part of speech; verified; related rows; enrichment; recency; UUID',
      })}
    ) returning id
  `;
  const runId = runRows[0].id;
  const summary: ImportSummary = {
    entriesProcessed: 0,
    exactExisting: 0,
    wordsCreated: 0,
    reviewRequired: 0,
    examplesCreated: 0,
    recordingsCreated: 0,
    recordingsReused: 0,
    recordingsSkippedUnusable: 0,
    errors: 0,
  };
  const createdWordIdsBySourceGroup = new Map<string, string>();

  for (const [index, planItem] of planned.mappingPlan.entries()) {
    const entry = entriesById.get(planItem.externalEntryId);
    if (!entry) throw new Error(`Entry missing from manifest: ${planItem.externalEntryId}`);
    try {
      const result = await sql.begin(async (tx) => {
        let wordId = planItem.wordId;
        let wordCreated = false;
        let createdWordId: string | null = null;
        if (planItem.status === 'create_from_source') {
          wordId = createdWordIdsBySourceGroup.get(planItem.sourceGroupKey) ?? null;
          if (!wordId) {
            wordId = await createSourceWord(tx, entry, planned.langId, wordClasses);
            createdWordId = wordId;
            wordCreated = true;
          }
        }
        const importEntryId = await upsertImportEntry(tx, sourceId, entry, planItem, wordId);
        if (!wordId) {
          return {
            importEntryId,
            wordId,
            wordCreated,
            createdWordId,
            examplesCreated: 0,
            created: 0,
            reused: 0,
            skippedUnusable: 0,
            unusableAudio: [] as Array<{ sourceAudioUrl: string; qualityNote?: string }>,
          };
        }

        let examplesCreated = 0;
        let created = 0;
        let reused = 0;
        let skippedUnusable = 0;
        const unusableAudio: Array<{ sourceAudioUrl: string; qualityNote?: string }> = [];
        for (const [recordingIndex, reference] of entry.wordRecordings.entries()) {
          const download = downloadsByUrl.get(reference.sourceAudioUrl);
          if (!download) throw new Error(`Audio manifest missing ${reference.sourceAudioUrl}`);
          if (download.qualityStatus !== 'usable') {
            skippedUnusable += 1;
            unusableAudio.push({ sourceAudioUrl: reference.sourceAudioUrl, qualityNote: download.qualityNote });
            continue;
          }
          const state = await insertRecording(tx, {
            sourceId,
            importEntryId,
            langId: planned.langId,
            wordId,
            exampleId: null,
            entry,
            reference,
            download,
            sourceSpeakerCodes: [...(speakerCodesByRecordingIdentity.get(versionedExternalRecordingId(reference, download)) ?? [])].sort(),
            isPrimary: recordingIndex === 0,
          });
          if (state === 'created') created += 1;
          else reused += 1;
        }
        for (const example of entry.examples) {
          const resolvedExample = await findOrCreateExample(tx, wordId, entry, example);
          if (resolvedExample.created) examplesCreated += 1;
          for (const [recordingIndex, reference] of example.recordings.entries()) {
            const download = downloadsByUrl.get(reference.sourceAudioUrl);
            if (!download) throw new Error(`Audio manifest missing ${reference.sourceAudioUrl}`);
            if (download.qualityStatus !== 'usable') {
              skippedUnusable += 1;
              unusableAudio.push({ sourceAudioUrl: reference.sourceAudioUrl, qualityNote: download.qualityNote });
              continue;
            }
            const state = await insertRecording(tx, {
              sourceId,
              importEntryId,
              langId: planned.langId,
              wordId,
              exampleId: resolvedExample.id,
              entry,
              reference,
              download,
              sourceSpeakerCodes: [...(speakerCodesByRecordingIdentity.get(versionedExternalRecordingId(reference, download)) ?? [])].sort(),
              isPrimary: recordingIndex === 0,
            });
            if (state === 'created') created += 1;
            else reused += 1;
          }
        }
        return {
          importEntryId,
          wordId,
          wordCreated,
          createdWordId,
          examplesCreated,
          created,
          reused,
          skippedUnusable,
          unusableAudio,
        };
      });

      if (result.createdWordId) {
        createdWordIdsBySourceGroup.set(planItem.sourceGroupKey, result.createdWordId);
      }
      summary.entriesProcessed += 1;
      if (planItem.status === 'exact_existing') summary.exactExisting += 1;
      if (planItem.status === 'review_required') summary.reviewRequired += 1;
      if (result.wordCreated) summary.wordsCreated += 1;
      summary.examplesCreated += result.examplesCreated;
      summary.recordingsCreated += result.created;
      summary.recordingsReused += result.reused;
      summary.recordingsSkippedUnusable += result.skippedUnusable;
      await recordEvent(sql, runId, 'entry_imported', entry.externalEntryId, result.importEntryId, {
        mappingStatus: planItem.status,
        wordId: result.wordId,
        wordCreated: result.wordCreated,
        examplesCreated: result.examplesCreated,
        recordingsCreated: result.created,
        recordingsReused: result.reused,
        recordingsSkippedUnusable: result.skippedUnusable,
        unusableAudio: result.unusableAudio,
        candidateWordIds: planItem.candidateWordIds,
        reason: planItem.reason,
      });
    } catch (error) {
      summary.errors += 1;
      await recordEvent(sql, runId, 'entry_error', entry.externalEntryId, null, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (index === 0 || (index + 1) % 250 === 0 || index + 1 === planned.mappingPlan.length) {
      console.log(
        `Import: ${index + 1}/${planned.mappingPlan.length}, recordings=${summary.recordingsCreated}, ` +
          `words=${summary.wordsCreated}, errors=${summary.errors}`,
      );
    }
  }

  const status = summary.errors === 0 ? 'completed' : 'failed';
  await sql`
    update public.recording_import_runs
    set status = ${status}, summary = ${sql.json(summary)}, finished_at = now()
    where id = ${runId}::uuid
  `;
  const report = { generatedAt: new Date().toISOString(), runId, status, ...summary };
  await writeJson(IMPORT_REPORT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (summary.errors > 0) throw new Error(`Import completed with ${summary.errors} entry errors; see run ${runId}`);
}

async function verify(sql: Sql): Promise<void> {
  await assertSchema(sql);
  const sourceRows = await sql<{ id: string }[]>`
    select id from public.recording_sources where slug = ${MIKMAQ_ONLINE_SOURCE_SLUG} limit 1
  `;
  if (sourceRows.length === 0) throw new Error('Imported recording source row does not exist');
  const sourceId = sourceRows[0].id;
  const entries = await readJsonl<MikmaqEntry>(ENTRY_MANIFEST_PATH);
  const downloads = await readJsonl<AudioDownload>(AUDIO_DOWNLOAD_PATH);
  const manifests = await manifestContext();
  const runRows = await sql<{ id: string }[]>`
    insert into public.recording_import_runs (
      source_id, operation, status, entry_manifest_sha256, audio_manifest_sha256, configuration
    ) values (
      ${sourceId}::uuid, 'verify', 'running', ${manifests.entryManifestSha256},
      ${manifests.audioManifestSha256},
      ${sql.json({ researchRoot: MIKMAQ_RESEARCH_ROOT, storageRoot: STORAGE_ROOT })}
    ) returning id
  `;
  const runId = runRows[0].id;
  const downloadsByUrl = new Map(downloads.map((download) => [download.sourceAudioUrl, download]));
  const expectedRecordingIds = new Set<string>();
  const expectedSpeakerCodesByRecordingId = new Map<string, Set<string>>();
  for (const reference of entries.flatMap(entryAudio)) {
    const download = downloadsByUrl.get(reference.sourceAudioUrl);
    if (!download) throw new Error(`Verification audio manifest is missing ${reference.sourceAudioUrl}`);
    if (download.qualityStatus !== 'usable') continue;
    const recordingId = versionedExternalRecordingId(reference, download);
    expectedRecordingIds.add(recordingId);
    if (reference.speakerCode) {
      const codes = expectedSpeakerCodesByRecordingId.get(recordingId) ?? new Set<string>();
      codes.add(reference.speakerCode);
      expectedSpeakerCodesByRecordingId.set(recordingId, codes);
    }
  }
  const expectedEntryIds = new Set(entries.map((entry) => entry.externalEntryId));
  const rows = await sql<Record<string, unknown>[]>`
    select
      count(distinct rie.id)::int as mapped_entries,
      count(distinct rie.id) filter (where rie.mapping_status = 'exact_existing')::int as exact_existing,
      count(distinct rie.id) filter (where rie.mapping_status = 'created_from_source')::int as created_from_source,
      count(distinct rie.id) filter (where rie.mapping_status = 'review_required')::int as review_required,
      count(distinct rer.recording_id)::int as imported_recordings,
      count(distinct rer.recording_id) filter (where r.kind = 'word')::int as word_recordings,
      count(distinct rer.recording_id) filter (where r.kind = 'sentence')::int as sentence_recordings,
      count(distinct rer.recording_id) filter (where r.status <> 'active')::int as inactive_recordings,
      count(distinct rer.recording_id) filter (where r.word_id is null)::int as recordings_without_word,
      count(distinct rer.recording_id) filter (where r.kind = 'sentence' and r.example_id is null)::int as sentences_without_example,
      count(distinct rer.recording_id) filter (
        where r.duration_ms is null or r.duration_ms <= 0
           or r.sample_rate is null or r.sample_rate <= 0
           or r.channels is null or r.channels <= 0
      )::int as recordings_without_audio_metadata
    from public.recording_import_entries rie
    left join public.recording_external_refs rer on rer.import_entry_id = rie.id
    left join public.recordings r on r.id = rer.recording_id
    where rie.source_id = ${sourceId}::uuid
  `;
  const storageRows = await sql<{ storage_path: string; content_sha256: string }[]>`
    select r.storage_path, rer.content_sha256
    from public.recording_external_refs rer
    join public.recordings r on r.id = rer.recording_id
    where rer.source_id = ${sourceId}::uuid
    order by r.storage_path
  `;
  const externalRows = await sql<{
    external_recording_id: string;
    speaker_code: string | null;
    metadata: Record<string, unknown>;
  }[]>`
    select external_recording_id, speaker_code, metadata
    from public.recording_external_refs
    where source_id = ${sourceId}::uuid
    order by external_recording_id
  `;
  const mappingRows = await sql<{ external_entry_id: string }[]>`
    select external_entry_id
    from public.recording_import_entries
    where source_id = ${sourceId}::uuid
    order by external_entry_id
  `;
  const actualRecordingIds = new Set(externalRows.map((row) => row.external_recording_id));
  const actualEntryIds = new Set(mappingRows.map((row) => row.external_entry_id));
  const missingRecordingIds = [...expectedRecordingIds].filter((id) => !actualRecordingIds.has(id));
  const unexpectedRecordingIds = [...actualRecordingIds].filter((id) => !expectedRecordingIds.has(id));
  const missingEntryIds = [...expectedEntryIds].filter((id) => !actualEntryIds.has(id));
  const unexpectedEntryIds = [...actualEntryIds].filter((id) => !expectedEntryIds.has(id));
  const speakerAttributionMismatches: Array<{
    externalRecordingId: string;
    expectedCodes: string[];
    actualCode: string | null;
    retainedCodes: string[];
  }> = [];
  for (const row of externalRows) {
    const expectedCodes = [...(expectedSpeakerCodesByRecordingId.get(row.external_recording_id) ?? [])].sort();
    const expectedCode = expectedCodes.length === 1 ? expectedCodes[0] : null;
    const retainedCodes = Array.isArray(row.metadata?.sourceSpeakerCodes)
      ? row.metadata.sourceSpeakerCodes.filter((code): code is string => typeof code === 'string').sort()
      : [];
    const ambiguousCodesRetained = expectedCodes.length <= 1 || JSON.stringify(retainedCodes) === JSON.stringify(expectedCodes);
    if (row.speaker_code !== expectedCode || !ambiguousCodesRetained) {
      speakerAttributionMismatches.push({
        externalRecordingId: row.external_recording_id,
        expectedCodes,
        actualCode: row.speaker_code,
        retainedCodes,
      });
    }
  }
  const missingFiles: string[] = [];
  const checksumMismatches: string[] = [];
  const checkedPaths = new Set<string>();
  for (const row of storageRows) {
    if (checkedPaths.has(row.storage_path)) continue;
    checkedPaths.add(row.storage_path);
    const path = join(STORAGE_ROOT, row.storage_path);
    if (!(await pathExists(path))) {
      missingFiles.push(row.storage_path);
      continue;
    }
    const digest = sha256(await readFile(path));
    if (digest !== row.content_sha256) checksumMismatches.push(row.storage_path);
  }
  const aggregates = rows[0] ?? {};
  const violations = {
    inactiveRecordings: asNumber(aggregates.inactive_recordings),
    recordingsWithoutWord: asNumber(aggregates.recordings_without_word),
    sentencesWithoutExample: asNumber(aggregates.sentences_without_example),
    recordingsWithoutAudioMetadata: asNumber(aggregates.recordings_without_audio_metadata),
    missingFiles: missingFiles.length,
    checksumMismatches: checksumMismatches.length,
    missingRecordingIdentities: missingRecordingIds.length,
    missingEntryMappings: missingEntryIds.length,
    speakerAttributionMismatches: speakerAttributionMismatches.length,
  };
  const passed = Object.values(violations).every((value) => value === 0);
  const report = {
    generatedAt: new Date().toISOString(),
    runId,
    passed,
    sourceId,
    database: aggregates,
    productionFilesChecked: checkedPaths.size,
    expectedRecordingIdentities: expectedRecordingIds.size,
    actualRecordingIdentities: actualRecordingIds.size,
    expectedEntryMappings: expectedEntryIds.size,
    actualEntryMappings: actualEntryIds.size,
    violations,
    retainedHistoricalRows: {
      recordingIdentitiesNotInCurrentManifest: unexpectedRecordingIds.length,
      entryMappingsNotInCurrentManifest: unexpectedEntryIds.length,
    },
    missingFiles,
    checksumMismatches,
    missingRecordingIds,
    unexpectedRecordingIds,
    missingEntryIds,
    unexpectedEntryIds,
    speakerAttributionMismatches,
  };
  await sql`
    update public.recording_import_runs
    set status = ${passed ? 'completed' : 'failed'}, summary = ${sql.json(report)}, finished_at = now()
    where id = ${runId}::uuid
  `;
  await recordEvent(sql, runId, passed ? 'verification_passed' : 'verification_failed', null, null, {
    violations,
    expectedRecordingIdentities: expectedRecordingIds.size,
    actualRecordingIdentities: actualRecordingIds.size,
    productionFilesChecked: checkedPaths.size,
  });
  await writeJson(VERIFY_REPORT_PATH, report);
  console.log(JSON.stringify(report, null, 2));
  if (!passed) throw new Error('Imported recording verification failed');
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const sql = postgres(databaseUrl, { max: 4, idle_timeout: 20, connect_timeout: 15 });
  try {
    if (options.command === 'plan') await plan(sql, options);
    if (options.command === 'import') await runImport(sql, options);
    if (options.command === 'verify') await verify(sql);
  } finally {
    await sql.end({ timeout: 10 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
