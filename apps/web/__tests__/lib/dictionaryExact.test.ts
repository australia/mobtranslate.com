// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildExactDictionaryIndex,
  findUniqueExactDictionaryMatch,
  normalizeDictionaryEnglish,
} from '../../lib/dictionary-exact.server';

describe('exact dictionary lookup', () => {
  it('returns one attested headword for an unambiguous atomic gloss', () => {
    const index = buildExactDictionaryIndex([
      { word: 'jalbu', gloss: 'woman' },
      { word: 'jalbu', gloss: 'female, woman' },
    ]);

    expect(findUniqueExactDictionaryMatch('  Woman? ', index)).toEqual({
      word: 'jalbu',
      gloss: 'woman',
    });
  });

  it('refuses to choose between distinct headwords', () => {
    const index = buildExactDictionaryIndex([
      { word: 'baya', gloss: 'fire' },
      { word: 'kunjin', gloss: 'fire' },
    ]);

    expect(findUniqueExactDictionaryMatch('fire', index)).toBeNull();
  });

  it('deduplicates orthographically equivalent headwords', () => {
    const index = buildExactDictionaryIndex([
      { word: 'Bana', gloss: 'water' },
      { word: 'bana', gloss: 'water' },
    ]);

    expect(findUniqueExactDictionaryMatch('water', index)?.word).toBe('Bana');
  });

  it('does not split punctuation inside a source record into invented senses', () => {
    const index = buildExactDictionaryIndex([
      { word: 'jalbu', gloss: 'female, woman' },
      { word: 'jawun', gloss: 'friend; relation' },
    ]);

    expect(findUniqueExactDictionaryMatch('woman', index)).toBeNull();
    expect(findUniqueExactDictionaryMatch('friend', index)).toBeNull();
  });

  it('does not treat a longer sentence as a lexical lookup', () => {
    const index = buildExactDictionaryIndex([
      { word: 'example', gloss: 'one two three four five six seven' },
    ]);

    expect(
      findUniqueExactDictionaryMatch(
        'one two three four five six seven',
        index,
      ),
    ).toBeNull();
  });

  it('normalizes Unicode apostrophes and whitespace deterministically', () => {
    expect(normalizeDictionaryEnglish('  Mother\u2019s\n brother ')).toBe(
      "mother's brother",
    );
  });
});
