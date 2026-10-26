import { applyResearchHeaders, requireResearchAdminApi, researchJson } from '@/lib/research/access';
import { EngineUnavailableError, engineFetch } from '@/lib/research/field/engine.server';
import { modelBelongsTo } from '@/lib/research/field/store.server';

export const dynamic = 'force-dynamic';

const assets = {
  'area.png': { path: 'area.png', type: 'image/png' },
  'regional.png': { path: 'regional.png', type: 'image/png' },
  'area-spots': { path: 'area-spots', type: 'application/json' },
} as const;

/** Maps and the offline spot list for a recorded model. */
export async function GET(_request: Request, { params }: { params: Promise<{ modelId: string; asset: string }> }) {
  const { response } = await requireResearchAdminApi();
  if (response) return response;
  const { modelId, asset } = await params;
  const spec = assets[asset as keyof typeof assets];
  if (!spec || !/^[a-z0-9-]+$/.test(modelId) || !(await modelBelongsTo(modelId))) return researchJson({ error: 'not_found' }, 404);
  try {
    const upstream = await engineFetch(`/models/${modelId}/${spec.path}`);
    if (!upstream.ok) return researchJson({ error: 'not_found' }, 404);
    const headers = applyResearchHeaders(new Headers({ 'content-type': spec.type }));
    // Model artefacts never change once written.
    headers.set('Cache-Control', 'private, max-age=31536000, immutable');
    const bounds = upstream.headers.get('x-bounds');
    if (bounds) headers.set('x-bounds', bounds);
    return new Response(await upstream.arrayBuffer(), { headers });
  } catch (error) {
    if (error instanceof EngineUnavailableError) return researchJson({ error: 'engine_unavailable' }, 503);
    throw error;
  }
}
