import { z } from 'zod';

const KeySchema = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/u);

export const GoogleBooksSnippetWitnessContractSchema = z.object({
  schema_version: z.literal(1),
  acquisition_id: KeySchema,
  source_id: KeySchema,
  created_at_utc: z.string().datetime(),
  volume: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    landing_url: z.string().url(),
  }),
  endpoint: z.string().url(),
  printed_page_scope: z.object({
    first: z.number().int().positive(),
    last: z.number().int().positive(),
  }),
  queries: z
    .array(
      z.object({
        query_id: KeySchema,
        query: z.string().min(1),
      }),
    )
    .min(1),
  expected: z.object({
    query_count: z.number().int().positive(),
    minimum_scoped_hits: z.number().int().positive(),
    required_printed_pages: z.array(z.number().int().positive()).min(1),
  }),
  rights: z.object({
    license: z.string().min(1),
    training_use: z.literal('not_allowed'),
    redistribution: z.literal('not_allowed'),
    derived_weights: z.literal('not_allowed'),
    hosted_transfer: z.literal('not_allowed'),
  }),
  claim_limit: z.string().min(1),
});

export type GoogleBooksSnippetWitnessContract = z.infer<
  typeof GoogleBooksSnippetWitnessContractSchema
>;

const SearchResultSchema = z.object({
  page_id: z.string().min(1),
  page_number: z.string().min(1),
  snippet_text: z.string().min(1),
  page_url: z.string().url().optional(),
});

const SearchResponseSchema = z.object({
  number_of_results: z.number().int().nonnegative(),
  search_results: z.array(SearchResultSchema).optional(),
  search_query_escaped: z.string().optional(),
  searchable: z.boolean().optional(),
});

export interface SnippetQueryResponse {
  queryId: string;
  query: string;
  response: unknown;
}

export interface GoogleBooksSnippetWitnessResult {
  queryRows: Array<Record<string, unknown>>;
  scopedHits: Array<Record<string, unknown>>;
  pageWitnesses: Map<number, string>;
  counts: {
    queries: number;
    reportedHits: number;
    scopedHits: number;
    uniqueScopedSnippets: number;
    scopedPrintedPages: number;
  };
}

function printedPage(pageId: string, pageNumber: string): number | null {
  const idMatch = /^PA([0-9]+)$/u.exec(pageId);
  if (!idMatch) return null;
  const idPage = Number(idMatch[1]);
  if (!Number.isSafeInteger(idPage) || idPage <= 0) return null;
  if (!/^[0-9]+$/u.test(pageNumber)) return null;
  const printed = Number(pageNumber);
  if (printed !== idPage) return null;
  return printed;
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function buildGoogleBooksSnippetWitness(
  contractValue: unknown,
  responses: SnippetQueryResponse[],
): GoogleBooksSnippetWitnessResult {
  const contract = GoogleBooksSnippetWitnessContractSchema.parse(contractValue);
  if (contract.printed_page_scope.first > contract.printed_page_scope.last)
    throw new Error('printed page scope is reversed');
  if (contract.queries.length !== contract.expected.query_count)
    throw new Error('query count does not match contract');
  assertUnique(
    contract.queries.map((row) => row.query_id),
    'query ID',
  );
  if (responses.length !== contract.queries.length)
    throw new Error('response count does not match query count');

  const responseById = new Map(responses.map((row) => [row.queryId, row]));
  if (responseById.size !== responses.length)
    throw new Error('duplicate query response');

  const queryRows: Array<Record<string, unknown>> = [];
  const scopedHits: Array<Record<string, unknown>> = [];
  let reportedHits = 0;
  for (const query of contract.queries) {
    const supplied = responseById.get(query.query_id);
    if (!supplied) throw new Error(`missing query response: ${query.query_id}`);
    if (supplied.query !== query.query)
      throw new Error(`query text mismatch: ${query.query_id}`);
    const response = SearchResponseSchema.parse(supplied.response);
    const results = response.search_results ?? [];
    if (response.number_of_results !== results.length)
      throw new Error(`reported result count mismatch: ${query.query_id}`);
    reportedHits += response.number_of_results;
    let scopedCount = 0;
    for (const result of results) {
      const page = printedPage(result.page_id, result.page_number);
      if (
        page === null ||
        page < contract.printed_page_scope.first ||
        page > contract.printed_page_scope.last
      )
        continue;
      scopedCount += 1;
      scopedHits.push({
        schemaVersion: 1,
        sourceId: contract.source_id,
        acquisitionId: contract.acquisition_id,
        queryId: query.query_id,
        query: query.query,
        pageId: result.page_id,
        printedPage: page,
        snippetText: result.snippet_text,
        ...(result.page_url ? { pageUrl: result.page_url } : {}),
        evidenceStatus: 'publisher_public_search_snippet',
        acceptanceStatus: 'not_accepted',
        trainingEligibility: 'not_allowed',
        benchmarkEligibility: 'not_allowed',
        syntheticEligibility: 'not_allowed',
      });
    }
    queryRows.push({
      schemaVersion: 1,
      queryId: query.query_id,
      query: query.query,
      reportedResults: response.number_of_results,
      scopedResults: scopedCount,
      searchable: response.searchable ?? true,
    });
  }

  if (scopedHits.length < contract.expected.minimum_scoped_hits)
    throw new Error('scoped snippet count is below contract minimum');
  const pages = new Set(
    scopedHits.map((row) => z.number().int().parse(row.printedPage)),
  );
  for (const page of contract.expected.required_printed_pages)
    if (!pages.has(page)) throw new Error(`required printed page is absent: ${page}`);

  const uniqueByPageAndText = new Map<string, Record<string, unknown>>();
  for (const row of scopedHits) {
    const key = `${String(row.printedPage)}\u0000${String(row.snippetText)}`;
    if (!uniqueByPageAndText.has(key)) uniqueByPageAndText.set(key, row);
  }
  const grouped = new Map<number, Array<Record<string, unknown>>>();
  for (const row of uniqueByPageAndText.values()) {
    const page = z.number().int().parse(row.printedPage);
    grouped.set(page, [...(grouped.get(page) ?? []), row]);
  }
  const pageWitnesses = new Map<number, string>();
  for (const [page, rows] of [...grouped].sort(([left], [right]) => left - right)) {
    const lines = [
      `Google Books public snippet witness for ${contract.volume.title}`,
      `Volume ID: ${contract.volume.id}`,
      `Printed page: ${page}`,
      'Access scope: public search snippets only; surrounding chapter text was not available.',
      '',
    ];
    for (const [index, row] of rows.entries())
      lines.push(
        `Witness ${String(index + 1).padStart(2, '0')}`,
        `Query ID: ${String(row.queryId)}`,
        `Query: ${String(row.query)}`,
        `Snippet: ${String(row.snippetText)}`,
        '',
      );
    pageWitnesses.set(page, `${lines.join('\n')}\n`);
  }

  return {
    queryRows,
    scopedHits,
    pageWitnesses,
    counts: {
      queries: contract.queries.length,
      reportedHits,
      scopedHits: scopedHits.length,
      uniqueScopedSnippets: uniqueByPageAndText.size,
      scopedPrintedPages: pageWitnesses.size,
    },
  };
}
