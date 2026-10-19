import { describe, expect, it } from 'vitest';
import {
  buildLexicalBenchmarkCandidateCensus,
  type LexicalBenchmarkCandidateCensusContract,
  type LexicalBenchmarkCandidateCensusInputs,
} from '../../lib/research/lexicalBenchmarkCandidateCensus';

const sha = 'a'.repeat(64);

function contract(): LexicalBenchmarkCandidateCensusContract {
  const component = { path: 'input.jsonl', sha256: sha };
  return {
    schema_version: 1,
    census_id: 'wajarri-lexical-benchmark-candidate-census-v0.1.0',
    created_at_utc: '2026-07-22T09:40:00.000Z',
    language: { name: 'Wajarri', iso_639_3: 'wbv', glottocode: 'waja1257' },
    dictionary_edition: {
      edition_id: 'dictionary-v0.5.0',
      manifest_path: 'dictionary/EDITION.json',
      manifest_sha256: sha,
    },
    components: {
      entries: component,
      senses: component,
      forms: component,
      media_links: component,
      review_queue: component,
      historical_crosswalk: component,
      contemporary_evidence: component,
      published_evidence: component,
    },
    source_layers: {
      current: {
        source_id: 'current-source',
        role: 'current_product_dictionary_source',
      },
      historical: {
        source_id: 'historical-source',
        role: 'historical_dictionary_evidence',
      },
    },
    normalization: {
      comparison_unicode: 'NFKC',
      comparison_case: 'lowercase',
      comparison_whitespace: 'trim_and_collapse',
      source_strings_preserved: true,
      punctuation_preserved: true,
    },
    candidate_policy: {
      current_source_records_are_diagnostic_candidates: true,
      historical_records_are_separate_evidence: true,
      group_current_prompts_by_exact_translation_comparison: true,
      group_headwords_within_source_layer: true,
      accepted_references_must_be_empty: true,
      benchmark_registration_allowed: false,
      automatic_sense_or_synonym_acceptance: false,
      automatic_historical_modern_mapping: false,
      model_output_is_linguistic_evidence: false,
    },
    outputs: {
      root: 'analysis/out',
      records: 'records.jsonl',
      prompt_groups: 'prompts.jsonl',
      headword_groups: 'headwords.jsonl',
      benchmark_candidates: 'candidates.jsonl',
      report: 'REPORT.json',
      manifest: 'MANIFEST.json',
    },
    claim_limit: 'Candidates are not accepted references.',
  };
}

function inputs(): LexicalBenchmarkCandidateCensusInputs {
  const entries = [
    ['entry-1', 'record-1', 'current-source', 1, 'alpha-alpha'],
    ['entry-2', 'record-2', 'current-source', 2, 'beta'],
    ['entry-3', 'record-3', 'current-source', 3, 'alpha-alpha'],
    ['entry-h1', 'record-h1', 'historical-source', 1, 'alpa'],
  ].map(
    ([
      entryCandidateId,
      sourceRecordId,
      sourceId,
      sourceOrdinal,
      headwordSource,
    ]) => ({
      entryCandidateId,
      sourceRecordId,
      sourceId,
      sourceOrdinal,
      sourceRecordSha256: sha,
      headwordSource,
      headwordComparison: headwordSource,
      rawPartOfSpeech: sourceId === 'historical-source' ? 'N' : null,
      lexicalIdentityStatus: 'unadjudicated_source_record',
      status: 'candidate',
    }),
  );
  const senses = [
    ['sense-1', 'entry-1', 'record-1', 'bird', 'bird', 'a bird'],
    ['sense-2', 'entry-2', 'record-2', 'bird', 'bird', 'another bird'],
    ['sense-3', 'entry-3', 'record-3', 'wing', 'wing', 'a wing'],
    ['sense-h1', 'entry-h1', 'record-h1', null, null, 'historical bird'],
  ].map(
    ([
      senseCandidateId,
      entryCandidateId,
      sourceRecordId,
      translationSource,
      translationComparison,
      definitionSource,
    ]) => ({
      senseCandidateId,
      entryCandidateId,
      sourceRecordId,
      translationSource,
      translationComparison,
      definitionSource,
      senseBoundaryStatus: 'unadjudicated',
      substitutableTranslationStatus: 'unadjudicated',
      status: 'candidate',
    }),
  );
  const forms = entries.map((entry) => ({
    formCandidateId: `${entry.sourceRecordId}-form`,
    entryCandidateId: entry.entryCandidateId,
    sourceRecordId: entry.sourceRecordId,
    status: 'candidate',
  }));
  return {
    entries,
    senses,
    forms,
    mediaLinks: [
      {
        sourceRecordId: 'record-1',
        mediaKind: 'audio',
        resolutionStatus: 'archived_cdx_digest_and_decode_verified',
        status: 'candidate',
      },
    ],
    reviewQueue: [
      {
        reviewItemId: 'review-1',
        reviewKind: 'english_prompt_mapping',
        sourceRecordIds: ['record-1', 'record-2'],
        status: 'pending',
      },
    ],
    historicalCrosswalk: [
      {
        historicalSourceRecordId: 'record-h1',
        currentSourceRecordId: 'record-1',
        relationStatus: 'unadjudicated',
        automaticMergeAllowed: false,
      },
    ],
    contemporaryEvidence: [
      {
        exactCurrentEntryCandidateIds: ['entry-1'],
        reviewCandidates: [{ sourceRecordId: 'record-2' }],
        status: 'candidate',
      },
    ],
    publishedEvidence: [
      {
        exactCurrentEntryCandidateId: 'entry-1',
        diagnosticGlossRelation: 'exact_normalized_string',
        status: 'candidate',
        automaticMergeAllowed: false,
      },
    ],
  };
}

