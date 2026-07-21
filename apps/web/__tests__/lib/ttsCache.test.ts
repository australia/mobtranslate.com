// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import { ttsInputFingerprint } from '@/lib/tts-cache.server';

describe('TTS cache fingerprints', () => {
  afterEach(() => {
    delete process.env.MOBTRANSLATE_TTS_CACHE_SECRET;
  });

  it('is deterministic, opaque, and bound to language and model', () => {
    process.env.MOBTRANSLATE_TTS_CACHE_SECRET = 'tts-test-secret';
    const first = ttsInputFingerprint('kuku_yalanji', 'bana', 'model-a');

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(
      ttsInputFingerprint('kuku_yalanji', 'bana', 'model-a'),
    );
    expect(first).not.toContain('bana');
    expect(first).not.toBe(
      ttsInputFingerprint('kuku_yalanji', 'bana', 'model-b'),
    );
    expect(first).not.toBe(ttsInputFingerprint('aoi', 'bana', 'model-a'));
  });
});
