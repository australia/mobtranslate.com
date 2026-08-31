import { describe, expect, it } from 'vitest';

import {
  isDictionaryLookupAdmitted,
  listTranslationReleasePolicies,
  loadTranslationReleasePolicy,
  resolveTranslationDictionaryCode,
} from '../../lib/translation-release-policy.server';

describe('evidence-bound translation release policy', () => {
  it('covers every audited language and its public aliases', () => {
    expect(loadTranslationReleasePolicy('kuku_yalanji')?.policyId).toBe(
      'kuku-yalanji-live-answer-policy-v1.0.0',
    );
    expect(loadTranslationReleasePolicy('kuku-yalanji')).toBe(
      loadTranslationReleasePolicy('kuku_yalanji'),
    );
    expect(loadTranslationReleasePolicy('wajarri')).toBe(
      loadTranslationReleasePolicy('wbv'),
    );
    expect(loadTranslationReleasePolicy('anindilyakwa')).toBe(
      loadTranslationReleasePolicy('aoi'),
    );
    expect(loadTranslationReleasePolicy('migmaq')).toBe(
      loadTranslationReleasePolicy('mic'),
    );
    expect(listTranslationReleasePolicies()).toHaveLength(4);
  });

  it('resolves aliases to the actual production dictionary codes', () => {
    expect(resolveTranslationDictionaryCode('kuku-yalanji')).toBe(
      'kuku_yalanji',
    );
    expect(resolveTranslationDictionaryCode('wajarri')).toBe('wbv');
    expect(resolveTranslationDictionaryCode('aoi')).toBe('anindilyakwa');
    expect(resolveTranslationDictionaryCode('mic')).toBe('migmaq');
    expect(resolveTranslationDictionaryCode('warlpiri')).toBe('warlpiri');
  });

  it('permits only unambiguous exact dictionary answers for three languages', () => {
    for (const code of ['kuku_yalanji', 'wbv', 'migmaq']) {
      const policy = loadTranslationReleasePolicy(code)!;
      expect(isDictionaryLookupAdmitted(policy, 'to_language')).toBe(true);
      expect(isDictionaryLookupAdmitted(policy, 'to_english')).toBe(true);
      expect(policy).toMatchObject({
        forwardRoute: 'dictionary_exact_only',
        reverseRoute: 'dictionary_exact_only',
        publicDictionaryLookupEnabled: true,
        publicModelInferenceEnabled: false,
        genericModelFallbackEnabled: false,
        answerScope: 'unambiguous_atomic_dictionary_record_only',
        unsupportedStatus: 422,
      });
      expect(policy.evidenceAudit.sha256).toMatch(/^[0-9a-f]{64}$/u);
    }
  });

  it('keeps every Anindilyakwa public route unavailable until promotion', () => {
    const policy = loadTranslationReleasePolicy('anindilyakwa')!;

    expect(policy).toMatchObject({
      policyId: 'anindilyakwa-homepage-release-policy-v0.1.0',
      programId: 'anindilyakwa-v1',
      forwardRoute: 'unavailable',
      reverseRoute: 'unavailable',
      publicDictionaryLookupEnabled: false,
      publicModelInferenceEnabled: false,
      genericModelFallbackEnabled: false,
      answerScope: 'unavailable',
      unsupportedStatus: 422,
    });
    expect(isDictionaryLookupAdmitted(policy, 'to_language')).toBe(false);
    expect(isDictionaryLookupAdmitted(policy, 'to_english')).toBe(false);
    expect(policy.corpusReadiness).toEqual({
      reportId: 'anindilyakwa-corpus-readiness-v0.3.0',
      sha256:
        '40e8e0186e93f479c23e455a8f2c408099522b99d274cbf1e2c8fafa7892fd35',
    });
  });

  it('never admits a model or generic fallback for an audited language', () => {
    for (const policy of listTranslationReleasePolicies()) {
      expect(policy.publicModelInferenceEnabled).toBe(false);
      expect(policy.genericModelFallbackEnabled).toBe(false);
    }
  });

  it('does not infer restrictions for an unaudited language', () => {
    expect(loadTranslationReleasePolicy('not-a-declared-program')).toBeNull();
  });
});
