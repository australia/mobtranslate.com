import {
  normalizeEvidenceText,
  parseExtractedPdfPages,
  rankPdfPages,
  sha1Base32,
  sha256Bytes,
  sourceSpanText,
  tokenRecall,
} from '@/lib/research/pdfSourceFidelity';

describe('PDF source-fidelity analysis', () => {
  it('normalizes typography while preserving lexical tokens', () => {
    expect(normalizeEvidenceText("Nhaa—nyinda’s  TWO\nwords")).toEqual([
      'nhaa',
      "nyinda's",
      'two',
      'words',
    ]);
  });

  it('matches evidence to a page despite column-order changes', () => {
    const pages = parseExtractedPdfPages(
      [
        'unrelated generic language text P–10 Scope and Sequence 1',
        'ngatha balu nyinda ergative suffix transitive subject P–10 Scope and Sequence 2',
        '',
      ].join('\f'),
      2,
    );
    const ranked = rankPdfPages(
      'transitive subject uses an ergative suffix: nyinda, ngatha, balu',
      pages,
    );

    expect(ranked[0]).toMatchObject({ physicalPage: 2, printedPage: 2 });
    expect(ranked[0].combinedScore).toBeGreaterThan(ranked[1].combinedScore);
  });

  it('counts duplicate evidence tokens rather than set membership alone', () => {
    expect(tokenRecall('baba baba rain', 'baba rain')).toEqual({
      multiset: 0.666667,
      unique: 1,
      evidenceTokens: 3,
    });
  });

  it('verifies line-bounded spans without a trailing newline', () => {
    const span = {
      pageNumbers: [7],
      pagePrecision: 'exact',
      sourceLineStart: 2,
      sourceLineEnd: 3,
      sourceSpanSha256: '',
    };
    const text = sourceSpanText(['zero', 'one', 'two', 'three'], span);
    expect(text).toBe('one\ntwo');
    expect(sha256Bytes(text)).toBe(
      '21066d108d5319ecb5a1fc4454f42ef22fc5f1c7df49c31d90294950e0ea8b2c',
    );
  });

  it('reproduces the Base32 form used by Wayback CDX SHA-1 digests', () => {
    expect(sha1Base32(Buffer.from('abc'))).toBe(
      'VGMT4NSHA2AWVOR6EVYXQUGCNSONBWE5',
    );
  });
});
