import { createHash } from 'node:crypto';
import {
  buildDouglasGrammarInventory,
  type DouglasGrammarInventoryContract,
  type DouglasPageIndexRow,
} from '@/lib/research/douglasGrammarInventory';

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function splitPages(source: Buffer): Buffer[] {
  return source
    .toString('utf8')
    .split('\f')
    .slice(0, -1)
    .map((page) => Buffer.from(page));
}

function pageRows(source: Buffer): DouglasPageIndexRow[] {
  return splitPages(source).map((page, index) => ({
    pageIndexId: `fixture:page:${index + 1}`,
    sourceId: 'src-fixture',
    sourceSha256: sha256(source),
    chapterPageOrdinal: index + 1,
    sourcePdfPage: 218 + index,
    printedPage: 196 + index,
    pageSha256: sha256(page),
    pageLineCount: page.toString('utf8').split('\n').length - 1,
  }));
}

function fixtureContract(source: Buffer): DouglasGrammarInventoryContract {
  return {
    schema_version: 1,
    inventory_id: 'fixture-douglas-inventory-v0.1.0',
    created_at_utc: '2026-07-22T00:00:00.000Z',
    status: 'source_preserving_ocr_inventory',
    scope: {
      language: 'Wajarri',
      iso_639_3: 'wbv',
      variety: 'fixture',
      orthography: 'source preserving',
    },
    source: {
      source_id: 'src-fixture',
      path: 'sources/fixture.txt',
      sha256: sha256(source),
      source_rendering: 'fixture OCR',
      training_use: 'not_allowed',
      page_index: {
        manifest_path: 'analysis/pages/MANIFEST.json',
        manifest_sha256: '1'.repeat(64),
        pages_path: 'analysis/pages/pages.jsonl',
        pages_sha256: '2'.repeat(64),
      },
    },
    source_ledger: {
      path: 'sources/SOURCE-LEDGER.jsonl',
      sha256: '3'.repeat(64),
    },
    numbered_examples: {
      expected_first_number: 1,
      expected_last_number: 3,
      expected_occurrence_count: 4,
      expected_duplicate_numbers: [2],
      block_boundary_policy: 'next_numbered_example_or_source_page_end',
    },
    table_blocks: [
      {
        block_key: 'fixture-table',
        label: 'Fixture table',
        table_kind: 'noun_case_paradigm',
        evidence_span: {
          chapter_page_ordinal: 1,
          line_start: 1,
          line_end: 2,
        },
        intended_analysis: 'Preserve a source table.',
        limitations: ['Fixture only.'],
      },
    ],
    morphotactic_statements: [
      {
        statement_key: 'fixture-statement',
        topic: 'fixture morphology',
        proposition: 'The source states a fixture rule.',
        evidence_spans: [
          {
            chapter_page_ordinal: 1,
            line_start: 1,
            line_end: 1,
          },
        ],
        source_analysis_type: 'author_descriptive_analysis',
        limitations: ['Fixture only.'],
      },
    ],
    curated_examples: [
      {
        example_number: 2,
        phenomenon_tags: ['case-marking'],
        selection_rationale: 'Exercise grouped duplicate occurrences.',
        limitations: ['Fixture only.'],
      },
    ],
    output_directory: 'analysis/fixture',
    release_status: 'not_released',
  };
}

describe('Douglas grammar inventory', () => {
  const source = Buffer.from(
    [
      'Page one',
      'TABLE -n g (k) u',
      '(1) target one',
      '    gloss one',
      '( 2) target two',
      '    translation two',
      '\fPage two',
      '(2) continuation translation',
      '( 3 ) target three',
      '    translation three',
      '\f',
    ].join('\n'),
  );

  it('binds table blocks, statements, and the complete example sequence to source pages', () => {
    const result = buildDouglasGrammarInventory(
      source,
      pageRows(source),
      fixtureContract(source),
    );

    expect(result.tableBlocks).toHaveLength(1);
    expect(result.morphotacticStatements).toHaveLength(1);
    expect(result.numberedExamples).toHaveLength(3);
    expect(result.numberedExampleOccurrenceCount).toBe(4);
    expect(result.duplicateExampleNumbers).toEqual([2]);
    expect(result.curatedExamples).toHaveLength(1);
    expect(result.tableBlocks[0]).toMatchObject({
      cellResolutionStatus: 'unresolved',
      acceptanceStatus: 'not_accepted',
      trainingEligibility: 'not_allowed',
    });
    expect(result.numberedExamples[1]).toMatchObject({
      exampleNumber: 2,
      occurrenceCount: 2,
      blockBoundaryPrecision: 'coarse_source_layout_block',
      translationAlignmentStatus: 'unresolved',
      trainingEligibility: 'not_allowed',
    });
    expect(
      (
        result.numberedExamples[1]?.occurrences as Array<{
          sourceText: string;
        }>
      )[1]?.sourceText,
    ).toContain('continuation translation');
  });

  it('rejects any source-byte mismatch', () => {
    const contract = fixtureContract(source);
    contract.source.sha256 = '0'.repeat(64);

    expect(() =>
      buildDouglasGrammarInventory(source, pageRows(source), contract),
    ).toThrow('source hash mismatch');
  });

  it('rejects a missing example number instead of silently accepting a partial inventory', () => {
    const incomplete = Buffer.from(
      'Page one\nTABLE\n(1) one\n\fPage two\n(2) two\n\f',
    );
    const contract = fixtureContract(incomplete);
    contract.numbered_examples.expected_occurrence_count = 2;
    contract.numbered_examples.expected_duplicate_numbers = [];

    expect(() =>
      buildDouglasGrammarInventory(incomplete, pageRows(incomplete), contract),
    ).toThrow('numbered examples are missing: 3');
  });

  it('rejects unregistered duplicate example labels', () => {
    const contract = fixtureContract(source);
    contract.numbered_examples.expected_duplicate_numbers = [];

    expect(() =>
      buildDouglasGrammarInventory(source, pageRows(source), contract),
    ).toThrow('duplicate example numbers');
  });
});
