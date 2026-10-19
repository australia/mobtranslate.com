import { describe, expect, it } from 'vitest';
import {
  extractVisibleHtmlText,
  locateEvidenceMarkers,
  normalizeExtractedText,
} from '../../lib/research/publicParallelWitnessArchive';

describe('public parallel witness archive', () => {
  it('extracts visible block text while excluding script content', () => {
    const text = extractVisibleHtmlText(`
      <html><body>
        <h1>Phrase guide</h1>
        <p>Alpha beta<br>English meaning</p>
        <script>Alpha beta</script>
      </body></html>
    `);

    expect(text).toContain('Phrase guide');
    expect(text).toContain('Alpha beta\nEnglish meaning');
    expect(text.match(/Alpha beta/gu)).toHaveLength(1);
  });

  it('normalizes line endings and horizontal whitespace deterministically', () => {
    expect(normalizeExtractedText(' one\t two \r\n\r\n three  ')).toBe(
      'one two\nthree\n',
    );
  });

  it('locates exact normalized evidence lines and rejects count drift', () => {
    const text = 'Heading\nNyinda   barndi? How are you?\nFooter\n';
    expect(
      locateEvidenceMarkers(text, [
        { markerId: 'greeting', text: 'Nyinda barndi?', expectedCount: 1 },
      ])[0],
    ).toMatchObject({
      markerId: 'greeting',
      observedCount: 1,
      lineNumbers: [2],
      matchingLines: ['Nyinda barndi? How are you?'],
    });
    expect(() =>
      locateEvidenceMarkers(text, [
        { markerId: 'greeting', text: 'Nyinda barndi?', expectedCount: 2 },
      ]),
    ).toThrow('expected 2 line matches, observed 1');
  });

  it('rejects duplicate marker identities', () => {
    expect(() =>
      locateEvidenceMarkers('Alpha\n', [
        { markerId: 'same', text: 'Alpha', expectedCount: 1 },
        { markerId: 'same', text: 'Alpha', expectedCount: 1 },
      ]),
    ).toThrow('duplicate marker IDs');
  });
});
