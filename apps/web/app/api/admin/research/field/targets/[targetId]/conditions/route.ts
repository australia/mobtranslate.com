import { requireResearchAdminApi, researchJson } from '@/lib/research/access';
import { fitTargetConditions } from '@/lib/research/field/conditions.server';
import { getTarget } from '@/lib/research/field/store.server';
import { targetIdPattern } from '@/lib/research/field/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Context = { params: Promise<{ targetId: string }> };

/** When and with what bait this animal has been caught: fitted fresh from every fishing log. */
export async function GET(_request: Request, { params }: Context) {
  const { response } = await requireResearchAdminApi();
  if (response) return response;
  const { targetId } = await params;
  const target = targetIdPattern.test(targetId) ? await getTarget(targetId) : null;
  if (!target || target.activity !== 'fish') return researchJson({ error: 'not_found' }, 404);
  return researchJson(await fitTargetConditions(targetId));
}
