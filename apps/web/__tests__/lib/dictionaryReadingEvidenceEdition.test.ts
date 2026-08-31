// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildDictionaryReadingEvidenceEdition,
  type DictionaryReadingEvidenceContract,
} from '@/lib/research/dictionaryReadingEvidenceEdition';

const reference = (path: string, rows: number) => ({
  path,
  sha256: 'a'.repeat(64),
  rows,
});

function fixture() {
  const contract: DictionaryReadingEvidenceContract = {
    schema_version: 1,
    edition_id: 'fixture-dictionary-v0.2.0',
    parent_edition_id: 'fixture-dictionary-v0.1.0',
    created_at_utc: '2026-07-22T16:00:00.000Z',
    status: 'reading_context_evidence_expansion',
    scope: {
      language: 'Fixture',
      iso_639_3: 'fix',
      glottocode: 'fixt1234',
      variety: 'unknown',
      orthographies: ['source'],
    },
    parent_manifest: { path: 'dictionary/parent.json', sha256: 'b'.repeat(64) },
    evidence_inventory: {
      inventory_id: 'fixture-reading-v0.1.0',
      manifest_path: 'analysis/reading.json',
      manifest_sha256: 'c'.repeat(64),
      reading_component_key: 'readingComprehensionClusters',
      translation_witness_component_key: 'documentTranslationWitnesses',
    },
    current_dictionary_source_id: 'source-current',
    source_ledger: { path: 'sources/ledger.jsonl', sha256: 'd'.repeat(64) },
    change_ledger: {
      path: 'dictionary/ledger.jsonl',
      sha256: 'e'.repeat(64),
      issuing_change_id: 'change-1',
      accepted_change_ids: [],
    },
    observations: [
      {
        observation_id: 'observation-1',
        cluster_id: 'cluster-1',
        source_form: 'Thumbuny',
        scientific_name_source: 'Santalum spicatum',
        english_context_label_source: 'sandalwood',
        source_form_occurrence_sentence_numbers: [2],
        supporting_question_numbers: [1],
        relation_status: 'document_context_only',
        automatic_acceptance: false,
        training_use: 'not_allowed',
      },
    ],
    title_translation_observations: [
      {
        observation_id: 'title-observation-1',
        cluster_id: 'cluster-1',
        witness_id: 'witness-1',
        source_form: 'Thumbuny',
        scientific_name_source: 'Santalum spicatum',
        english_translation_source: 'Sandalwood',
        relation_status: 'source_attested_title_translation',
        automatic_acceptance: false,
        training_use: 'not_allowed',
      },
    ],
    expected_counts: {
      reading_clusters: 1,
      evidence_links: 1,
      exact_current_headword_links: 1,
      related_prompt_groups: 1,
      added_review_items: 1,
      title_translation_witnesses: 1,
      title_translation_evidence_links: 1,
      title_translation_related_prompt_groups: 1,
      added_title_translation_review_items: 1,
    },
    current_pointer_path: 'dictionary/CURRENT.json',
    supersedes_pointer_sha256: 'f'.repeat(64),
    release_status: 'not_released',
    claim_limit: 'Evidence only.',
  };
  return {
    contractValue: contract,
    parentManifestValue: {
      edition_id: contract.parent_edition_id,
      components: { entries: reference('entries.jsonl', 2) },
      counts: { acceptedLexicalRows: 0, trainingEligibleRows: 0 },
    },
    inventoryManifestValue: {
      inventory_id: contract.evidence_inventory.inventory_id,
      components: {
        readingComprehensionClusters: reference('reading.jsonl', 1),
        documentTranslationWitnesses: reference('translation.jsonl', 1),
      },
      validation: {
        reading_comprehension_clusters: 1,
        document_translation_witnesses: 1,
        accepted_rows: 0,
        training_eligible_rows: 0,
      },
    },
    readingClusterRows: [
      {
        schemaVersion: 1,
        inventoryId: contract.evidence_inventory.inventory_id,
        clusterId: 'cluster-1',
        sourceId: 'source-reading',
        sourceArtifact: { path: 'page.png', sha256: '1'.repeat(64) },
        titleSource: 'Thumbuny (Santalum spicatum)',
        scientificNameSource: 'Santalum spicatum',
        wajarriSentencesSource: [
          'Another sentence.',
          'Nganajungu Thumbuny ngardi.',
        ],
        comprehensionQuestionsSource: [
          {
            question_number: 1,
            question_source: 'What was sandalwood made into?',
            response_language_source: 'English',
            answer_supplied: false,
            semantic_scope: 'question_constrained_proposition_only',
          },
        ],
        translationStatus: 'no_translation_supplied',
        translationBenchmarkUnitCount: 0,
        acceptanceStatus: 'not_accepted',
        trainingEligibility: 'not_allowed',
      },
    ],
    documentTranslationWitnessRows: [
      {
        schemaVersion: 1,
        inventoryId: contract.evidence_inventory.inventory_id,
        witnessId: 'witness-1',
        sourceId: 'source-marking-key',
        sourceArtifact: {
          path: 'marking-key.pdf',
          sha256: '2'.repeat(64),
        },
        sourceClusterId: 'cluster-1',
        sourceTextSourceId: 'source-reading',
        titleTranslationSource: 'Sandalwood',
        translationStatus: 'official_marking_key_full_document_translation',
        documentParallelUnitCount: 1,
        sentenceTranslationBenchmarkUnitCount: 0,
        acceptanceStatus: 'not_accepted',
        trainingEligibility: 'not_allowed',
      },
    ],
    parentEntries: [
      {
        entryCandidateId: 'entry-birdilyba',
        sourceId: 'source-current',
        headwordComparison: 'birdilyba',
      },
      {
        entryCandidateId: 'entry-thumbuny',
        sourceId: 'source-current',
        headwordComparison: 'thumbuny',
      },
    ],
    parentSenses: [
      {
        senseCandidateId: 'sense-thumbuny',
        entryCandidateId: 'entry-thumbuny',
      },
    ],
    parentPromptGroups: [
      {
        promptGroupId: 'prompt-sandalwood',
        sourcePromptComparison: 'sandalwood',
        acceptedReferences: ['birdilyba', 'thumbuny'],
        sourceRecordIds: ['record-birdilyba', 'record-thumbuny'],
        semanticTranslationAccepted: false,
        trainingEligibility: 'not_allowed',
      },
    ],
    parentReviewQueue: [{ reviewItemId: 'review-parent' }],
    changeLedgerRows: [
      {
        change_id: contract.change_ledger.issuing_change_id,
        new_edition_id: contract.edition_id,
        parent_edition_id: contract.parent_edition_id,
        status: 'candidate',
      },
    ],
  };
}

