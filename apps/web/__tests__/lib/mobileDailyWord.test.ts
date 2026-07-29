import { describe, expect, it } from 'vitest';
import { sourceBackedDailyWord } from '../../../../mobile/src/lib/dailyWord';

describe('mobile daily-word source contract', () => {
  it('rejects an editorial word that cannot open a dictionary source trail', () => {
    expect(sourceBackedDailyWord({
      word: 'bubu',
      meaning: 'ground, Country, place',
    })).toBeNull();
  });

  it('accepts an addressable dictionary record without inventing missing fields', () => {
    expect(sourceBackedDailyWord({
      id: 'word-123',
      word: 'samqwan',
      meaning: 'water',
      example: null,
    })).toEqual({
      id: 'word-123',
      word: 'samqwan',
      meaning: 'water',
      pronunciation: undefined,
      example: undefined,
      imageUrl: undefined,
    });
  });
});
