import { requireResearchAdminApi, researchJson } from '@/lib/research/access';
import { getTarget, listObservations, recordObservations } from '@/lib/research/field/store.server';
import { observationBatchSchema, targetIdPattern } from '@/lib/research/field/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { response } = await requireResearchAdminApi();
  if (response) return response;
  const targetId = new URL(request.url).searchParams.get('targetId') ?? undefined;
  if (targetId !== undefined && !targetIdPattern.test(targetId)) return researchJson({ error: 'invalid_request' }, 400);
  return researchJson({ observations: await listObservations(targetId, 500) });
}

/** Upload observations queued on the phone. Safe to retry: client ids are unique. */
export async function POST(request: Request) {
  const { user, response } = await requireResearchAdminApi();
  if (response) return response;
  const parsed = observationBatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return researchJson({ error: 'invalid_request', issues: parsed.error.issues }, 400);
  const targetIds = [...new Set(parsed.data.observations.map((o) => o.targetId))];
  for (const id of targetIds) {
    if (!(await getTarget(id))) return researchJson({ error: 'unknown_target', targetId: id }, 400);
  }
  return researchJson({ observations: await recordObservations(parsed.data.observations, user.id) });
}
