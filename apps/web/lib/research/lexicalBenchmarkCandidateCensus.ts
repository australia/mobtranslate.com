import { createHash } from 'node:crypto';
import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);

const ComponentSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
});

export const LexicalBenchmarkCandidateCensusContractSchema = z.object({
  schema_version: z.literal(1),
  census_id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/u),
  created_at_utc: z.string().min(1),
  language: z.object({
    name: z.string().min(1),
    iso_639_3: z.string().length(3),
    glottocode: z.string().min(1),
  }),
  dictionary_edition: z.object({
    edition_id: z.string().min(1),
    manifest_path: z.string().min(1),
    manifest_sha256: Sha256Schema,
  }),
  components: z.object({
    entries: ComponentSchema,
    senses: ComponentSchema,
    forms: ComponentSchema,
    media_links: ComponentSchema,
    review_queue: ComponentSchema,
    historical_crosswalk: ComponentSchema,
    contemporary_evidence: ComponentSchema,
    published_evidence: ComponentSchema,
  }),
  source_layers: z.object({
    current: z.object({
      source_id: z.string().min(1),
      role: z.literal('current_product_dictionary_source'),
    }),
    historical: z.object({
      source_id: z.string().min(1),
      role: z.literal('historical_dictionary_evidence'),
    }),
  }),
  normalization: z.object({
    comparison_unicode: z.literal('NFKC'),
    comparison_case: z.literal('lowercase'),
    comparison_whitespace: z.literal('trim_and_collapse'),
    source_strings_preserved: z.literal(true),
    punctuation_preserved: z.literal(true),
  }),
  candidate_policy: z.object({
    current_source_records_are_diagnostic_candidates: z.literal(true),
    historical_records_are_separate_evidence: z.literal(true),
    group_current_prompts_by_exact_translation_comparison: z.literal(true),
    group_headwords_within_source_layer: z.literal(true),
    accepted_references_must_be_empty: z.literal(true),
    benchmark_registration_allowed: z.literal(false),
    automatic_sense_or_synonym_acceptance: z.literal(false),
    automatic_historical_modern_mapping: z.literal(false),
    model_output_is_linguistic_evidence: z.literal(false),
  }),
  outputs: z.object({
    root: z.string().min(1),
    records: z.string().min(1),
    prompt_groups: z.string().min(1),
    headword_groups: z.string().min(1),
    benchmark_candidates: z.string().min(1),
    report: z.string().min(1),
    manifest: z.string().min(1),
  }),
  claim_limit: z.string().min(1),
});

export type LexicalBenchmarkCandidateCensusContract = z.infer<
  typeof LexicalBenchmarkCandidateCensusContractSchema
>;

const EntrySchema = z
  .object({
    entryCandidateId: z.string().min(1),
    sourceRecordId: z.string().min(1),
    sourceId: z.string().min(1),
    sourceOrdinal: z.number().int().positive(),
    sourceRecordSha256: Sha256Schema,
    headwordSource: z.string().min(1),
    headwordComparison: z.string().min(1),
    rawPartOfSpeech: z.string().nullable(),
    lexicalIdentityStatus: z.string().min(1),
    status: z.literal('candidate'),
  })
  .passthrough();

const SenseSchema = z
  .object({
    senseCandidateId: z.string().min(1),
    entryCandidateId: z.string().min(1),
    sourceRecordId: z.string().min(1),
    translationSource: z.string().min(1).nullable(),
    translationComparison: z.string().min(1).nullable(),
    definitionSource: z.string().min(1),
    senseBoundaryStatus: z.literal('unadjudicated'),
    substitutableTranslationStatus: z.literal('unadjudicated'),
    status: z.literal('candidate'),
  })
  .passthrough();

const FormSchema = z
  .object({
    formCandidateId: z.string().min(1),
    entryCandidateId: z.string().min(1),
    sourceRecordId: z.string().min(1),
    status: z.literal('candidate'),
  })
  .passthrough();

const MediaLinkSchema = z
  .object({
    sourceRecordId: z.string().min(1),
    mediaKind: z.enum(['audio', 'image']),
    resolutionStatus: z.string().min(1),
    status: z.literal('candidate'),
  })
  .passthrough();

