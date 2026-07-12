import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';
import { STUDIO_ROLES, CORPUS_SOURCE, rowsOf } from '@/lib/recording/sentence-studio';

export const runtime = 'nodejs';

// GET the next sentence to record for a speaker.
//   ?speakerId=<uuid>  (optional — used to skip what this speaker already recorded)
//   ?batch=<label>     (optional — default 'tts-priority-v1'; 'all' = whole corpus)
//
// Ordering: highest-priority PENDING first; SKIPPED sentences resurface last
// (least-skipped first). Sentences already marked_bad or recorded are excluded.
// Returns the sentence + queue position (done / total) for the progress bar.
export async function GET(request: NextRequest) {
  const { response } = await requireRole(STUDIO_ROLES);
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const speakerId = searchParams.get('speakerId');
  const batch = searchParams.get('batch') ?? 'tts-priority-v1';
  const batchFilter = batch === 'all' ? sql`true` : sql`rs.batch_label = ${batch}`;
  const speakerUuid = speakerId && /^[0-9a-f-]{36}$/i.test(speakerId) ? speakerId : null;

  try {
    // Aggregate progress across the batch scope.
    const statsRes = await db.execute(sql`
      select
        count(*)::int as total,
        count(*) filter (where status = 'pending')::int as pending,
        count(*) filter (where status = 'skipped')::int as skipped,
        count(*) filter (where status in ('recorded','fixed_recorded'))::int as recorded,
        count(*) filter (where status = 'marked_bad')::int as marked_bad
      from public.recording_sentences rs
      where rs.corpus_source = ${CORPUS_SOURCE} and ${batchFilter}`);
    const stats = rowsOf(statsRes)[0] ?? { total: 0, pending: 0, skipped: 0, recorded: 0, marked_bad: 0 };

    const nextRes = await db.execute(sql`
      select rs.id, rs.corpus_sentence_id, rs.kuku_text, rs.english_text, rs.original_kuku,
             rs.analysis, rs.frame, rs.tier, rs.confidence, rs.status, rs.priority,
             rs.batch_label, rs.times_skipped,
             (rs.kuku_text is distinct from rs.original_kuku) as already_fixed
      from public.recording_sentences rs
      where rs.corpus_source = ${CORPUS_SOURCE}
        and ${batchFilter}
        and rs.status in ('pending','skipped')
        and (${speakerUuid}::uuid is null or not exists (
          select 1 from public.sentence_recordings sr
          where sr.sentence_id = rs.id and sr.speaker_id = ${speakerUuid}::uuid and sr.status = 'active'
        ))
      order by (rs.status = 'pending') desc, rs.times_skipped asc, rs.priority desc, rs.id asc
      limit 1`);
    const next = rowsOf(nextRes)[0] ?? null;

    const done = (stats.recorded ?? 0) + (stats.marked_bad ?? 0);
    return NextResponse.json({
      sentence: next,
      progress: {
        total: stats.total,
        done,
        pending: stats.pending,
        skipped: stats.skipped,
        recorded: stats.recorded,
        markedBad: stats.marked_bad,
        position: next ? done + 1 : done,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as any)?.cause?.message ?? (err as Error).message },
      { status: 500 },
    );
  }
}
