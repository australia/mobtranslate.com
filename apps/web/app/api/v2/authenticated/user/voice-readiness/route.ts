import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireUser } from '@/lib/recording/server';
import { computeReadiness, type VoiceMetrics } from '@/lib/voice/readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function rowsOf(res: any): any[] {
  return Array.isArray(res) ? res : (res?.rows ?? []);
}

// GET ?language=<code> : voice-model readiness breakdown for one language.
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  const code = new URL(request.url).searchParams.get('language');
  if (!code) return NextResponse.json({ error: 'language (code) required' }, { status: 400 });

  const lang = rowsOf(await db.execute(
    sql`select id, code, name from public.languages where code = ${code} limit 1`,
  ))[0];
  if (!lang) return NextResponse.json({ error: 'Language not found' }, { status: 404 });

  const row: any = rowsOf(await db.execute(sql`
    select
      count(*)                                                              as total_clips,
      count(*) filter (where r.kind = 'word')                               as word_clips,
      count(*) filter (where r.kind = 'phrase')                             as phrase_clips,
      count(*) filter (where r.kind = 'sentence')                           as sentence_clips,
      count(distinct r.word_id)    filter (where r.word_id is not null)     as distinct_words,
      count(distinct r.example_id) filter (where r.example_id is not null)  as distinct_sentences,
      round(coalesce(sum(r.duration_ms), 0) / 1000.0, 1)                    as total_duration_seconds,
      round(coalesce(sum(r.duration_ms) filter (where r.kind = 'sentence'), 0) / 1000.0, 1) as sentence_duration_seconds,
      count(*) filter (where r.clipped)                                     as clipped_count,
      count(*) filter (where coalesce(btrim(r.gloss), '') <> '')            as with_gloss,
      count(distinct r.sample_rate)                                         as distinct_sample_rates,
      min(r.sample_rate)                                                    as min_sample_rate,
      count(distinct r.speaker_id)                                          as speaker_profiles,
      min(r.created_at)                                                     as first_recorded_at,
      max(r.created_at)                                                     as last_recorded_at,
      array_remove(array_agg(distinct w.phonemic), null)                    as recorded_phonemics
    from public.recordings r
    join public.speaker_profiles sp on sp.id = r.speaker_id
    left join public.words w on w.id = r.word_id
    where sp.user_id = ${userId} and r.language_id = ${lang.id} and r.status = 'active'
  `))[0] ?? {};

  const metrics: VoiceMetrics = {
    totalClips: Number(row.total_clips) || 0,
    wordClips: Number(row.word_clips) || 0,
    phraseClips: Number(row.phrase_clips) || 0,
    sentenceClips: Number(row.sentence_clips) || 0,
    distinctWords: Number(row.distinct_words) || 0,
    distinctSentences: Number(row.distinct_sentences) || 0,
    totalDurationSeconds: Number(row.total_duration_seconds) || 0,
    sentenceDurationSeconds: Number(row.sentence_duration_seconds) || 0,
    clippedCount: Number(row.clipped_count) || 0,
    withGloss: Number(row.with_gloss) || 0,
    distinctSampleRates: Number(row.distinct_sample_rates) || 0,
    minSampleRate: row.min_sample_rate != null ? Number(row.min_sample_rate) : null,
    speakerProfiles: Number(row.speaker_profiles) || 0,
    recordedPhonemics: (row.recorded_phonemics as string[]) ?? [],
  };

  const readiness = computeReadiness(metrics, lang.code);
  return NextResponse.json({
    language: { id: lang.id, code: lang.code, name: lang.name },
    metrics: {
      totalClips: metrics.totalClips,
      wordClips: metrics.wordClips,
      phraseClips: metrics.phraseClips,
      sentenceClips: metrics.sentenceClips,
      distinctWords: metrics.distinctWords,
      distinctSentences: metrics.distinctSentences,
      durationSeconds: metrics.totalDurationSeconds,
      firstRecordedAt: row.first_recorded_at ?? null,
      lastRecordedAt: row.last_recorded_at ?? null,
    },
    readiness,
  });
}
