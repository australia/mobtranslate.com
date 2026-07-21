import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { recordings as recordingsT, words as wordsT } from '@/lib/db/schema';
import { recordingPublicUrl } from '@/lib/storage';
import { uploadAudio } from '@/lib/recording/server';
import { compressedAudioMeta } from '@/lib/recording/types';
import { getSessionUser } from '@/lib/auth-helpers';

export const runtime = 'nodejs';

// Pronunciations for a single dictionary word.
//   GET  — public: list active community and attributed source recordings.
//   POST — any signed-in user adds their own pronunciation (NOT invite-gated, unlike the
//          speaker studio). A user's previous take for the word is superseded.

const metaSchema = z.object({
  clientId: z.string().min(1),
  durationMs: z.number().nonnegative().optional(),
  sampleRate: z.number().int().positive().optional(),
  bitDepth: z.number().int().positive().optional(),
  channels: z.number().int().positive().optional(),
  peakAmplitude: z.number().optional(),
  clipped: z.boolean().optional(),
  opusType: z.string().nullable().optional(),
});

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: wordId } = await context.params;
  const me = await getSessionUser();
  try {
    const res: any = await db.execute(sql`
      select r.id, r.storage_path, r.opus_path, r.duration_ms, r.is_primary,
             r.recorded_by, r.created_at,
             coalesce(sp.name, up.display_name, up.username) as speaker_name,
             sp.community as speaker_community,
             sp.dialect   as speaker_dialect,
             rer.speaker_code as source_speaker_code,
             rs.name as source_name,
             rs.source_url,
             rs.license_name,
             rs.license_url,
             rs.commercial_use_allowed,
             rs.attribution_text,
             rer.source_entry_url
      from public.recordings r
      join public.words recorded_word on recorded_word.id = r.word_id
      join public.words requested_word on requested_word.id = ${wordId}::uuid
      left join public.speaker_profiles sp on sp.id = r.speaker_id
      left join public.user_profiles    up on up.user_id = r.recorded_by
      left join public.recording_external_refs rer on rer.recording_id = r.id
      left join public.recording_sources rs on rs.id = rer.source_id
      where r.status = 'active'
        and r.kind = 'word'
        and (
          r.word_id = ${wordId}::uuid
          or (
            rer.recording_id is not null
            and recorded_word.language_id = requested_word.language_id
            and recorded_word.word = requested_word.word
          )
        )
      order by (rer.recording_id is not null) desc, r.is_primary desc, r.created_at asc
    `);
    const rows = (Array.isArray(res) ? res : res?.rows ?? []) as any[];
    const recordings = rows.map((r) => ({
      id: r.id,
      url: recordingPublicUrl(r.opus_path) ?? recordingPublicUrl(r.storage_path),
      master_url: recordingPublicUrl(r.storage_path),
      duration_ms: r.duration_ms,
      is_primary: r.is_primary,
      speaker_name: r.speaker_name || (r.source_name ? 'Source speaker' : 'Community speaker'),
      speaker_community: r.speaker_community || null,
      speaker_dialect: r.speaker_dialect || null,
      source_speaker_code: r.source_speaker_code || null,
      source_name: r.source_name || null,
      source_url: r.source_url || null,
      source_entry_url: r.source_entry_url || null,
      source_license_name: r.license_name || null,
      source_license_url: r.license_url || null,
      source_commercial_use_allowed: r.commercial_use_allowed ?? null,
      source_attribution: r.attribution_text || null,
      created_at: r.created_at,
      is_mine: !!(me && r.recorded_by && r.recorded_by === me.id),
    }));
    return NextResponse.json({ recordings, signed_in: !!me });
  } catch (error) {
    console.error('Failed to list word recordings:', error);
    return NextResponse.json({ error: 'Failed to load recordings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: wordId } = await context.params;
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: 'Please sign in to add a pronunciation.' }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }
  const rawMeta = form.get('meta');
  if (typeof rawMeta !== 'string') return NextResponse.json({ error: 'Missing meta' }, { status: 400 });
  let meta: z.infer<typeof metaSchema>;
  try {
    meta = metaSchema.parse(JSON.parse(rawMeta));
  } catch (err) {
    return NextResponse.json({ error: 'Invalid meta', details: err instanceof z.ZodError ? err.issues : String(err) }, { status: 400 });
  }
  const master = form.get('master');
  if (!(master instanceof Blob)) return NextResponse.json({ error: 'Missing master audio' }, { status: 400 });
  const opus = form.get('opus');

  // The word must exist; derive its language + headword.
  const w = await db
    .select({ id: wordsT.id, languageId: wordsT.languageId, word: wordsT.word })
    .from(wordsT)
    .where(eq(wordsT.id, wordId))
    .limit(1);
  if (w.length === 0) return NextResponse.json({ error: 'Word not found' }, { status: 404 });
  const word = w[0];

  // Store audio on the box filesystem (host-independent same-origin URLs).
  const base = `words/${wordId}/${me.id}-${meta.clientId}`;
  let storagePath: string;
  let opusPath: string | null = null;
  try {
    const up = await uploadAudio(`${base}.wav`, await master.arrayBuffer(), 'audio/wav');
    storagePath = up.path;
  } catch (err) {
    return NextResponse.json(
      { error: `Could not save the recording: ${(err as any)?.cause?.message ?? (err as Error).message}` },
      { status: 502 },
    );
  }
  if (opus instanceof Blob && opus.size > 0) {
    try {
      const { ext, contentType } = compressedAudioMeta(opus.type);
      const upo = await uploadAudio(`${base}.${ext}`, await opus.arrayBuffer(), contentType);
      opusPath = upo.path;
    } catch {
      opusPath = null;
    }
  }

  const fileSize = master.size + (opus instanceof Blob ? opus.size : 0);

  // One active take per user per word — supersede the previous.
  await db
    .update(recordingsT)
    .set({ status: 'superseded', updatedAt: new Date().toISOString() })
    .where(and(eq(recordingsT.wordId, wordId), eq(recordingsT.recordedBy, me.id), eq(recordingsT.status, 'active')));

  const [rec] = await db
    .insert(recordingsT)
    .values({
      languageId: word.languageId,
      wordId,
      kind: 'word',
      label: word.word,
      recordedBy: me.id,
      storagePath,
      masterUrl: recordingPublicUrl(storagePath),
      masterFormat: 'wav',
      opusPath,
      opusUrl: recordingPublicUrl(opusPath),
      mimeType: opus instanceof Blob ? opus.type : 'audio/wav',
      sampleRate: meta.sampleRate ?? null,
      bitDepth: meta.bitDepth ?? null,
      channels: meta.channels ?? null,
      durationMs: meta.durationMs ?? null,
      fileSizeBytes: fileSize,
      peakAmplitude: meta.peakAmplitude ?? null,
      clipped: meta.clipped ?? false,
      status: 'active',
      isPrimary: false,
      clientId: meta.clientId,
    })
    .returning();

  return NextResponse.json(
    {
      id: rec.id,
      url: recordingPublicUrl(rec.opusPath) ?? recordingPublicUrl(rec.storagePath),
      duration_ms: rec.durationMs,
      speaker_name: 'You',
      created_at: rec.createdAt,
      is_mine: true,
    },
    { status: 201 },
  );
}