describe('buildLexicalBenchmarkCandidateCensus', () => {
  it('covers every source record while keeping accepted references empty', () => {
    const result = buildLexicalBenchmarkCandidateCensus(inputs(), contract());
    expect(result.records).toHaveLength(4);
    expect(result.benchmarkCandidates).toHaveLength(3);
    expect(result.promptGroups).toHaveLength(2);
    expect(result.headwordGroups).toHaveLength(3);
    expect(
      result.benchmarkCandidates.every(
        (row) => row.acceptedReferences.length === 0,
      ),
    ).toBe(true);
    expect(result.report.coverage).toMatchObject({
      sourceRecordsTotal: 4,
      currentSourceRecords: 3,
      historicalSourceRecords: 1,
      acceptedBenchmarkRows: 0,
      multiTargetPromptGroups: 1,
      repeatedCurrentHeadwordGroups: 1,
    });
    expect(result.report.structuralStrata).toEqual({
      dual_prompt_and_headword_ambiguity: 1,
      historical_evidence_requires_modern_relation_review: 1,
      multi_target_prompt_requires_relation_review: 1,
      repeated_headword_requires_sense_review: 1,
    });
  });

  it('preserves evidence and mechanical surface diagnostics without accepting them', () => {
    const result = buildLexicalBenchmarkCandidateCensus(inputs(), contract());
    const row = result.records.find(
      (candidate) => candidate.sourceRecordId === 'record-1',
    );
    expect(row).toMatchObject({
      structuralFeatures: {
        targetTokenCount: 1,
        reduplicationSurfaceCandidate: true,
      },
      evidenceCoverage: {
        verifiedAudioLinks: 1,
        contemporaryExactEvidenceLinks: 1,
        contemporaryReviewCandidateLinks: 0,
        publishedEvidenceRelations: ['exact_normalized_string'],
        historicalCrosswalkCandidates: 1,
      },
      benchmarkDisposition: 'diagnostic_candidate_not_frozen',
      trainingEligibility: 'not_allowed',
    });
  });

  it('fails when an entry does not have exactly one sense', () => {
    const malformed = inputs();
    malformed.senses = malformed.senses.slice(1);
    expect(() =>
      buildLexicalBenchmarkCandidateCensus(malformed, contract()),
    ).toThrow('expected one sense per entry');
  });

  it('fails for an uncontracted source layer', () => {
    const malformed = inputs();
    malformed.entries = malformed.entries.map((row, index) =>
      index === 0 ? { ...(row as object), sourceId: 'unknown-source' } : row,
    );
    expect(() =>
      buildLexicalBenchmarkCandidateCensus(malformed, contract()),
    ).toThrow('uncontracted lexical source layer');
  });

  it('fails when evidence points at an unknown current entry', () => {
    const malformed = inputs();
    malformed.publishedEvidence = [
      {
        exactCurrentEntryCandidateId: 'missing-entry',
        diagnosticGlossRelation: 'exact_normalized_string',
        status: 'candidate',
        automaticMergeAllowed: false,
      },
    ];
    expect(() =>
      buildLexicalBenchmarkCandidateCensus(malformed, contract()),
    ).toThrow('published evidence references unknown current entry');
  });
});
