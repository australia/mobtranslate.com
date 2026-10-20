import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original env
const originalEnv = { ...process.env };

describe('GET /api/version', () => {
  beforeEach(() => {
    vi.resetModules();
    // Clear all release metadata env vars before each test
    delete process.env.MOBTRANSLATE_RELEASE_ID;
    delete process.env.MOBTRANSLATE_SOURCE_SHA256;
    delete process.env.MOBTRANSLATE_GIT_COMMIT;
    delete process.env.MOBTRANSLATE_DEPLOYED_AT;
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
    expect(data).toHaveProperty('release');
    expect(data).toHaveProperty('sourceSha256');
    expect(data).toHaveProperty('sha');
    expect(data).toHaveProperty('environment');
    expect(data).toHaveProperty('deployedAt');
  });

  it('should return default values when env vars are not set', async () => {
    const response = await callGET();
    const data = await response.json();

    expect(data.version).toBe('dev');
    expect(data.release).toBeNull();
    expect(data.sourceSha256).toBeNull();
    expect(data.sha).toBe('local');
    expect(data.environment).toBe(process.env.NODE_ENV || 'development');
  });

  it('should not invent a deployment date when no deployment metadata exists', async () => {
    const response = await callGET();
    const data = await response.json();

    expect(data.deployedAt).toBeNull();
  });

  it('should use MOBTRANSLATE_GIT_COMMIT for sha', async () => {
    process.env.MOBTRANSLATE_GIT_COMMIT = 'abc1234567890def';

    const response = await callGET();
    const data = await response.json();

    expect(data.sha).toBe('abc1234567890def');
  });

  it('should prefer immutable release metadata and disable caching', async () => {
    process.env.MOBTRANSLATE_RELEASE_ID = '20260719T120000Z-abc1234';
    process.env.MOBTRANSLATE_SOURCE_SHA256 = 'a'.repeat(64);
    process.env.MOBTRANSLATE_DEPLOYED_AT = '2026-07-19T12:00:00Z';

    const response = await callGET();
    const data = await response.json();

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(data.version).toBe('20260719T120000Z-abc1234');
    expect(data.release).toBe('20260719T120000Z-abc1234');
    expect(data.sourceSha256).toBe('a'.repeat(64));
    expect(data.deployedAt).toBe('2026-07-19T12:00:00Z');
  });

  it('should return all env values when all are set', async () => {
    process.env.MOBTRANSLATE_RELEASE_ID = '20260601T000000Z-deadbeef1234';
    process.env.MOBTRANSLATE_SOURCE_SHA256 = 'b'.repeat(64);
    process.env.MOBTRANSLATE_GIT_COMMIT = 'deadbeef12345678';
    process.env.MOBTRANSLATE_DEPLOYED_AT = '2026-06-01T00:00:00Z';

    const response = await callGET();
    const data = await response.json();

    expect(data).toEqual({
      version: '20260601T000000Z-deadbeef1234',
      release: '20260601T000000Z-deadbeef1234',
      sourceSha256: 'b'.repeat(64),
      sha: 'deadbeef12345678',
      environment: process.env.NODE_ENV || 'development',
      deployedAt: '2026-06-01T00:00:00Z',
    });
  });
});
