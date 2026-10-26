import { z } from 'zod';
import { requireResearchAdminApi, researchJson } from '@/lib/research/access';
import { EngineUnavailableError, engineJson } from '@/lib/research/field/engine.server';
import { modelBelongsTo } from '@/lib/research/field/store.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const windowSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  radiusM: z.number().min(300).max(4000).default(2000),
});

/** Where to look around a point: a map window and ranked spots with distance and bearing. */
export async function POST(request: Request, { params }: { params: Promise<{ modelId: string }> }) {
  const { response } = await requireResearchAdminApi();
  if (response) return response;
  const { modelId } = await params;
  if (!/^[a-z0-9-]+$/.test(modelId) || !(await modelBelongsTo(modelId))) return researchJson({ error: 'not_found' }, 404);
  const parsed = windowSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return researchJson({ error: 'invalid_request' }, 400);
  try {
    const { status, body } = await engineJson(`/models/${modelId}/window`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data),
      timeoutMs: 110_000,
    });
    return researchJson(body, status);
  } catch (error) {
    if (error instanceof EngineUnavailableError) return researchJson({ error: 'engine_unavailable' }, 503);
    throw error;
  }
}
