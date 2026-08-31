import { describe, expect, it } from 'vitest';
import { buildDictionaryReconstructionReferenceEdition } from '../../lib/research/dictionaryReconstructionReferenceEdition';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function record(
  ordinal: number,
  prompt: string,
  definition: string,
  target: string,
  promptGroupId: string,
) {
  const id = String(ordinal).padStart(6, '0');
  return {
    sourceLayer: 'current',
    sourceRecordId: `record-${id}`,
    sourceId: 'source-current',
    sourceOrdinal: ordinal,
    sourceRecordSha256: SHA_B,
    entryCandidateId: `entry-${id}`,
    senseCandidateId: `sense-${id}`,
    formCandidateId: `form-${id}`,
    sourceTargetCandidate: {
      source: target,
      comparison: target.toLowerCase(),
      acceptedReference: false,
    },
    sourcePromptCandidate: {
      source: prompt,
      comparison: prompt.toLowerCase(),
      definitionSource: definition,
      acceptedReferences: [],
    },
    grouping: {
      promptGroupId,
      headwordGroupId: `headword-${id}`,
    },
    structuralStratum: 'test-stratum',
    blockerCodes: ['source_mapping_unadjudicated'],
  };
}

const records = [
  record(1, 'bank', 'financial institution', 'target-a', 'prompt-bank'),
  record(2, 'bank', 'edge of a river', 'target-b', 'prompt-bank'),
  record(3, 'cat', 'cat', 'target-c', 'prompt-cat'),
  record(4, 'cat', 'cat', 'target-d', 'prompt-cat'),
];

function input(overrides: Record<string, unknown> = {}) {
  const contract = {
    schema_version: 1,
    edition_id: 'dictionary-v0.6.0',
    parent_edition_id: 'dictionary-v0.5.0',
    created_at_utc: '2026-07-22T10:00:00.000Z',
    status: 'internal_reconstruction_reference_scope_expansion',
    scope: {
      language: 'Wajarri',
      iso_639_3: 'wbv',
      glottocode: 'waja1257',
      variety: 'source scoped',
      orthographies: ['source'],
    },
    parent_manifest: { path: 'parent.json', sha256: SHA_A },
    candidate_census: {
      census_id: 'candidate-census-v0.2.0',
      manifest_path: 'census.json',
      manifest_sha256: SHA_B,
      records_component_key: 'records',
    },
    current_dictionary_source_id: 'source-current',
    source_ledger: { path: 'sources.jsonl', sha256: SHA_A },
    change_ledger: {
      path: 'changes.jsonl',
      sha256: SHA_A,
      issuing_change_id: 'change-4',
      accepted_change_ids: [],
    },
    expected_counts: {
      current_source_records: 4,
      current_target_surfaces: 4,
      context_groups: 3,
      multi_target_context_groups: 1,
      rows_in_multi_target_context_groups: 2,
      prompt_groups: 2,
      multi_target_prompt_groups: 2,
    },
    reference_policy: {
      evaluation_scope: 'internal_closed_set_source_reconstruction',
      semantic_translation_acceptance: false,
      training_eligibility: false,
      redistribution_authorized: false,
      model_output_is_linguistic_evidence: false,
      ambiguity_requires_reference_sets: true,
    },
    current_pointer_path: 'dictionary/CURRENT.json',
    supersedes_pointer_sha256: SHA_A,
    release_status: 'not_released',
    claim_limit: 'Internal source reconstruction only.',
  };
  return {
    contractValue: { ...contract, ...overrides },
    parentManifestValue: {
      edition_id: 'dictionary-v0.5.0',
      components: {},
      counts: { acceptedLexicalRows: 0, trainingEligibleRows: 0 },
    },
    censusManifestValue: {
      census_id: 'candidate-census-v0.2.0',
      dictionary_edition: {
        edition_id: 'dictionary-v0.5.0',
        manifest_sha256: SHA_A,
      },
      outputs: {
        records: { path: 'records.jsonl', sha256: SHA_B, rows: 4 },
      },
      validation: {
        acceptedReferences: 0,
        registeredBenchmarkRows: 0,
        trainingEligibleRows: 0,
        benchmarkRegistrationAllowed: false,
      },
    },
    censusRecords: records,
    sourceLedgerRows: [
      {
        source_id: 'source-current',
        training_use: 'needs_review',
        redistribution: 'needs_review',
        derived_weights: 'needs_review',
        hosted_transfer: 'needs_review',
      },
    ],
    changeLedgerRows: [
      {
        change_id: 'change-4',
        new_edition_id: 'dictionary-v0.6.0',
        parent_edition_id: 'dictionary-v0.5.0',
        status: 'candidate',
      },
    ],
  };
}

describe('dictionary reconstruction-reference edition', () => {
  it('covers every record while retaining ambiguity as accepted sets', () => {
    const result = buildDictionaryReconstructionReferenceEdition(input());

    expect(result.dispositions).toHaveLength(4);
    expect(result.contextGroups).toHaveLength(3);
    expect(result.promptGroups).toHaveLength(2);
    expect(
      result.contextGroups.find((row) => row.sourcePrompt === 'cat')
        ?.acceptedReferences,
    ).toEqual(['target-c', 'target-d']);
    expect(
      result.promptGroups.find((row) => row.sourcePromptComparison === 'bank')
        ?.acceptedReferences,
    ).toEqual(['target-a', 'target-b']);
    expect(result.report.acceptedSemanticTranslations).toBe(0);
    expect(result.report.acceptedTrainingRows).toBe(0);
  });

  it('rejects a contract whose expected population is wrong', () => {
    const value = input();
    const contract = value.contractValue as {
      expected_counts: { context_groups: number };
    };
    contract.expected_counts.context_groups = 4;

    expect(() => buildDictionaryReconstructionReferenceEdition(value)).toThrow(
      /expected count mismatch/u,
    );
  });

  it('rejects an allowed release right in an internal-only edition', () => {
    const value = input();
    value.sourceLedgerRows[0].redistribution = 'allowed';

    expect(() => buildDictionaryReconstructionReferenceEdition(value)).toThrow(
      /requires a non-release scope/u,
    );
  });

  it('requires an append-only change record for the new edition', () => {
    const value = input();
    value.changeLedgerRows = [];

    expect(() => buildDictionaryReconstructionReferenceEdition(value)).toThrow(
      /issuing dictionary change is absent/u,
    );
  });
});
