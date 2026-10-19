import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildPdfTsvLexicon } from '@/lib/research/pdfTsvLexicon';

const header =
  'level\tpage_num\tpar_num\tblock_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';

function row(
  page: number,
  paragraph: number,
  line: number,
  word: number,
  left: number,
  top: number,
  width: number,
  text: string,
): string {
  return [
    5,
    page,
    paragraph,
    0,
    line,
    word,
    left.toFixed(2),
    top.toFixed(2),
    width.toFixed(2),
    '7.40',
    100,
    text,
  ].join('\t');
}

function lineRow(
  page: number,
  paragraph: number,
  line: number,
  left: number,
  top: number,
  width: number,
): string {
  return [
    4,
    page,
    paragraph,
    0,
    line,
    0,
    left.toFixed(2),
    top.toFixed(2),
    width.toFixed(2),
    '7.40',
    -1,
    '###LINE###',
  ].join('\t');
}

function fixture(): Buffer {
  return Buffer.from(
    [
      header,
      lineRow(52, 8, 0, 228, 27, 45),
      lineRow(52, 0, 0, 24, 55, 61),
      lineRow(52, 1, 1, 34, 66, 21),
      lineRow(52, 2, 0, 212, 55, 97),
      lineRow(52, 2, 1, 221, 66, 28),
      row(52, 8, 0, 0, 228, 27, 45, 'heading'),
      row(52, 0, 0, 0, 24, 55, 4, 'k'),
      row(52, 0, 0, 1, 29, 55, 4, 'a'),
      row(52, 0, 0, 2, 34, 55, 4, 'n'),
      row(52, 1, 0, 0, 40, 55.4, 2, ','),
      row(52, 1, 0, 1, 50, 55.4, 9, 'N:'),
      row(52, 1, 0, 2, 65, 55.4, 20, 'water'),
      row(52, 1, 1, 0, 34, 66, 21, 'source'),
      row(52, 2, 0, 0, 212, 55, 18, 'kuka'),
      row(52, 2, 0, 1, 236, 55, 17, 'mantu'),
      row(52, 2, 0, 2, 258, 55, 2, ','),
      row(52, 2, 0, 3, 268, 55.4, 9, 'N:'),
      row(52, 2, 0, 4, 284, 55.4, 25, 'meat'),
      row(52, 2, 1, 0, 221, 66, 28, 'cooked'),
      '',
    ].join('\n'),
    'utf8',
  );
}

function contract(bytes: Buffer): Record<string, unknown> {
  return {
    schema_version: 1,
    inventory_id: 'fixture-v0.1.0',
    created_at_utc: '2026-07-22T03:00:00.000Z',
    language: { code: 'wbv', name: 'Wajarri' },
    source: {
      source_id: 'fixture-source',
      source_pdf_path: 'source.pdf',
      source_pdf_sha256: 'a'.repeat(64),
      tsv_path: 'source.tsv',
      tsv_sha256: createHash('sha256').update(bytes).digest('hex'),
      extraction_command: 'pdftotext -tsv',
      first_tsv_page: 52,
      last_tsv_page: 52,
      first_printed_page: 247,
      orthography_label: 'historical-source',
    },
    layout: {
      body_top_min: 45,
      body_top_max: 640,
      expected_columns: 2,
      minimum_column_gap_x: 50,
      column_boundary_tolerance_x: 2,
      entry_start_tolerance_x: 5,
      line_top_tolerance: 1,
      no_space_gap_max: 3,
    },
    output_directory: 'analysis/fixture',
    release_status: 'not_released',
  };
}

describe('buildPdfTsvLexicon', () => {
  it('reconstructs split paragraphs, letter spacing, columns, and continuations', () => {
    const bytes = fixture();
    const result = buildPdfTsvLexicon(bytes, contract(bytes));

    expect(result.lines).toHaveLength(4);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      headwordSource: 'kan',
      rawPartOfSpeech: 'N',
      glossSource: 'water source',
      startAnchor: { printedPage: 247, column: 'left' },
      trainingEligibility: 'not_allowed',
    });
    expect(result.entries[1]).toMatchObject({
      headwordSource: 'kuka mantu',
      rawPartOfSpeech: 'N',
      glossSource: 'meat cooked',
      startAnchor: { printedPage: 247, column: 'right' },
    });
    expect(result.reviewQueue).toHaveLength(2);
    expect(result.report).toMatchObject({
      candidateEntries: 2,
      leftColumnEntries: 1,
      rightColumnEntries: 1,
      orphanLines: 0,
      trainingEligibleRows: 0,
    });
  });

  it('fails closed when the TSV bytes differ from the contract', () => {
    const bytes = fixture();
    const changed = Buffer.concat([bytes, Buffer.from('changed')]);
    expect(() => buildPdfTsvLexicon(changed, contract(bytes))).toThrow(
      'TSV hash mismatch',
    );
  });
});
