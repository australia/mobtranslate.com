import { z } from 'zod';
import { normalizeComparison } from './dictionarySourceCensus';

const HistoricalEntrySchema = z.object({
  sourceRecordId: z.string().min(1),
  inventoryId: z.string().min(1),
  sourceId: z.string().min(1),
  sourcePdfSha256: z.string().regex(/^[0-9a-f]{64}$/),
  tsvSha256: z.string().regex(/^[0-9a-f]{64}$/),
  sourceOrdinal: z.number().int().positive(),
  sourceRecordSha256: z.string().regex(/^[0-9a-f]{64}$/),
  headwordSource: z.string().min(1),
  headwordComparison: z.string().min(1),
  rawPartOfSpeech: z.string().nullable(),
  glossSource: z.string(),
  sourceText: z.string().min(1),
  sourceLineIds: z.array(z.string().min(1)).min(1),
  startAnchor: z.object({
    tsvPage: z.number().int().positive(),
    printedPage: z.number().int().positive(),
    column: z.enum(['left', 'right']),
    sourceTop: z.number(),
    sourceLeft: z.number(),
  }),
  endAnchor: z.object({
    tsvPage: z.number().int().positive(),
    printedPage: z.number().int().positive(),
    column: z.enum(['left', 'right']),
    sourceTop: z.number(),
    sourceRight: z.number(),
  }),
  orthography: z.string().min(1),
  extractionFlags: z.array(z.string().min(1)),
  trainingEligibility: z.literal('not_allowed'),
  status: z.literal('candidate'),
});

const ParentEntrySchema = z
  .object({
    entryCandidateId: z.string().min(1),
    sourceRecordId: z.string().min(1),
    headwordSource: z.string().min(1),
    headwordComparison: z.string().min(1),
  })
  .passthrough();

const ParentSenseSchema = z
  .object({
    entryCandidateId: z.string().min(1),
    translationSource: z.string().nullable().optional(),
    definitionSource: z.string().nullable().optional(),
  })
  .passthrough();

const ReviewItemSchema = z
  .object({
    reviewItemId: z.string().min(1),
    sourceRecordId: z.string().min(1),
  })
  .passthrough();

export interface HistoricalDictionaryEditionInput {
  parentEntries: unknown[];
  parentSenses: unknown[];
  parentForms: unknown[];
  parentExamples: unknown[];
  parentMediaLinks: unknown[];
  parentConflicts: unknown[];
  parentReviewQueue: unknown[];
  historicalEntries: unknown[];
  historicalReviewQueue: unknown[];
  topCandidatesPerHistoricalEntry: number;
}

export interface HistoricalDictionaryEditionResult {
  entries: unknown[];
  senses: unknown[];
  forms: unknown[];
  examples: unknown[];
  mediaLinks: unknown[];
  conflicts: unknown[];
  reviewQueue: unknown[];
  crosswalkCandidates: unknown[];
  report: {
    inheritedEntries: number;
    historicalEntries: number;
    totalCandidateEntries: number;
    totalCandidateSenses: number;
    totalCandidateForms: number;
    inheritedReviewItems: number;
    historicalReviewItems: number;
    totalReviewItems: number;
    crosswalkCandidateRows: number;
    historicalRecordsWithExactSurfaceCandidate: number;
    historicalRecordsWithoutExactSurfaceCandidate: number;
    exactSurfaceCandidatesWithZeroGlossOverlap: number;
    topHeadwordSimilarityQuantiles: Record<string, number>;
    topGlossTokenJaccardQuantiles: Record<string, number>;
    topCombinedReviewScoreQuantiles: Record<string, number>;
    trainingEligibleHistoricalRows: 0;
  };
}

const graphemeSegmenter = new Intl.Segmenter('und', {
  granularity: 'grapheme',
});

