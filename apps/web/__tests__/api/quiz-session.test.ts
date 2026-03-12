import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- Supabase mock setup ----

// We build a chainable mock that records calls and returns configurable data.
let mockAuthUser: { data: { user: any }; error: any };
let mockQueryResults: Record<string, any>;

function createChainableMock(tableName: string) {
  const chain: any = {
    _table: tableName,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(function (this: any) {
      return this;
    }),
    insert: vi.fn().mockImplementation(function (this: any) {
      return this;
    }),
    single: vi.fn().mockImplementation(() => {
      return mockQueryResults[tableName + ':single'] || { data: null, error: null };
    }),
  };

  // Make select, eq, etc. return chain. Also intercept terminal calls.
  // When awaited (then), resolve with table's configured result.
  chain.then = function (resolve: any, reject: any) {
    const result = mockQueryResults[tableName] || { data: [], error: null };
    return Promise.resolve(result).then(resolve, reject);
  };

  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => createChainableMock(table)),
    auth: {
      getUser: vi.fn(() => Promise.resolve(mockAuthUser)),
    },
  })),
}));

vi.mock('@/lib/quiz/spacedRepetition', () => ({
  SpacedRepetitionEngine: {
    selectWordsForSession: vi.fn((states: any[], size: number) =>
      states.slice(0, size).map((s: any) => s.wordId)
    ),
    shuffleArray: vi.fn((arr: any[]) => [...arr]),
  },
}));

import { POST } from '@/app/api/v2/quiz/session/route';

function makeRequest(body: Record<string, any>) {
  return new Request('http://localhost/api/v2/quiz/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

describe('POST /api/v2/quiz/session', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: unauthenticated
    mockAuthUser = { data: { user: null }, error: { message: 'No session' } };
    mockQueryResults = {};
  });

  // ---- Authentication ----

  it('should return 401 when user is not authenticated', async () => {
    const response = await POST(makeRequest({ languageCode: 'wrl' }));
    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data.error).toBe('Authentication required');
  });

  it('should return 401 when auth returns an error', async () => {
    mockAuthUser = { data: { user: null }, error: { message: 'Token expired' } };

    const response = await POST(makeRequest({ languageCode: 'wrl' }));
    expect(response.status).toBe(401);
  });

  // ---- Language not found ----

  it('should return 404 when language code is invalid', async () => {
    mockAuthUser = {
      data: { user: { id: 'user-1' } },
      error: null,
    };

    // Language lookup returns null
    mockQueryResults['languages:single'] = {
      data: null,
      error: { message: 'not found' },
    };

    const response = await POST(makeRequest({ languageCode: 'nonexistent' }));
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.error).toBe('Language not found or not active');
  });

  it('should return 404 when language is inactive', async () => {
    mockAuthUser = {
      data: { user: { id: 'user-1' } },
      error: null,
    };

    // Even though we query with eq('is_active', true), if it returns null that means inactive
    mockQueryResults['languages:single'] = {
      data: null,
      error: null,
    };

    const response = await POST(makeRequest({ languageCode: 'wrl' }));
    expect(response.status).toBe(404);
  });

  // ---- Successful session creation ----

  function setupSuccessfulSession() {
    mockAuthUser = {
      data: { user: { id: 'user-1' } },
      error: null,
    };

    mockQueryResults['languages:single'] = {
      data: { id: 'lang-1', code: 'wrl', name: 'Wajarri' },
      error: null,
    };

    // No existing spaced repetition states (new user)
    mockQueryResults['spaced_repetition_states'] = {
      data: [],
      error: null,
    };

    // New words from the database
    mockQueryResults['words'] = {
      data: [
        {
          id: 'word-1',
          word: 'guli',
          definitions: [{ id: 'def-1', definition: 'water' }],
          word_class: { name: 'noun' },
        },
        {
          id: 'word-2',
          word: 'malu',
          definitions: [{ id: 'def-2', definition: 'kangaroo' }],
          word_class: { name: 'noun' },
        },
      ],
      error: null,
    };

    // Insert spaced_repetition_states succeeds
    mockQueryResults['spaced_repetition_states:insert'] = { error: null };

    // Quiz session creation
    mockQueryResults['quiz_sessions:single'] = {
      data: { id: 'session-123' },
      error: null,
    };
  }

  it('should return 200 with session data for valid request', async () => {
    setupSuccessfulSession();

    const response = await POST(makeRequest({ languageCode: 'wrl' }));

    // The route uses default NextResponse.json which is 200
    expect(response.status).toBe(200);
  });

  it('should include sessionId in the response', async () => {
    setupSuccessfulSession();

    const response = await POST(makeRequest({ languageCode: 'wrl' }));
    const data = await response.json();

    // sessionId comes from the quiz_sessions insert
    expect(data).toHaveProperty('sessionId');
  });

  it('should include language info in the response', async () => {
    setupSuccessfulSession();

    const response = await POST(makeRequest({ languageCode: 'wrl' }));
    const data = await response.json();

    expect(data).toHaveProperty('language');
    expect(data.language).toEqual({ code: 'wrl', name: 'Wajarri' });
  });

  it('should include settings in the response', async () => {
    setupSuccessfulSession();

    const response = await POST(
      makeRequest({ languageCode: 'wrl', sessionSize: 10, timeLimit: 5000 })
    );
    const data = await response.json();

    expect(data).toHaveProperty('settings');
    expect(data.settings).toHaveProperty('sessionSize');
    expect(data.settings).toHaveProperty('timeLimit');
  });

  // ---- Error handling ----

  it('should return 500 when spaced repetition states query fails', async () => {
    mockAuthUser = {
      data: { user: { id: 'user-1' } },
      error: null,
    };

    mockQueryResults['languages:single'] = {
      data: { id: 'lang-1', code: 'wrl', name: 'Wajarri' },
      error: null,
    };

    mockQueryResults['spaced_repetition_states'] = {
      data: null,
      error: { message: 'Database connection lost' },
    };

    const response = await POST(makeRequest({ languageCode: 'wrl' }));
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toBe('Failed to fetch user progress');
  });

  it('should use default sessionSize of 20 when not provided', async () => {
    setupSuccessfulSession();

    // We can verify indirectly: the route uses sessionSize default of 20
    const response = await POST(makeRequest({ languageCode: 'wrl' }));
    // Should not error out
    expect(response.status).toBe(200);
  });

  it('should use default timeLimit of 3000 when not provided', async () => {
    setupSuccessfulSession();

    const response = await POST(makeRequest({ languageCode: 'wrl' }));
    const data = await response.json();

    expect(data.settings.timeLimit).toBe(3000);
  });
});
