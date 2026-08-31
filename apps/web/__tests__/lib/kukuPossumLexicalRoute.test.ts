import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../../app/api/kuku-possum/lookup/route';

afterEach(() => {
  vi.unstubAllGlobals();
});

function request(payload: unknown) {
  return new Request('https://mobtranslate.com/api/kuku-possum/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('Kuku Possum candidate lexical proxy', () => {
  it('passes a bounded, variety-labelled lookup to the pinned Space route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        success: true,
        capability: 'closed_set_candidate_lexical_retrieval_research_only',
        matches: [{ target_form_source: 'abm', variety: 'olgol-y73' }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request({ query: 'person', variety: 'olgol-y73', top_k: 8 }));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-mobtranslate-capability')).toBe(
      'candidate-lexical-retrieval-research-only',
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/v1/lookup');
    expect(JSON.parse(init.body)).toEqual({ query: 'person', variety: 'olgol-y73', top_k: 8 });
  });

  it('rejects an unlabelled or unsupported variety before inference', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request({ query: 'person', variety: 'generic' }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when the Space is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const response = await POST(request({ query: 'person', variety: 'all', top_k: 8 }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ route: 'abstention', matches: [] });
  });
});

