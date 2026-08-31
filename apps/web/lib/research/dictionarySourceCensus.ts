import { createHash } from 'node:crypto';
import { z } from 'zod';

export const DictionaryCensusContractSchema = z.object({
  schema_version: z.literal(1),
  census_id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
  language: z.object({
    code: z.string().min(1),
    name: z.string().min(1),
  }),
  source: z.object({
    source_id: z.string().min(1),
    path: z.string().min(1),
    format: z.literal('json_array'),
    record_id_prefix: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    fields: z.object({
      headword: z.string().min(1),
      translation: z.string().min(1),
      definition: z.string().min(1),
      audio: z.string().min(1).nullable(),
      image: z.string().min(1).nullable(),
    }),
  }),
  database: z.object({
    yaml_source_file: z.string().min(1),
    yaml_source_ref_base: z.literal(1),
    require_exact_legacy_and_yaml_pair: z.boolean(),
  }),
});

export type DictionaryCensusContract = z.infer<
  typeof DictionaryCensusContractSchema
>;

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export const SourceDictionaryRecordSchema = z.object({
  sourceRecordId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceOrdinal: z.number().int().positive(),
  sourceRecordSha256: z.string().regex(/^[0-9a-f]{64}$/),
  headwordSource: z.string().min(1),
  headwordComparison: z.string().min(1),
  translationSource: z.string().min(1),
  translationComparison: z.string().min(1),
  definitionSource: z.string().min(1),
  audioPointer: z.string().nullable(),
  imagePointer: z.string().nullable(),
  contentTupleSha256: z.string().regex(/^[0-9a-f]{64}$/),
  rawRecord: z.record(z.string(), z.unknown()),
});

export type SourceDictionaryRecord = z.infer<typeof SourceDictionaryRecordSchema>;

export interface DatabaseDefinitionRecord {
  id: string;
  definition: string;
  definitionNumber: number | null;
  isPrimary: boolean | null;
}

export interface DatabaseTranslationRecord {
  id: string;
  translation: string;
  targetLanguage: string | null;
  isPrimary: boolean | null;
}

export interface DatabaseWordRecord {
  databaseWordId: string;
  word: string;
  normalizedWord: string | null;
  managedByYamlSync: boolean;
  yamlSourceFile: string | null;
  yamlSourceRef: string | null;
  yamlContentHash: string | null;
  isVerified: boolean | null;
  qualityScore: number | null;
  notes: string | null;
  metadata: { [key: string]: JsonValue };
  createdAt: string;
  updatedAt: string;
  wordClassCode: string | null;
  definitions: DatabaseDefinitionRecord[];
  translations: DatabaseTranslationRecord[];
  entrySource: string | null;
  needsReview: string | null;
}

export type DatabaseLineage = 'legacy_import' | 'yaml_sync' | 'unclassified';

export interface DictionaryCrosswalkRecord {
  sourceRecordId: string;
  sourceOrdinal: number;
  sourceRecordSha256: string;
  contentTupleSha256: string;
  headwordSource: string;
  translationSource: string;
  definitionSource: string;
  legacyDatabaseWordId: string | null;
  yamlDatabaseWordId: string | null;
  legacyOriginalRecordMatch: boolean;
  yamlSourceRefExpected: string;
  yamlSourceRefActual: string | null;
  yamlSourceRefMatch: boolean;
  exactContentPair: boolean;
  status: 'exact_two_lineage_pair' | 'anomaly';
  anomalyCodes: string[];
}

