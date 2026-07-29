import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, or, isNull, asc } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { speakerProfiles } from '@/lib/db/schema';
import { snakeRow, snakeRows } from '@/lib/db/case';
import { requireAdmin } from '@/lib/recording/server';
import { requireRole } from '@/lib/auth-helpers';

export const runtime = 'nodejs';

// ---- GET: speaker profiles (optionally scoped to a language) -----------
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const languageId = searchParams.get('languageId');
  if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 });
  const auth = await requireAdmin(languageId);
  if (auth.error) return auth.error;

  // Show language-specific speakers plus any global ones.
  const conds = [eq(speakerProfiles.isActive, true)];
  conds.push(or(eq(speakerProfiles.languageId, languageId), isNull(speakerProfiles.languageId))!);

  const rows = await db
    .select()
    .from(speakerProfiles)
    .where(and(...conds))
    .orderBy(asc(speakerProfiles.createdAt));

  return NextResponse.json(snakeRows(rows));
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
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid body', details: err instanceof z.ZodError ? err.issues : String(err) }, { status: 400 });
  }
  let userId: string;
  if (body.languageId) {
    const auth = await requireAdmin(body.languageId);
    if (auth.error) return auth.error;
    userId = auth.user.id;
  } else {
    const { user, response } = await requireRole(['super_admin']);
    if (response) return response;
    userId = user!.id;
  }

  let data;
  try {
    const rows = await db
      .insert(speakerProfiles)
      .values({
        name: body.name,
        languageId: body.languageId ?? null,
        community: body.community ?? null,
        birthYear: body.birthYear ?? null,
        age: body.age ?? null,
        gender: body.gender ?? null,
        dialect: body.dialect ?? null,
        bio: body.bio ?? null,
        culturalConsent: body.culturalConsent ?? true,
        createdBy: userId,
      })
      .returning();
    data = rows[0];
  } catch (err) {
    return NextResponse.json({ error: ((err as any)?.cause?.message ?? (err as Error).message) }, { status: 500 });
  }

  return NextResponse.json(snakeRow(data), { status: 201 });
}