const ReviewSchema = z
  .object({
    reviewItemId: z.string().min(1),
    reviewKind: z.string().min(1),
    sourceRecordIds: z.array(z.string().min(1)).default([]),
    sourceRecordId: z.string().min(1).optional(),
    candidateEntryIds: z.array(z.string().min(1)).default([]),
    currentEntryCandidateId: z.string().min(1).optional(),
    status: z.literal('pending'),
  })
  .passthrough();

const HistoricalCrosswalkSchema = z
  .object({
    historicalSourceRecordId: z.string().min(1),
    currentSourceRecordId: z.string().min(1),
    relationStatus: z.literal('unadjudicated'),
    automaticMergeAllowed: z.literal(false),
  })
  .passthrough();

const ContemporaryEvidenceSchema = z
  .object({
    exactCurrentEntryCandidateIds: z.array(z.string().min(1)),
    reviewCandidates: z.array(
      z.object({ sourceRecordId: z.string().min(1) }).passthrough(),
    ),
    status: z.literal('candidate'),
  })
  .passthrough();

const PublishedEvidenceSchema = z
  .object({
    exactCurrentEntryCandidateId: z.string().min(1),
    diagnosticGlossRelation: z.string().min(1),
    status: z.literal('candidate'),
    automaticMergeAllowed: z.literal(false),
  })
  .passthrough();

export interface LexicalBenchmarkCandidateCensusInputs {
  entries: unknown[];
  senses: unknown[];
  forms: unknown[];
  mediaLinks: unknown[];
  reviewQueue: unknown[];
  historicalCrosswalk: unknown[];
  contemporaryEvidence: unknown[];
  publishedEvidence: unknown[];
}

type SourceLayer = 'current' | 'historical';

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableId(prefix: string, ...parts: string[]): string {
  const digest = createHash('sha256')
    .update(parts.join('\0'))
    .digest('hex')
    .slice(0, 24);
  return `${prefix}-${digest}`;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareText);
}

function grouped<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    result.set(value, [...(result.get(value) ?? []), row]);
  }
  return result;
}

function assertUnique<T>(rows: T[], key: (row: T) => string, label: string) {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = key(row);
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function sourceTokens(value: string): string[] {
  return value.trim().split(/\s+/u).filter(Boolean);
}

function codePointCount(value: string): number {
  return [...value].length;
}

function graphemeCount(value: string): number {
  const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
  return [...segmenter.segment(value)].length;
}

function lengthBucket(value: number): string {
  if (value <= 5) return '1-5';
  if (value <= 10) return '6-10';
  if (value <= 15) return '11-15';
  if (value <= 20) return '16-20';
  return '21+';
}

function tokenBucket(value: number): string {
  if (value <= 1) return '1';
  if (value === 2) return '2';
  if (value <= 5) return '3-5';
  return '6+';
}

function punctuationFeatures(value: string) {
  return {
    apostrophe: /['’]/u.test(value),
    comma: value.includes(','),
    semicolon: value.includes(';'),
    slash: value.includes('/'),
    parentheses: /[()]/u.test(value),
    hyphen: /[-‐‑‒–—]/u.test(value),
    period: value.includes('.'),
    colon: value.includes(':'),
  };
}

function repeatedSegmentCandidate(value: string): boolean {
  const segments = value
    .toLocaleLowerCase('en')
    .split(/[-‐‑‒–—\s]+/u)
    .filter(Boolean);
  return segments.some(
    (segment, index) => index > 0 && segment === segments[index - 1],
  );
}

function increment(counter: Map<string, number>, key: string, amount = 1) {
  counter.set(key, (counter.get(key) ?? 0) + amount);
}

function sortedCounter(counter: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...counter.entries()].sort(([a], [b]) => compareText(a, b)),
  );
}

function structuralStratum(
  promptTargetCount: number,
  promptRecordCount: number,
  headwordRecordCount: number,
): string {
  if (promptTargetCount > 1 && headwordRecordCount > 1)
    return 'dual_prompt_and_headword_ambiguity';
  if (promptTargetCount > 1)
    return 'multi_target_prompt_requires_relation_review';
  if (headwordRecordCount > 1) return 'repeated_headword_requires_sense_review';
  if (promptRecordCount > 1) return 'single_target_multiple_source_records';
  return 'structurally_one_to_one_unadjudicated';
}

