// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('client analytics configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    delete window.gtag;
  });

  it('does not install a project-wide tracker when the deployment has no id', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_ID', '');
    const { GA_ID } = await import('@/lib/analytics');

    expect(GA_ID).toBe('');
  });

  it('uses and normalizes an explicitly configured analytics id', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_ID', '  G-TEST123  ');
    const { GA_ID } = await import('@/lib/analytics');

    expect(GA_ID).toBe('G-TEST123');
  });

  it('keeps product event calls inert when analytics is disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_ID', '');
    const { track, trackPageview } = await import('@/lib/analytics');

    expect(() => track('dictionary_search', { query_length: 5 })).not.toThrow();
    expect(() => trackPageview('/dictionaries')).not.toThrow();
    expect(window.gtag).toBeUndefined();
  });
});
