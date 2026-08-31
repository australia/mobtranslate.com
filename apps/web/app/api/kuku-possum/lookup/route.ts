import { z } from 'zod';

const SPACE_ORIGIN =
  process.env.MOBTRANSLATE_KUKU_POSSUM_LEXICAL_ENDPOINT ??
  'https://ajaxdavis-mobtranslate-kuku-possum-candidate-lex-3a055ae.hf.space';

const requestSchema = z.object({
  query: z.string().trim().min(1).max(400),
  variety: z.enum(['all', 'alungul-y199', 'olgol-y73', 'gugu-yawa-y74']),
  top_k: z.number().int().min(1).max(20).default(8),
}).strict();

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid lexical lookup request.', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(`${SPACE_ORIGIN}/v1/lookup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    const body: unknown = await upstream.json();
    if (!upstream.ok) {
      return Response.json(
        { error: 'The candidate lexical service rejected the request.', upstream: body },
        { status: 502 },
      );
    }
    return Response.json(body, {
      headers: {
        'Cache-Control': 'no-store',
        'X-MobTranslate-Capability': 'candidate-lexical-retrieval-research-only',
      },
    });
  } catch {
    return Response.json(
      {
        error: 'The Kuku Possum candidate lexical service is temporarily unavailable.',
        route: 'abstention',
        matches: [],
      },
      { status: 503 },
    );
  }
}

