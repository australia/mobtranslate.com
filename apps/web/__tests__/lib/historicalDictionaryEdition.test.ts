import { describe, expect, it } from 'vitest';
import { buildHistoricalDictionaryEdition } from '@/lib/research/historicalDictionaryEdition';

const parentEntries = [
  {
    entryCandidateId: 'current-karlaya',
    sourceRecordId: 'current-1',
    headwordSource: 'garlaya',
    headwordComparison: 'garlaya',
    status: 'candidate',
  },
  {
    entryCandidateId: 'current-kampu',
    sourceRecordId: 'current-2',
    headwordSource: 'gambu',
    headwordComparison: 'gambu',
    status: 'candidate',
  },
];

const parentSenses = [
  {
    entryCandidateId: 'current-karlaya',
    translationSource: 'emu',
    definitionSource: 'emu',
  },
  {
    entryCandidateId: 'current-kampu',
    translationSource: 'cooked meat',
    definitionSource: 'cooked meat',
  },
];

const historicalEntry = {
  sourceRecordId: 'wbv-douglas-1981-lex-0001',
  inventoryId: 'inventory',
  sourceId: 'douglas',
  sourcePdfSha256: 'a'.repeat(64),
  tsvSha256: 'b'.repeat(64),
  sourceOrdinal: 1,
  sourceRecordSha256: 'c'.repeat(64),
  headwordSource: 'karlaya',
  headwordComparison: 'karlaya',
  rawPartOfSpeech: 'N',
  glossSource: 'emu',
  sourceText: 'karlaya, N: emu',
  sourceLineIds: ['line-1'],
  startAnchor: {
    tsvPage: 52,
    printedPage: 247,
    column: 'right',
    sourceTop: 55,
    sourceLeft: 212,
  },
  endAnchor: {
    tsvPage: 52,
    printedPage: 247,
    column: 'right',
    sourceTop: 55,
    sourceRight: 300,
  },
  orthography: 'historical',
  extractionFlags: [],
  trainingEligibility: 'not_allowed',
  status: 'candidate',
};

describe('buildHistoricalDictionaryEdition', () => {
  it('appends evidence candidates and ranks review links without merging', () => {
    const result = buildHistoricalDictionaryEdition({
      parentEntries,
      parentSenses,
      parentForms: [],
      parentExamples: [],
      parentMediaLinks: [],
      parentConflicts: [],
      parentReviewQueue: [],
      historicalEntries: [historicalEntry],
      historicalReviewQueue: [
        {
          reviewItemId: 'review-1',
          sourceRecordId: historicalEntry.sourceRecordId,
          status: 'pending',
        },
      ],
      topCandidatesPerHistoricalEntry: 2,
    });

    expect(result.entries).toHaveLength(3);
    expect(result.crosswalkCandidates).toHaveLength(2);
    expect(result.crosswalkCandidates[0]).toMatchObject({
      currentEntryCandidateId: 'current-karlaya',
      rank: 1,
      relationStatus: 'unadjudicated',
      automaticMergeAllowed: false,
    });
    expect(result.entries[2]).toMatchObject({
      recordKind: 'historical_source_entry_candidate',
      trainingEligibility: 'not_allowed',
      status: 'candidate',
    });
    expect(result.report).toMatchObject({
      inheritedEntries: 2,
      historicalEntries: 1,
      historicalRecordsWithExactSurfaceCandidate: 0,
      trainingEligibleHistoricalRows: 0,
    });
  });

  it('requires one review record for every historical source record', () => {
    expect(() =>
      buildHistoricalDictionaryEdition({
        parentEntries,
        parentSenses,
        parentForms: [],
        parentExamples: [],
        parentMediaLinks: [],
        parentConflicts: [],
        parentReviewQueue: [],
        historicalEntries: [historicalEntry],
        historicalReviewQueue: [],
        topCandidatesPerHistoricalEntry: 2,
      }),
    ).toThrow('exactly one source-record review');
  });
});
