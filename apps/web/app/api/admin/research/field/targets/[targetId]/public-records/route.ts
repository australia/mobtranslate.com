import { requireResearchAdminApi, researchJson } from '@/lib/research/access';
import { fetchAlaRecords } from '@/lib/research/field/ala.server';
import { EngineUnavailableError, engineJson } from '@/lib/research/field/engine.server';
import { getTarget, listPublicRecords, replacePublicRecords } from '@/lib/research/field/store.server';
import { targetIdPattern, type Bounds } from '@/lib/research/field/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Context = { params: Promise<{ targetId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { response } = await requireResearchAdminApi();
  if (response) return response;
  const { targetId } = await params;
  if (!targetIdPattern.test(targetId)) return researchJson({ error: 'not_found' }, 404);
  return researchJson({ records: await listPublicRecords(targetId) });
}

/** Refresh the target's public records from the Atlas of Living Australia. */
export async function POST(_request: Request, { params }: Context) {
  const { response } = await requireResearchAdminApi();
  if (response) return response;
  const { targetId } = await params;
  const target = targetIdPattern.test(targetId) ? await getTarget(targetId) : null;
  if (!target) return researchJson({ error: 'not_found' }, 404);
  if (target.scientificNames.length === 0) return researchJson({ error: 'no_scientific_names' }, 400);
  let bounds: Bounds;
  try {
    const { body } = await engineJson<{ registry: { regionalGrid: { bounds: Bounds } } }>('/registry');
    bounds = body.registry.regionalGrid.bounds;
  } catch (error) {
    if (error instanceof EngineUnavailableError) return researchJson({ error: 'engine_unavailable' }, 503);
    throw error;
  }
  try {
    const records = await fetchAlaRecords(target.scientificNames, bounds);
    const stored = await replacePublicRecords(targetId, records);
    return researchJson({ stored });
  } catch (error) {
    return researchJson({ error: 'ala_unavailable', detail: error instanceof Error ? error.message : String(error) }, 502);
  }
}
