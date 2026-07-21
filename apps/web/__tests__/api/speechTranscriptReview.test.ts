// @vitest-environment node

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const RECORDING_ID = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  transaction: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock('@/lib/auth-helpers', () => ({
  requireRole: mocks.requireRole,
}));

vi.mock('@/lib/db/index', () => ({
  db: {
    transaction: mocks.transaction,
  },
}));

import { POST } from '@/app/api/v2/recordings/sentence-corpus/transcripts/[recordingId]/route';

function request() {
  return new NextRequest(
    `https://mobtranslate.com/api/v2/recordings/sentence-corpus/transcripts/${RECORDING_ID}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedVersion: 1,
        status: 'adjudicated',
        transcript: 'ngayu binal bama',
        orthographyVersion: 'project-nfc-v1',
        notes: null,
      }),
    },
  );
}

describe('speech transcript adjudication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({ user: { id: USER_ID }, response: null });
    mocks.transaction.mockImplementation(async (callback) => callback({ execute: mocks.execute }));
  });

  it('requires a different signed-in reviewer from the latest transcript author', async () => {
    mocks.execute.mockResolvedValueOnce([
      { id: '33333333-3333-4333-8333-333333333333', version: 1, recorded_by: USER_ID },
    ]);

    const response = await POST(request(), {
      params: Promise.resolve({ recordingId: RECORDING_ID }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'A different signed-in reviewer must adjudicate this transcript.',
    });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it('appends an adjudicated version without changing the prior transcript', async () => {
    mocks.execute
      .mockResolvedValueOnce([
        {
          id: '33333333-3333-4333-8333-333333333333',
          version: 1,
          recorded_by: '44444444-4444-4444-8444-444444444444',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: '55555555-5555-4555-8555-555555555555',
          version: 2,
          status: 'adjudicated',
          transcript: 'ngayu binal bama',
        },
      ]);

    const response = await POST(request(), {
      params: Promise.resolve({ recordingId: RECORDING_ID }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      version: 2,
      status: 'adjudicated',
    });
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });
});
