import { describe, expect, it } from 'vitest';
import { buildSyntheticConstructionReview } from '@/lib/research/syntheticConstructionReview';

function fixture() {
  const contract = {
    schema_version: 1,
    review_id: 'fixture-synthetic-construction-review-v1',
    created_at_utc: '2026-07-24T00:00:00Z',
    status: 'pre_census_linguistic_candidate_review',
    output_root: 'analysis/reviews/fixture',
    scope: {
      language: 'Fixture',
      iso_639_3: 'abc',
      variety: 'fixture variety',
      orthography: 'fixture orthography',
    },
    source_ledger: { path: 'sources.jsonl', sha256: 'a'.repeat(64) },
    dictionary_context: {
      edition_id: 'fixture-dictionary-v1',
      manifest: { path: 'dictionary.json', sha256: 'b'.repeat(64) },
      entry_component_key: 'entries',
      sense_component_key: 'senses',
      form_component_key: 'forms',
    },
    grammar_context: {
      edition_id: 'fixture-grammar-v1',
      manifest: { path: 'grammar.json', sha256: 'c'.repeat(64) },
    },
    evidence_components: [
      {
        component_id: 'modern-grammar',
        path: 'modern.jsonl',
        sha256: 'd'.repeat(64),
        rows: 1,
        record_id_field: 'recordId',
        source_cluster_id: 'cluster-modern',
      },
      {
        component_id: 'historical-grammar',
        path: 'historical.jsonl',
        sha256: 'e'.repeat(64),
        rows: 1,
        record_id_field: 'recordId',
        source_cluster_id: 'cluster-historical',
      },
    ],
    construction_families: [
      {
        construction_id: 'construction-intransitive-present',
        task_id: 'S1',
        construction_family: 'intransitive-present',
        source_pattern: 'The {subject} is {predicate}.',
        target_pattern: '{subject} {predicate}.',
        predicate_and_valency_frame: 'one-place intransitive predicate',
        participant_configuration: 'one nominative common-noun subject',
        polarity_tam_and_mood: 'positive present declarative',
        sentence_length_and_clause_depth: 'one independent clause',
        slots: [
          {
            slot_name: 'subject',
            role: 'nominative subject',
            allowed_slot_classes: ['nominative-common-noun-subject'],
            required_grammatical_features: { case: 'nominative' },
          },
          {
            slot_name: 'predicate',
            role: 'intransitive predicate',
            allowed_slot_classes: ['present-intransitive-predicate'],
            required_grammatical_features: { tam: 'present' },
          },
        ],
        evidence_record_ids: ['evidence-modern', 'evidence-historical'],
        source_cluster_ids: ['cluster-modern', 'cluster-historical'],
        limitations: ['Fixture candidate only.'],
        acceptance_status: 'accepted_for_pre_census_candidate_generation',
        synthetic_eligibility: 'candidate_only_pending_failure_census',
        training_eligibility: 'not_allowed',
        benchmark_eligibility: 'not_allowed',
        controlled_corpus_issued: false,
      },
    ],
    lexical_realizations: [
      {
        realization_id: 'realization-dog',
        entry_candidate_id: 'entry-dog',
        sense_candidate_id: 'sense-dog',
        form_candidate_id: 'form-dog',
        english_surface: 'dog',
        english_surface_evidence: {
          sense_field: 'translationSource',
          source_value: 'dog',
          relation: 'exact',
        },
        target_surface: 'duthu',
        part_of_speech: 'noun',
        morphology_status: 'full_published_surface_no_generation',
        slot_classes: ['nominative-common-noun-subject'],
        grammatical_features: { case: 'nominative' },
        source_ids: ['source-dictionary'],
        source_record_ids: ['record-dog'],
        source_cluster_ids: ['cluster-dictionary'],
        evidence_record_ids: [],
        limitations: ['Fixture candidate only.'],
        acceptance_status: 'accepted_for_pre_census_candidate_generation',
        synthetic_eligibility: 'candidate_only_pending_failure_census',
        training_eligibility: 'not_allowed',
        benchmark_eligibility: 'not_allowed',
        controlled_corpus_issued: false,
      },
      {
        realization_id: 'realization-running',
        entry_candidate_id: 'entry-running',
        sense_candidate_id: 'sense-running',
        form_candidate_id: 'form-running',
        english_surface: 'running',
        english_surface_evidence: {
          sense_field: 'translationSource',
          source_value: 'running',
          relation: 'exact',
        },
        target_surface: 'jamarnimanha',
        part_of_speech: 'inflected verb',
        morphology_status: 'full_published_surface_no_generation',
        slot_classes: ['present-intransitive-predicate'],
        grammatical_features: { tam: 'present', valency: 'intransitive' },
        source_ids: ['source-dictionary'],
        source_record_ids: ['record-running'],
        source_cluster_ids: ['cluster-dictionary'],
        evidence_record_ids: ['evidence-modern'],
        limitations: ['Fixture candidate only.'],
        acceptance_status: 'accepted_for_pre_census_candidate_generation',
        synthetic_eligibility: 'candidate_only_pending_failure_census',
        training_eligibility: 'not_allowed',
        benchmark_eligibility: 'not_allowed',
        controlled_corpus_issued: false,
      },
    ],
    explicit_bindings: [
      {
        binding_id: 'binding-dog-running',
        construction_id: 'construction-intransitive-present',
        bindings: {
          subject: 'realization-dog',
          predicate: 'realization-running',
        },
        semantic_compatibility_status:
          'accepted_for_pre_census_candidate_preview',
        semantic_compatibility_rationale: 'Dogs can run.',
        evidence_record_ids: [],
        source_cluster_ids: ['cluster-review'],
        limitations: ['Fixture candidate only.'],
        acceptance_status: 'accepted_for_pre_census_candidate_generation',
        synthetic_eligibility: 'candidate_only_pending_failure_census',
        training_eligibility: 'not_allowed',
        benchmark_eligibility: 'not_allowed',
        controlled_corpus_issued: false,
      },
    ],
    policy: {
      automatic_cartesian_expansion: false,
      generated_pairs_are_linguistic_evidence: false,
      model_output_is_linguistic_evidence: false,
      census_required_before_coverage_commission: true,
      living_book_child_editions_required_before_controlled_issuance: true,
      training_approval_separate: true,
    },
    expected_counts: {
      construction_families: 1,
      lexical_realizations: 2,
      explicit_bindings: 1,
      candidate_pair_previews: 1,
      controlled_corpus_rows: 0,
      training_eligible_rows: 0,
    },
    claim_limit: 'Fixture candidate review only.',
  };
  return {
    contract,
    contractValue: contract,
    sourceLedgerRows: [{ source_id: 'source-dictionary' }],
    dictionaryManifestValue: { edition_id: 'fixture-dictionary-v1' },
    dictionaryEntries: [
      { entryCandidateId: 'entry-dog', sourceRecordId: 'record-dog' },
      {
        entryCandidateId: 'entry-running',
        sourceRecordId: 'record-running',
      },
    ],
    dictionarySenses: [
      {
        senseCandidateId: 'sense-dog',
        entryCandidateId: 'entry-dog',
        sourceRecordId: 'record-dog',
        translationSource: 'dog',
      },
      {
        senseCandidateId: 'sense-running',
        entryCandidateId: 'entry-running',
        sourceRecordId: 'record-running',
        translationSource: 'running',
      },
    ],
    dictionaryForms: [
      {
        formCandidateId: 'form-dog',
        entryCandidateId: 'entry-dog',
        sourceRecordId: 'record-dog',
        surfaceSource: 'duthu',
      },
      {
        formCandidateId: 'form-running',
        entryCandidateId: 'entry-running',
        sourceRecordId: 'record-running',
        surfaceSource: 'jamarnimanha',
      },
    ],
    evidenceRowsByComponent: new Map([
      ['modern-grammar', [{ recordId: 'evidence-modern' }]],
      ['historical-grammar', [{ recordId: 'evidence-historical' }]],
    ]),
  };
}

