// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('@/lib/db/index', () => ({
  db: { execute: (...args: unknown[]) => mocks.execute(...args) },
}));

import {
  ApiBudgetUnavailableError,
  ApiRateLimitError,
  apiGuardResponse,
  clientNetworkIdentity,
  enforceEventRequestLimit,
  enforceOpenAiProviderBudget,
  enforceTtsProviderBudget,
  enforceTtsRequestLimit,
  rateLimitSubjectHash,
} from '@/lib/api-rate-limit.server';

function request(headers: Record<string, string> = {}) {
  return new Request('https://mobtranslate.com/api/translate/kuku_yalanji', {
    headers,
  });
}

describe('public API rate limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MOBTRANSLATE_RATE_LIMIT_SECRET = 'unit-test-rate-limit-secret';
    mocks.execute.mockResolvedValue([
      { request_count: 1, retry_after_seconds: 30 },
    ]);
  });

  it('prefers a valid Cloudflare client address', () => {
    expect(
      clientNetworkIdentity(
        request({
          'cf-connecting-ip': '203.0.113.8',
          'x-forwarded-for': '198.51.100.4',
        }),
      ),
    ).toBe('203.0.113.8');
  });

  it('uses the rightmost valid forwarded address as the fallback', () => {
    expect(
      clientNetworkIdentity(
        request({ 'x-forwarded-for': 'not-an-ip, 198.51.100.4, 192.0.2.7' }),
      ),
    ).toBe('192.0.2.7');
  });

  it('creates deterministic opaque subject identifiers', () => {
    const digest = rateLimitSubjectHash('network:203.0.113.8', 'secret');
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).toBe(
      rateLimitSubjectHash('network:203.0.113.8', 'secret'),
    );
    expect(digest).not.toContain('203.0.113.8');
  });

  it('enforces subject, hourly, and daily provider windows', async () => {
    await enforceOpenAiProviderBudget(request(), 'user-1');
    expect(mocks.execute).toHaveBeenCalledTimes(3);
  });

  it('gives TTS separate request and provider ledgers', async () => {
    await enforceTtsRequestLimit(request(), 'user-1');
    await enforceTtsProviderBudget(request(), 'user-1');
    expect(mocks.execute).toHaveBeenCalledTimes(4);
  });

  it('guards the public client-event relay', async () => {
    await enforceEventRequestLimit(request(), null);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it('fails closed when a subject window is exhausted', async () => {
    mocks.execute.mockResolvedValueOnce([
      { request_count: 21, retry_after_seconds: 47 },
    ]);
    await expect(
      enforceOpenAiProviderBudget(request(), 'user-1'),
    ).rejects.toMatchObject({
      name: 'ApiRateLimitError',
      status: 429,
      retryAfterSeconds: 47,
    });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the budget ledger is unavailable', async () => {
    mocks.execute.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(
      enforceOpenAiProviderBudget(request(), null),
    ).rejects.toBeInstanceOf(ApiBudgetUnavailableError);
  });

  it('returns a no-store 429 response with Retry-After', async () => {
    const response = apiGuardResponse(new ApiRateLimitError('Wait.', 17));
    expect(response?.status).toBe(429);
    expect(response?.headers.get('retry-after')).toBe('17');
    expect(response?.headers.get('cache-control')).toBe('no-store');
    await expect(response?.json()).resolves.toEqual({
      success: false,
      error: 'Wait.',
    });
  });
});
