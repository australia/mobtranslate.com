// @vitest-environment node

import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import {
  createTranslationCacheIdentity,
  normalizeTranslationCacheSource,
  withTranslationCache,
  type TranslationCacheDescriptor,
} from '../../lib/translation-pipeline-cache.server';

const secret = 'test-cache-secret-that-is-not-used-in-production';
const descriptor: TranslationCacheDescriptor = {
  stage: 'kuku_hf_draft',
  languageCode: 'kuku_yalanji',
  source: 'The woman saw water.',
  dictionaryFingerprint: 'dictionary-a',
  modelId: 'kuku-yalanji-nllb-lora',
  modelVersion: 'v24.3',
  contractVersion: 'draft-v1',
};

describe('translation pipeline cache identity', () => {
  it('normalizes Unicode and insignificant whitespace without lowercasing', () => {
    expect(normalizeTranslationCacheSource('  Water\n\t flows  ')).toBe(
      'Water flows',
    );
    expect(normalizeTranslationCacheSource('Water')).not.toBe(
      normalizeTranslationCacheSource('water'),
    );
  });

  it('uses opaque HMAC keys and never places source text in the identity', () => {
    const identity = createTranslationCacheIdentity(descriptor, secret);

    expect(identity.key).toMatch(/^[a-f0-9]{64}$/);
    expect(identity.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(identity.key).not.toContain('woman');
    expect(identity.sourceFingerprint).not.toContain('woman');
    expect(identity.sourceLength).toBe(descriptor.source.length);
  });

  it('shares equivalent whitespace but invalidates on dictionary, model, or contract changes', () => {
    const base = createTranslationCacheIdentity(descriptor, secret).key;
    const whitespaceVariant = createTranslationCacheIdentity(
      { ...descriptor, source: '  The woman   saw water.  ' },
      secret,
    ).key;
    const dictionaryVariant = createTranslationCacheIdentity(
      { ...descriptor, dictionaryFingerprint: 'dictionary-b' },
      secret,
    ).key;
    const modelVariant = createTranslationCacheIdentity(
      { ...descriptor, modelVersion: 'v24.4' },
      secret,
    ).key;
    const contractVariant = createTranslationCacheIdentity(
      { ...descriptor, contractVersion: 'draft-v2' },
      secret,
    ).key;

    expect(whitespaceVariant).toBe(base);
    expect(dictionaryVariant).not.toBe(base);
    expect(modelVariant).not.toBe(base);
    expect(contractVariant).not.toBe(base);
  });
});

describe('translation pipeline cache computation guard', () => {
  it('checks the provider budget before computing when caching is disabled', async () => {
    const order: string[] = [];
    const result = await withTranslationCache({
      descriptor,
      schema: z.object({ translation: z.string() }),
      ttlMs: 1000,
      secret: null,
      beforeCompute: async () => {
        order.push('guard');
      },
      compute: async () => {
        order.push('compute');
        return { translation: 'Jalbu' };
      },
    });

    expect(order).toEqual(['guard', 'compute']);
    expect(result.state).toBe('disabled');
  });

  it('does not compute when the provider budget rejects the caller', async () => {
    const compute = vi.fn(async () => ({ translation: 'Jalbu' }));
    await expect(
      withTranslationCache({
        descriptor,
        schema: z.object({ translation: z.string() }),
        ttlMs: 1000,
        secret: null,
        beforeCompute: async () => {
          throw new Error('budget rejected');
        },
        compute,
      }),
    ).rejects.toThrow('budget rejected');
    expect(compute).not.toHaveBeenCalled();
  });
});
