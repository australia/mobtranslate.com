// @vitest-environment node

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  read: vi.fn(),
}));

vi.mock('@/lib/recording/speech-access.server', () => ({
  resolveSentenceAudioAccess: mocks.access,
}));

vi.mock('@/lib/storage', () => ({
  readRecording: mocks.read,
  contentTypeFor: vi.fn().mockReturnValue('audio/wav'),
}));

import { GET } from '@/app/api/storage/recordings/[...path]/route';

function request(path: string[]) {
  return GET(
    new NextRequest(`https://mobtranslate.com/api/storage/recordings/${path.join('/')}`),
    { params: Promise.resolve({ path }) },
  );
}

describe('sentence recording storage consent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue(Buffer.from('wav-data'));
  });

  it('hides a sentence file when no current permission authorizes access', async () => {
    mocks.access.mockResolvedValue('denied');
    const response = await request(['sentences', 'speaker', 'clip.wav']);
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('serves explicitly public sentence audio with short revocable caching', async () => {
    mocks.access.mockResolvedValue('public');
    const response = await request(['sentences', 'speaker', 'clip.wav']);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=60, must-revalidate');
    expect(response.headers.get('vary')).toBe('Cookie');
  });

  it('serves authorized private review without shared caching', async () => {
    mocks.access.mockResolvedValue('private');
    const response = await request(['sentences', 'speaker', 'clip.wav']);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('preserves immutable public delivery for non-sentence dictionary audio', async () => {
    const response = await request(['words', 'clip.wav']);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(mocks.access).not.toHaveBeenCalled();
  });
});
