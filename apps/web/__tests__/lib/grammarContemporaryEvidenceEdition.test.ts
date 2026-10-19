// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildGrammarContemporaryEvidenceEdition,
  type GrammarContemporaryEvidenceContract,
} from '@/lib/research/grammarContemporaryEvidenceEdition';

const reference = (path: string, rows: number) => ({
  path,
  sha256: 'a'.repeat(64),
  rows,
});

function fixture() {
  const contract: GrammarContemporaryEvidenceContract = {
    schema_version: 1,
    edition_id: 'fixture-grammar-v0.2.0',
    parent_edition_id: 'fixture-grammar-v0.1.0',
    created_at_utc: '2026-07-22T09:00:00.000Z',
    status: 'contemporary_source_evidence_expansion',
    scope: {
      language: 'Fixture',
      iso_639_3: 'fix',
      glottocode: 'fixt1234',
      variety: 'unknown',
      orthography: 'source preserving',
    },
    parent_manifest: { path: 'grammar/parent.json', sha256: 'b'.repeat(64) },
    evidence_inventory: {
      inventory_id: 'fixture-inventory-v0.1.0',
      manifest_path: 'analysis/inventory.json',
      manifest_sha256: 'c'.repeat(64),
      component_keys: [
        'pedagogicalEvidence',
        'discourseClusters',
        'readingComprehensionClusters',
        'documentTranslationWitnesses',
        'assessmentVersionConflicts',
      ],
    },
    source_ledger: { path: 'sources/ledger.jsonl', sha256: 'd'.repeat(64) },
    change_ledger: {
      path: 'grammar/ledger.jsonl',
      sha256: 'e'.repeat(64),
      issuing_change_id: 'change-1',
      accepted_change_ids: [],
    },
    review_items: [
      {
        review_key: 'review-discourse',
        question: 'How should this source be analysed?',
        evidence_component_keys: ['discourseClusters'],
        evidence_required: ['Independent alignment.'],
        priority: 'critical',
      },
    ],
    expected_counts: {
      pedagogical_records: 1,
      discourse_clusters: 1,
      discourse_benchmark_units: 1,
      reading_comprehension_clusters: 1,
      document_translation_witnesses: 1,
      assessment_version_conflicts: 1,
      document_parallel_units: 1,
      sentence_translation_benchmark_units: 0,
      added_review_items: 1,
    },
    current_pointer_path: 'grammar/CURRENT.json',
    supersedes_pointer_sha256: 'f'.repeat(64),
    release_status: 'not_released',
  };
  return {
    contractValue: contract,
    parentManifestValue: {
      edition_id: contract.parent_edition_id,
      components: {
        assertions: reference('assertions.jsonl', 1),
        syntheses: reference('syntheses.jsonl', 1),
        conflicts: reference('conflicts.jsonl', 1),
        reviewQueue: reference('review.jsonl', 1),
        evidenceComponents: reference('evidence.jsonl', 1),
      },
      counts: {
        inherited_accepted_for_analysis_syntheses: 1,
        unresolved_conflicts: 1,
        training_eligible_rows: 0,
      },
    },
    inventoryManifestValue: {
      inventory_id: contract.evidence_inventory.inventory_id,
      components: {
        pedagogicalEvidence: reference('pedagogy.jsonl', 1),
        discourseClusters: reference('discourse.jsonl', 1),
        readingComprehensionClusters: reference('reading.jsonl', 1),
        documentTranslationWitnesses: reference('translation.jsonl', 1),
        assessmentVersionConflicts: reference('version-conflicts.jsonl', 1),
      },
      validation: {
        pedagogical_records: 1,
        discourse_clusters: 1,
        benchmark_units_from_discourse: 1,
        reading_comprehension_clusters: 1,
        document_translation_witnesses: 1,
        assessment_version_conflicts: 1,
        document_parallel_units: 1,
        sentence_translation_benchmark_units: 0,
        accepted_rows: 0,
        training_eligible_rows: 0,
      },
    },
    parentReviewRows: [{ reviewItemId: 'review-parent', reviewKey: 'parent' }],
    parentEvidenceComponentRows: [
      { evidenceComponentKey: 'historicalEvidence' },
    ],
    inventoryRowsByComponent: new Map([
      [
        'pedagogicalEvidence',
        [
          {
            acceptanceStatus: 'not_accepted',
            trainingEligibility: 'not_allowed',
          },
        ],
      ],
      [
        'discourseClusters',
        [
          {
            acceptanceStatus: 'not_accepted',
            trainingEligibility: 'not_allowed',
          },
        ],
      ],
      [
        'readingComprehensionClusters',
        [
          {
            acceptanceStatus: 'not_accepted',
            trainingEligibility: 'not_allowed',
          },
        ],
      ],
      [
        'documentTranslationWitnesses',
        [
          {
            acceptanceStatus: 'not_accepted',
            trainingEligibility: 'not_allowed',
          },
        ],
      ],
      [
        'assessmentVersionConflicts',
        [
          {
            acceptanceStatus: 'not_accepted',
            trainingEligibility: 'not_allowed',
          },
        ],
      ],
    ]),
    changeLedgerRows: [
      {
        change_id: contract.change_ledger.issuing_change_id,
        new_edition_id: contract.edition_id,
        parent_edition_id: contract.parent_edition_id,
        accepted: false,
      },
    ],
  };
}