function graphemeTrigrams(value: string): Set<string> {
  const graphemes = Array.from(
    graphemeSegmenter.segment(normalizeComparison(value)),
    (segment) => segment.segment,
  );
  if (graphemes.length === 0) return new Set();
  const padded = ['^', '^', ...graphemes, '$', '$'];
  const trigrams = new Set<string>();
  for (let index = 0; index <= padded.length - 3; index += 1)
    trigrams.add(padded.slice(index, index + 3).join(''));
  return trigrams;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function lexicalTokens(value: string): Set<string> {
  return new Set(
    normalizeComparison(value).match(/[\p{L}\p{M}\p{N}]+/gu) ?? [],
  );
}

function comparisonSurfaces(headword: string): string[] {
  const surfaces = [headword, ...headword.split(/\s*~\s*/u)]
    .map(normalizeComparison)
    .filter(Boolean);
  return [...new Set(surfaces)].sort();
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function quantiles(values: number[]): Record<string, number> {
  if (values.length === 0) return {};
  const sorted = [...values].sort((a, b) => a - b);
  const at = (probability: number): number => {
    const position = (sorted.length - 1) * probability;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.ceil(position);
    const lower = sorted[lowerIndex] ?? 0;
    const upper = sorted[upperIndex] ?? lower;
    return rounded(lower + (upper - lower) * (position - lowerIndex));
  };
  return {
    minimum: at(0),
    p25: at(0.25),
    median: at(0.5),
    p75: at(0.75),
    p90: at(0.9),
    maximum: at(1),
  };
}

export function buildHistoricalDictionaryEdition(
  input: HistoricalDictionaryEditionInput,
): HistoricalDictionaryEditionResult {
  if (!Number.isInteger(input.topCandidatesPerHistoricalEntry))
    throw new Error('topCandidatesPerHistoricalEntry must be an integer');
  if (input.topCandidatesPerHistoricalEntry < 1)
    throw new Error('topCandidatesPerHistoricalEntry must be positive');

  const parentEntries = input.parentEntries.map((row) =>
    ParentEntrySchema.parse(row),
  );
  const parentSenses = input.parentSenses.map((row) =>
    ParentSenseSchema.parse(row),
  );
  const historicalEntries = input.historicalEntries.map((row) =>
    HistoricalEntrySchema.parse(row),
  );
  const historicalReviewQueue = input.historicalReviewQueue.map((row) =>
    ReviewItemSchema.parse(row),
  );
  const reviewBySourceRecord = new Map(
    historicalReviewQueue.map((review) => [review.sourceRecordId, review]),
  );
  if (reviewBySourceRecord.size !== historicalEntries.length)
    throw new Error(
      'historical review queue must contain exactly one source-record review per historical entry',
    );

  const sensesByEntry = new Map<string, z.infer<typeof ParentSenseSchema>[]>();
  for (const sense of parentSenses) {
    const senses = sensesByEntry.get(sense.entryCandidateId) ?? [];
    senses.push(sense);
    sensesByEntry.set(sense.entryCandidateId, senses);
  }
  const preparedParentEntries = parentEntries.map((entry) => {
    const senses = sensesByEntry.get(entry.entryCandidateId) ?? [];
    const evidenceText = senses
      .flatMap((sense) => [sense.translationSource, sense.definitionSource])
      .filter((value): value is string => typeof value === 'string')
      .join(' ');
    return {
      entry,
      trigrams: graphemeTrigrams(entry.headwordComparison),
      glossTokens: lexicalTokens(evidenceText),
    };
  });

  const crosswalkCandidates: Array<Record<string, unknown>> = [];
  const historicalEntriesWithLinks: Array<{
    sourceRecordId: string;
    crosswalkCandidateIds: string[];
    hasExactSurfaceCandidate: boolean;
    exactSurfaceCandidateHasGlossOverlap: boolean;
    topHeadwordSimilarity: number;
    topGlossTokenJaccard: number;
    topCombinedReviewScore: number;
  }> = [];

  for (const historical of historicalEntries) {
    const surfaces = comparisonSurfaces(historical.headwordSource);
    const surfaceTrigrams = surfaces.map(graphemeTrigrams);
    const historicalGlossTokens = lexicalTokens(historical.glossSource);
    const ranked = preparedParentEntries
      .map(({ entry, trigrams, glossTokens }) => {
        const headwordSimilarity = Math.max(
          ...surfaceTrigrams.map((surface) => jaccard(surface, trigrams)),
        );
        const glossTokenJaccard = jaccard(historicalGlossTokens, glossTokens);
        const exactSurface = surfaces.includes(entry.headwordComparison);
        return {
          entry,
          exactSurface,
          headwordSimilarity,
          glossTokenJaccard,
          combinedReviewScore:
            headwordSimilarity * 0.8 + glossTokenJaccard * 0.2,
        };
      })
      .sort(
        (left, right) =>
          Number(right.exactSurface) - Number(left.exactSurface) ||
          right.combinedReviewScore - left.combinedReviewScore ||
          right.headwordSimilarity - left.headwordSimilarity ||
          left.entry.entryCandidateId.localeCompare(
            right.entry.entryCandidateId,
          ),
      )
      .slice(0, input.topCandidatesPerHistoricalEntry);
    const ids: string[] = [];
    ranked.forEach((candidate, index) => {
      const crosswalkCandidateId = `${historical.sourceRecordId}-to-current-${String(
        index + 1,
      ).padStart(2, '0')}`;
      ids.push(crosswalkCandidateId);
      crosswalkCandidates.push({
        schemaVersion: 1,
        crosswalkCandidateId,
        historicalSourceRecordId: historical.sourceRecordId,
        historicalHeadwordSource: historical.headwordSource,
        historicalComparisonSurfaces: surfaces,
        currentEntryCandidateId: candidate.entry.entryCandidateId,
        currentSourceRecordId: candidate.entry.sourceRecordId,
        currentHeadwordSource: candidate.entry.headwordSource,
        rank: index + 1,
        exactSurface: candidate.exactSurface,
        headwordTrigramJaccard: rounded(candidate.headwordSimilarity),
        glossTokenJaccard: rounded(candidate.glossTokenJaccard),
        combinedReviewScore: rounded(candidate.combinedReviewScore),
        relationStatus: 'unadjudicated',
        automaticMergeAllowed: false,
      });
    });
    historicalEntriesWithLinks.push({
      sourceRecordId: historical.sourceRecordId,
      crosswalkCandidateIds: ids,
      hasExactSurfaceCandidate: ranked.some(
        (candidate) => candidate.exactSurface,
      ),
      exactSurfaceCandidateHasGlossOverlap: ranked.some(
        (candidate) =>
          candidate.exactSurface && candidate.glossTokenJaccard > 0,
      ),
      topHeadwordSimilarity: ranked[0]?.headwordSimilarity ?? 0,
      topGlossTokenJaccard: ranked[0]?.glossTokenJaccard ?? 0,
      topCombinedReviewScore: ranked[0]?.combinedReviewScore ?? 0,
    });
  }
  const linksBySourceRecord = new Map(
    historicalEntriesWithLinks.map((links) => [links.sourceRecordId, links]),
  );

  const addedEntries = historicalEntries.map((historical) => ({
    schemaVersion: 1,
    recordKind: 'historical_source_entry_candidate',
    entryCandidateId: `${historical.sourceRecordId}-entry-candidate`,
    sourceRecordId: historical.sourceRecordId,
    sourceId: historical.sourceId,
    sourceOrdinal: historical.sourceOrdinal,
    sourceRecordSha256: historical.sourceRecordSha256,
    headwordSource: historical.headwordSource,
    headwordComparison: historical.headwordComparison,
    rawPartOfSpeech: historical.rawPartOfSpeech,
    comparisonPartOfSpeech: null,
    partOfSpeechStatus: 'historical_source_label_unadjudicated',
    lexicalIdentityStatus: 'unadjudicated_historical_source_record',
    modernOrthographyRelationStatus: 'unadjudicated',
    evidenceAnchor: historical.startAnchor,
    extractionFlags: historical.extractionFlags,
    crosswalkCandidateIds:
      linksBySourceRecord.get(historical.sourceRecordId)
        ?.crosswalkCandidateIds ?? [],
    trainingEligibility: 'not_allowed',
    status: 'candidate',
  }));
  const addedSenses = historicalEntries.map((historical) => ({
    schemaVersion: 1,
    recordKind: 'historical_gloss_candidate',
    senseCandidateId: `${historical.sourceRecordId}-sense-candidate`,
    entryCandidateId: `${historical.sourceRecordId}-entry-candidate`,
    sourceRecordId: historical.sourceRecordId,
    translationSource: null,
    translationComparison: null,
    definitionSource: historical.glossSource,
    sourceFields: { historicalGloss: historical.glossSource },
    senseBoundaryStatus: 'unadjudicated',
    crossEntryRelationStatus: 'unadjudicated',
    substitutableTranslationStatus: 'unadjudicated',
    trainingEligibility: 'not_allowed',
    status: 'candidate',
  }));
  const addedForms = historicalEntries.map((historical) => ({
    schemaVersion: 1,
    recordKind: 'historical_published_form_candidate',
    formCandidateId: `${historical.sourceRecordId}-form-candidate`,
    entryCandidateId: `${historical.sourceRecordId}-entry-candidate`,
    sourceRecordId: historical.sourceRecordId,
    surfaceSource: historical.headwordSource,
    surfaceComparison: historical.headwordComparison,
    formType: 'historical_published_headword_or_variant_set',
    formSegmentationStatus: 'unadjudicated',
    morphologicalAnalysisStatus: 'unanalysed',
    variety: 'source_record_requires_adjudication',
    orthography: historical.orthography,
    trainingEligibility: 'not_allowed',
    status: 'candidate',
  }));
  const addedReviews = historicalEntries.map((historical) => {
    const review = reviewBySourceRecord.get(historical.sourceRecordId);
    const links = linksBySourceRecord.get(historical.sourceRecordId);
    if (!review || !links)
      throw new Error(
        `missing review or links for ${historical.sourceRecordId}`,
      );
    return {
      ...review,
      crosswalkCandidateIds: links.crosswalkCandidateIds,
      automaticMergeAllowed: false,
      status: 'pending',
    };
  });
  const exactCount = historicalEntriesWithLinks.filter(
    (links) => links.hasExactSurfaceCandidate,
  ).length;

  return {
    entries: [...input.parentEntries, ...addedEntries],
    senses: [...input.parentSenses, ...addedSenses],
    forms: [...input.parentForms, ...addedForms],
    examples: input.parentExamples,
    mediaLinks: input.parentMediaLinks,
    conflicts: input.parentConflicts,
    reviewQueue: [...input.parentReviewQueue, ...addedReviews],
    crosswalkCandidates,
    report: {
      inheritedEntries: input.parentEntries.length,
      historicalEntries: historicalEntries.length,
      totalCandidateEntries: input.parentEntries.length + addedEntries.length,
      totalCandidateSenses: input.parentSenses.length + addedSenses.length,
      totalCandidateForms: input.parentForms.length + addedForms.length,
      inheritedReviewItems: input.parentReviewQueue.length,
      historicalReviewItems: addedReviews.length,
      totalReviewItems: input.parentReviewQueue.length + addedReviews.length,
      crosswalkCandidateRows: crosswalkCandidates.length,
      historicalRecordsWithExactSurfaceCandidate: exactCount,
      historicalRecordsWithoutExactSurfaceCandidate:
        historicalEntries.length - exactCount,
      exactSurfaceCandidatesWithZeroGlossOverlap:
        historicalEntriesWithLinks.filter(
          (links) =>
            links.hasExactSurfaceCandidate &&
            !links.exactSurfaceCandidateHasGlossOverlap,
        ).length,
      topHeadwordSimilarityQuantiles: quantiles(
        historicalEntriesWithLinks.map((links) => links.topHeadwordSimilarity),
      ),
      topGlossTokenJaccardQuantiles: quantiles(
        historicalEntriesWithLinks.map((links) => links.topGlossTokenJaccard),
      ),
      topCombinedReviewScoreQuantiles: quantiles(
        historicalEntriesWithLinks.map((links) => links.topCombinedReviewScore),
      ),
      trainingEligibleHistoricalRows: 0,
    },
  };
}
