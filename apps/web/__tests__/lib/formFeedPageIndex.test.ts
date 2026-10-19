import { createHash } from 'node:crypto';
import {
  buildFormFeedPageIndex,
  type FormFeedPageIndexContract,
} from '@/lib/research/formFeedPageIndex';

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function fixtureContract(source: Buffer): FormFeedPageIndexContract {
  return {
    schema_version: 1,
    index_id: 'test-pages-v0.1.0',
    created_at_utc: '2026-07-22T00:00:00.000Z',
    source: {
      source_id: 'src-test',
      path: 'sources/test.txt',
      sha256: sha256(source),
      media_type: 'text/plain',
      extraction_method: 'fixture',
      page_delimiter_hex: '0c',
      expected_page_count: 2,
      first_source_pdf_page: 218,
      first_printed_page: 196,
    },
    output_directory: 'analysis/pages/test',
    release_status: 'not_released',
  };
}

describe('form-feed page index', () => {
  const source = Buffer.from(
    '196 First page\nbody one\n\fSecond page 197\nbody two\n\f',
  );

  it('indexes every source byte and preserves three page identities', () => {
    const result = buildFormFeedPageIndex(source, fixtureContract(source));

    expect(result.pages).toHaveLength(2);
    expect(result.delimiterCount).toBe(2);
    expect(result.pages[0]).toMatchObject({
      chapterPageOrdinal: 1,
      sourcePdfPage: 218,
      printedPage: 196,
      firstNonemptyLine: '196 First page',
      lastNonemptyLine: 'body one',
    });
    expect(result.pages[1]).toMatchObject({
      chapterPageOrdinal: 2,
      sourcePdfPage: 219,
      printedPage: 197,
      firstNonemptyLine: 'Second page 197',
      lastNonemptyLine: 'body two',
    });
    expect(result.pages[1]?.delimiterByteOffset).toBe(source.length - 1);
  });

  it('fails if the declared source hash is not exact', () => {
    const contract = fixtureContract(source);
    contract.source.sha256 = '0'.repeat(64);

    expect(() => buildFormFeedPageIndex(source, contract)).toThrow(
      'source hash mismatch',
    );
  });

  it('fails when the final page lacks its delimiter', () => {
    const malformed = Buffer.from('page one\n\fpage two\n');
    const contract = fixtureContract(malformed);

    expect(() => buildFormFeedPageIndex(malformed, contract)).toThrow(
      'found 1 form-feed delimiters, expected 2',
    );
  });
});