describe('dictionary reading-context evidence edition', () => {
  it('links source context while preserving the full prompt ambiguity set', () => {
    const result = buildDictionaryReadingEvidenceEdition(fixture());
    expect(result.report).toMatchObject({
      evidenceLinks: 1,
      exactCurrentHeadwordLinks: 1,
      relatedPromptGroups: 1,
      addedReviewItems: 1,
      titleTranslationWitnesses: 1,
      titleTranslationEvidenceLinks: 1,
      titleTranslationRelatedPromptGroups: 1,
      addedTitleTranslationReviewItems: 1,
      acceptedLexicalRows: 0,
      trainingEligibleRows: 0,
    });
    expect(result.readingContextEvidenceLinks[0]).toMatchObject({
      sourceForm: 'Thumbuny',
      exactCurrentEntryCandidateId: 'entry-thumbuny',
      synonymyStatus: 'unadjudicated',
      relatedPromptGroups: [
        {
          promptGroupId: 'prompt-sandalwood',
          recordedTargetCandidates: ['birdilyba', 'thumbuny'],
        },
      ],
      acceptanceStatus: 'not_accepted',
      trainingEligibility: 'not_allowed',
    });
    expect(result.titleTranslationEvidenceLinks[0]).toMatchObject({
      sourceForm: 'Thumbuny',
      titleTranslationSource: 'Sandalwood',
      semanticRelationScope: 'source_document_title_only',
      exactCurrentEntryCandidateId: 'entry-thumbuny',
      relatedPromptGroups: [
        {
          promptGroupId: 'prompt-sandalwood',
          recordedTargetCandidates: ['birdilyba', 'thumbuny'],
        },
      ],
      lexicalIdentityStatus: 'unadjudicated',
      sentenceTranslationBenchmarkUnitCount: 0,
      acceptanceStatus: 'not_accepted',
      trainingEligibility: 'not_allowed',
    });
  });

  it('rejects a claimed occurrence that is absent from the source sentence', () => {
    const input = fixture();
    input.contractValue.observations[0]!.source_form_occurrence_sentence_numbers =
      [1];
    expect(() => buildDictionaryReadingEvidenceEdition(input)).toThrow(
      'source form is absent from declared sentence',
    );
  });

  it('requires the exact append-only dictionary lineage', () => {
    const input = fixture();
    input.changeLedgerRows[0]!.new_edition_id = 'wrong-edition';
    expect(() => buildDictionaryReadingEvidenceEdition(input)).toThrow(
      'issuing dictionary change has the wrong lineage',
    );
  });

  it('rejects a title translation that does not match the official witness', () => {
    const input = fixture();
    input.contractValue.title_translation_observations![0]!.english_translation_source =
      'wood';
    expect(() => buildDictionaryReadingEvidenceEdition(input)).toThrow(
      'does not match its source witnesses',
    );
  });
});
