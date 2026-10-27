import { requireResearchAdminApi, researchJson } from '@/lib/research/access';
import { conditionsFeed } from '@/lib/research/field/conditions.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Weather and river level for the area: the last eight days and the week ahead. */
export async function GET() {
  const { response } = await requireResearchAdminApi();
  if (response) return response;
  return researchJson(await conditionsFeed());
}
