import { describe, it, expect } from 'vitest';
import type {
  Language,
  Word,
  Definition,
  Translation,
  UsageExample,
  CulturalContext,
  WordClass,
  DictionaryQueryParams,
} from '@/lib/supabase/types';

/**
 * These tests verify the shape of our TypeScript types at runtime
 * by creating conformant objects and checking their structure.
 */

describe('Language type', () => {
  const language: Language = {
    id: 'test-id',
    code: 'ky',
    name: 'Kuku Yalanji',
    native_name: 'Kuku Yalanji',
    is_active: true,
  };

  it('has required id field', () => {
    expect(language.id).toBeDefined();
    expect(typeof language.id).toBe('string');
  });

  it('has required code field', () => {
    expect(language.code).toBeDefined();
    expect(typeof language.code).toBe('string');
  });

  it('has required name field', () => {
    expect(language.name).toBeDefined();
    expect(typeof language.name).toBe('string');
  });

  it('has required native_name field', () => {
    expect(language.native_name).toBeDefined();
    expect(typeof language.native_name).toBe('string');
  });

  it('has required is_active field', () => {
    expect(language.is_active).toBeDefined();
    expect(typeof language.is_active).toBe('boolean');
  });

  it('supports optional fields', () => {
    const full: Language = {
      ...language,
      description: 'A language of Far North Queensland',
      region: 'Far North Queensland',
      country: 'Australia',
      status: 'active',
      family: 'Pama-Nyungan',
      writing_system: 'Latin',
    };
    expect(full.description).toBe('A language of Far North Queensland');
    expect(full.region).toBe('Far North Queensland');
    expect(full.country).toBe('Australia');
    expect(full.family).toBe('Pama-Nyungan');
  });
});

describe('Word type', () => {
  const word: Word = {
    id: 'word-1',
    language_id: 'lang-1',
    word: 'bama',
  };

  it('has required id field', () => {
    expect(word.id).toBeDefined();
    expect(typeof word.id).toBe('string');
  });

  it('has required language_id field', () => {
    expect(word.language_id).toBeDefined();
    expect(typeof word.language_id).toBe('string');
  });

  it('has required word field', () => {
    expect(word.word).toBeDefined();
    expect(typeof word.word).toBe('string');
  });

  it('supports optional phonetic_transcription', () => {
    const detailed: Word = { ...word, phonetic_transcription: '/bama/' };
    expect(detailed.phonetic_transcription).toBe('/bama/');
  });

  it('supports optional metadata as Record', () => {
    const withMeta: Word = { ...word, metadata: { source: 'fieldwork', year: 2024 } };
    expect(withMeta.metadata).toEqual({ source: 'fieldwork', year: 2024 });
  });

  it('supports optional location fields', () => {
    const located: Word = { ...word, is_location: true, latitude: -16.5, longitude: 145.4 };
    expect(located.is_location).toBe(true);
    expect(located.latitude).toBe(-16.5);
  });

  it('supports nested definitions array', () => {
    const withDefs: Word = {
      ...word,
      definitions: [
        { id: 'def-1', word_id: 'word-1', definition: 'person', is_primary: true },
      ],
    };
    expect(withDefs.definitions).toHaveLength(1);
    expect(withDefs.definitions![0].definition).toBe('person');
  });
});

describe('Definition type', () => {
  it('has required fields', () => {
    const def: Definition = {
      id: 'def-1',
      word_id: 'word-1',
      definition: 'person, Aboriginal person',
    };
    expect(def.id).toBeDefined();
    expect(def.word_id).toBeDefined();
    expect(def.definition).toBeDefined();
  });

  it('supports optional translations array', () => {
    const def: Definition = {
      id: 'def-1',
      word_id: 'word-1',
      definition: 'person',
      translations: [
        { id: 't-1', word_id: 'word-1', definition_id: 'def-1', translation: 'person' },
      ],
    };
    expect(def.translations).toHaveLength(1);
  });
});

describe('Translation type', () => {
  it('has required fields', () => {
    const translation: Translation = {
      id: 't-1',
      word_id: 'word-1',
      translation: 'person',
    };
    expect(translation.id).toBeDefined();
    expect(translation.word_id).toBeDefined();
    expect(translation.translation).toBeDefined();
  });
});

describe('UsageExample type', () => {
  it('has required fields', () => {
    const example: UsageExample = {
      id: 'ex-1',
      word_id: 'word-1',
      example_text: 'Bama jalbu yindu.',
    };
    expect(example.id).toBeDefined();
    expect(example.word_id).toBeDefined();
    expect(example.example_text).toBeDefined();
  });
});

describe('CulturalContext type', () => {
  it('has required fields', () => {
    const ctx: CulturalContext = {
      id: 'ctx-1',
      word_id: 'word-1',
      context_description: 'Used in everyday speech',
    };
    expect(ctx.id).toBeDefined();
    expect(ctx.word_id).toBeDefined();
    expect(ctx.context_description).toBeDefined();
  });

  it('supports optional ceremonial_use flag', () => {
    const ctx: CulturalContext = {
      id: 'ctx-1',
      word_id: 'word-1',
      context_description: 'Ceremonial term',
      ceremonial_use: true,
    };
    expect(ctx.ceremonial_use).toBe(true);
  });
});

describe('WordClass type', () => {
  it('has required fields', () => {
    const wc: WordClass = {
      id: 'wc-1',
      code: 'n',
      name: 'noun',
    };
    expect(wc.id).toBeDefined();
    expect(wc.code).toBe('n');
    expect(wc.name).toBe('noun');
  });
});

describe('DictionaryQueryParams type', () => {
  it('all fields are optional', () => {
    const params: DictionaryQueryParams = {};
    expect(params).toEqual({});
  });

  it('supports language filter', () => {
    const params: DictionaryQueryParams = { language: 'kuku-yalanji' };
    expect(params.language).toBe('kuku-yalanji');
  });

  it('supports search parameter', () => {
    const params: DictionaryQueryParams = { search: 'bama' };
    expect(params.search).toBe('bama');
  });

  it('supports pagination parameters', () => {
    const params: DictionaryQueryParams = { page: 1, limit: 20 };
    expect(params.page).toBe(1);
    expect(params.limit).toBe(20);
  });

  it('supports sort parameters', () => {
    const params: DictionaryQueryParams = { sortBy: 'word', sortOrder: 'asc' };
    expect(params.sortBy).toBe('word');
    expect(params.sortOrder).toBe('asc');
  });

  it('supports wordClass filter', () => {
    const params: DictionaryQueryParams = { wordClass: 'noun' };
    expect(params.wordClass).toBe('noun');
  });

  it('supports letter filter', () => {
    const params: DictionaryQueryParams = { letter: 'b' };
    expect(params.letter).toBe('b');
  });

  it('supports all parameters together', () => {
    const params: DictionaryQueryParams = {
      language: 'wajarri',
      search: 'hello',
      page: 2,
      limit: 50,
      sortBy: 'frequency_score',
      sortOrder: 'desc',
      wordClass: 'verb',
      letter: 'h',
    };
    expect(Object.keys(params)).toHaveLength(8);
  });
});
