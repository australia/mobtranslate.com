import { describe, expect, it } from 'vitest';
import {
  KUKU_YALANJI_VOICE_PROMPTS,
  REQUIRED_KUKU_YALANJI_VOICE_PROMPTS,
} from '@/lib/kuku-yalanji-speech-types';
import { tokenizeKukuYalanjiTranscript } from '@/lib/kuku-yalanji-speech.server';

describe('Kuku Yalanji speech contract', () => {
  it('uses distinct, source-linked voice prompts', () => {
    expect(KUKU_YALANJI_VOICE_PROMPTS).toHaveLength(10);
    expect(new Set(KUKU_YALANJI_VOICE_PROMPTS.map((prompt) => prompt.id)).size).toBe(10);
    expect(REQUIRED_KUKU_YALANJI_VOICE_PROMPTS).toBe(10);
    const promptWords = KUKU_YALANJI_VOICE_PROMPTS.flatMap((prompt) =>
      prompt.kuku.toLocaleLowerCase('en').split(/\s+/),
    );
    expect(new Set(promptWords).size).toBeGreaterThanOrEqual(25);
    for (const prompt of KUKU_YALANJI_VOICE_PROMPTS) {
      expect(prompt.sourceRefs.length).toBeGreaterThan(0);
      for (const sourceRef of prompt.sourceRefs) {
        expect(sourceRef).toMatch(/^dictionaries\/kuku_yalanji\/dictionary\.yaml#/);
      }
    }
  });

  it('preserves Kuku Yalanji multigraphs and adds morpheme components', () => {
    expect(tokenizeKukuYalanjiTranscript('Nyulu  karrkay-ngka, dingkar.')).toEqual([
      'nyulu',
      'karrkay-ngka',
      'karrkay',
      'ngka',
      'dingkar',
    ]);
  });

  it('deduplicates tokens and rejects punctuation-only input', () => {
    expect(tokenizeKukuYalanjiTranscript('Bama, bama!')).toEqual(['bama']);
    expect(tokenizeKukuYalanjiTranscript('...')).toEqual([]);
  });
});
