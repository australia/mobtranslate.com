import { describe, expect, it } from 'vitest';
import { getLearnerLanguageCapability } from '@/lib/learner-language-capabilities';

describe('learner language capabilities', () => {
  it('keeps Kuku Yalanji sentence generation on its research surface', () => {
    const capability = getLearnerLanguageCapability('kuku_yalanji');

    expect(capability.dictionaryLookup).toBe('available');
    expect(capability.sentenceGeneration.status).toBe('research_only');
    expect(capability.sentenceGeneration.researchUrl).toBe('/translate/v2');
  });

  it("does not authorize Mi'gmaq homepage or API generation", () => {
    const capability = getLearnerLanguageCapability('migmaq');

    expect(capability.sentenceGeneration.status).toBe('research_only');
    expect(capability.sentenceGeneration.detail).toContain(
      'does not authorize homepage routing or production API use',
    );
  });

  it('defaults undocumented languages to dictionary-only learner use', () => {
    const capability = getLearnerLanguageCapability('undocumented');

    expect(capability.languageCode).toBe('undocumented');
    expect(capability.dictionaryLookup).toBe('available');
    expect(capability.sentenceGeneration.status).toBe('not_supported');
  });
});
