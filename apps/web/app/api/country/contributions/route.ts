import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/lib/auth-helpers';
import { contributionFieldsSchema, MAX_PHOTO_BYTES } from '@/lib/country/contributions';
import { insertContribution, listContributions, storeContributionPhoto } from '@/lib/country/contributions.server';
import { getCountryEntrySlugs, getCountryPlaces, hasCountry } from '@/lib/country/entries.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'no-store' };

function bad(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status, headers: NO_STORE });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const language = params.get('language') ?? '';
  if (!hasCountry(language)) return bad('Unknown language', 404);
  const target = params.get('target') ?? undefined;
  const limit = Number(params.get('limit') ?? 50);
  const contributions = await listContributions({ language, target, limit: Number.isFinite(limit) ? limit : 50 });
  return NextResponse.json({ contributions }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response || !user) return response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad('Expected multipart/form-data');
  }
  const raw: Record<string, string> = {};
  for (const key of ['language', 'target', 'kind', 'name', 'title', 'words', 'body', 'where', 'when']) {
    const value = form.get(key);
    if (typeof value === 'string' && value.trim()) raw[key] = value;
  }
  const parsed = contributionFieldsSchema.safeParse(raw);
  if (!parsed.success) return bad('Please check the form', 400, z.flattenError(parsed.error).fieldErrors);
  const fields = parsed.data;

  if (!hasCountry(fields.language)) return bad('Unknown language', 404);
  if (fields.target !== 'new') {
    const [kind, slug] = fields.target.split(':');
    const exists =
      kind === 'entry'
        ? getCountryEntrySlugs(fields.language).has(slug)
        : getCountryPlaces(fields.language).some((place) => place.slug === slug);
    if (!exists) return bad('That page does not exist', 404);
  }

  const file = form.get('photo');
  let photo: { photoPath: string; width: number; height: number } | null = null;
  if (file instanceof Blob && file.size > 0) {
    if (file.size > MAX_PHOTO_BYTES) return bad('The photo is too large (12 MB max)', 413);
    try {
      photo = await storeContributionPhoto(fields.language, fields.target, Buffer.from(await file.arrayBuffer()));
    } catch {
      return bad('That file could not be read as a photo');
    }
  } else if (fields.kind === 'photo') {
    return bad('Choose a photo to add');
  }

  const contribution = await insertContribution(fields, user.id, photo);
  return NextResponse.json({ contribution }, { status: 201, headers: NO_STORE });
}
