import { applyResearchHeaders, requireResearchAdminApi, researchJson } from '@/lib/research/access';
import { readObservationPhoto, storeObservationPhoto } from '@/lib/research/field/store.server';

export const dynamic = 'force-dynamic';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BYTES = 20 * 1024 * 1024;

type Context = { params: Promise<{ observationId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { response } = await requireResearchAdminApi();
  if (response) return response;
  const { observationId } = await params;
  const photo = uuid.test(observationId) ? await readObservationPhoto(observationId) : null;
  if (!photo) return researchJson({ error: 'not_found' }, 404);
  const headers = applyResearchHeaders(new Headers({ 'content-type': 'image/webp' }));
  return new Response(new Uint8Array(photo), { headers });
}

export async function POST(request: Request, { params }: Context) {
  const { response } = await requireResearchAdminApi();
  if (response) return response;
  const { observationId } = await params;
  if (!uuid.test(observationId)) return researchJson({ error: 'not_found' }, 404);
  const form = await request.formData().catch(() => null);
  const file = form?.get('photo');
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_BYTES) return researchJson({ error: 'invalid_photo' }, 400);
  try {
    const stored = await storeObservationPhoto(observationId, Buffer.from(await file.arrayBuffer()));
    return stored ? researchJson({ stored: true }) : researchJson({ error: 'not_found' }, 404);
  } catch {
    return researchJson({ error: 'invalid_photo' }, 400);
  }
}
