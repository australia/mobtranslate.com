// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildContemporaryLanguageEvidenceInventory,
  type ContemporaryLanguageEvidenceInventoryContract,
} from '@/lib/research/contemporaryLanguageEvidenceInventory';

function contract(): ContemporaryLanguageEvidenceInventoryContract {
  return {
    schema_version: 1,
    inventory_id: 'fixture-contemporary-evidence-v0.1.0',
    created_at_utc: '2026-07-22T09:00:00.000Z',
    language: { name: 'Fixture', iso_639_3: 'fix', glottocode: 'fixt1234' },
    source_ledger: {
      path: 'sources/SOURCE-LEDGER.jsonl',
      sha256: 'a'.repeat(64),
    },
    source_artifacts: [
      {
        artifact_key: 'newsletterPage',
        source_id: 'src-newsletter',
        path: 'sources/page.png',
        sha256: 'b'.repeat(64),
        media_type: 'image/png',
        physical_pdf_page: 2,
      },
      {
        artifact_key: 'discoursePage',
        source_id: 'src-discourse',
        path: 'sources/discourse.png',
        sha256: 'c'.repeat(64),
        media_type: 'image/png',
        physical_pdf_page: 3,
      },
    ],
    lexical_pairings: [
      {
        record_id: 'lex-1',
        source_id: 'src-newsletter',
        artifact_key: 'newsletterPage',
        source_form: 'marlu',
        english_gloss_source: 'red kangaroo',
        source_quote: 'marlu - red kangaroo',
        pairing_status: 'explicit_published_pairing',
        source_independence: 'same_project_corroboration',
        automatic_acceptance: false,
        training_use: 'not_allowed',
      },
    ],
    pedagogical_evidence: [
      {
        record_kind: 'word_bank',
        record_id: 'bank-1',
        source_id: 'src-newsletter',
        artifact_key: 'newsletterPage',
        section_title_source: 'Word Search',
        forms_source: ['Marlu'],
        semantic_mapping_status: 'no_semantics_supplied',
        automatic_acceptance: false,
        training_use: 'not_allowed',
      },
      {
        record_kind: 'picture_completion',
        record_id: 'completion-1',
        source_id: 'src-newsletter',
        artifact_key: 'newsletterPage',
        source_mask: 'm_rl_',
        completed_form_source: 'marlu',
        picture_prompt_editorial: 'kangaroo',
        mapping_status: 'source_implied_unadjudicated',
        transcription_status: 'manual_visual_transcription',
        automatic_acceptance: false,
        training_use: 'not_allowed',
      },
    ],
    discourse_clusters: [
      {
        cluster_id: 'discourse-1',
        source_id: 'src-discourse',
        artifact_key: 'discoursePage',
        title_source: 'Sample text',
        wajarri_heading_source: 'Heading',
        wajarri_paragraphs_source: ['Source paragraph.'],
        english_heading_source: 'Translation',
        english_paragraphs_source: ['Translation paragraph.'],
        attribution_source: 'By permission of the source organisation.',
        alignment_status: 'discourse_level_only',
        speaker_status: 'not_identified',
        occasion_status: 'not_identified',
        code_switching_status: 'present',
        independence_status: 'unresolved',
        automatic_acceptance: false,
        training_use: 'not_allowed',
      },
    ],
    expected_counts: {
      lexical_pairings: 1,
      pedagogical_records: 2,
      picture_completions: 1,
      discourse_clusters: 1,
    },
    release_status: 'not_released',
    claim_limit: 'Source candidates only.',
  };
}

const source = (sourceId: string) => ({
  source_id: sourceId,
  training_use: 'not_allowed',
  redistribution: 'not_allowed',
  derived_weights: 'not_allowed',
  hosted_transfer: 'not_allowed',
});

