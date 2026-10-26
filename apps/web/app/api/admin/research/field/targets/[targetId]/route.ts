import { requireResearchAdminApi, researchJson } from '@/lib/research/access';
import { getTarget, listModels, listObservations, updateTarget } from '@/lib/research/field/store.server';
import { newTargetSchema, targetIdPattern } from '@/lib/research/field/types';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ targetId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { response } = await requireResearchAdminApi();
  if (response) return response;
  const { targetId } = await params;
  if (!targetIdPattern.test(targetId)) return researchJson({ error: 'not_found' }, 404);
  const target = await getTarget(targetId);
  if (!target) return researchJson({ error: 'not_found' }, 404);
  const [observations, models] = await Promise.all([listObservations(targetId), listModels(targetId)]);
  return researchJson({ target, observations, models });
}

export async function PATCH(request: Request, { params }: Context) {
  const { response } = await requireResearchAdminApi();
  if (response) return response;
  const { targetId } = await params;
  if (!targetIdPattern.test(targetId) || !(await getTarget(targetId))) return researchJson({ error: 'not_found' }, 404);
  const parsed = newTargetSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return researchJson({ error: 'invalid_request', issues: parsed.error.issues }, 400);
  await updateTarget(targetId, parsed.data);
  return researchJson({ target: await getTarget(targetId) });
}