export interface DictionaryCensusResult {
  crosswalk: DictionaryCrosswalkRecord[];
  report: {
    schemaVersion: 1;
    language: { code: string; name: string };
    source: {
      sourceId: string;
      rows: number;
      distinctExactHeadwords: number;
      distinctComparisonHeadwords: number;
      distinctContentTuples: number;
      repeatedExactHeadwordGroups: number;
      rowsInRepeatedExactHeadwordGroups: number;
      multiwordHeadwords: number;
      rowsWithAudioPointers: number;
      distinctAudioPointers: number;
      rowsWithImagePointers: number;
      distinctImagePointers: number;
    };
    database: {
      rows: number;
      legacyImportRows: number;
      yamlSyncRows: number;
      unclassifiedRows: number;
      distinctContentTuples: number;
    };
    crosswalk: {
      exactTwoLineagePairs: number;
      anomalyRows: number;
      unconsumedDatabaseRows: number;
      duplicateSourceContentTupleGroups: number;
    };
    EnglishPromptInventory: {
      distinctComparisonPrompts: number;
      promptsWithMultipleSourceRows: number;
      promptsWithMultipleTargetHeadwords: number;
    };
    repeatedHeadwordGroups: Array<{
      headword: string;
      sourceRecordIds: string[];
      translations: string[];
      definitions: string[];
    }>;
    ambiguousEnglishPromptGroups: Array<{
      prompt: string;
      sourceRecordIds: string[];
      sourceTranslations: string[];
      targetHeadwords: string[];
    }>;
    anomalyCodes: Record<string, number>;
    unconsumedDatabaseWordIds: string[];
    claimLimit: string;
  };
}

export interface CandidateDictionaryLedgers {
  entries: Array<{
    entryCandidateId: string;
    sourceRecordId: string;
    sourceId: string;
    sourceOrdinal: number;
    sourceRecordSha256: string;
    headwordSource: string;
    headwordComparison: string;
    rawPartOfSpeech: null;
    comparisonPartOfSpeech: null;
    partOfSpeechStatus: 'not_provided_by_source';
    lexicalIdentityStatus: 'unadjudicated_source_record';
    status: 'candidate';
  }>;
  senses: Array<{
    senseCandidateId: string;
    entryCandidateId: string;
    sourceRecordId: string;
    translationSource: string;
    translationComparison: string;
    definitionSource: string;
    sourceFields: { translation: string; definition: string };
    senseBoundaryStatus: 'unadjudicated';
    crossEntryRelationStatus: 'unadjudicated';
    substitutableTranslationStatus: 'unadjudicated';
    status: 'candidate';
  }>;
  forms: Array<{
    formCandidateId: string;
    entryCandidateId: string;
    sourceRecordId: string;
    surfaceSource: string;
    surfaceComparison: string;
    formType: 'published_headword';
    morphologicalAnalysisStatus: 'unanalysed';
    variety: 'unknown';
    orthography: string;
    status: 'candidate';
  }>;
  examples: [];
  mediaLinks: Array<{
    mediaLinkId: string;
    entryCandidateId: string;
    sourceRecordId: string;
    mediaKind: 'audio' | 'image';
    sourcePointer: string;
    archivePath: null;
    speakerId: 'unknown';
    recordingSessionId: 'unknown';
    resolutionStatus: 'source_pointer_unresolved';
    status: 'candidate';
  }>;
  conflicts: [];
  reviewQueue: Array<{
    reviewItemId: string;
    reviewKind: 'headword_identity' | 'english_prompt_mapping';
    sourceRecordIds: string[];
    surfaceKey: string;
    observedValues: string[];
    decisionRequired: string;
    allowedOutcomes: string[];
    evidenceRequirement: string;
    status: 'pending';
  }>;
}

