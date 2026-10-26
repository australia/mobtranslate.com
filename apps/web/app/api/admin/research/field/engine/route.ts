import { z } from 'zod';
import { requireResearchAdminApi, researchJson } from '@/lib/research/access';
import { EngineUnavailableError, engineHealth, engineJson } from '@/lib/research/field/engine.server';

export const dynamic = 'force-dynamic';

type Registry = {
  registry: {
    regionalGrid: { bounds: { west: number; south: number; east: number; north: number } };
    features: Array<{ id: string; title: string; group: string; unit: string; scale: string }>;
  };
};

export async function GET() {
  const { response } = await requireResearchAdminApi();
  if (response) return response;
  const health = await engineHealth();
  if (!health) return researchJson({ available: false });
  try {
    const { body } = await engineJson<Registry>('/registry');
    return researchJson({ available: true, health, regionalBounds: body.registry.regionalGrid.bounds, features: body.registry.features });
  } catch {
    return researchJson({ available: true, health, features: [] });
  }
}

const actionSchema = z.object({ action: z.enum(['build-area', 'build-regional']) });

export async function POST(request: Request) {
  const { response } = await requireResearchAdminApi();
  if (response) return response;
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return researchJson({ error: 'invalid_request' }, 400);
  try {
    const path = parsed.data.action === 'build-area' ? '/area/build' : '/regional/build';
    const { status, body } = await engineJson(path, { method: 'POST' });
    return researchJson(body, status);
  } catch (error) {
    if (error instanceof EngineUnavailableError) return researchJson({ error: 'engine_unavailable' }, 503);
    throw error;
  }
}
