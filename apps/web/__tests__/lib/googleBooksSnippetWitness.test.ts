import { buildGoogleBooksSnippetWitness } from '@/lib/research/googleBooksSnippetWitness';

function fixture() {
  const contract = {
    schema_version: 1,
    acquisition_id: 'wajarri-google-books-test',
    source_id: 'src-wbv-google-books-test',
    created_at_utc: '2026-07-23T00:00:00.000Z',
    volume: {
      id: 'volume-1',
      title: 'Wajarri chapter',
      landing_url: 'https://books.example/volume-1',
    },
    endpoint: 'https://books.example/search',
    printed_page_scope: { first: 933, last: 949 },
    queries: [{ query_id: 'verbs', query: 'Wajarri verbs' }],
    expected: {
      query_count: 1,
      minimum_scoped_hits: 1,
      required_printed_pages: [942],
    },
    rights: {
      license: 'all rights reserved',
      training_use: 'not_allowed',
      redistribution: 'not_allowed',
      derived_weights: 'not_allowed',
      hosted_transfer: 'not_allowed',
    },
    claim_limit: 'Snippet evidence only.',
  };
  const responses = [
    {
      queryId: 'verbs',
      query: 'Wajarri verbs',
      response: {
        number_of_results: 2,
        search_results: [
          {
            page_id: 'PA942',
            page_number: '942',
            snippet_text: 'Wajarri verbs have two open classes.',
          },
          {
            page_id: 'PA100',
            page_number: '100',
            snippet_text: 'An unrelated chapter.',
          },
        ],
      },
    },
  ];
  return { contract, responses };
}

describe('Google Books snippet witness', () => {
  it('retains only scoped numeric page witnesses', () => {
    const { contract, responses } = fixture();
    const result = buildGoogleBooksSnippetWitness(contract, responses);

    expect(result.counts).toEqual({
      queries: 1,
      reportedHits: 2,
      scopedHits: 1,
      uniqueScopedSnippets: 1,
      scopedPrintedPages: 1,
    });
    expect(result.pageWitnesses.get(942)).toContain(
      'Wajarri verbs have two open classes.',
    );
  });

  it('rejects a response bound to the wrong query text', () => {
    const { contract, responses } = fixture();
    responses[0].query = 'different query';

    expect(() => buildGoogleBooksSnippetWitness(contract, responses)).toThrow(
      'query text mismatch',
    );
  });

  it('rejects a missing required printed page', () => {
    const { contract, responses } = fixture();
    contract.expected.required_printed_pages = [943];

    expect(() => buildGoogleBooksSnippetWitness(contract, responses)).toThrow(
      'required printed page is absent: 943',
    );
  });
});
