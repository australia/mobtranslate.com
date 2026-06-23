import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray, asc, desc } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { recordingTargets, recordings } from '@/lib/db/schema';
import { snakeRow } from '@/lib/db/case';
import { requireAdmin } from '@/lib/recording/server';

export const runtime = 'nodejs';

// ---- GET: list custom recording targets (phrases / new words) ----------
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const languageId = searchParams.get('languageId');
  const status = searchParams.get('status') ?? 'pending';
  if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 });

  const conds = [eq(recordingTargets.languageId, languageId)];
  if (status !== 'all') conds.push(eq(recordingTargets.status, status));

  const targets = await db
    .select()
    .from(recordingTargets)
    .where(and(...conds))
    .orderBy(desc(recordingTargets.priority), asc(recordingTargets.createdAt));

  // Attach the embedded recordings:recordings(id, status) array per target.
  const ids = targets.map((t) => t.id);
  const recs = ids.length
    ? await db
        .select({ id: recordings.id, status: recordings.status, targetId: recordings.targetId })
        .from(recordings)
        .where(inArray(recordings.targetId, ids))
    : [];
  const byTarget = new Map<string, { id: string; status: string }[]>();
  for (const r of recs) {
    if (!r.targetId) continue;
    const arr = byTarget.get(r.targetId) ?? [];
    arr.push({ id: r.id, status: r.status });
    byTarget.set(r.targetId, arr);
  }

  const data = targets.map((t) => ({ ...snakeRow(t), recordings: byTarget.get(t.id) ?? [] }));
  return NextResponse.json(data);
}

// ---- POST: add a word/phrase the speaker wants recorded ----------------
const createSchema = z.object({
  languageId: z.string().uuid(),
  kind: z.enum(['word', 'phrase', 'sentence']).default('phrase'),
  text: z.string().min(1).max(500),
  gloss: z.string().max(1000).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  wordId: z.string().uuid().nullable().optional(),
  priority: z.number().int().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid body', details: err instanceof z.ZodError ? err.issues : String(err) }, { status: 400 });
  }

  let data;
  try {
    const rows = await db
      .insert(recordingTargets)
      .values({
        languageId: body.languageId,
        kind: body.kind,
        text: body.text,
        gloss: body.gloss ?? null,
        note: body.note ?? null,
        wordId: body.wordId ?? null,
        priority: body.priority ?? 0,
        status: 'pending',
        createdBy: userId,
      })
      .returning();
    data = rows[0];
  } catch (err) {
    return NextResponse.json({ error: ((err as any)?.cause?.message ?? (err as Error).message) }, { status: 500 });
  }

  return NextResponse.json(snakeRow(data), { status: 201 });
}
