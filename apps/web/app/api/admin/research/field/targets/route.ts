import { requireResearchAdminApi, researchJson } from '@/lib/research/access';
import { createTarget, listTargets } from '@/lib/research/field/store.server';
import { newTargetSchema } from '@/lib/research/field/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { response } = await requireResearchAdminApi();
  if (response) return response;
  return researchJson({ targets: await listTargets() });
}

export async function POST(request: Request) {
  const { user, response } = await requireResearchAdminApi();
  if (response) return response;
  const parsed = newTargetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return researchJson({ error: 'invalid_request', issues: parsed.error.issues }, 400);
  return researchJson({ target: await createTarget(parsed.data, user.id) }, 201);
}
