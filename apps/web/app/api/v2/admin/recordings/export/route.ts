import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/recording/server';

export const runtime = 'nodejs';

// Build a training-ready manifest (LJSpeech-style) of active recordings.
// The client turns this into metadata.csv + a download script for the WAVs.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const languageId = searchParams.get('languageId');
  const speakerId = searchParams.get('speakerId');
  if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 });

  const db = auth.supabase;
  let query = db
    .from('recordings')
    .select('id, label, duration_ms, sample_rate, kind, master_url, speaker:speaker_profiles(name)')
    .eq('language_id', languageId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(10000);
  if (speakerId) query = query.eq('speaker_id', speakerId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).filter((r) => r.master_url && (r.label ?? '').trim());
  const items = rows.map((r) => ({
    id: r.id,
    file: `${r.id}.wav`,
    text: (r.label ?? '').trim(),
    // LJSpeech "normalized" column: collapse whitespace; keep the language's orthography intact.
    normalized: (r.label ?? '').trim().replace(/\s+/g, ' '),
    duration_ms: r.duration_ms,
    sample_rate: r.sample_rate,
    kind: r.kind,
    speaker: (r.speaker as { name?: string } | null)?.name ?? null,
    url: r.master_url,
  }));

  const totalSeconds = Math.round(items.reduce((s, i) => s + (i.duration_ms ?? 0), 0) / 1000);

  return NextResponse.json({ count: items.length, totalSeconds, items });
}
