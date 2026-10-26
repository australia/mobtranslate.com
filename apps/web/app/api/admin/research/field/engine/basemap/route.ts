import { applyResearchHeaders, requireResearchAdminApi, researchJson } from '@/lib/research/access';
import { EngineUnavailableError, engineFetch } from '@/lib/research/field/engine.server';

export const dynamic = 'force-dynamic';

/** Hillshade basemap of the prototype area, drawn by the engine from its own layers. */
export async function GET() {
  const { response } = await requireResearchAdminApi();
  if (response) return response;
  try {
    const upstream = await engineFetch('/area/basemap.png');
    if (!upstream.ok) return researchJson({ error: 'not_ready' }, 404);
    const headers = applyResearchHeaders(new Headers({ 'content-type': 'image/png' }));
    headers.set('Cache-Control', 'private, max-age=3600');
    const bounds = upstream.headers.get('x-bounds');
    if (bounds) headers.set('x-bounds', bounds);
    return new Response(await upstream.arrayBuffer(), { headers });
  } catch (error) {
    if (error instanceof EngineUnavailableError) return researchJson({ error: 'engine_unavailable' }, 503);
    throw error;
  }
}