function asJsonValue(value: unknown, path = '$'): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`non-finite number at ${path}`);
    return value;
  }
  if (Array.isArray(value))
    return value.map((item, index) => asJsonValue(item, `${path}[${index}]`));
  if (typeof value === 'object') {
    const result: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) throw new Error(`undefined value at ${path}.${key}`);
      result[key] = asJsonValue(item, `${path}.${key}`);
    }
    return result;
  }
  throw new Error(`unsupported JSON value at ${path}: ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(asJsonValue(value));
}

export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function normalizeComparison(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ');
}

function requiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new Error(`source field ${field} must be a non-empty string`);
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  field: string | null,
): string | null {
  if (!field) return null;
  const value = record[field];
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string')
    throw new Error(`source field ${field} must be a string when present`);
  return value;
}

function contentTuple(
  headword: string,
  definitions: string[],
  translations: string[],
): { headword: string; definitions: string[]; translations: string[] } {
  return {
    headword,
    definitions: [...definitions].sort(),
    translations: [...translations].sort(),
  };
}

export function databaseContentTupleSha256(row: DatabaseWordRecord): string {
  return sha256Canonical(
    contentTuple(
      row.word,
      row.definitions.map((definition) => definition.definition),
      row.translations.map((translation) => translation.translation),
    ),
  );
}

export function classifyDatabaseLineage(
  row: DatabaseWordRecord,
): DatabaseLineage {
  if (row.managedByYamlSync) return 'yaml_sync';
  if (
    row.metadata.original_entry !== null &&
    typeof row.metadata.original_entry === 'object' &&
    !Array.isArray(row.metadata.original_entry)
  )
    return 'legacy_import';
  return 'unclassified';
}

export function buildSourceDictionaryRecords(
  rawRecords: unknown[],
  contract: DictionaryCensusContract,
): SourceDictionaryRecord[] {
  return rawRecords.map((raw, index) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error(`source row ${index + 1} must be an object`);
    const record = raw as Record<string, unknown>;
    const fields = contract.source.fields;
    const headword = requiredString(record, fields.headword);
    const translation = requiredString(record, fields.translation);
    const definition = requiredString(record, fields.definition);
    const rawRecord = asJsonValue(record) as { [key: string]: JsonValue };
    const ordinal = index + 1;
    return {
      sourceRecordId: `${contract.source.record_id_prefix}-${String(ordinal).padStart(6, '0')}`,
      sourceId: contract.source.source_id,
      sourceOrdinal: ordinal,
      sourceRecordSha256: sha256Canonical(rawRecord),
      headwordSource: headword,
      headwordComparison: normalizeComparison(headword),
      translationSource: translation,
      translationComparison: normalizeComparison(translation),
      definitionSource: definition,
      audioPointer: optionalString(record, fields.audio),
      imagePointer: optionalString(record, fields.image),
      contentTupleSha256: sha256Canonical(
        contentTuple(headword, [definition], [translation]),
      ),
      rawRecord,
    };
  });
}

function increment(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

function groupBy<T>(rows: T[], key: (_row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    groups.set(value, [...(groups.get(value) ?? []), row]);
  }
  return groups;
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function buildDictionaryCensus(
  sourceRecords: SourceDictionaryRecord[],
  databaseRows: DatabaseWordRecord[],
  contract: DictionaryCensusContract,
): DictionaryCensusResult {
  const databaseByTuple = groupBy(databaseRows, databaseContentTupleSha256);
  const consumedDatabaseIds = new Set<string>();
  const anomalyCodes: Record<string, number> = {};

  const crosswalk = sourceRecords.map((source): DictionaryCrosswalkRecord => {
    const candidates = databaseByTuple.get(source.contentTupleSha256) ?? [];
    const legacy = candidates.filter(
      (row) => classifyDatabaseLineage(row) === 'legacy_import',
    );
    const yaml = candidates.filter(
      (row) => classifyDatabaseLineage(row) === 'yaml_sync',
    );
    const unclassified = candidates.filter(
      (row) => classifyDatabaseLineage(row) === 'unclassified',
    );
    const anomalies: string[] = [];
    if (legacy.length !== 1) anomalies.push('legacy_lineage_count_not_one');
    if (yaml.length !== 1) anomalies.push('yaml_lineage_count_not_one');
    if (unclassified.length > 0) anomalies.push('unclassified_matching_lineage');

    const legacyRow = legacy.length === 1 ? legacy[0] : null;
    const yamlRow = yaml.length === 1 ? yaml[0] : null;
    const originalEntry = legacyRow?.metadata.original_entry;
    const legacyOriginalRecordMatch =
      originalEntry !== undefined &&
      sha256Canonical(originalEntry) === source.sourceRecordSha256;
    if (legacyRow && !legacyOriginalRecordMatch)
      anomalies.push('legacy_original_record_mismatch');

    const expectedYamlRef = `${contract.database.yaml_source_file}#${source.sourceOrdinal}`;
    const yamlSourceRefMatch = yamlRow?.yamlSourceRef === expectedYamlRef;
    if (yamlRow && !yamlSourceRefMatch) anomalies.push('yaml_source_ref_mismatch');

    for (const row of [...legacy, ...yaml, ...unclassified])
      consumedDatabaseIds.add(row.databaseWordId);
    for (const code of anomalies) increment(anomalyCodes, code);

    return {
      sourceRecordId: source.sourceRecordId,
      sourceOrdinal: source.sourceOrdinal,
      sourceRecordSha256: source.sourceRecordSha256,
      contentTupleSha256: source.contentTupleSha256,
      headwordSource: source.headwordSource,
      translationSource: source.translationSource,
      definitionSource: source.definitionSource,
      legacyDatabaseWordId: legacyRow?.databaseWordId ?? null,
      yamlDatabaseWordId: yamlRow?.databaseWordId ?? null,
      legacyOriginalRecordMatch,
      yamlSourceRefExpected: expectedYamlRef,
      yamlSourceRefActual: yamlRow?.yamlSourceRef ?? null,
      yamlSourceRefMatch,
      exactContentPair: legacy.length === 1 && yaml.length === 1,
      status: anomalies.length === 0 ? 'exact_two_lineage_pair' : 'anomaly',
      anomalyCodes: anomalies,
    };
  });

  const sourceByContent = groupBy(
    sourceRecords,
    (row) => row.contentTupleSha256,
  );
  for (const rows of sourceByContent.values())
    if (rows.length > 1) increment(anomalyCodes, 'duplicate_source_content_tuple');

  const unconsumedDatabaseWordIds = databaseRows
    .filter((row) => !consumedDatabaseIds.has(row.databaseWordId))
    .map((row) => row.databaseWordId)
    .sort();
  if (unconsumedDatabaseWordIds.length > 0)
    anomalyCodes.unconsumed_database_row = unconsumedDatabaseWordIds.length;

  const exactHeadwordGroups = groupBy(
    sourceRecords,
    (row) => row.headwordSource,
  );
  const repeatedHeadwordGroups = [...exactHeadwordGroups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([headword, rows]) => ({
      headword,
      sourceRecordIds: rows.map((row) => row.sourceRecordId),
      translations: sortedUnique(rows.map((row) => row.translationSource)),
      definitions: sortedUnique(rows.map((row) => row.definitionSource)),
    }))
    .sort((left, right) => left.headword.localeCompare(right.headword));

  const EnglishPromptGroups = groupBy(
    sourceRecords,
    (row) => row.translationComparison,
  );
  const ambiguousEnglishPromptGroups = [...EnglishPromptGroups.entries()]
    .map(([prompt, rows]) => ({
      prompt,
      sourceRecordIds: rows.map((row) => row.sourceRecordId),
      sourceTranslations: sortedUnique(rows.map((row) => row.translationSource)),
      targetHeadwords: sortedUnique(rows.map((row) => row.headwordSource)),
    }))
    .filter((group) => group.targetHeadwords.length > 1)
    .sort((left, right) => left.prompt.localeCompare(right.prompt));

  const lineageCounts: Record<DatabaseLineage, number> = {
    legacy_import: 0,
    yaml_sync: 0,
    unclassified: 0,
  };
  for (const row of databaseRows) lineageCounts[classifyDatabaseLineage(row)] += 1;

  const duplicateSourceContentTupleGroups = [...sourceByContent.values()].filter(
    (rows) => rows.length > 1,
  ).length;

  return {
    crosswalk,
    report: {
      schemaVersion: 1,
      language: contract.language,
      source: {
        sourceId: contract.source.source_id,
        rows: sourceRecords.length,
        distinctExactHeadwords: exactHeadwordGroups.size,
        distinctComparisonHeadwords: new Set(
          sourceRecords.map((row) => row.headwordComparison),
        ).size,
        distinctContentTuples: sourceByContent.size,
        repeatedExactHeadwordGroups: repeatedHeadwordGroups.length,
        rowsInRepeatedExactHeadwordGroups: repeatedHeadwordGroups.reduce(
          (total, group) => total + group.sourceRecordIds.length,
          0,
        ),
        multiwordHeadwords: sourceRecords.filter((row) =>
          /\s/u.test(row.headwordSource.trim()),
        ).length,
        rowsWithAudioPointers: sourceRecords.filter(
          (row) => row.audioPointer !== null,
        ).length,
        distinctAudioPointers: new Set(
          sourceRecords.flatMap((row) =>
            row.audioPointer === null ? [] : [row.audioPointer],
          ),
        ).size,
        rowsWithImagePointers: sourceRecords.filter(
          (row) => row.imagePointer !== null,
        ).length,
        distinctImagePointers: new Set(
          sourceRecords.flatMap((row) =>
            row.imagePointer === null ? [] : [row.imagePointer],
          ),
        ).size,
      },
      database: {
        rows: databaseRows.length,
        legacyImportRows: lineageCounts.legacy_import,
        yamlSyncRows: lineageCounts.yaml_sync,
        unclassifiedRows: lineageCounts.unclassified,
        distinctContentTuples: new Set(
          databaseRows.map(databaseContentTupleSha256),
        ).size,
      },
      crosswalk: {
        exactTwoLineagePairs: crosswalk.filter(
          (row) => row.status === 'exact_two_lineage_pair',
        ).length,
        anomalyRows: crosswalk.filter((row) => row.status === 'anomaly').length,
        unconsumedDatabaseRows: unconsumedDatabaseWordIds.length,
        duplicateSourceContentTupleGroups,
      },
      EnglishPromptInventory: {
        distinctComparisonPrompts: EnglishPromptGroups.size,
        promptsWithMultipleSourceRows: [...EnglishPromptGroups.values()].filter(
          (rows) => rows.length > 1,
        ).length,
        promptsWithMultipleTargetHeadwords: ambiguousEnglishPromptGroups.length,
      },
      repeatedHeadwordGroups,
      ambiguousEnglishPromptGroups,
      anomalyCodes,
      unconsumedDatabaseWordIds,
      claimLimit:
        'This census proves source-to-database lineage and surface-record identity only. Repeated headwords and English prompts have not yet been adjudicated into senses, synonyms, variants, inflections, or benchmark-acceptable answers.',
    },
  };
}

