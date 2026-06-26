import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { recordings as recordingsT, usageExamples as usageExamplesT, words as wordsT } from '@/lib/db/schema';
import { recordingPublicUrl } from '@/lib/storage';
import { uploadAudio } from '@/lib/recording/server';
import { compressedAudioMeta } from '@/lib/recording/types';
import { getSessionUser } from '@/lib/auth-helpers';

export const runtime = 'nodejs';

// Community recordings for a usage EXAMPLE (a spoken sentence).
//   GET  — public list (attribution + playable URLs).
//   POST — any signed-in user adds a reading of the sentence (kind='sentence').

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
  const { id: exampleId } = await context.params;
  const me = await getSessionUser();
  try {
    const res: any = await db.execute(sql`
      select r.id, r.storage_path, r.opus_path, r.duration_ms, r.is_primary,
             r.recorded_by, r.created_at,
             coalesce(sp.name, up.display_name, up.username) as speaker_name,
             sp.community as speaker_community, sp.dialect as speaker_dialect
      from public.recordings r
      left join public.speaker_profiles sp on sp.id = r.speaker_id
      left join public.user_profiles    up on up.user_id = r.recorded_by
      where r.example_id = ${exampleId}::uuid and r.status = 'active'
      order by r.is_primary desc, r.created_at asc
    `);
    const rows = (Array.isArray(res) ? res : res?.rows ?? []) as any[];
    const recordings = rows.map((r) => ({
      id: r.id,
      url: recordingPublicUrl(r.opus_path) ?? recordingPublicUrl(r.storage_path),
      duration_ms: r.duration_ms,
      is_primary: r.is_primary,
      speaker_name: r.speaker_name || 'Community speaker',
      speaker_community: r.speaker_community || null,
      speaker_dialect: r.speaker_dialect || null,
      created_at: r.created_at,
      is_mine: !!(me && r.recorded_by && r.recorded_by === me.id),
    }));
    return NextResponse.json({ recordings, signed_in: !!me });
  } catch (error) {
    console.error('Failed to list example recordings:', error);
    return NextResponse.json({ error: 'Failed to load recordings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: exampleId } = await context.params;
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: 'Please sign in to add a recording.' }, { status: 401 });

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

  // Resolve the example -> its word + language + the sentence text.
  const ex = await db
    .select({ id: usageExamplesT.id, wordId: usageExamplesT.wordId, text: usageExamplesT.exampleText, languageId: wordsT.languageId })
    .from(usageExamplesT)
    .innerJoin(wordsT, eq(wordsT.id, usageExamplesT.wordId))
    .where(eq(usageExamplesT.id, exampleId))
    .limit(1);
  if (ex.length === 0) return NextResponse.json({ error: 'Example not found' }, { status: 404 });
  const example = ex[0];

  const base = `examples/${exampleId}/${me.id}-${meta.clientId}`;
  let storagePath: string;
  let opusPath: string | null = null;
  try {
    const up = await uploadAudio(`${base}.wav`, await master.arrayBuffer(), 'audio/wav');
    storagePath = up.path;
  } catch (err) {
    return NextResponse.json({ error: `Could not save the recording: ${(err as any)?.cause?.message ?? (err as Error).message}` }, { status: 502 });
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

  await db
    .update(recordingsT)
    .set({ status: 'superseded', updatedAt: new Date().toISOString() })
    .where(and(eq(recordingsT.exampleId, exampleId), eq(recordingsT.recordedBy, me.id), eq(recordingsT.status, 'active')));

  const [rec] = await db
    .insert(recordingsT)
    .values({
      languageId: example.languageId,
      wordId: example.wordId,
      exampleId,
      kind: 'sentence',
      label: example.text,
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
    { id: rec.id, url: recordingPublicUrl(rec.opusPath) ?? recordingPublicUrl(rec.storagePath), duration_ms: rec.durationMs, speaker_name: 'You', created_at: rec.createdAt, is_mine: true },
    { status: 201 },
  );
}
