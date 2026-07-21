// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ loadConfig: vi.fn() }));

vi.mock('@/lib/kuku-yalanji-asr.server', () => ({
  loadKukuYalanjiAsrConfig: () => mocks.loadConfig(),
}));

import { GET } from '@/app/api/speech/kuku-yalanji/status/route';

describe('Kuku Yalanji speech availability', () => {
  afterEach(() => {
    delete process.env.MOBTRANSLATE_KUKU_SPEECH_REPLY_ENABLED;
    delete process.env.OPENAI_API_KEY;
    vi.clearAllMocks();
  });

  it('reports listening and explicitly disabled replies independently', async () => {
    mocks.loadConfig.mockReturnValue({ endpointId: 'endpoint' });
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MOBTRANSLATE_KUKU_SPEECH_REPLY_ENABLED = '0';

    const response = GET();

    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      listeningAvailable: true,
      replyAvailable: false,
    });
  });

  it('requires both an API key and an enabled reply flag', async () => {
    mocks.loadConfig.mockReturnValue(null);
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MOBTRANSLATE_KUKU_SPEECH_REPLY_ENABLED = '1';

    await expect(GET().json()).resolves.toEqual({
      listeningAvailable: false,
      replyAvailable: true,
    });
  });
});
