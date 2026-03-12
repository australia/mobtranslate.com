import { describe, it, expect } from 'vitest';
import {
  transformWordForUI,
  transformWordsForUI,
} from '@/lib/utils/dictionary-transform';

// Helper to create a minimal Word-like object matching the Word interface
function makeWord(overrides: Record<string, any> = {}): any {
  return {
    id: 'word-1',
    language_id: 'lang-1',
    word: 'yira',
    ...overrides,
  };
}

describe('transformWordForUI', () => {
  it('transforms basic word fields (id, word)', () => {
    const result = transformWordForUI(makeWord());
    expect(result.id).toBe('word-1');
    expect(result.word).toBe('yira');
  });

  it('uses word_type for type when available', () => {
    const result = transformWordForUI(makeWord({ word_type: 'noun' }));
    expect(result.type).toBe('noun');
  });

  it('falls back to word_class.name when word_type is not set', () => {
    const result = transformWordForUI(makeWord({ word_class: { name: 'verb' } }));
    expect(result.type).toBe('verb');
  });

  it('prefers word_type over word_class.name', () => {
    const result = transformWordForUI(
      makeWord({ word_type: 'noun', word_class: { name: 'verb' } })
    );
    expect(result.type).toBe('noun');
  });

  it('sets type to undefined when neither word_type nor word_class exists', () => {
    const result = transformWordForUI(makeWord());
    expect(result.type).toBeUndefined();
  });

  it('extracts definitions from object-style definitions', () => {
    const word = makeWord({
      definitions: [
        { definition: 'to run', translations: [] },
        { definition: 'to walk fast', translations: [] },
      ],
    });
    const result = transformWordForUI(word);
    expect(result.definitions).toEqual(['to run', 'to walk fast']);
    expect(result.definition).toBe('to run');
  });

  it('extracts definitions from string-style definitions', () => {
    const word = makeWord({ definitions: ['to run', 'to walk fast'] });
    const result = transformWordForUI(word);
    expect(result.definitions).toEqual(['to run', 'to walk fast']);
    expect(result.definition).toBe('to run');
  });

  it('extracts translations from nested definition.translations', () => {
    const word = makeWord({
      definitions: [
        {
          definition: 'to run',
          translations: [{ translation: 'run' }, { translation: 'sprint' }],
        },
        {
          definition: 'to walk',
          translations: [{ translation: 'walk' }],
        },
      ],
    });
    const result = transformWordForUI(word);
    expect(result.translations).toEqual(['run', 'sprint', 'walk']);
  });

  it('returns empty translations for string definitions', () => {
    const word = makeWord({ definitions: ['to run'] });
    const result = transformWordForUI(word);
    expect(result.translations).toEqual([]);
  });

  it('handles definitions with no translations array', () => {
    const word = makeWord({
      definitions: [{ definition: 'to run' }],
    });
    const result = transformWordForUI(word);
    expect(result.translations).toEqual([]);
  });

  it('extracts example_text from first usage example (object)', () => {
    const word = makeWord({
      usage_examples: [
        { example_text: 'Yira ngayi.' },
        { example_text: 'Another example.' },
      ],
    });
    const result = transformWordForUI(word);
    expect(result.example).toBe('Yira ngayi.');
  });

  it('handles string usage examples', () => {
    const word = makeWord({
      usage_examples: ['Example sentence'],
    });
    const result = transformWordForUI(word);
    expect(result.example).toBe('Example sentence');
  });

  it('sets phonetic from phonetic_transcription', () => {
    const result = transformWordForUI(makeWord({ phonetic_transcription: '/jiːra/' }));
    expect(result.phonetic).toBe('/jiːra/');
  });

  it('sets notes from notes field', () => {
    const result = transformWordForUI(makeWord({ notes: 'Common word' }));
    expect(result.notes).toBe('Common word');
  });

  it('extracts first cultural context description', () => {
    const word = makeWord({
      cultural_contexts: [
        { context_description: 'Used in ceremonies' },
        { context_description: 'Also daily use' },
      ],
    });
    const result = transformWordForUI(word);
    expect(result.culturalContext).toBe('Used in ceremonies');
  });

  it('handles missing optional fields gracefully', () => {
    const result = transformWordForUI(makeWord());
    expect(result.definitions).toEqual([]);
    expect(result.translations).toEqual([]);
    expect(result.definition).toBe('');
    expect(result.example).toBeUndefined();
    expect(result.phonetic).toBeUndefined();
    expect(result.notes).toBeUndefined();
    expect(result.culturalContext).toBeUndefined();
  });

  it('handles empty arrays', () => {
    const word = makeWord({
      definitions: [],
      usage_examples: [],
      cultural_contexts: [],
    });
    const result = transformWordForUI(word);
    expect(result.definitions).toEqual([]);
    expect(result.translations).toEqual([]);
    expect(result.definition).toBe('');
    expect(result.example).toBeUndefined();
    expect(result.culturalContext).toBeUndefined();
  });
});

describe('transformWordsForUI', () => {
  it('transforms multiple words', () => {
    const words = [
      makeWord({ id: '1', word: 'yira' }),
      makeWord({ id: '2', word: 'mala' }),
    ];
    const results = transformWordsForUI(words);
    expect(results).toHaveLength(2);
    expect(results[0].word).toBe('yira');
    expect(results[1].word).toBe('mala');
  });

  it('returns empty array for empty input', () => {
    expect(transformWordsForUI([])).toEqual([]);
  });

  it('preserves order of words', () => {
    const words = [
      makeWord({ id: '3', word: 'c' }),
      makeWord({ id: '1', word: 'a' }),
      makeWord({ id: '2', word: 'b' }),
    ];
    const results = transformWordsForUI(words);
    expect(results.map(r => r.word)).toEqual(['c', 'a', 'b']);
  });
});
