import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original env
const originalEnv = { ...process.env };

describe('GET /api/version', () => {
  beforeEach(() => {
    vi.resetModules();
    // Clear all VERCEL_ env vars before each test
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.VERCEL_GIT_COMMIT_MESSAGE;
    delete process.env.VERCEL_GIT_COMMIT_REF;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_GIT_COMMIT_AUTHOR_DATE;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  async function callGET() {
    const { GET } = await import('@/app/api/version/route');
    return GET();
  }

  it('should return a JSON response', async () => {
    const response = await callGET();
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('should return status 200', async () => {
    const response = await callGET();
    expect(response.status).toBe(200);
  });

  it('should return all expected fields', async () => {
    const response = await callGET();
    const data = await response.json();

    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('sha');
    expect(data).toHaveProperty('message');
    expect(data).toHaveProperty('branch');
    expect(data).toHaveProperty('environment');
    expect(data).toHaveProperty('deployedAt');
  });

  it('should return default values when env vars are not set', async () => {
    const response = await callGET();
    const data = await response.json();

    expect(data.version).toBe('dev');
    expect(data.sha).toBe('local');
    expect(data.message).toBe('');
    expect(data.branch).toBe('local');
    expect(data.environment).toBe('development');
  });

  it('should return an ISO date string for deployedAt when env var is not set', async () => {
    const response = await callGET();
    const data = await response.json();

    // Should be a valid ISO date string
    const parsed = new Date(data.deployedAt);
    expect(parsed.getTime()).not.toBeNaN();
  });

  it('should use VERCEL_GIT_COMMIT_SHA for version (first 7 chars) and sha', async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = 'abc1234567890def';

    const response = await callGET();
    const data = await response.json();

    expect(data.version).toBe('abc1234');
    expect(data.sha).toBe('abc1234567890def');
  });

  it('should use VERCEL_GIT_COMMIT_MESSAGE for message', async () => {
    process.env.VERCEL_GIT_COMMIT_MESSAGE = 'fix: something important';

    const response = await callGET();
    const data = await response.json();

    expect(data.message).toBe('fix: something important');
  });

  it('should use VERCEL_GIT_COMMIT_REF for branch', async () => {
    process.env.VERCEL_GIT_COMMIT_REF = 'feature/new-thing';

    const response = await callGET();
    const data = await response.json();

    expect(data.branch).toBe('feature/new-thing');
  });

  it('should use VERCEL_ENV for environment', async () => {
    process.env.VERCEL_ENV = 'production';

    const response = await callGET();
    const data = await response.json();

    expect(data.environment).toBe('production');
  });

  it('should use VERCEL_GIT_COMMIT_AUTHOR_DATE for deployedAt', async () => {
    process.env.VERCEL_GIT_COMMIT_AUTHOR_DATE = '2025-01-15T10:30:00Z';

    const response = await callGET();
    const data = await response.json();

    expect(data.deployedAt).toBe('2025-01-15T10:30:00Z');
  });

  it('should return all env values when all are set', async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = 'deadbeef12345678';
    process.env.VERCEL_GIT_COMMIT_MESSAGE = 'deploy: release v2';
    process.env.VERCEL_GIT_COMMIT_REF = 'main';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_GIT_COMMIT_AUTHOR_DATE = '2025-06-01T00:00:00Z';

    const response = await callGET();
    const data = await response.json();

    expect(data).toEqual({
      version: 'deadbee',
      sha: 'deadbeef12345678',
      message: 'deploy: release v2',
      branch: 'main',
      environment: 'preview',
      deployedAt: '2025-06-01T00:00:00Z',
    });
  });
});
