import { createHash } from 'node:crypto';
import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const KeySchema = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/);

export const FormFeedPageIndexContractSchema = z.object({
  schema_version: z.literal(1),
  index_id: KeySchema,
  created_at_utc: z.string().datetime(),
  source: z.object({
    source_id: z.string().min(1),
    path: z.string().min(1),
    sha256: Sha256Schema,
    media_type: z.literal('text/plain'),
    extraction_method: z.string().min(1),
    page_delimiter_hex: z.literal('0c'),
    expected_page_count: z.number().int().positive(),
    first_source_pdf_page: z.number().int().positive(),
    first_printed_page: z.number().int().positive(),
  }),
  output_directory: z.string().min(1),
  release_status: z.literal('not_released'),
});

export type FormFeedPageIndexContract = z.infer<
  typeof FormFeedPageIndexContractSchema
>;

export interface FormFeedPageIndexRow {
  schemaVersion: 1;
  pageIndexId: string;
  sourceId: string;
  sourceSha256: string;
  chapterPageOrdinal: number;
  sourcePdfPage: number;
  printedPage: number;
  sourceByteStartInclusive: number;
  sourceByteEndExclusive: number;
  delimiterByteOffset: number;
  pageByteLength: number;
  pageSha256: string;
  pageLineCount: number;
  firstNonemptyLine: string;
  lastNonemptyLine: string;
}

export interface FormFeedPageIndexResult {
  pages: FormFeedPageIndexRow[];
  sourceByteLength: number;
  delimiterCount: number;
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function displayLine(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function pageLines(pageBytes: Buffer): string[] {
  const text = pageBytes.toString('utf8').replace(/\r\n?/gu, '\n');
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

export function buildFormFeedPageIndex(
  sourceBytes: Buffer,
  contractValue: unknown,
): FormFeedPageIndexResult {
  const contract = FormFeedPageIndexContractSchema.parse(contractValue);
  const sourceSha256 = sha256(sourceBytes);
  if (sourceSha256 !== contract.source.sha256)
    throw new Error(
      `source hash mismatch: ${sourceSha256} != ${contract.source.sha256}`,
    );

  const delimiter = 0x0c;
  const delimiterOffsets: number[] = [];
  for (let offset = 0; offset < sourceBytes.length; offset += 1) {
    if (sourceBytes[offset] === delimiter) delimiterOffsets.push(offset);
  }

  if (delimiterOffsets.length !== contract.source.expected_page_count)
    throw new Error(
      `found ${delimiterOffsets.length} form-feed delimiters, expected ${contract.source.expected_page_count}`,
    );
  if (delimiterOffsets.at(-1) !== sourceBytes.length - 1)
    throw new Error('source must end with one form-feed delimiter per page');

  const pages: FormFeedPageIndexRow[] = [];
  let pageStart = 0;
  delimiterOffsets.forEach((delimiterOffset, index) => {
    const ordinal = index + 1;
    const pageBytes = sourceBytes.subarray(pageStart, delimiterOffset);
    if (pageBytes.length === 0)
      throw new Error(`page ${ordinal} contains no bytes`);
    const lines = pageLines(pageBytes);
    const nonemptyLines = lines.map(displayLine).filter(Boolean);
    if (nonemptyLines.length === 0)
      throw new Error(`page ${ordinal} contains no nonempty text lines`);

    pages.push({
      schemaVersion: 1,
      pageIndexId: `${contract.index_id}:page:${ordinal}`,
      sourceId: contract.source.source_id,
      sourceSha256: contract.source.sha256,
      chapterPageOrdinal: ordinal,
      sourcePdfPage: contract.source.first_source_pdf_page + index,
      printedPage: contract.source.first_printed_page + index,
      sourceByteStartInclusive: pageStart,
      sourceByteEndExclusive: delimiterOffset,
      delimiterByteOffset: delimiterOffset,
      pageByteLength: pageBytes.length,
      pageSha256: sha256(pageBytes),
      pageLineCount: lines.length,
      firstNonemptyLine: nonemptyLines[0] ?? '',
      lastNonemptyLine: nonemptyLines.at(-1) ?? '',
    });
    pageStart = delimiterOffset + 1;
  });

  if (pageStart !== sourceBytes.length)
    throw new Error('page indexing did not consume the complete source');

  return {
    pages,
    sourceByteLength: sourceBytes.length,
    delimiterCount: delimiterOffsets.length,
  };
}
