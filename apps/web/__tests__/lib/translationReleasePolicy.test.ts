import { describe, expect, it } from 'vitest';

import {
  isDictionaryLookupAdmitted,
  isGeneratedTranslationAdmitted,
  listTranslationReleasePolicies,
  loadTranslationReleasePolicy,
  resolveTranslationDictionaryCode,
} from '../../lib/translation-release-policy.server';

describe('evidence-bound translation release policy', () => {
  it('covers every audited language and its public aliases', () => {
    expect(loadTranslationReleasePolicy('kuku_yalanji')?.policyId).toBe(
      'kuku-yalanji-live-answer-policy-v1.1.0',
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

  it('restores Kuku Yalanji model plus OpenAI review as an unverified preview', () => {
    const policy = loadTranslationReleasePolicy('kuku_yalanji')!;
    expect(isDictionaryLookupAdmitted(policy, 'to_language')).toBe(true);
    expect(isDictionaryLookupAdmitted(policy, 'to_english')).toBe(true);
    expect(isGeneratedTranslationAdmitted(policy, 'to_language')).toBe(true);
    expect(isGeneratedTranslationAdmitted(policy, 'to_english')).toBe(true);
    expect(policy).toMatchObject({
      forwardRoute: 'hybrid_review',
      reverseRoute: 'dictionary_reverse_review',
      publicDictionaryLookupEnabled: true,
      publicModelInferenceEnabled: true,
      genericModelFallbackEnabled: true,
      answerScope: 'dictionary_and_unverified_research_preview',
    });
  });

  it('routes Wajarri through dictionary-guided generation in both directions', () => {
    const policy = loadTranslationReleasePolicy('wbv')!;
    expect(isDictionaryLookupAdmitted(policy, 'to_language')).toBe(true);
    expect(isDictionaryLookupAdmitted(policy, 'to_english')).toBe(true);
    expect(isGeneratedTranslationAdmitted(policy, 'to_language')).toBe(true);
    expect(isGeneratedTranslationAdmitted(policy, 'to_english')).toBe(true);
    expect(policy).toMatchObject({
      policyId: 'wajarri-live-answer-policy-v1.1.0',
      forwardRoute: 'dictionary_prompt',
      reverseRoute: 'dictionary_reverse_review',
      publicDictionaryLookupEnabled: true,
      publicModelInferenceEnabled: true,
      genericModelFallbackEnabled: true,
      answerScope: 'dictionary_and_unverified_research_preview',
    });
    expect(policy.evidenceAudit.sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("routes Listuguj Mi'gmaq through its model plus review pipeline", () => {
    const policy = loadTranslationReleasePolicy('migmaq')!;
    expect(isDictionaryLookupAdmitted(policy, 'to_language')).toBe(true);
    expect(isDictionaryLookupAdmitted(policy, 'to_english')).toBe(true);
    expect(isGeneratedTranslationAdmitted(policy, 'to_language')).toBe(true);
    expect(isGeneratedTranslationAdmitted(policy, 'to_english')).toBe(true);
    expect(policy).toMatchObject({
      policyId: 'listuguj-migmaq-live-answer-policy-v1.1.0',
      forwardRoute: 'hybrid_review',
      reverseRoute: 'dictionary_reverse_review',
      publicDictionaryLookupEnabled: true,
      publicModelInferenceEnabled: true,
      genericModelFallbackEnabled: true,
      answerScope: 'dictionary_and_unverified_research_preview',
    });
    expect(policy.evidenceAudit.sha256).toMatch(/^[0-9a-f]{64}$/u);
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
    expect(isGeneratedTranslationAdmitted(policy, 'to_language')).toBe(false);
    expect(isGeneratedTranslationAdmitted(policy, 'to_english')).toBe(false);
    expect(policy.corpusReadiness).toEqual({
      reportId: 'anindilyakwa-corpus-readiness-v0.3.0',
      sha256:
        '40e8e0186e93f479c23e455a8f2c408099522b99d274cbf1e2c8fafa7892fd35',
    });
  });

  it('keeps the unreleased Anindilyakwa program out of public inference', () => {
    const policy = loadTranslationReleasePolicy('anindilyakwa')!;
    expect(policy.publicModelInferenceEnabled).toBe(false);
    expect(policy.genericModelFallbackEnabled).toBe(false);
  });

  it('admits full generated attempts for every available language program', () => {
    for (const policy of listTranslationReleasePolicies()) {
      if (policy.forwardRoute === 'unavailable') continue;
      expect(isGeneratedTranslationAdmitted(policy, 'to_language')).toBe(true);
      expect(isGeneratedTranslationAdmitted(policy, 'to_english')).toBe(true);
      expect(policy.answerScope).toBe(
        'dictionary_and_unverified_research_preview',
      );
    }
  });

  it('does not infer restrictions for an unaudited language', () => {
    expect(loadTranslationReleasePolicy('not-a-declared-program')).toBeNull();
  });
});
