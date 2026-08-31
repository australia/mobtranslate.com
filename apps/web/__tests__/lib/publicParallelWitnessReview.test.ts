import { describe, expect, it } from 'vitest';
import { buildPublicParallelWitnessReview } from '../../lib/research/publicParallelWitnessReview';

const baseContract = {
  schema_version: 1,
  review_id: 'review-v1',
  created_at_utc: '2026-07-23T23:15:00Z',
  output_root: 'analysis/reviews/review-v1',
  source_texts: [
    {
      source_id: 'source-a',
      title: 'Source A',
      artifact: { path: 'source-a.txt', sha256: 'a'.repeat(64) },
      expected_lines: 2,
      training_use: 'not_allowed',
    },
  ],
  line_spans: [
    {
      span_id: 'span-a',
      source_id: 'source-a',
      role: 'wajarri',
      line_start: 1,
      line_end: 1,
      exact_lines: ['Nyinda barndi? How are you?'],
    },
  ],
  evidence_units: [
    {
      evidence_unit_id: 'unit-a',
      source_id: 'source-a',
      span_ids: ['span-a'],
      wajarri_text: 'Nyinda barndi?',
      english_text: 'How are you?',
      alignment_scope: 'direct_same_line',
      direct_pair_status: 'source_explicit_pair',
      speaker_or_author_status: 'not stated',
      source_family: 'test',
      segmentation_status: 'not_inferred',
      training_eligibility: 'not_allowed',
      synthetic_eligibility: 'not_allowed_from_this_source',
      claim_limit: 'Exact source pair only.',
    },
  ],
  external_records: [
    {
      evidence_record_id: 'external-a',
      artifact: { path: 'external.jsonl', sha256: 'b'.repeat(64) },
      match_field: 'id',
      match_value: 'row-a',
      expected_fields: { target: 'nyinda barndi?' },
      evidence_role: 'corroboration',
      training_interpretation: 'not automatically eligible',
    },
  ],
  construction_candidates: [
    {
      candidate_id: 'candidate-a',
      label: 'Greeting',
      candidate_kind: 'fixed_utterance_corroboration',
      evidence_unit_ids: ['unit-a'],
      external_evidence_record_ids: ['external-a'],
      support_span_ids: [],
      candidate_status: 'accepted_source_scoped_fixed_pair',
      source_independence_status: 'not_assumed',
      proposed_english_pattern: 'How are you?',
      proposed_wajarri_pattern: 'Nyinda barndi?',
      synthetic_template_status: 'not_a_productive_template',
      required_before_generation: ['A productive construction is required.'],
      claim_limit: 'Fixed pair only.',
    },
  ],
  expected_counts: {
    source_texts: 1,
    line_spans: 1,
    evidence_units: 1,
    external_records: 1,
    construction_candidates: 1,
    accepted_source_scoped_fixed_pairs: 1,
    productive_synthetic_templates: 0,
    direct_training_rows: 0,
    controlled_synthetic_sentence_pairs: 0,
  },
  review_policy: {
    source_text: 'exact_line_and_hash_verification',
    document_alignment: 'never_silently_split',
    source_independence: 'never_inferred_from_publication_count',
    synthetic_generation:
      'blocked_without_accepted_productive_grammar_slots_and_allowed_use',
    generated_output_is_evidence: false,
  },
} as const;

function build(contractValue: unknown = baseContract) {
  return buildPublicParallelWitnessReview({
    contractValue,
    sourceTextById: new Map([
      ['source-a', 'Nyinda barndi? How are you?\nFooter\n'],
    ]),
    externalRowsByPath: new Map([
      ['external.jsonl', [{ id: 'row-a', target: 'nyinda barndi?' }]],
    ]),
  });
}

describe('public parallel witness review', () => {
  it('verifies exact lines and keeps fixed evidence out of synthetic templates', () => {
    const result = build();

    expect(result.locatedSpans[0]).toMatchObject({
      lineStart: 1,
      lineEnd: 1,
      exactLines: ['Nyinda barndi? How are you?'],
    });
    expect(result.externalCorroborations[0].sourceLine).toBe(1);
    expect(result.counts).toMatchObject({
      accepted_source_scoped_fixed_pairs: 1,
      productive_synthetic_templates: 0,
      controlled_synthetic_sentence_pairs: 0,
    });
  });

  it('rejects exact-line drift', () => {
    const changed = structuredClone(baseContract);
    changed.line_spans[0].exact_lines = ['Nyinda barndi! How are you?'];
    expect(() => build(changed)).toThrow('exact-line mismatch');
  });

  it('rejects silent line alignment of a document-level translation', () => {
    const changed = structuredClone(baseContract);
    changed.evidence_units[0].alignment_scope = 'document_level';
    expect(() => build(changed)).toThrow(
      'document-level unit is misclassified as aligned',
    );
  });

  it('rejects promotion of an accepted fixed pair into a productive template', () => {
    const changed = structuredClone(baseContract);
    changed.construction_candidates[0].synthetic_template_status =
      'blocked_pending_rights_and_productivity_review';
    expect(() => build(changed)).toThrow(
      'fixed pair cannot be promoted as a template',
    );
  });
});
