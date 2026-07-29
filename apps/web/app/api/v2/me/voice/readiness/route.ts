import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { getSessionUser } from '@/lib/auth-helpers';
import { computeReadiness, ipaPhonemes, type RecordingLite } from '@/lib/voice-readiness';

export const dynamic = 'force-dynamic';

function rows<T = any>(res: any): T[] {
  return (Array.isArray(res) ? res : res?.rows ?? []) as T[];
}

/**
 * Technical corpus coverage for the signed-in user, scoped to the language
 * with the most recordings whose exact CURRENT consent event permits TTS
 * training and recognisable voice replication. Dictionary-public permission
 * does not qualify. Technical coverage never substitutes for project approval.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const uid = user.id;

  const mine = sql`r.status = 'active' and (
    r.recorded_by = ${uid}::uuid
    or r.speaker_id in (select id from public.speaker_profiles where user_id = ${uid}::uuid)
  ) and exists (
    select 1
      from public.current_speech_consent consent
     where consent.id = r.speech_consent_record_id
       and consent.speaker_id = r.speaker_id
       and consent.language_id = r.language_id
       and consent.event_type <> 'withdraw'
       and consent.recording_allowed = true
       and consent.public_transcript_allowed = true
       and consent.tts_training_allowed = true
       and consent.speaker_voice_replication_allowed = true
  )`;

  // Dominant language of this user's recordings.
  const domRows = rows(await db.execute(sql`
    select r.language_id, count(*)::int as clips
    from public.recordings r where ${mine}
    group by r.language_id order by clips desc limit 1
  `));
  const languageId: string | null = domRows[0]?.language_id ?? null;

  if (!languageId) {
    // No recordings yet — return an empty-but-shaped readiness.
    const empty = computeReadiness({
      recordings: [], recordedWordIpa: [], languageInventory: new Set(),
    });
    return NextResponse.json({ language: null, ...empty });
  }

  const [lang, recs, recordedIpa, inventoryIpa] = await Promise.all([
    db.execute(sql`select code, name from public.languages where id = ${languageId}::uuid limit 1`),
    db.execute(sql`
      select r.kind, r.duration_ms, r.sample_rate, r.channels, r.peak_amplitude, r.clipped, r.word_id
      from public.recordings r where ${mine} and r.language_id = ${languageId}::uuid
    `),
    // IPA for the distinct words this speaker actually recorded (the covered sounds).
    db.execute(sql`
      select distinct w.phonemic
      from public.recordings r join public.words w on w.id = r.word_id
      where ${mine} and r.language_id = ${languageId}::uuid and w.phonemic is not null and w.phonemic <> ''
    `),
    // Full phonetic inventory of the language (data-derived target set).
    db.execute(sql`
      select phonemic from public.words
      where language_id = ${languageId}::uuid and phonemic is not null and phonemic <> ''
    `),
  ]);

  const recordings: RecordingLite[] = rows(recs).map((r) => ({
    kind: r.kind,
    durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
    sampleRate: r.sample_rate == null ? null : Number(r.sample_rate),
    channels: r.channels == null ? null : Number(r.channels),
    peakAmplitude: r.peak_amplitude == null ? null : Number(r.peak_amplitude),
    clipped: r.clipped,
    wordId: r.word_id,
  }));

  const languageInventory = new Set<string>();
  for (const row of rows(inventoryIpa)) for (const p of ipaPhonemes(row.phonemic)) languageInventory.add(p);

  const result = computeReadiness({
    recordings,
    recordedWordIpa: rows(recordedIpa).map((r) => r.phonemic),
    languageInventory,
  });

  const l = rows(lang)[0];
  return NextResponse.json({ language: l ? { code: l.code, name: l.name } : null, ...result });
}
