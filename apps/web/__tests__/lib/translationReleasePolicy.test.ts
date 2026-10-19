import { describe, expect, it } from 'vitest';

import { loadTranslationReleasePolicy } from '../../lib/translation-release-policy.server';

describe('evidence-bound translation release policy', () => {
  it('admits only the Traditional-Owner-authorized Anindilyakwa routes', () => {
    const policy = loadTranslationReleasePolicy('anindilyakwa');

    expect(policy).toMatchObject({
      policyId: 'anindilyakwa-homepage-release-policy-v0.2.0',
      programId: 'anindilyakwa-v1',
      forwardRoute: 'dictionary_exact_or_experimental_model',
      reverseRoute: 'dictionary_exact_only',
      publicDictionaryLookupEnabled: true,
      publicModelInferenceEnabled: true,
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