export function buildLexicalBenchmarkCandidateCensus(
  rawInputs: LexicalBenchmarkCandidateCensusInputs,
  contractInput: unknown,
) {
  const contract =
    LexicalBenchmarkCandidateCensusContractSchema.parse(contractInput);
  const entries = z.array(EntrySchema).parse(rawInputs.entries);
  const senses = z.array(SenseSchema).parse(rawInputs.senses);
  const forms = z.array(FormSchema).parse(rawInputs.forms);
  const mediaLinks = z.array(MediaLinkSchema).parse(rawInputs.mediaLinks);
  const reviewQueue = z.array(ReviewSchema).parse(rawInputs.reviewQueue);
  const historicalCrosswalk = z
    .array(HistoricalCrosswalkSchema)
    .parse(rawInputs.historicalCrosswalk);
  const contemporaryEvidence = z
    .array(ContemporaryEvidenceSchema)
    .parse(rawInputs.contemporaryEvidence);
  const publishedEvidence = z
    .array(PublishedEvidenceSchema)
    .parse(rawInputs.publishedEvidence);

  assertUnique(entries, (row) => row.entryCandidateId, 'entry candidate ID');
  assertUnique(entries, (row) => row.sourceRecordId, 'entry source record ID');
  assertUnique(senses, (row) => row.senseCandidateId, 'sense candidate ID');
  assertUnique(forms, (row) => row.formCandidateId, 'form candidate ID');
  assertUnique(reviewQueue, (row) => row.reviewItemId, 'review item ID');

  const entryById = new Map(entries.map((row) => [row.entryCandidateId, row]));
  const senseByRecord = grouped(senses, (row) => row.sourceRecordId);
  const formByRecord = grouped(forms, (row) => row.sourceRecordId);
  const mediaByRecord = grouped(mediaLinks, (row) => row.sourceRecordId);
  const reviewsByRecord = new Map<string, typeof reviewQueue>();

  if (senses.length !== entries.length)
    throw new Error(
      `expected one sense per entry; got ${senses.length} senses for ${entries.length} entries`,
    );
  if (forms.length !== entries.length)
    throw new Error(
      `expected one form per entry; got ${forms.length} forms for ${entries.length} entries`,
    );
  for (const entry of entries) {
    const recordSenses = senseByRecord.get(entry.sourceRecordId) ?? [];
    const recordForms = formByRecord.get(entry.sourceRecordId) ?? [];
    if (recordSenses.length !== 1)
      throw new Error(
        `source record ${entry.sourceRecordId} has ${recordSenses.length} senses`,
      );
    if (recordForms.length !== 1)
      throw new Error(
        `source record ${entry.sourceRecordId} has ${recordForms.length} forms`,
      );
    if (recordSenses[0].entryCandidateId !== entry.entryCandidateId)
      throw new Error(
        `sense/entry identity mismatch for ${entry.sourceRecordId}`,
      );
    if (recordForms[0].entryCandidateId !== entry.entryCandidateId)
      throw new Error(
        `form/entry identity mismatch for ${entry.sourceRecordId}`,
      );
  }

  const layerFor = (sourceId: string): SourceLayer => {
    if (sourceId === contract.source_layers.current.source_id) return 'current';
    if (sourceId === contract.source_layers.historical.source_id)
      return 'historical';
    throw new Error(`uncontracted lexical source layer: ${sourceId}`);
  };

  const currentEntries = entries.filter(
    (entry) => layerFor(entry.sourceId) === 'current',
  );
  const currentRecords = new Set(
    currentEntries.map((entry) => entry.sourceRecordId),
  );
  const currentEntryIds = new Set(
    currentEntries.map((entry) => entry.entryCandidateId),
  );
  const currentSenseRows = currentEntries.map(
    (entry) => senseByRecord.get(entry.sourceRecordId)![0],
  );

  const lexicalRecordIds = new Set(
    entries.map((entry) => entry.sourceRecordId),
  );
  for (const review of reviewQueue) {
    const referencedRecords = new Set(
      review.sourceRecordIds.filter((sourceRecordId) =>
        lexicalRecordIds.has(sourceRecordId),
      ),
    );
    if (review.sourceRecordId && lexicalRecordIds.has(review.sourceRecordId))
      referencedRecords.add(review.sourceRecordId);
    for (const entryId of review.candidateEntryIds) {
      const entry = entryById.get(entryId);
      if (!entry)
        throw new Error(
          `review ${review.reviewItemId} references unknown entry ${entryId}`,
        );
      referencedRecords.add(entry.sourceRecordId);
    }
    if (review.currentEntryCandidateId) {
      const entry = entryById.get(review.currentEntryCandidateId);
      if (!entry)
        throw new Error(
          `review ${review.reviewItemId} references unknown current entry ${review.currentEntryCandidateId}`,
        );
      referencedRecords.add(entry.sourceRecordId);
    }
    for (const sourceRecordId of referencedRecords) {
      reviewsByRecord.set(sourceRecordId, [
        ...(reviewsByRecord.get(sourceRecordId) ?? []),
        review,
      ]);
    }
  }

  for (const sense of currentSenseRows) {
    if (!sense.translationSource || !sense.translationComparison)
      throw new Error(
        `current source record lacks translation prompt: ${sense.sourceRecordId}`,
      );
  }

  const promptGroupsMap = grouped(
    currentSenseRows,
    (sense) => sense.translationComparison as string,
  );
  const currentHeadwordGroupsMap = grouped(
    currentEntries,
    (entry) => entry.headwordComparison,
  );
  const allHeadwordGroupsMap = grouped(
    entries,
    (entry) => `${layerFor(entry.sourceId)}\0${entry.headwordComparison}`,
  );

  const promptGroups = [...promptGroupsMap.entries()]
    .map(([promptComparison, groupSenses]) => {
      const groupEntries = groupSenses.map(
        (sense) => entryById.get(sense.entryCandidateId)!,
      );
      const targets = uniqueSorted(
        groupEntries.map((entry) => entry.headwordSource),
      );
      const sourceRecordIds = uniqueSorted(
        groupEntries.map((entry) => entry.sourceRecordId),
      );
      const relationStatus =
        targets.length > 1
          ? 'multiple_targets_requires_relation_review'
          : sourceRecordIds.length > 1
            ? 'single_target_multiple_source_records'
            : 'single_target_single_source_record_unadjudicated';
      return {
        schemaVersion: 1,
        promptGroupId: stableId('wbv-current-prompt-group', promptComparison),
        promptComparison,
        promptSourceValues: uniqueSorted(
          groupSenses.map((sense) => sense.translationSource as string),
        ),
        sourceRecordIds,
        entryCandidateIds: uniqueSorted(
          groupEntries.map((entry) => entry.entryCandidateId),
        ),
        targetSurfaceCandidates: targets,
        distinctTargetCount: targets.length,
        sourceRecordCount: sourceRecordIds.length,
        relationStatus,
        acceptedReferences: [] as string[],
        benchmarkStatus: 'not_frozen_unadjudicated',
      };
    })
    .sort((left, right) =>
      compareText(left.promptComparison, right.promptComparison),
    );

  const promptGroupByComparison = new Map(
    promptGroups.map((group) => [group.promptComparison, group]),
  );

  const headwordGroups = [...allHeadwordGroupsMap.entries()]
    .map(([compoundKey, groupEntries]) => {
      const [sourceLayer, headwordComparison] = compoundKey.split('\0') as [
        SourceLayer,
        string,
      ];
      const groupSenses = groupEntries.map(
        (entry) => senseByRecord.get(entry.sourceRecordId)![0],
      );
      const promptComparisons = uniqueSorted(
        groupSenses
          .map((sense) => sense.translationComparison)
          .filter((value): value is string => Boolean(value)),
      );
      return {
        schemaVersion: 1,
        headwordGroupId: stableId(
          'wbv-headword-group',
          sourceLayer,
          headwordComparison,
        ),
        sourceLayer,
        headwordComparison,
        headwordSourceValues: uniqueSorted(
          groupEntries.map((entry) => entry.headwordSource),
        ),
        sourceRecordIds: uniqueSorted(
          groupEntries.map((entry) => entry.sourceRecordId),
        ),
        entryCandidateIds: uniqueSorted(
          groupEntries.map((entry) => entry.entryCandidateId),
        ),
        promptComparisons,
        sourceRecordCount: groupEntries.length,
        distinctPromptCount: promptComparisons.length,
        relationStatus:
          groupEntries.length > 1
            ? 'requires_lexical_identity_or_sense_review'
            : 'single_source_record',
        acceptedRelations: [] as string[],
      };
    })
    .sort(
      (left, right) =>
        compareText(left.sourceLayer, right.sourceLayer) ||
        compareText(left.headwordComparison, right.headwordComparison),
    );

  const headwordGroupByKey = new Map(
    headwordGroups.map((group) => [
      `${group.sourceLayer}\0${group.headwordComparison}`,
      group,
    ]),
  );

  const crosswalkCountByRecord = new Map<string, number>();
  for (const row of historicalCrosswalk) {
    increment(crosswalkCountByRecord, row.historicalSourceRecordId);
    increment(crosswalkCountByRecord, row.currentSourceRecordId);
  }

  const contemporaryExactCountByRecord = new Map<string, number>();
  const contemporaryReviewCountByRecord = new Map<string, number>();
  for (const row of contemporaryEvidence) {
    const exactRecordIds = new Set<string>();
    const reviewRecordIds = new Set<string>();
    for (const entryId of row.exactCurrentEntryCandidateIds) {
      const entry = entryById.get(entryId);
      if (!entry || !currentEntryIds.has(entryId))
        throw new Error(
          `contemporary evidence references unknown current entry ${entryId}`,
        );
      exactRecordIds.add(entry.sourceRecordId);
    }
    for (const candidate of row.reviewCandidates) {
      if (!currentRecords.has(candidate.sourceRecordId))
        throw new Error(
          `contemporary evidence references unknown current record ${candidate.sourceRecordId}`,
        );
      reviewRecordIds.add(candidate.sourceRecordId);
    }
    for (const sourceRecordId of exactRecordIds)
      increment(contemporaryExactCountByRecord, sourceRecordId);
    for (const sourceRecordId of reviewRecordIds)
      increment(contemporaryReviewCountByRecord, sourceRecordId);
  }

  const publishedRelationsByRecord = new Map<string, string[]>();
  for (const row of publishedEvidence) {
    const entry = entryById.get(row.exactCurrentEntryCandidateId);
    if (!entry || !currentEntryIds.has(row.exactCurrentEntryCandidateId))
      throw new Error(
        `published evidence references unknown current entry ${row.exactCurrentEntryCandidateId}`,
      );
    publishedRelationsByRecord.set(entry.sourceRecordId, [
      ...(publishedRelationsByRecord.get(entry.sourceRecordId) ?? []),
      row.diagnosticGlossRelation,
    ]);
  }

  const records = entries
    .map((entry) => {
      const sourceLayer = layerFor(entry.sourceId);
      const sense = senseByRecord.get(entry.sourceRecordId)![0];
      const media = mediaByRecord.get(entry.sourceRecordId) ?? [];
      const reviews = reviewsByRecord.get(entry.sourceRecordId) ?? [];
      const promptGroup = sense.translationComparison
        ? promptGroupByComparison.get(sense.translationComparison)
        : undefined;
      const headwordGroup = headwordGroupByKey.get(
        `${sourceLayer}\0${entry.headwordComparison}`,
      )!;
      const promptTokens = sense.translationSource
        ? sourceTokens(sense.translationSource)
        : [];
      const targetTokens = sourceTokens(entry.headwordSource);
      const blockerCodes = [
        'source_mapping_unadjudicated',
        'training_and_redistribution_not_allowed',
      ];
      if (sourceLayer === 'current') {
        blockerCodes.push('part_of_speech_missing');
        if (!promptGroup)
          throw new Error(
            `current record missing prompt group ${entry.sourceRecordId}`,
          );
        if (promptGroup.distinctTargetCount > 1)
          blockerCodes.push('english_prompt_has_multiple_targets');
        if (headwordGroup.sourceRecordCount > 1)
          blockerCodes.push('headword_has_multiple_source_records');
      } else {
        blockerCodes.push(
          'historical_orthography_relation_unadjudicated',
          'historical_gloss_not_substitutable_translation',
        );
      }
      const stratum =
        sourceLayer === 'current' && promptGroup
          ? structuralStratum(
              promptGroup.distinctTargetCount,
              promptGroup.sourceRecordCount,
              headwordGroup.sourceRecordCount,
            )
          : 'historical_evidence_requires_modern_relation_review';
      return {
        schemaVersion: 1,
        censusRecordId: stableId(
          'wbv-lexical-census-record',
          entry.sourceRecordId,
        ),
        sourceLayer,
        sourceRecordId: entry.sourceRecordId,
        sourceId: entry.sourceId,
        sourceOrdinal: entry.sourceOrdinal,
        sourceRecordSha256: entry.sourceRecordSha256,
        entryCandidateId: entry.entryCandidateId,
        senseCandidateId: sense.senseCandidateId,
        formCandidateId: formByRecord.get(entry.sourceRecordId)![0]
          .formCandidateId,
        sourceTargetCandidate: {
          source: entry.headwordSource,
          comparison: entry.headwordComparison,
          acceptedReference: false,
        },
        sourcePromptCandidate:
          sourceLayer === 'current'
            ? {
                source: sense.translationSource,
                comparison: sense.translationComparison,
                definitionSource: sense.definitionSource,
                proposedTaskPrefix: '<lexeme>',
                acceptedReferences: [] as string[],
              }
            : null,
        sourceGlossEvidence:
          sourceLayer === 'historical'
            ? {
                definitionSource: sense.definitionSource,
                modernPromptAccepted: false,
              }
            : null,
        partOfSpeech: {
          source: entry.rawPartOfSpeech,
          comparison: null,
          status: entry.rawPartOfSpeech
            ? 'source_label_unadjudicated'
            : 'not_provided_by_source',
        },
        structuralFeatures: {
          promptTokenCount: promptTokens.length,
          promptTokenBucket: promptTokens.length
            ? tokenBucket(promptTokens.length)
            : 'not_applicable',
          promptCodePointCount: sense.translationSource
            ? codePointCount(sense.translationSource)
            : null,
          promptPunctuation: sense.translationSource
            ? punctuationFeatures(sense.translationSource)
            : null,
          promptBeginsWithArticle: sense.translationComparison
            ? /^(a|an|the)\s/u.test(sense.translationComparison)
            : false,
          targetTokenCount: targetTokens.length,
          targetTokenBucket: tokenBucket(targetTokens.length),
          targetCodePointCount: codePointCount(entry.headwordSource),
          targetGraphemeCount: graphemeCount(entry.headwordSource),
          targetLengthBucket: lengthBucket(graphemeCount(entry.headwordSource)),
          targetPunctuation: punctuationFeatures(entry.headwordSource),
          reduplicationSurfaceCandidate: repeatedSegmentCandidate(
            entry.headwordSource,
          ),
          identityMappingCandidate:
            sense.translationComparison !== null &&
            sense.translationComparison === entry.headwordComparison,
          definitionSegmentCount: sense.definitionSource
            .split(/[;,]/u)
            .map((value) => value.trim())
            .filter(Boolean).length,
        },
        evidenceCoverage: {
          verifiedAudioLinks: media.filter(
            (row) =>
              row.mediaKind === 'audio' &&
              row.resolutionStatus ===
                'archived_cdx_digest_and_decode_verified',
          ).length,
          unresolvedImageLinks: media.filter(
            (row) =>
              row.mediaKind === 'image' &&
              row.resolutionStatus === 'source_pointer_unresolved',
          ).length,
          contemporaryExactEvidenceLinks:
            contemporaryExactCountByRecord.get(entry.sourceRecordId) ?? 0,
          contemporaryReviewCandidateLinks:
            contemporaryReviewCountByRecord.get(entry.sourceRecordId) ?? 0,
          publishedEvidenceRelations: uniqueSorted(
            publishedRelationsByRecord.get(entry.sourceRecordId) ?? [],
          ),
          historicalCrosswalkCandidates:
            crosswalkCountByRecord.get(entry.sourceRecordId) ?? 0,
        },
        reviewDependencies: {
          reviewItemIds: uniqueSorted(reviews.map((row) => row.reviewItemId)),
          reviewKinds: uniqueSorted(reviews.map((row) => row.reviewKind)),
        },
        grouping: {
          promptGroupId: promptGroup?.promptGroupId ?? null,
          promptDistinctTargetCount: promptGroup?.distinctTargetCount ?? null,
          promptSourceRecordCount: promptGroup?.sourceRecordCount ?? null,
          headwordGroupId: headwordGroup.headwordGroupId,
          headwordSourceRecordCount: headwordGroup.sourceRecordCount,
        },
        structuralStratum: stratum,
        blockerCodes: uniqueSorted(blockerCodes),
        benchmarkDisposition:
          sourceLayer === 'current'
            ? 'diagnostic_candidate_not_frozen'
            : 'historical_evidence_not_product_candidate',
        trainingEligibility: 'not_allowed',
      };
    })
    .sort(
      (left, right) =>
        compareText(left.sourceLayer, right.sourceLayer) ||
        left.sourceOrdinal - right.sourceOrdinal,
    );

  const benchmarkCandidates = records
    .filter((row) => row.sourceLayer === 'current')
    .map((row) => ({
      schemaVersion: 1,
      rowId: stableId('wbv-l1-diagnostic-candidate', row.sourceRecordId),
      task: 'L1_source_record_reconstruction_diagnostic',
      sourceRecordId: row.sourceRecordId,
      entryCandidateId: row.entryCandidateId,
      senseCandidateId: row.senseCandidateId,
      unconditionedInputText: row.sourcePromptCandidate!.source,
      inputTextCandidate: `<lexeme> ${row.sourcePromptCandidate!.source}`,
      definitionSource: row.sourcePromptCandidate!.definitionSource,
      sourceTargetCandidate: row.sourceTargetCandidate.source,
      acceptedReferences: [] as string[],
      structuralStratum: row.structuralStratum,
      blockerCodes: row.blockerCodes,
      promptGroupId: row.grouping.promptGroupId,
      headwordGroupId: row.grouping.headwordGroupId,
      benchmarkStatus: 'not_frozen_unadjudicated',
      registrationAllowed: false,
      claimLimit:
        'A source-record reconstruction candidate is not an accepted translation reference or deployable benchmark row.',
    }));

  const stratumCounts = new Map<string, number>();
  const promptTokenBuckets = new Map<string, number>();
  const targetTokenBuckets = new Map<string, number>();
  const targetLengthBuckets = new Map<string, number>();
  const reviewKindCounts = new Map<string, number>();
  const blockerCounts = new Map<string, number>();
  const targetPunctuationCounts = new Map<string, number>();
  const promptPunctuationCounts = new Map<string, number>();
  for (const record of records) {
    increment(stratumCounts, record.structuralStratum);
    if (record.sourceLayer === 'current') {
      increment(
        promptTokenBuckets,
        record.structuralFeatures.promptTokenBucket,
      );
      increment(
        targetTokenBuckets,
        record.structuralFeatures.targetTokenBucket,
      );
      increment(
        targetLengthBuckets,
        record.structuralFeatures.targetLengthBucket,
      );
      for (const [feature, present] of Object.entries(
        record.structuralFeatures.targetPunctuation,
      ))
        if (present) increment(targetPunctuationCounts, feature);
      for (const [feature, present] of Object.entries(
        record.structuralFeatures.promptPunctuation ?? {},
      ))
        if (present) increment(promptPunctuationCounts, feature);
    }
    for (const kind of record.reviewDependencies.reviewKinds)
      increment(reviewKindCounts, kind);
    for (const blocker of record.blockerCodes)
      increment(blockerCounts, blocker);
  }

  const currentPromptGroups = promptGroups.length;
  const multiTargetPromptGroups = promptGroups.filter(
    (group) => group.distinctTargetCount > 1,
  );
  const repeatedCurrentHeadwordGroups = headwordGroups.filter(
    (group) => group.sourceLayer === 'current' && group.sourceRecordCount > 1,
  );
  const structurallyOneToOneRows = records.filter(
    (row) => row.structuralStratum === 'structurally_one_to_one_unadjudicated',
  );

  const report = {
    schemaVersion: 1,
    censusId: contract.census_id,
    createdAtUtc: contract.created_at_utc,
    analysisKind:
      'pre_benchmark_full_lexical_source_census_and_ambiguity_analysis',
    boundDictionaryEdition: contract.dictionary_edition,
    coverage: {
      sourceRecordsTotal: records.length,
      currentSourceRecords: currentEntries.length,
      historicalSourceRecords: records.length - currentEntries.length,
      currentDiagnosticCandidates: benchmarkCandidates.length,
      acceptedBenchmarkRows: 0,
      registeredBenchmarkRows: 0,
      trainingEligibleRows: 0,
      currentPromptGroups,
      currentDistinctTargetSurfaces: new Set(
        currentEntries.map((row) => row.headwordComparison),
      ).size,
      multiTargetPromptGroups: multiTargetPromptGroups.length,
      rowsInMultiTargetPromptGroups: new Set(
        multiTargetPromptGroups.flatMap((group) => group.sourceRecordIds),
      ).size,
      repeatedCurrentHeadwordGroups: repeatedCurrentHeadwordGroups.length,
      rowsInRepeatedCurrentHeadwordGroups: new Set(
        repeatedCurrentHeadwordGroups.flatMap((group) => group.sourceRecordIds),
      ).size,
      structurallyOneToOneUnadjudicatedRows: structurallyOneToOneRows.length,
    },
    structuralStrata: sortedCounter(stratumCounts),
    currentSurfaceSlices: {
      promptTokenBuckets: sortedCounter(promptTokenBuckets),
      targetTokenBuckets: sortedCounter(targetTokenBuckets),
      targetGraphemeLengthBuckets: sortedCounter(targetLengthBuckets),
      promptPunctuationRows: sortedCounter(promptPunctuationCounts),
      targetPunctuationRows: sortedCounter(targetPunctuationCounts),
      promptBeginsWithArticle: records.filter(
        (row) =>
          row.sourceLayer === 'current' &&
          row.structuralFeatures.promptBeginsWithArticle,
      ).length,
      targetReduplicationSurfaceCandidates: records.filter(
        (row) =>
          row.sourceLayer === 'current' &&
          row.structuralFeatures.reduplicationSurfaceCandidate,
      ).length,
      identityMappingCandidates: records.filter(
        (row) =>
          row.sourceLayer === 'current' &&
          row.structuralFeatures.identityMappingCandidate,
      ).length,
      rowsWithVerifiedAudio: records.filter(
        (row) =>
          row.sourceLayer === 'current' &&
          row.evidenceCoverage.verifiedAudioLinks > 0,
      ).length,
      rowsWithPublishedEvidence: records.filter(
        (row) =>
          row.sourceLayer === 'current' &&
          row.evidenceCoverage.publishedEvidenceRelations.length > 0,
      ).length,
      rowsWithExactContemporaryEvidence: records.filter(
        (row) =>
          row.sourceLayer === 'current' &&
          row.evidenceCoverage.contemporaryExactEvidenceLinks > 0,
      ).length,
      rowsAppearingAsContemporaryReviewCandidate: records.filter(
        (row) =>
          row.sourceLayer === 'current' &&
          row.evidenceCoverage.contemporaryReviewCandidateLinks > 0,
      ).length,
    },
    reviewCoverage: {
      reviewItems: reviewQueue.length,
      reviewKindsByReferencedRecord: sortedCounter(reviewKindCounts),
      blockerCounts: sortedCounter(blockerCounts),
    },
    benchmarkDisposition: {
      candidateRows: benchmarkCandidates.length,
      acceptedReferences: 0,
      frozenSuites: 0,
      registrationAllowed: false,
      nextGate:
        'Adjudicate source substitutability, prompt ambiguity, repeated headwords, part of speech, orthography/variety, and evaluation-use rights before freezing any L1 suite.',
    },
    requiredFailureJoinFields: [
      'rowId',
      'sourceRecordId',
      'promptGroupId',
      'headwordGroupId',
      'structuralStratum',
      'prompt and target token counts',
      'target grapheme count',
      'punctuation features',
      'audio and published evidence coverage',
      'review kinds',
      'blocker codes',
      'tokenizer fertility',
      'documented training exposure',
    ],
    claimLimit: contract.claim_limit,
  };

  if (records.length !== entries.length)
    throw new Error('census lost source records');
  if (benchmarkCandidates.length !== currentEntries.length)
    throw new Error('current diagnostic census is incomplete');
  if (benchmarkCandidates.some((row) => row.acceptedReferences.length > 0))
    throw new Error('candidate census illegally contains accepted references');

  return { records, promptGroups, headwordGroups, benchmarkCandidates, report };
}