describe('grammar contemporary evidence edition', () => {
  it('adds source components and reviews without multiplying discourse units', () => {
    const result = buildGrammarContemporaryEvidenceEdition(fixture());
    expect(result.report).toMatchObject({
      addedEvidenceComponents: 5,
      addedReviewItems: 1,
      discourseClusters: 1,
      discourseBenchmarkUnits: 1,
      readingComprehensionClusters: 1,
      documentTranslationWitnesses: 1,
      assessmentVersionConflicts: 1,
      documentParallelUnits: 1,
      sentenceTranslationBenchmarkUnits: 0,
      newAcceptedRows: 0,
      trainingEligibleRows: 0,
    });
  });

  it('fails closed if an inventory row becomes accepted', () => {
    const input = fixture();
    input.inventoryRowsByComponent.set('discourseClusters', [
      { acceptanceStatus: 'accepted', trainingEligibility: 'not_allowed' },
    ]);
    expect(() => buildGrammarContemporaryEvidenceEdition(input)).toThrow();
  });

  it('tracks lexical, whole-phrase, and source-internal conflict evidence without accepting an analysis', () => {
    const input = fixture();
    input.contractValue.evidence_inventory.component_keys.push(
      'lexicalPairings',
      'phraseTranslationPairings',
    );
    input.contractValue.evidence_inventory.component_aliases = {
      lexicalPairings: 'attestedLexicalEvidenceV010',
      phraseTranslationPairings: 'wholePhraseEvidenceV010',
    };
    input.contractValue.expected_counts.lexical_pairings = 2;
    input.contractValue.expected_counts.phrase_translation_pairings = 1;
    input.contractValue.expected_counts.source_internal_form_conflicts = 1;
    Object.assign(input.inventoryManifestValue.components, {
      lexicalPairings: reference('lexical.jsonl', 2),
      phraseTranslationPairings: reference('phrases.jsonl', 1),
    });
    Object.assign(input.inventoryManifestValue.validation, {
      lexical_pairings: 2,
      phrase_translation_pairings: 1,
    });
    input.inventoryRowsByComponent.set('lexicalPairings', [
      {
        acceptanceStatus: 'not_accepted',
        trainingEligibility: 'not_allowed',
      },
      {
        acceptanceStatus: 'not_accepted',
        trainingEligibility: 'not_allowed',
      },
    ]);
    input.inventoryRowsByComponent.set('phraseTranslationPairings', [
      {
        acceptanceStatus: 'not_accepted',
        trainingEligibility: 'not_allowed',
      },
    ]);
    input.inventoryRowsByComponent.set('pedagogicalEvidence', [
      {
        record_kind: 'source_internal_form_conflict',
        acceptanceStatus: 'not_accepted',
        trainingEligibility: 'not_allowed',
      },
    ]);

    const result = buildGrammarContemporaryEvidenceEdition(input);
    expect(result.report).toMatchObject({
      lexicalPairings: 2,
      phraseTranslationPairings: 1,
      sourceInternalFormConflicts: 1,
      acceptedForAnalysisSyntheses: 1,
      newAcceptedRows: 0,
      trainingEligibleRows: 0,
    });
    expect(result.evidenceComponents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidenceComponentKey: 'attestedLexicalEvidenceV010',
          inventoryComponentKey: 'lexicalPairings',
        }),
        expect.objectContaining({
          evidenceComponentKey: 'wholePhraseEvidenceV010',
          inventoryComponentKey: 'phraseTranslationPairings',
        }),
      ]),
    );
    expect(result.inventoryComponents).toHaveProperty(
      'attestedLexicalEvidenceV010',
    );
  });

  it('requires the exact append-only lineage', () => {
    const input = fixture();
    input.changeLedgerRows[0]!.parent_edition_id = 'wrong-parent';
    expect(() => buildGrammarContemporaryEvidenceEdition(input)).toThrow(
      'does not identify this closed lineage',
    );
  });

  it('can chain from a contemporary edition without relaxing zero training rows', () => {
    const input = fixture();
    input.parentManifestValue.counts = {
      acceptedForAnalysisSyntheses: 1,
      unresolvedConflicts: 1,
      trainingEligibleRows: 0,
    };
    expect(buildGrammarContemporaryEvidenceEdition(input).report).toMatchObject(
      {
        acceptedForAnalysisSyntheses: 1,
        unresolvedConflicts: 1,
        trainingEligibleRows: 0,
      },
    );
  });
});
