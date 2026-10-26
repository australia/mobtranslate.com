import { requireResearchAdminApi, researchJson } from '@/lib/research/access';
import { EngineUnavailableError, engineJson } from '@/lib/research/field/engine.server';
import { recordModel } from '@/lib/research/field/store.server';
import type { EngineJob, ModelCard } from '@/lib/research/field/types';

export const dynamic = 'force-dynamic';

/** Job progress. A finished fit is recorded against its target the first time it is seen. */
export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { user, response } = await requireResearchAdminApi();
  if (response) return response;
  const { jobId } = await params;
  if (!/^[a-z]+-[0-9]{1,13}$/.test(jobId)) return researchJson({ error: 'not_found' }, 404);
  try {
    const { status, body } = await engineJson<EngineJob & { result?: unknown }>(`/jobs/${jobId}`);
    if (status !== 200) return researchJson(body, status);
    if (body.kind === 'fit' && body.state === 'done' && body.result) await recordModel(body.result as ModelCard, user.id);
    return researchJson(body);
  } catch (error) {
    if (error instanceof EngineUnavailableError) return researchJson({ error: 'engine_unavailable' }, 503);
    throw error;
  }
}
