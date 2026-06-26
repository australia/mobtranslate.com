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
 * Voice-model readiness for the signed-in user, scoped to the language they've
 * recorded most (a personal voice is fine-tuned per language). Returns the full
 * research-grounded breakdown (see lib/voice-readiness.ts).
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const uid = user.id;

  const mine = sql`r.status = 'active' and (
    r.recorded_by = ${uid}::uuid
    or r.speaker_id in (select id from public.speaker_profiles where user_id = ${uid}::uuid)
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
      consent: { granted: false, at: null },
    });
    return NextResponse.json({ language: null, ...empty });
  }

  const [lang, recs, recordedIpa, inventoryIpa, consentRow] = await Promise.all([
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
    // Highest training-consent across the user's speaker profiles for this language (or any).
    db.execute(sql`
      select training_consent, training_consent_at
      from public.speaker_profiles
      where user_id = ${uid}::uuid and (language_id = ${languageId}::uuid or language_id is null)
      order by training_consent desc, training_consent_at desc nulls last limit 1
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

  const cr = rows(consentRow)[0];
  const result = computeReadiness({
    recordings,
    recordedWordIpa: rows(recordedIpa).map((r) => r.phonemic),
    languageInventory,
    consent: { granted: cr?.training_consent === true, at: cr?.training_consent_at || null },
  });

  const l = rows(lang)[0];
  return NextResponse.json({ language: l ? { code: l.code, name: l.name } : null, ...result });
}
