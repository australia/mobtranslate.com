import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueuedResult = unknown[] | Error;

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  selectQueue: [] as QueuedResult[],
  insertQueue: [] as QueuedResult[],
}));

function chainFor(result: QueuedResult | undefined) {
  const settle = () =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result ?? []);
  const chain: any = {};

  for (const method of ['from', 'leftJoin', 'innerJoin', 'where']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.limit = vi.fn(settle);
  chain.values = vi.fn(() => chain);
  chain.returning = vi.fn(settle);
  chain.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
    settle().then(resolve, reject);

  return chain;
}

vi.mock('@/lib/auth-helpers', () => ({
  requireUser: (...args: unknown[]) => mocks.requireUser(...args),
}));

vi.mock('@/lib/db/index', () => ({
  db: {
    select: (...args: unknown[]) => mocks.select(...args),
    insert: (...args: unknown[]) => mocks.insert(...args),
  },
}));

vi.mock('@/lib/quiz/spacedRepetition', () => ({
  SpacedRepetitionEngine: {
    selectWordsForSession: vi.fn((states: any[], size: number) =>
      states.slice(0, size).map((state: any) => state.wordId)
    ),
    shuffleArray: vi.fn((items: any[]) => [...items]),
  },
}));

import { POST } from '@/app/api/v2/quiz/session/route';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/v2/quiz/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

function authenticate() {
  mocks.requireUser.mockResolvedValue({
    user: { id: 'user-1', email: 'learner@example.com' },
    response: null,
  });
}

function queueSuccessfulSession() {
  authenticate();
  mocks.selectQueue.push(
    [{ id: 'lang-1', code: 'wrl', name: 'Wajarri' }],
    [],
    [{ id: 'word-1' }],
    [{
      word: { id: 'word-1', word: 'guli', languageId: 'lang-1' },
      wordClassName: 'noun',
    }],
    [{ id: 'def-1', wordId: 'word-1', definition: 'water' }],
    []
  );
  mocks.insertQueue.push([], [{ id: 'session-123' }]);
}

describe('POST /api/v2/quiz/session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectQueue.length = 0;
    mocks.insertQueue.length = 0;
    mocks.select.mockImplementation(() => chainFor(mocks.selectQueue.shift()));
    mocks.insert.mockImplementation(() => chainFor(mocks.insertQueue.shift()));
    mocks.requireUser.mockResolvedValue({ user: null, response: {} });
  });

  it('returns 401 when user is not authenticated', async () => {
    const response = await POST(makeRequest({ languageCode: 'wrl' }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required' });
  });

  it('returns 401 when authentication fails', async () => {
    mocks.requireUser.mockResolvedValue({ user: null, response: { status: 401 } });
    const response = await POST(makeRequest({ languageCode: 'wrl' }));
    expect(response.status).toBe(401);
  });

  it('returns 404 when language code is invalid', async () => {
    authenticate();
    mocks.selectQueue.push([]);
    const response = await POST(makeRequest({ languageCode: 'nonexistent' }));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Language not found or not active',
    });
  });

  it('returns 404 when language is inactive', async () => {
    authenticate();
    mocks.selectQueue.push([]);
    const response = await POST(makeRequest({ languageCode: 'wrl' }));
    expect(response.status).toBe(404);
  });

  it('returns 200 with session data for a valid request', async () => {
    queueSuccessfulSession();
    const response = await POST(makeRequest({ languageCode: 'wrl' }));
    expect(response.status).toBe(200);
  });

  it('includes the persisted session ID', async () => {
    queueSuccessfulSession();
    const data = await (await POST(makeRequest({ languageCode: 'wrl' }))).json();
    expect(data.sessionId).toBe('session-123');
  });

  it('includes language information', async () => {
    queueSuccessfulSession();
    const data = await (await POST(makeRequest({ languageCode: 'wrl' }))).json();
    expect(data.language).toEqual({ code: 'wrl', name: 'Wajarri' });
  });

  it('includes requested settings', async () => {
    queueSuccessfulSession();
    const data = await (
      await POST(makeRequest({ languageCode: 'wrl', sessionSize: 10, timeLimit: 5000 }))
    ).json();
    expect(data.settings).toEqual({ sessionSize: 1, timeLimit: 5000 });
  });

  it('returns 500 when the progress query fails', async () => {
    authenticate();
    mocks.selectQueue.push(
      [{ id: 'lang-1', code: 'wrl', name: 'Wajarri' }],
      new Error('Database connection lost')
    );
    const response = await POST(makeRequest({ languageCode: 'wrl' }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Internal server error' });
  });

  it('uses the default session size when omitted', async () => {
    queueSuccessfulSession();
    const data = await (await POST(makeRequest({ languageCode: 'wrl' }))).json();
    expect(data.settings.sessionSize).toBe(1);
  });

  it('uses the default time limit when omitted', async () => {
    queueSuccessfulSession();
    const data = await (await POST(makeRequest({ languageCode: 'wrl' }))).json();
    expect(data.settings.timeLimit).toBe(3000);
  });
});
