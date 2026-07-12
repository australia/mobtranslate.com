import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';
import { EXPORT_ROLES, rowsOf } from '@/lib/recording/sentence-studio';

export const runtime = 'nodejs';

// GET the elder-verified sentence pairs as JSONL — the verification record that
// upgrades the synthetic corpus from 'pending_elder_verification'. One line per
// ledger judgment (fixed / approved_as_is / marked_bad).
//   { corpus_sentence_id, original_kuku, final_kuku, action, speaker, reviewed_at }
export async function GET(_request: NextRequest) {
  const { response } = await requireRole(EXPORT_ROLES);
  if (response) return response;

  try {
    const res = await db.execute(sql`
      select
        rs.corpus_sentence_id,
        rs.corpus_source,
        rs.original_kuku,
        rs.english_text,
        case r.action
          when 'fixed' then r.new_kuku
          when 'approved_as_is' then rs.original_kuku
          else null
        end as final_kuku,
        r.action,
        r.previous_kuku,
        r.reason,
        sp.name as speaker,
        r.created_at as reviewed_at
      from public.sentence_reviews r
      join public.recording_sentences rs on rs.id = r.sentence_id
      left join public.speaker_profiles sp on sp.id = r.speaker_id
      where r.action in ('fixed', 'approved_as_is', 'marked_bad')
      order by r.created_at asc`);
    const rows = rowsOf(res);

    const ndjson = rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
    return new NextResponse(ndjson, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Content-Disposition': `attachment; filename="elder-verified-pairs-${new Date().toISOString().slice(0, 10)}.jsonl"`,
        'X-Row-Count': String(rows.length),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as any)?.cause?.message ?? (err as Error).message },
      { status: 500 },
    );
  }
}
