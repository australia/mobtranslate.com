import { describe, expect, it } from 'vitest';

import { loadTranslationReleasePolicy } from '../../lib/translation-release-policy.server';

describe('evidence-bound translation release policy', () => {
  it('keeps every Anindilyakwa public route unavailable until promotion', () => {
    const policy = loadTranslationReleasePolicy('anindilyakwa');

    expect(policy).toMatchObject({
      policyId: 'anindilyakwa-homepage-release-policy-v0.1.0',
      programId: 'anindilyakwa-v1',
      forwardRoute: 'unavailable',
      reverseRoute: 'unavailable',
      publicDictionaryLookupEnabled: false,
      publicModelInferenceEnabled: false,
      genericModelFallbackEnabled: false,
      unsupportedStatus: 422,
    });
    expect(policy?.corpusReadiness).toEqual({
      reportId: 'anindilyakwa-corpus-readiness-v0.3.0',
      sha256:
        '40e8e0186e93f479c23e455a8f2c408099522b99d274cbf1e2c8fafa7892fd35',
    });
  });

  it('does not infer restrictions for languages without a declared policy', () => {
    expect(loadTranslationReleasePolicy('kuku_yalanji')).toBeNull();
    expect(loadTranslationReleasePolicy('wajarri')).toBeNull();
  });
});
