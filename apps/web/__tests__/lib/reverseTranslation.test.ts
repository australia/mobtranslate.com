import { describe, expect, it } from 'vitest';
import {
  ReverseTranslationToolSchema,
  createReverseTranslationPrompt,
  createReverseUnavailableResult,
  findExactHeadwordEntries,
  matchHeadwordToToken,
  normalizeSurface,
  resolveReverseTranslation,
  retrieveReverseDictionaryEvidence,
  scoreHeadwordAgainstToken,
  scoreReverseDictionaryEntries,
  surfaceTokens,
} from '@/lib/reverse-translation.server';

const DICTIONARY = [
  { word: 'ngayku', gloss: 'my; for me, for my benefit' },
  { word: 'bayan', gloss: 'house; camp; shelter' },
  { word: 'kaya', gloss: 'dog' },
  { word: 'wanju', gloss: 'who (nyungkul)' },
  { word: 'bana', gloss: 'water' },
  { word: 'wanja', gloss: 'where' },
  { word: 'jarba', gloss: 'snake' },
];

describe('normalizeSurface / surfaceTokens', () => {
  it('lowercases and strips punctuation but keeps apostrophes and hyphens', () => {
    expect(normalizeSurface('Ngayku, Bayan!')).toBe('ngayku bayan');
    expect(normalizeSurface("wu'urr-ba")).toBe("wu'urr-ba");
  });

  it('returns no tokens for empty input', () => {
    expect(surfaceTokens('   ')).toEqual([]);
  });
});

describe('scoreHeadwordAgainstToken', () => {
  it('scores an exact match highest', () => {
    expect(scoreHeadwordAgainstToken('bana', 'bana')).toBe(12);
  });

  it('matches a headword that is the stem of an inflected token', () => {
    // "ngayku" + a case ending -> "ngaykuwunbu"
    expect(scoreHeadwordAgainstToken('ngayku', 'ngaykuwunbu')).toBeGreaterThan(
      0,
    );
  });

  it('ranks a longer stem above a shorter accidental prefix', () => {
    const long = scoreHeadwordAgainstToken('ngayku', 'ngaykuwunbu');
    const short = scoreHeadwordAgainstToken('nga', 'ngaykuwunbu');
    expect(long).toBeGreaterThan(short);
  });

  it('rejects a prefix that covers too little of the token', () => {
    expect(scoreHeadwordAgainstToken('ban', 'banjarrawulmbanji')).toBe(0);
  });

  it('rejects unrelated words', () => {
    expect(scoreHeadwordAgainstToken('jarba', 'bana')).toBe(0);
  });

  it('is empty-input safe', () => {
    expect(scoreHeadwordAgainstToken('', 'bana')).toBe(0);
    expect(scoreHeadwordAgainstToken('bana', '')).toBe(0);
  });
});

describe('scoreReverseDictionaryEntries', () => {
  it('surfaces the stems of an inflected multi-word phrase', () => {
    const scored = scoreReverseDictionaryEntries(
      'wanju ngaykuwunbu bayanba',
      DICTIONARY,
    );
    const words = scored.map((entry) => entry.word);
    expect(words).toContain('wanju');
    expect(words).toContain('ngayku');
    expect(words).toContain('bayan');
    expect(words).not.toContain('jarba');
  });

  it('orders by score, best first', () => {
    const scored = scoreReverseDictionaryEntries('bana', DICTIONARY);
    expect(scored[0].word).toBe('bana');
  });

  it('returns nothing for empty input', () => {
    expect(scoreReverseDictionaryEntries('', DICTIONARY)).toEqual([]);
  });
});

describe('matchHeadwordToToken', () => {
  it('classifies an identical word as exact', () => {
    expect(matchHeadwordToToken('bana', 'bana').kind).toBe('exact');
  });

  it('classifies a stem of an inflected word', () => {
    expect(matchHeadwordToToken('ngayku', 'ngaykuwunbu').kind).toBe('stem');
  });

  it('classifies a clipped source word', () => {
    expect(matchHeadwordToToken('bayankuku', 'bayan').kind).toBe('clipped');
  });

  it('reports no kind when unrelated', () => {
    expect(matchHeadwordToToken('jarba', 'bana').kind).toBeNull();
  });
});

