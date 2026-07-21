// @vitest-environment node

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requestLimit: vi.fn(),
  loadConfig: vi.fn(),
  submit: vi.fn(),
  createPollToken: vi.fn(),
}));

vi.mock('@/lib/auth-helpers', () => ({
  getSessionUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/api-rate-limit.server', () => ({
  apiGuardResponse: vi.fn().mockReturnValue(null),
  enforceAsrProviderBudget: vi.fn(),
  enforceAsrRequestLimit: mocks.requestLimit,
}));

vi.mock('@/lib/kuku-yalanji-asr.server', () => ({
  KukuYalanjiAsrError: class KukuYalanjiAsrError extends Error {
    status = 502;
  },
  createKukuYalanjiAsrPollToken: mocks.createPollToken,
  loadKukuYalanjiAsrConfig: mocks.loadConfig,
  submitKukuYalanjiSpeech: mocks.submit,
}));

describe('POST /api/speech/kuku-yalanji/transcribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats a request without a recording form as a client error', async () => {
    const { POST } = await import(
      '@/app/api/speech/kuku-yalanji/transcribe/route'
    );
    const request = new NextRequest(
      'https://mobtranslate.com/api/speech/kuku-yalanji/transcribe',
      { method: 'POST' },
    );

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Please record a sentence first.',
    });
  });

  it('returns a signed polling capability without waiting for a cold worker', async () => {
    mocks.loadConfig.mockReturnValue({
      provider: 'runpod',
      endpoint: 'https://api.runpod.ai/v2/endpoint-id',
      token: 'secret',
      timeoutMs: 300_000,
    });
    mocks.submit.mockResolvedValue({ status: 'pending', jobId: 'runpod-job-1234' });
    mocks.createPollToken.mockReturnValue('p'.repeat(64));
    const { POST } = await import(
      '@/app/api/speech/kuku-yalanji/transcribe/route'
    );
    const form = new FormData();
    form.append('target', new File([new Uint8Array(64)], 'target.wav', { type: 'audio/wav' }));
    for (let index = 1; index <= 10; index += 1) {
      form.append('contextId', `line-${index}`);
      form.append(
        'contextAudio',
        new File([new Uint8Array(64)], `context-${index}.wav`, { type: 'audio/wav' }),
      );
    }
    const request = new NextRequest(
      'https://mobtranslate.com/api/speech/kuku-yalanji/transcribe',
      { method: 'POST', body: form },
    );

    const response = await POST(request);

    expect(response.status).toBe(202);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      success: true,
      status: 'pending',
      pollToken: 'p'.repeat(64),
      retryAfterMs: 3_000,
    });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });
});
