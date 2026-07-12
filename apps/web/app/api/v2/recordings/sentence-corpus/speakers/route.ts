import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';
import { STUDIO_ROLES, kukuLanguageId, rowsOf } from '@/lib/recording/sentence-studio';

export const runtime = 'nodejs';

// GET active speakers (Kuku Yalanji + any global), with their sentence-studio
// clip/minute totals for the speaker picker. Reuses public.speaker_profiles.
export async function GET(_request: NextRequest) {
  const { response } = await requireRole(STUDIO_ROLES);
  if (response) return response;

  const langId = await kukuLanguageId();
  try {
    const res = await db.execute(sql`
      select sp.id, sp.name, sp.community, sp.dialect, sp.gender, sp.age, sp.bio,
             sp.cultural_consent, sp.training_consent,
             coalesce(a.clips, 0)::int as clips,
             coalesce(a.minutes, 0)::float as minutes
      from public.speaker_profiles sp
      left join lateral (
        select count(*)::int as clips, round(sum(duration_ms) / 60000.0, 1) as minutes
        from public.sentence_recordings sr where sr.speaker_id = sp.id and sr.status = 'active'
      ) a on true
      where sp.is_active = true and (sp.language_id = ${langId}::uuid or sp.language_id is null)
      order by sp.created_at asc`);
    return NextResponse.json(rowsOf(res));
  } catch (err) {
    return NextResponse.json(
      { error: (err as any)?.cause?.message ?? (err as Error).message },
      { status: 500 },
    );
  }
}

// POST create a speaker with the in-person consent affirmation (CARE gate).
const schema = z.object({
  name: z.string().min(1).max(255),
  community: z.string().max(255).nullable().optional(),
  dialect: z.string().max(255).nullable().optional(),
  gender: z.string().max(50).nullable().optional(),
  age: z.number().int().min(0).max(130).nullable().optional(),
  bio: z.string().max(2000).nullable().optional(),
  culturalConsent: z.boolean(),
  trainingConsent: z.boolean().optional(),
  consentNote: z.string().max(2000).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const { user, response } = await requireRole(STUDIO_ROLES);
  if (response) return response;

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid body', details: err instanceof z.ZodError ? err.issues : String(err) },
      { status: 400 },
    );
  }
  if (!body.culturalConsent) {
    return NextResponse.json({ error: 'Consent to record and publish is required.' }, { status: 400 });
  }

  const langId = await kukuLanguageId();
  const trainingConsent = body.trainingConsent ?? false;
  try {
    const res = await db.execute(sql`
      insert into public.speaker_profiles
        (name, language_id, community, dialect, gender, age, bio,
         cultural_consent, training_consent, training_consent_at, training_consent_note, created_by)
      values
        (${body.name}, ${langId}::uuid, ${body.community ?? null}, ${body.dialect ?? null},
         ${body.gender ?? null}, ${body.age ?? null}::int, ${body.bio ?? null},
         true, ${trainingConsent}::boolean,
         ${trainingConsent ? sql`now()` : sql`null`}, ${body.consentNote ?? null}, ${user!.id}::uuid)
      returning id, name, community, dialect, gender, age, cultural_consent, training_consent`);
    return NextResponse.json(rowsOf(res)[0], { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as any)?.cause?.message ?? (err as Error).message },
      { status: 500 },
    );
  }
}
