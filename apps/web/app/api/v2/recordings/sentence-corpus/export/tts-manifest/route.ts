import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';
import { recordingPublicUrl } from '@/lib/storage';
import { EXPORT_ROLES, rowsOf } from '@/lib/recording/sentence-studio';

export const runtime = 'nodejs';

// GET the TTS training manifest as JSONL (LJSpeech-adjacent). One line per active
// recording of a non-rejected sentence. `text` is the exact surface spoken for
// that take (airtight audio↔text ground truth).
//   { id, audio_path, audio_url, text, speaker, duration_ms, sample_rate, channels }
// ?speakerId=<uuid> restricts to one voice; ?cleanOnly=1 drops clipped clips.
export async function GET(request: NextRequest) {
  const { response } = await requireRole(EXPORT_ROLES);
  if (response) return response;

  const { searchParams } = new URL(request.url);
  const speakerId = searchParams.get('speakerId');
  const speakerUuid = speakerId && /^[0-9a-f-]{36}$/i.test(speakerId) ? speakerId : null;
  const cleanOnly = searchParams.get('cleanOnly') === '1';

  try {
    const res = await db.execute(sql`
      select
        sr.id,
        sr.audio_path,
        sr.opus_path,
        sr.spoken_kuku as text,
        rs.corpus_sentence_id,
        rs.english_text,
        sp.name as speaker,
        sp.id as speaker_id,
        sr.duration_ms,
        sr.sample_rate,
        sr.channels,
        sr.clipped,
        sr.training_consent,
        sr.created_at
      from public.sentence_recordings sr
      join public.recording_sentences rs on rs.id = sr.sentence_id
      left join public.speaker_profiles sp on sp.id = sr.speaker_id
      where sr.status = 'active'
        and rs.status <> 'marked_bad'
        ${speakerUuid ? sql`and sr.speaker_id = ${speakerUuid}::uuid` : sql``}
        ${cleanOnly ? sql`and sr.clipped = false` : sql``}
      order by sp.name asc nulls last, sr.created_at asc`);
    const rows = rowsOf<any>(res);

    const ndjson =
      rows
        .map((r) =>
          JSON.stringify({
            id: r.id,
            audio_path: r.audio_path,
            audio_url: recordingPublicUrl(r.audio_path),
            opus_url: recordingPublicUrl(r.opus_path),
            text: r.text,
            english: r.english_text,
            corpus_sentence_id: r.corpus_sentence_id,
            speaker: r.speaker,
            speaker_id: r.speaker_id,
            duration_ms: r.duration_ms,
            sample_rate: r.sample_rate,
            channels: r.channels,
            clipped: r.clipped,
            training_consent: r.training_consent,
            created_at: r.created_at,
          }),
        )
        .join('\n') + (rows.length ? '\n' : '');

    return new NextResponse(ndjson, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Content-Disposition': `attachment; filename="tts-manifest-${new Date().toISOString().slice(0, 10)}.jsonl"`,
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
