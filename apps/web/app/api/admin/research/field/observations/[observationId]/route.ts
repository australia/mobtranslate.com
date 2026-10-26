import { requireResearchAdminApi, researchJson } from '@/lib/research/access';
import { deleteObservation } from '@/lib/research/field/store.server';

export const dynamic = 'force-dynamic';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function DELETE(_request: Request, { params }: { params: Promise<{ observationId: string }> }) {
  const { response } = await requireResearchAdminApi();
  if (response) return response;
  const { observationId } = await params;
  if (!uuid.test(observationId) || !(await deleteObservation(observationId))) return researchJson({ error: 'not_found' }, 404);
  return researchJson({ deleted: true });
}
