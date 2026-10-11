// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildGlossIndex,
  countGlossWords,
  englishLookupVariants,
  glossText,
  tokenizeGlossText,
} from '../../lib/dictionary-gloss';

const index = buildGlossIndex([
  { word: 'jalbu', gloss: 'woman' },
  { word: 'jalbu', gloss: 'female, woman' },
  { word: 'bana', gloss: 'water' },
  { word: 'ngana', gloss: 'we' },
  { word: 'kalu', gloss: 'salt water catfish' },
  { word: 'kijukum', gloss: 'saltwater catfish' },
  { word: 'mukal', gloss: 'catfish' },
  { word: 'nuka-l', gloss: 'to eat' },
  { word: 'baya', gloss: 'fire' },
  { word: 'kunjin', gloss: 'fire' },
  { word: 'yarraman', gloss: 'horse' },
  { word: 'danda', gloss: 'chestnut horse' },
]);

describe('tokenizeGlossText', () => {
  it('splits on whitespace and drops punctuation', () => {
    expect(tokenizeGlossText('Hello, roland! We  catching catfish.')).toEqual([
      'Hello',
      'roland',
      'We',
      'catching',
      'catfish',
    ]);
    expect(countGlossWords('  one ')).toBe(1);
    expect(countGlossWords('')).toBe(0);
  });

  it('keeps hyphens and apostrophes inside a word', () => {
    expect(tokenizeGlossText("dijarr-dijin's nest")).toEqual([
      "dijarr-dijin's",
      'nest',
    ]);
  });
});

describe('englishLookupVariants', () => {
  it('offers inflection-stripped candidates after the literal token', () => {
    expect(englishLookupVariants('Catching')).toEqual([
      'catching',
      'catch',
      'catche',
    ]);
    expect(englishLookupVariants('horses')).toEqual(['horses', 'hors', 'horse']);
    expect(englishLookupVariants('stopped')).toContain('stop');
    expect(englishLookupVariants('babies')).toContain('baby');
  });
});

describe('glossText', () => {
  it('glosses every word it can and reports the rest as missing', () => {
    const result = glossText('helllo roland we catching catfish and eating them', index);
    const byToken = Object.fromEntries(result.tokens.map((t) => [t.token, t]));

    expect(byToken.helllo.status).toBe('missing');
    expect(byToken.roland.status).toBe('missing');
    expect(byToken.we).toMatchObject({ status: 'exact', lookup: 'we' });
    expect(byToken.we.matches).toEqual([{ word: 'ngana', gloss: 'we' }]);
    expect(byToken.catching.status).toBe('missing');
    expect(byToken.catfish).toMatchObject({ status: 'exact', ambiguous: false });
    expect(byToken.catfish.matches).toEqual([{ word: 'mukal', gloss: 'catfish' }]);
    expect(byToken.and.status).toBe('skipped');
    expect(byToken.eating).toMatchObject({ status: 'mention', lookup: 'eat' });
    expect(byToken.eating.matches).toEqual([{ word: 'nuka-l', gloss: 'to eat' }]);
    expect(byToken.them.status).toBe('skipped');

    expect(result.found).toBe(3);
    expect(result.missing).toBe(3);
    expect(result.skipped).toBe(2);
    expect(result.complete).toBe(false);
  });

  it('matches headwords of the language before English glosses', () => {
    const result = glossText('Jalbu bana', index);
    expect(result.tokens[0]).toMatchObject({
      status: 'headword',
      matches: [{ word: 'jalbu', gloss: 'woman; female, woman' }],
    });
    expect(result.tokens[1].matches[0].word).toBe('bana');
    expect(result.complete).toBe(true);
    expect(result.missing).toBe(0);
  });

  it('keeps every headword for an ambiguous gloss and says so', () => {
    const result = glossText('fire', index);
    expect(result.tokens[0]).toMatchObject({ status: 'exact', ambiguous: true });
    expect(result.tokens[0].matches.map((m) => m.word)).toEqual(['baya', 'kunjin']);
  });

  it('prefers an exact gloss over a mention and strips plurals', () => {
    const result = glossText('horses', index);
    expect(result.tokens[0]).toMatchObject({
      status: 'exact',
      lookup: 'horse',
      matches: [{ word: 'yarraman', gloss: 'horse' }],
    });
  });

  it('never invents a word for an empty or unknown input', () => {
    expect(glossText('', index)).toMatchObject({ tokens: [], found: 0, complete: false });
    expect(glossText('zzzz', index).tokens[0].status).toBe('missing');
  });
});