describe('contemporary language evidence inventory', () => {
  it('preserves source granularity while keeping every row closed', () => {
    const result = buildContemporaryLanguageEvidenceInventory({
      contractValue: contract(),
      sourceLedgerRows: [source('src-newsletter'), source('src-discourse')],
    });

    expect(result.report).toMatchObject({
      lexicalPairings: 1,
      pictureCompletions: 1,
      discourseClusters: 1,
      acceptedRows: 0,
      trainingEligibleRows: 0,
    });
    expect(result.discourseClusters).toEqual([
      expect.objectContaining({
        benchmarkUnitCount: 1,
        alignmentStatus: 'discourse_level_only',
        trainingEligibility: 'not_allowed',
      }),
    ]);
  });

  it('keeps reading-comprehension evidence separate from translation data', () => {
    const value = contract();
    value.reading_comprehension_clusters = [
      {
        cluster_id: 'reading-1',
        source_id: 'src-discourse',
        artifact_key: 'discoursePage',
        title_source: 'Plant name',
        scientific_name_source: 'Plantus exemplaris',
        wajarri_sentences_source: ['Source sentence.'],
        attribution_source: 'From: Source (2003).',
        comprehension_questions_source: [
          {
            question_number: 1,
            question_source: 'What was the plant used for?',
            response_language_source: 'English',
            answer_supplied: false,
            semantic_scope: 'question_constrained_proposition_only',
          },
        ],
        translation_status: 'no_translation_supplied',
        alignment_status: 'not_applicable_without_translation',
        segmentation_status: 'orthographic_sentence_boundaries_only',
        speaker_status: 'not_identified',
        occasion_status: 'not_identified',
        variety_status: 'not_identified',
        code_switching_status: 'not_annotated',
        independence_status: 'unresolved',
        automatic_acceptance: false,
        training_use: 'not_allowed',
      },
    ];
    value.expected_counts.reading_comprehension_clusters = 1;

    const result = buildContemporaryLanguageEvidenceInventory({
      contractValue: value,
      sourceLedgerRows: [source('src-newsletter'), source('src-discourse')],
    });

    expect(result.report.readingComprehensionClusters).toBe(1);
    expect(result.readingComprehensionClusters).toEqual([
      expect.objectContaining({
        translationStatus: 'no_translation_supplied',
        alignmentStatus: 'not_applicable_without_translation',
        translationBenchmarkUnitCount: 0,
        trainingEligibility: 'not_allowed',
      }),
    ]);
  });

  it('separates whole-title translations from lexical pairings and preserves language attribution', () => {
    const value = contract();
    value.lexical_pairings[0]!.pairing_scope = 'contextual_nominal_label';
    value.lexical_pairings[0]!.language_attribution_status =
      'joint_yamaji_and_wajarri';
    value.phrase_translation_pairings = [
      {
        record_id: 'title-1',
        source_id: 'src-newsletter',
        artifact_key: 'newsletterPage',
        source_text_source: 'Waranygu bayalgu',
        english_translation_source: 'Digging for Food',
        source_quote: 'Waranygu bayalgu: Digging for Food',
        pairing_scope: 'publication_title',
        language_attribution_status: 'explicitly_wajarri',
        translation_status: 'explicit_published_whole_phrase_translation',
        alignment_status: 'whole_phrase_only',
        source_independence: 'same_project_corroboration',
        automatic_acceptance: false,
        training_use: 'not_allowed',
      },
    ];
    value.expected_counts.phrase_translation_pairings = 1;

    const result = buildContemporaryLanguageEvidenceInventory({
      contractValue: value,
      sourceLedgerRows: [source('src-newsletter'), source('src-discourse')],
    });

    expect(result.lexicalPairings[0]).toMatchObject({
      pairingScope: 'contextual_nominal_label',
      languageAttributionStatus: 'joint_yamaji_and_wajarri',
    });
    expect(result.phraseTranslationPairings).toEqual([
      expect.objectContaining({
        recordKind: 'explicit_whole_phrase_translation_pairing',
        sourceTextSource: 'Waranygu bayalgu',
        englishTranslationSource: 'Digging for Food',
        alignmentStatus: 'whole_phrase_only',
        lexicalSegmentationStatus: 'not_inferred',
        phraseBenchmarkUnitCount: 0,
        trainingEligibility: 'not_allowed',
      }),
    ]);
    expect(result.report.phraseTranslationPairings).toBe(1);
  });

  it('requires phrase-translation rows and counts together', () => {
    const value = contract();
    value.phrase_translation_pairings = [];
    expect(() =>
      buildContemporaryLanguageEvidenceInventory({
        contractValue: value,
        sourceLedgerRows: [source('src-newsletter'), source('src-discourse')],
      }),
    ).toThrow(
      'phrase-translation rows and expected count must be declared together',
    );
  });

  it('keeps a source-internal form discrepancy unresolved', () => {
    const value = contract();
    value.pedagogical_evidence.push({
      record_kind: 'source_internal_form_conflict',
      record_id: 'form-conflict-1',
      source_id: 'src-newsletter',
      artifact_key: 'newsletterPage',
      source_forms_source: ['Birlung', 'birluny'],
      source_contexts_source: ['matching list', 'white swatch'],
      conflict_status: 'unresolved_orthographic_or_morphological_relation',
      automatic_acceptance: false,
      training_use: 'not_allowed',
    });
    value.expected_counts.pedagogical_records = 3;

    const result = buildContemporaryLanguageEvidenceInventory({
      contractValue: value,
      sourceLedgerRows: [source('src-newsletter'), source('src-discourse')],
    });

    expect(result.pedagogicalEvidence.at(-1)).toMatchObject({
      record_kind: 'source_internal_form_conflict',
      conflict_status: 'unresolved_orthographic_or_morphological_relation',
      acceptanceStatus: 'not_accepted',
      trainingEligibility: 'not_allowed',
    });

    const conflict = value.pedagogical_evidence.at(-1);
    if (conflict?.record_kind === 'source_internal_form_conflict')
      conflict.source_forms_source.push('third-form');
    expect(() =>
      buildContemporaryLanguageEvidenceInventory({
        contractValue: value,
        sourceLedgerRows: [source('src-newsletter'), source('src-discourse')],
      }),
    ).toThrow('source form and context counts must match');
  });

  it('requires reading-comprehension rows and counts together', () => {
    const value = contract();
    value.reading_comprehension_clusters = [];
    expect(() =>
      buildContemporaryLanguageEvidenceInventory({
        contractValue: value,
        sourceLedgerRows: [source('src-newsletter'), source('src-discourse')],
      }),
    ).toThrow('rows and expected count must be declared together');
  });

  it('keeps an official full translation at document level and exposes source-version conflicts', () => {
    const value = contract();
    value.source_artifacts.push({
      artifact_key: 'markingKeyPage',
      source_id: 'src-marking-key',
      path: 'sources/marking-key.png',
      sha256: 'd'.repeat(64),
      media_type: 'image/png',
      physical_pdf_page: 3,
    });
    value.reading_comprehension_clusters = [
      {
        cluster_id: 'reading-1',
        source_id: 'src-discourse',
        artifact_key: 'discoursePage',
        title_source: 'Plant name',
        wajarri_sentences_source: ['Sentence one.'],
        attribution_source: 'From: Source (2003).',
        comprehension_questions_source: [
          {
            question_number: 1,
            question_source: 'What was the plant used for?',
            response_language_source: 'English',
            answer_supplied: false,
            semantic_scope: 'question_constrained_proposition_only',
            maximum_marks_source: 1,
          },
        ],
        translation_status: 'no_translation_supplied',
        alignment_status: 'not_applicable_without_translation',
        segmentation_status: 'orthographic_sentence_boundaries_only',
        speaker_status: 'not_identified',
        occasion_status: 'not_identified',
        variety_status: 'not_identified',
        code_switching_status: 'not_annotated',
        independence_status: 'unresolved',
        automatic_acceptance: false,
        training_use: 'not_allowed',
      },
    ];
    value.document_translation_witnesses = [
      {
        witness_id: 'translation-1',
        source_id: 'src-marking-key',
        artifact_key: 'markingKeyPage',
        source_cluster_id: 'reading-1',
        source_text_source_id: 'src-discourse',
        translation_heading_source: 'Translation of source text',
        title_translation_source: 'Plant',
        english_translation_sentences_source: [
          'Translation one.',
          'Translation two.',
        ],
        attribution_source: 'Source (2003) [Translation].',
        page_citation_source: 'p. 1',
        translation_status: 'official_marking_key_full_document_translation',
        alignment_status: 'document_level_only',
        segmentation_status: 'orthographic_sentence_boundaries_only',
        speaker_status: 'not_identified',
        translator_status: 'not_identified',
        variety_status: 'not_identified',
        independence_status: 'same_attributed_publication_lineage',
        declared_source_sentence_count: 1,
        declared_translation_sentence_count: 2,
        marking_key_questions_source: [
          {
            question_number: 1,
            question_source: 'How was the plant used?',
            answer_points_source: ['medicine'],
            maximum_marks_source: 2,
          },
        ],
        task_part_1_marks_source: 1,
        marking_key_part_1_marks_source: 2,
        task_part_2_marks_source: 15,
        marking_key_part_2_marks_source: 14,
        automatic_acceptance: false,
        training_use: 'not_allowed',
      },
    ];
    value.expected_counts.reading_comprehension_clusters = 1;
    value.expected_counts.document_translation_witnesses = 1;
    value.expected_counts.assessment_version_conflicts = 1;

    const result = buildContemporaryLanguageEvidenceInventory({
      contractValue: value,
      sourceLedgerRows: [
        source('src-newsletter'),
        source('src-discourse'),
        source('src-marking-key'),
      ],
    });

    expect(result.report).toMatchObject({
      documentTranslationWitnesses: 1,
      documentParallelUnits: 1,
      assessmentVersionConflicts: 1,
      sentenceTranslationBenchmarkUnits: 0,
      acceptedRows: 0,
      trainingEligibleRows: 0,
    });
    expect(result.documentTranslationWitnesses[0]).toMatchObject({
      sourceSentenceCount: 1,
      translationSentenceCount: 2,
      alignmentStatus: 'document_level_only',
      sentenceTranslationBenchmarkUnitCount: 0,
      trainingEligibility: 'not_allowed',
    });
    expect(result.assessmentVersionConflicts[0]).toMatchObject({
      questionNumber: 1,
      relationStatus: 'question_and_marks_conflict',
      conflictStatus: 'unresolved_source_version_conflict',
    });

    value.document_translation_witnesses[0]!.declared_translation_sentence_count = 3;
    expect(() =>
      buildContemporaryLanguageEvidenceInventory({
        contractValue: value,
        sourceLedgerRows: [
          source('src-newsletter'),
          source('src-discourse'),
          source('src-marking-key'),
        ],
      }),
    ).toThrow('translation sentence count mismatch');
  });

  it('fails closed when source rights are not explicitly disallowed', () => {
    const invalidSource = {
      ...source('src-newsletter'),
      training_use: 'allowed',
    };
    expect(() =>
      buildContemporaryLanguageEvidenceInventory({
        contractValue: contract(),
        sourceLedgerRows: [invalidSource, source('src-discourse')],
      }),
    ).toThrow();
  });

  it('rejects evidence whose artifact belongs to another source', () => {
    const value = contract();
    value.lexical_pairings[0]!.source_id = 'src-discourse';
    expect(() =>
      buildContemporaryLanguageEvidenceInventory({
        contractValue: value,
        sourceLedgerRows: [source('src-newsletter'), source('src-discourse')],
      }),
    ).toThrow('evidence/source mismatch');
  });

  it('does not invent a completion outside the printed word bank', () => {
    const value = contract();
    const completion = value.pedagogical_evidence[1];
    if (completion?.record_kind === 'picture_completion')
      completion.completed_form_source = 'invented';
    expect(() =>
      buildContemporaryLanguageEvidenceInventory({
        contractValue: value,
        sourceLedgerRows: [source('src-newsletter'), source('src-discourse')],
      }),
    ).toThrow('absent from every source word bank');
  });
});
