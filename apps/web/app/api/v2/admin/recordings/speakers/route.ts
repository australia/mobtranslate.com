import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/recording/server';

export const runtime = 'nodejs';

// ---- GET: speaker profiles (optionally scoped to a language) -----------
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const languageId = searchParams.get('languageId');

  const db = auth.supabase;
  let query = db.from('speaker_profiles').select('*').eq('is_active', true).order('created_at', { ascending: true });
  // Show language-specific speakers plus any global ones.
  if (languageId) query = query.or(`language_id.eq.${languageId},language_id.is.null`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// ---- POST: create a speaker profile ------------------------------------
const createSchema = z.object({
  name: z.string().min(1).max(255),
  languageId: z.string().uuid().nullable().optional(),
  community: z.string().max(255).nullable().optional(),
  birthYear: z.number().int().min(1900).max(2025).nullable().optional(),
  age: z.number().int().min(0).max(130).nullable().optional(),
  gender: z.string().max(50).nullable().optional(),
  dialect: z.string().max(255).nullable().optional(),
  bio: z.string().max(2000).nullable().optional(),
  culturalConsent: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid body', details: err instanceof z.ZodError ? err.issues : String(err) }, { status: 400 });
  }

  const db = auth.supabase;
  const { data, error } = await db
    .from('speaker_profiles')
    .insert({
      name: body.name,
      language_id: body.languageId ?? null,
      community: body.community ?? null,
      birth_year: body.birthYear ?? null,
      age: body.age ?? null,
      gender: body.gender ?? null,
      dialect: body.dialect ?? null,
      bio: body.bio ?? null,
      cultural_consent: body.culturalConsent ?? true,
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
