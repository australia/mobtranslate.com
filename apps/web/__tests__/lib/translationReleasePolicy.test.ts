import { describe, expect, it } from 'vitest';
import { loadTranslationReleasePolicy } from '../../lib/translation-release-policy.server';

describe('evidence-bound translation release policy', () => {
  it('keeps every Anindilyakwa public route unavailable until promotion', () => {
    const policy = loadTranslationReleasePolicy('anindilyakwa');

    expect(policy).toMatchObject({
      programId: 'anindilyakwa-v1',
      forwardRoute: 'unavailable',
      reverseRoute: 'unavailable',
      publicDictionaryLookupEnabled: false,
      publicModelInferenceEnabled: false,
      genericModelFallbackEnabled: false,
      unsupportedStatus: 422,
    });
    expect(policy?.corpusReadiness.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(policy?.permissionAttestationSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('does not infer restrictions for languages without a declared policy', () => {
    expect(loadTranslationReleasePolicy('not-a-declared-program')).toBeNull();
  });
});
