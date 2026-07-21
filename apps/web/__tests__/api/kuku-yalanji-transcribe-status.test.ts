// @vitest-environment node

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  statusLimit: vi.fn(),
  loadConfig: vi.fn(),
  verifyToken: vi.fn(),
  poll: vi.fn(),
}));

vi.mock('@/lib/auth-helpers', () => ({
  getSessionUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/api-rate-limit.server', () => ({
  apiGuardResponse: vi.fn().mockReturnValue(null),
  enforceAsrStatusRequestLimit: mocks.statusLimit,
}));

vi.mock('@/lib/kuku-yalanji-asr.server', () => ({
  KukuYalanjiAsrError: class KukuYalanjiAsrError extends Error {
    status = 502;
  },
  loadKukuYalanjiAsrConfig: mocks.loadConfig,
  verifyKukuYalanjiAsrPollToken: mocks.verifyToken,
  pollKukuYalanjiSpeech: mocks.poll,
}));

describe('POST /api/speech/kuku-yalanji/transcribe/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfig.mockReturnValue({
      provider: 'runpod',
      endpoint: 'https://api.runpod.ai/v2/endpoint-id',
      token: 'secret',
      timeoutMs: 300_000,
    });
    mocks.verifyToken.mockReturnValue('runpod-job-1234');
  });

  it('rejects a missing poll capability', async () => {
    const { POST } = await import(
      '@/app/api/speech/kuku-yalanji/transcribe/status/route'
    );
    const request = new NextRequest(
      'https://mobtranslate.com/api/speech/kuku-yalanji/transcribe/status',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mocks.poll).not.toHaveBeenCalled();
  });

  it('returns a bounded retry instruction while the worker starts', async () => {
    mocks.poll.mockResolvedValue({ status: 'pending' });
    const { POST } = await import(
      '@/app/api/speech/kuku-yalanji/transcribe/status/route'
    );
    const request = new NextRequest(
      'https://mobtranslate.com/api/speech/kuku-yalanji/transcribe/status',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pollToken: 'x'.repeat(64) }),
      },
    );

    const response = await POST(request);

    expect(response.status).toBe(202);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      success: true,
      status: 'pending',
      pollToken: 'x'.repeat(64),
      retryAfterMs: 3_000,
    });
    expect(mocks.poll).toHaveBeenCalledWith(
      'runpod-job-1234',
      expect.objectContaining({ provider: 'runpod' }),
    );
  });
});
