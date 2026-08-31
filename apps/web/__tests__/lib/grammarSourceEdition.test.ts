import { createHash } from 'node:crypto';
import {
  buildGrammarSourceEdition,
  type GrammarSourceEditionContract,
} from '@/lib/research/grammarSourceEdition';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fixtureContract(source: string): GrammarSourceEditionContract {
  return {
    schema_version: 1,
    edition_id: 'test-grammar-v0.1.0',
    parent_edition_id: 'test-grammar-v0.0.0',
    created_at_utc: '2026-07-22T00:00:00.000Z',
    status: 'source_verified_candidates',
    scope: {
      language: 'Test',
      iso_639_3: 'tst',
      glottocode: 'test1234',
      variety: 'unknown',
      orthography: 'source',
    },
    source: {
      source_id: 'src-test',
      path: 'sources/test.md',
      sha256: sha256(source),
      declared_page_count: 3,
      page_footer_pattern: 'Scope (\\d+)\\s*$',
      expected_observed_footer_pages: [1, 2],
      trailing_page_range: [3, 3],
      source_rendering: 'test fixture',
      training_use: 'not_allowed',
    },
    parent_manifest: { path: 'grammar/old.json', sha256: '0'.repeat(64) },
    source_ledger: { path: 'sources/ledger.jsonl', sha256: '1'.repeat(64) },
    change_ledger: {
      path: 'grammar/changes.jsonl',
      sha256: '2'.repeat(64),
      accepted_change_ids: [],
    },
    current_pointer_path: 'grammar/CURRENT.json',
    supersedes_pointer_sha256: '3'.repeat(64),
    release_status: 'not_released',
    claims: [
      {
        claim_key: 'plural-marker',
        topic: 'morphology',
        subtopic: 'number',
        statement: 'The source presents -ya as a plural marker.',
        evidence_spans: [{ line_start: 3, line_end: 3 }],
        evidence_class: 'explicit_curriculum_statement',
        scope_conditions: [],
        limitations: ['Fixture only.'],
      },
    ],
    examples: [
      {
        example_key: 'children-found-food',
        claim_keys: ['plural-marker'],
        target_text: 'Mayungguya gulburna warany.',
        english_text: 'The children found bush food.',
        evidence_spans: [{ line_start: 3, line_end: 3 }],
        unit: 'sentence',
        translation_alignment: 'explicit_source_parenthetical',
        limitations: ['Fixture only.'],
      },
    ],
    paradigms: [
      {
        paradigm_key: 'plural-suffix',
        claim_keys: ['plural-marker'],
        label: 'Plural suffix candidate',
        evidence_spans: [{ line_start: 3, line_end: 3 }],
        cells: [
          { slot: 'plural', surface: '-ya', meaning: 'they', condition: null },
        ],
        limitations: ['Fixture only.'],
      },
    ],
    review_items: [
      {
        review_key: 'confirm-plural',
        review_kind: 'cross_source_confirmation',
        question: 'Does a descriptive source confirm the analysis?',
        linked_claim_keys: ['plural-marker'],
        linked_example_keys: ['children-found-food'],
        evidence_required: ['Independent descriptive grammar.'],
        priority: 'high',
      },
    ],
  };
}

describe('grammar source edition', () => {
  const source = [
    'Page one Scope 1',
    'Page two Scope 2',
    'The plural form -ya (they): Mayungguya gulburna warany. (The children found bush food.)',
    '',
  ].join('\n');

  it('indexes exact footer pages and preserves an unresolved trailing page', () => {
    const result = buildGrammarSourceEdition(source, fixtureContract(source));

    expect(result.sourceLineCount).toBe(3);
    expect(result.pages.map((page) => page.pageNumbers)).toEqual([
      [1],
      [2],
      [3],
    ]);
    expect(result.pages[2].pagePrecision).toBe('unresolved_page_range');
    expect(result.claims).toHaveLength(1);
    expect(result.examples).toHaveLength(1);
    expect(result.paradigms).toHaveLength(1);
    expect(result.reviewQueue).toHaveLength(1);
  });

  it('fails when a transcribed example is absent from the cited span', () => {
    const contract = fixtureContract(source);
    contract.examples[0].target_text = 'Invented text';

    expect(() => buildGrammarSourceEdition(source, contract)).toThrow(
      'target_text is absent from its evidence span',
    );
  });

  it('fails when an evidence span crosses a page boundary', () => {
    const contract = fixtureContract(source);
    contract.claims[0].evidence_spans = [{ line_start: 1, line_end: 2 }];

    expect(() => buildGrammarSourceEdition(source, contract)).toThrow(
      'crosses or falls outside page boundaries',
    );
  });
});