export function buildCandidateDictionaryLedgers(
  sourceRecords: SourceDictionaryRecord[],
  censusReport: DictionaryCensusResult['report'],
  settings: { orthographyId: string },
): CandidateDictionaryLedgers {
  const entryId = (record: SourceDictionaryRecord) =>
    `${record.sourceRecordId}-entry-candidate`;
  const senses = sourceRecords.map((record) => ({
    senseCandidateId: `${record.sourceRecordId}-sense-candidate`,
    entryCandidateId: entryId(record),
    sourceRecordId: record.sourceRecordId,
    translationSource: record.translationSource,
    translationComparison: record.translationComparison,
    definitionSource: record.definitionSource,
    sourceFields: { translation: 'English', definition: 'description' },
    senseBoundaryStatus: 'unadjudicated' as const,
    crossEntryRelationStatus: 'unadjudicated' as const,
    substitutableTranslationStatus: 'unadjudicated' as const,
    status: 'candidate' as const,
  }));
  const reviewQueue: CandidateDictionaryLedgers['reviewQueue'] = [];
  for (const group of censusReport.repeatedHeadwordGroups) {
    reviewQueue.push({
      reviewItemId: `${censusReport.language.code}-review-headword-${sha256Canonical({
        headword: group.headword,
        sourceRecordIds: group.sourceRecordIds,
      })}`,
      reviewKind: 'headword_identity',
      sourceRecordIds: group.sourceRecordIds,
      surfaceKey: group.headword,
      observedValues: sortedUnique([
        ...group.translations,
        ...group.definitions,
      ]),
      decisionRequired:
        'Determine whether these source records represent homonyms, polysemous senses of one lexeme, inflectional or derivational relations, spelling/variety variants, duplicate records, or another source-supported relation.',
      allowedOutcomes: [
        'separate_homonyms',
        'shared_lexeme_multiple_senses',
        'morphologically_related_forms',
        'orthographic_or_variety_variants',
        'duplicate_source_records',
        'defer_unresolved',
      ],
      evidenceRequirement:
        'A source anchor or recorded qualified review is required; surface spelling alone cannot decide lexical identity.',
      status: 'pending',
    });
  }
  for (const group of censusReport.ambiguousEnglishPromptGroups) {
    reviewQueue.push({
      reviewItemId: `${censusReport.language.code}-review-english-${sha256Canonical({
        prompt: group.prompt,
        sourceRecordIds: group.sourceRecordIds,
      })}`,
      reviewKind: 'english_prompt_mapping',
      sourceRecordIds: group.sourceRecordIds,
      surfaceKey: group.prompt,
      observedValues: group.targetHeadwords,
      decisionRequired:
        'Determine which mappings are sense-specific translations, substitutable synonyms, variety or spelling variants, morphologically distinct forms, or context-bound descriptions before building lookup or exact-match benchmark references.',
      allowedOutcomes: [
        'sense_qualified_mappings',
        'substitutable_synonyms',
        'orthographic_or_variety_variants',
        'morphologically_distinct_forms',
        'context_bound_descriptions',
        'defer_unresolved',
      ],
      evidenceRequirement:
        'A source anchor or recorded qualified review is required; sharing an English label does not establish synonymy.',
      status: 'pending',
    });
  }

  return {
    entries: sourceRecords.map((record) => ({
      entryCandidateId: entryId(record),
      sourceRecordId: record.sourceRecordId,
      sourceId: record.sourceId,
      sourceOrdinal: record.sourceOrdinal,
      sourceRecordSha256: record.sourceRecordSha256,
      headwordSource: record.headwordSource,
      headwordComparison: record.headwordComparison,
      rawPartOfSpeech: null,
      comparisonPartOfSpeech: null,
      partOfSpeechStatus: 'not_provided_by_source',
      lexicalIdentityStatus: 'unadjudicated_source_record',
      status: 'candidate',
    })),
    senses,
    forms: sourceRecords.map((record) => ({
      formCandidateId: `${record.sourceRecordId}-form-candidate`,
      entryCandidateId: entryId(record),
      sourceRecordId: record.sourceRecordId,
      surfaceSource: record.headwordSource,
      surfaceComparison: record.headwordComparison,
      formType: 'published_headword',
      morphologicalAnalysisStatus: 'unanalysed',
      variety: 'unknown',
      orthography: settings.orthographyId,
      status: 'candidate',
    })),
    examples: [],
    mediaLinks: sourceRecords.flatMap((record) => {
      const links: CandidateDictionaryLedgers['mediaLinks'] = [];
      if (record.audioPointer !== null)
        links.push({
          mediaLinkId: `${record.sourceRecordId}-media-audio`,
          entryCandidateId: entryId(record),
          sourceRecordId: record.sourceRecordId,
          mediaKind: 'audio',
          sourcePointer: record.audioPointer,
          archivePath: null,
          speakerId: 'unknown',
          recordingSessionId: 'unknown',
          resolutionStatus: 'source_pointer_unresolved',
          status: 'candidate',
        });
      if (record.imagePointer !== null)
        links.push({
          mediaLinkId: `${record.sourceRecordId}-media-image`,
          entryCandidateId: entryId(record),
          sourceRecordId: record.sourceRecordId,
          mediaKind: 'image',
          sourcePointer: record.imagePointer,
          archivePath: null,
          speakerId: 'unknown',
          recordingSessionId: 'unknown',
          resolutionStatus: 'source_pointer_unresolved',
          status: 'candidate',
        });
      return links;
    }),
    conflicts: [],
    reviewQueue: reviewQueue.sort((left, right) =>
      left.reviewItemId.localeCompare(right.reviewItemId),
    ),
  };
}