describe('buildSyntheticConstructionReview', () => {
  it('renders only the explicit reviewed binding', () => {
    const result = buildSyntheticConstructionReview(fixture());
    expect(result.validation).toEqual({
      constructionFamilies: 1,
      lexicalRealizations: 2,
      explicitBindings: 1,
      candidatePairPreviews: 1,
      evidenceRecords: 2,
      controlledCorpusRows: 0,
      trainingEligibleRows: 0,
    });
    expect(result.candidatePairPreviews[0]).toMatchObject({
      sourceText: 'The dog is running.',
      targetText: 'duthu jamarnimanha.',
      trainingEligibility: 'not_allowed',
      controlledCorpusIssued: false,
    });
  });

  it('rejects a target surface that changes the dictionary form', () => {
    const input = fixture();
    input.contract.lexical_realizations[0].target_surface = 'changed';
    expect(() => buildSyntheticConstructionReview(input)).toThrow(
      'changes the published surface',
    );
  });

  it('rejects an English surface that changes the dictionary sense', () => {
    const input = fixture();
    input.contract.lexical_realizations[0].english_surface = 'hound';
    expect(() => buildSyntheticConstructionReview(input)).toThrow(
      'changes the published English sense surface',
    );
  });

  it('rejects construction support from only one source cluster', () => {
    const input = fixture();
    input.contract.construction_families[0].evidence_record_ids = [
      'evidence-modern',
      'evidence-modern-2',
    ];
    input.contract.construction_families[0].source_cluster_ids = [
      'cluster-modern',
      'cluster-historical',
    ];
    input.evidenceRowsByComponent.set('modern-grammar', [
      { recordId: 'evidence-modern' },
    ]);
    expect(() => buildSyntheticConstructionReview(input)).toThrow(
      'unknown evidence evidence-modern-2',
    );
  });

  it('rejects slot-incompatible explicit bindings', () => {
    const input = fixture();
    input.contract.lexical_realizations[0].slot_classes = ['object-np'];
    expect(() => buildSyntheticConstructionReview(input)).toThrow(
      'uses incompatible realization realization-dog',
    );
  });
});
