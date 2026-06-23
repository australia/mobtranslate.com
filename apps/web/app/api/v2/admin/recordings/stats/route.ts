import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireAdmin } from '@/lib/recording/server';

export const runtime = 'nodejs';

// Corpus statistics for the TTS dashboard (optionally scoped to one speaker).
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const languageId = searchParams.get('languageId');
  const speakerId = searchParams.get('speakerId');
  if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 });

  let res: any;
  try {
    res = await db.execute(
      sql`select * from public.recording_corpus_stats(${languageId}::uuid, ${speakerId || null}::uuid)`,
    );
  } catch (err) {
    return NextResponse.json({ error: ((err as any)?.cause?.message ?? (err as Error).message) }, { status: 500 });
  }

  const rows = (Array.isArray(res) ? res : res?.rows ?? []) as Array<Record<string, unknown>>;
  return NextResponse.json(rows[0] ?? null);
}