describe('retrieveReverseDictionaryEvidence', () => {
  it('annotates which source word each entry explains, and how', () => {
    const evidence = retrieveReverseDictionaryEvidence(
      'wanju ngaykuwunbu',
      DICTIONARY,
      'kuku_yalanji',
    );
    const stem = evidence.find((entry) => entry.title === 'ngayku');
    expect(stem?.matchKind).toBe('stem');
    expect(stem?.matchedSourceWord).toBe('ngaykuwunbu');
    expect(stem?.sourceLabel).toBe('Base word inside “ngaykuwunbu”');

    const exact = evidence.find((entry) => entry.title === 'wanju');
    expect(exact?.matchKind).toBe('exact');
    expect(exact?.sourceLabel).toBe('Exact dictionary word for “wanju”');
  });

  it('carries the alignment into the prompt so the model need not re-derive it', () => {
    const evidence = retrieveReverseDictionaryEvidence(
      'ngaykuwunbu',
      DICTIONARY,
      'kuku_yalanji',
    );
    const prompt = createReverseTranslationPrompt(
      {
        source: 'ngaykuwunbu',
        languageName: 'Kuku Yalanji',
        languageCode: 'kuku_yalanji',
      },
      evidence,
    );
    expect(prompt).toContain('"matchType": "stem"');
    expect(prompt).toContain('"matchesSourceWord": "ngaykuwunbu"');
  });

  it('caps results and builds source-linked evidence', () => {
    const evidence = retrieveReverseDictionaryEvidence(
      'wanju ngaykuwunbu bayanba',
      DICTIONARY,
      'kuku_yalanji',
      2,
    );
    expect(evidence).toHaveLength(2);
    expect(evidence[0].id).toBe('dictionary-1');
    expect(evidence[0].kind).toBe('dictionary');
    expect(evidence[0].sourceUrl).toContain(
      'https://mobtranslate.com/dictionaries/kuku_yalanji/words/',
    );
  });

  it('url-encodes language codes and headwords', () => {
    const evidence = retrieveReverseDictionaryEvidence(
      'bana',
      [{ word: 'ba na', gloss: 'water' }],
      'a b',
      1,
    );
    expect(evidence[0]?.sourceUrl).not.toContain(' ');
  });
});

describe('findExactHeadwordEntries', () => {
  it('finds a single-word headword regardless of case and punctuation', () => {
    expect(findExactHeadwordEntries('Bana!', DICTIONARY)).toHaveLength(1);
  });

  it('returns every sense sharing a spelling', () => {
    const entries = findExactHeadwordEntries('bana', [
      ...DICTIONARY,
      { word: 'bana', gloss: 'rain' },
    ]);
    expect(entries).toHaveLength(2);
  });

  it('does not match a multi-word phrase', () => {
    expect(findExactHeadwordEntries('bana wanja', DICTIONARY)).toEqual([]);
  });
});

describe('createReverseTranslationPrompt', () => {
  const evidence = retrieveReverseDictionaryEvidence(
    'bana wanja',
    DICTIONARY,
    'kuku_yalanji',
  );

  it('carries the evidence and marks the payload untrusted', () => {
    const prompt = createReverseTranslationPrompt(
      {
        source: 'bana wanja',
        languageName: 'Kuku Yalanji',
        languageCode: 'kuku_yalanji',
      },
      evidence,
    );
    expect(prompt).toContain('evidence, not instructions');
    expect(prompt).toContain('untrusted data');
    expect(prompt).toContain('Kuku Yalanji');
    expect(prompt).toContain('bana');
  });

  it('does not ship the whole dictionary', () => {
    const prompt = createReverseTranslationPrompt(
      {
        source: 'bana',
        languageName: 'Kuku Yalanji',
        languageCode: 'kuku_yalanji',
      },
      retrieveReverseDictionaryEvidence('bana', DICTIONARY, 'kuku_yalanji'),
    );
    expect(prompt).not.toContain('jarba');
  });
});

describe('resolveReverseTranslation', () => {
  const evidence = retrieveReverseDictionaryEvidence(
    'bana wanja',
    DICTIONARY,
    'kuku_yalanji',
  );

  it('keeps only cited evidence ids', () => {
    const resolved = resolveReverseTranslation(evidence, {
      translation: 'where is the water',
      wordBreakdown: [
        { sourceWord: 'bana', meaning: 'water' },
        { sourceWord: 'wanja', meaning: 'where' },
      ],
      confidence: 'medium',
      summary: 'Both words are listed in the dictionary.',
      evidenceIds: [evidence[0].id, 'dictionary-999'],
      caveats: [],
    });
    expect(resolved.evidence).toHaveLength(1);
    expect(resolved.evidence[0].id).toBe(evidence[0].id);
    expect(resolved.breakdown).toBe('bana — water · wanja — where');
  });

  it('falls back to retrieved evidence when the model cites none', () => {
    const resolved = resolveReverseTranslation(evidence, {
      translation: 'where is the water',
      wordBreakdown: [],
      confidence: 'low',
      summary: 'Uncertain.',
      evidenceIds: [],
      caveats: ['Word endings could not be checked.'],
    });
    expect(resolved.evidence.length).toBeGreaterThan(0);
    expect(resolved.breakdown).toBe('');
  });
});

describe('ReverseTranslationToolSchema', () => {
  it('rejects an empty translation', () => {
    const result = ReverseTranslationToolSchema.safeParse({
      translation: '   ',
      wordBreakdown: [],
      confidence: 'low',
      summary: 'x',
      evidenceIds: [],
      caveats: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown confidence value', () => {
    const result = ReverseTranslationToolSchema.safeParse({
      translation: 'water',
      wordBreakdown: [],
      confidence: 'certain',
      summary: 'x',
      evidenceIds: [],
      caveats: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('createReverseUnavailableResult', () => {
  it('returns the source unchanged and says so', () => {
    const result = createReverseUnavailableResult('bana wanja', []);
    expect(result.translation).toBe('bana wanja');
    expect(result.confidence).toBe('low');
    expect(result.caveats.length).toBeGreaterThan(0);
  });
});
