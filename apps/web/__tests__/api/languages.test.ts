import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetActiveLanguages = vi.fn();

vi.mock('@/lib/supabase/queries', () => ({
  getActiveLanguages: (...args: any[]) => mockGetActiveLanguages(...args),
}));

import { GET } from '@/app/api/v2/languages/route';

describe('GET /api/v2/languages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockLanguages = [
    { id: '1', code: 'wrl', name: 'Wajarri', native_name: 'Wajarri', is_active: true },
    { id: '2', code: 'yij', name: 'Yindjibarndi', native_name: 'Yindjibarndi', is_active: true },
  ];

  it('should return languages as JSON on success', async () => {
    mockGetActiveLanguages.mockResolvedValue(mockLanguages);

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual(mockLanguages);
  });

  it('should return status 200 on success', async () => {
    mockGetActiveLanguages.mockResolvedValue(mockLanguages);

    const response = await GET();

    expect(response.status).toBe(200);
  });

  it('should call getActiveLanguages once', async () => {
    mockGetActiveLanguages.mockResolvedValue([]);

    await GET();

    expect(mockGetActiveLanguages).toHaveBeenCalledTimes(1);
  });

  it('should set Cache-Control header with s-maxage=3600', async () => {
    mockGetActiveLanguages.mockResolvedValue(mockLanguages);

    const response = await GET();
    const cacheControl = response.headers.get('Cache-Control');

    expect(cacheControl).toContain('s-maxage=3600');
  });

  it('should set Cache-Control header with stale-while-revalidate=7200', async () => {
    mockGetActiveLanguages.mockResolvedValue(mockLanguages);

    const response = await GET();
    const cacheControl = response.headers.get('Cache-Control');

    expect(cacheControl).toContain('stale-while-revalidate=7200');
  });

  it('should set Cache-Control header as public', async () => {
    mockGetActiveLanguages.mockResolvedValue(mockLanguages);

    const response = await GET();
    const cacheControl = response.headers.get('Cache-Control');

    expect(cacheControl).toContain('public');
  });

  it('should return 500 when getActiveLanguages throws', async () => {
    mockGetActiveLanguages.mockRejectedValue(new Error('Database error'));

    const response = await GET();

    expect(response.status).toBe(500);
  });

  it('should return error message when getActiveLanguages throws', async () => {
    mockGetActiveLanguages.mockRejectedValue(new Error('Database error'));

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({ error: 'Failed to fetch languages' });
  });

  it('should return an empty array when no languages exist', async () => {
    mockGetActiveLanguages.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual([]);
    expect(response.status).toBe(200);
  });

  it('should return a single language when only one exists', async () => {
    mockGetActiveLanguages.mockResolvedValue([mockLanguages[0]]);

    const response = await GET();
    const data = await response.json();

    expect(data).toHaveLength(1);
    expect(data[0].code).toBe('wrl');
  });

  it('should handle non-Error exceptions gracefully', async () => {
    mockGetActiveLanguages.mockRejectedValue('unexpected string error');

    const response = await GET();

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Failed to fetch languages');
  });
});
