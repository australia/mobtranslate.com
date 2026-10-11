import { NextRequest } from 'next/server';
import { loadAtomicDictionary } from '@/lib/dictionary-atomic.server';
import {
  buildGlossIndex,
  glossText,
  MAX_GLOSS_CHARS,
  type GlossIndex,
} from '@/lib/dictionary-gloss';
import {
  corsHeaders,
  createErrorResponse,
  createSuccessResponse,
} from '../../middleware';

/**
 * GET /api/v2/public/gloss?q=<text>&dictionary_code=<code>
 *
 * Word-by-word, source-backed lookup of a phrase. Each word is answered only
 * from dictionary records; a word with no record is returned as missing so the
 * caller can show the gap instead of a guess.
 */

const indexCache = new Map<string, { revision: string; index: GlossIndex }>();

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = (searchParams.get('q') || '').trim();
    const code = (searchParams.get('dictionary_code') || '').trim();
    if (!query) return createErrorResponse('Query text is required', 400);
    if (query.length > MAX_GLOSS_CHARS)
      return createErrorResponse(
        `Query text must be ${MAX_GLOSS_CHARS} characters or fewer`,
        400,
      );
    if (!code) return createErrorResponse('dictionary_code is required', 400);

    const dictionary = await loadAtomicDictionary(code);
    if (!dictionary) return createErrorResponse('Unknown dictionary', 404);

    let cached = indexCache.get(code);
    if (!cached || cached.revision !== dictionary.revision) {
      cached = {
        revision: dictionary.revision,
        index: buildGlossIndex(dictionary.entries),
      };
      indexCache.set(code, cached);
    }

    const result = glossText(query, cached.index);
    return createSuccessResponse({
      dictionary: {
        code: dictionary.code,
        name: dictionary.name,
        headwords: dictionary.headwordCount,
        revision: dictionary.revision.slice(0, 12),
      },
      query,
      ...result,
    });
  } catch (error) {
    console.error('Gloss lookup failed', error);
    return createErrorResponse('Gloss lookup failed', 500);
  }
}
