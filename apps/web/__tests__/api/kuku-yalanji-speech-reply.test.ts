// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  enforceChat: vi.fn(),
  enforceBudget: vi.fn(),
  createReply: vi.fn(),
  retrieveEvidence: vi.fn(),
}));

vi.mock('@/lib/auth-helpers', () => ({
  getSessionUser: (...args: unknown[]) => mocks.getSessionUser(...args),
}));

vi.mock('@/lib/api-rate-limit.server', () => ({
  apiGuardResponse: vi.fn(() => null),
  enforceChatRequestLimit: (...args: unknown[]) => mocks.enforceChat(...args),
  enforceOpenAiProviderBudget: (...args: unknown[]) => mocks.enforceBudget(...args),
}));

vi.mock('@/lib/kuku-yalanji-speech.server', () => ({
  createKukuYalanjiSpeechReply: (...args: unknown[]) => mocks.createReply(...args),
  retrieveKukuYalanjiSpeechEvidence: (...args: unknown[]) =>
    mocks.retrieveEvidence(...args),
}));

import { POST } from '@/app/api/speech/kuku-yalanji/reply/route';

describe('Kuku Yalanji speech reply availability', () => {
  afterEach(() => {
    delete process.env.MOBTRANSLATE_KUKU_SPEECH_REPLY_ENABLED;
    delete process.env.OPENAI_API_KEY;
    vi.clearAllMocks();
  });

  it('fails quickly and privately when replies are disabled', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.MOBTRANSLATE_KUKU_SPEECH_REPLY_ENABLED = '0';
    const request = new Request(
      'https://mobtranslate.com/api/speech/kuku-yalanji/reply',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: 'ngayu binal bama', history: [] }),
      },
    );

    const response = await POST(request as never);

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBe('3600');
    expect(mocks.getSessionUser).not.toHaveBeenCalled();
    expect(mocks.enforceChat).not.toHaveBeenCalled();
    expect(mocks.enforceBudget).not.toHaveBeenCalled();
    expect(mocks.createReply).not.toHaveBeenCalled();
  });
});
