// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mocks.getSession(...args),
    },
  },
}));

vi.mock('@/lib/db/index', () => ({
  db: {
    execute: (...args: unknown[]) => mocks.execute(...args),
  },
}));

import {
  requireRole,
  requireUser as requireSessionUser,
} from '@/lib/auth-helpers';
import {
  requireAdmin as requireRecordingAdmin,
  requireUser as requireRecordingUser,
} from '@/lib/recording/server';

describe('authentication response cache policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(null);
    mocks.execute.mockResolvedValue([{ has_role: false }]);
  });

  it('marks shared unauthenticated responses as no-store', async () => {
    const result = await requireSessionUser();

    expect(result.response?.status).toBe(401);
    expect(result.response?.headers.get('cache-control')).toBe('no-store');
  });

  it('marks shared forbidden responses as no-store', async () => {
    mocks.getSession.mockResolvedValue({
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        email: 'user@example.test',
      },
    });

    const result = await requireRole(['super_admin']);

    expect(result.response?.status).toBe(403);
    expect(result.response?.headers.get('cache-control')).toBe('no-store');
  });

  it('marks recording-portal auth failures as no-store', async () => {
    const userResult = await requireRecordingUser();
    const adminResult = await requireRecordingAdmin();

    expect(userResult.error?.status).toBe(401);
    expect(userResult.error?.headers.get('cache-control')).toBe('no-store');
    expect(adminResult.error?.status).toBe(401);
    expect(adminResult.error?.headers.get('cache-control')).toBe('no-store');
  });
});
