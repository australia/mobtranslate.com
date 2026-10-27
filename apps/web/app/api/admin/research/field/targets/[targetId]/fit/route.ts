import { z } from 'zod';
import { requireResearchAdminApi, researchJson } from '@/lib/research/access';
import { EngineUnavailableError, engineJson } from '@/lib/research/field/engine.server';
import { getTarget, listObservations, listPublicRecords } from '@/lib/research/field/store.server';
import { targetIdPattern } from '@/lib/research/field/types';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ targetId: string }> };

const optionsSchema = z.object({
  usePublicRecords: z.boolean().default(true),
  fieldWeight: z.number().min(1).max(100).default(5),
});

/** Send the target's finds (and, unless switched off, its public records) to the engine. */
export async function POST(request: Request, { params }: Context) {
  const { response } = await requireResearchAdminApi();
  if (response) return response;
  const { targetId } = await params;
  const target = targetIdPattern.test(targetId) ? await getTarget(targetId) : null;
  if (!target) return researchJson({ error: 'not_found' }, 404);
  const parsed = optionsSchema.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return researchJson({ error: 'invalid_request' }, 400);
  const options = parsed.data;

  const [field, publicRecords] = await Promise.all([
    listObservations(targetId, 100_000),
    options.usePublicRecords ? listPublicRecords(targetId) : Promise.resolve([]),
  ]);
  const observations = [
    ...field.map((o) => ({
      id: o.id,
      lon: o.longitude,
      lat: o.latitude,
      kind: o.kind,
      origin: 'field' as const,
      uncertaintyM: o.accuracyM,
    })),
    ...publicRecords.map((r) => ({
      id: r.recordId,
      lon: r.longitude,
      lat: r.latitude,
      kind: 'presence' as const,
      origin: 'public' as const,
      uncertaintyM: r.uncertaintyM,
    })),
  ];
  if (!observations.some((o) => o.kind === 'presence')) return researchJson({ error: 'no_presences' }, 400);
  try {
    const { status, body } = await engineJson('/fit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        targetId,
        observations,
        options: {
          usePublicRecords: options.usePublicRecords,
          fieldWeight: options.fieldWeight,
          // Fish live in rivers and waterholes: rank only water and its banks.
          habitat: target.activity === 'fish' ? 'water' : 'land',
        },
      }),
    });
    return researchJson(body, status);
  } catch (error) {
    if (error instanceof EngineUnavailableError) return researchJson({ error: 'engine_unavailable' }, 503);
    throw error;
  }
}
