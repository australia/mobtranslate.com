import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { POST } from '../app/api/kuku-possum/lookup/route';

function request(payload: unknown) {
  return new Request('https://mobtranslate.com/api/kuku-possum/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

const originalFetch = globalThis.fetch;

async function main() {
 try {
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return Response.json({
      success: true,
      capability: 'closed_set_candidate_lexical_retrieval_research_only',
      matches: [{ target_form_source: 'abm', variety: 'olgol-y73' }],
    });
  };

  const success = await POST(request({ query: 'person', variety: 'olgol-y73', top_k: 8 }));
  assert.equal(success.status, 200);
  assert.equal(upstreamCalls, 1);
  assert.equal(
    success.headers.get('x-mobtranslate-capability'),
    'candidate-lexical-retrieval-research-only',
  );

  const invalid = await POST(request({ query: 'person', variety: 'generic', top_k: 8 }));
  assert.equal(invalid.status, 400);
  assert.equal(upstreamCalls, 1);

  globalThis.fetch = async () => {
    throw new Error('offline');
  };
  const unavailable = await POST(request({ query: 'person', variety: 'all', top_k: 8 }));
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {
    error: 'The Kuku Possum candidate lexical service is temporarily unavailable.',
    route: 'abstention',
    matches: [],
  });

  const clientSource = await readFile(
    new URL('../app/labs/kuku-possum/KukuPossumLexicalClient.tsx', import.meta.url),
    'utf8',
  );
  assert.match(clientSource, /Experimental candidate evidence.not sentence translation/s);
  assert.match(clientSource, /No generic multilingual fallback/);
  assert.match(clientSource, /mobtranslate-kuku-possum-candidate-lexical-v1/);

  console.log('Kuku Possum lexical release verification passed.');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void main();
