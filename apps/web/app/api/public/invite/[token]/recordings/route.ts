import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { resolveInvite } from '@/lib/recording/public';
import { saveRecording, recordingPublicUrl, deleteRecording } from '@/lib/storage';
import { compressedAudioMeta } from '@/lib/recording/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const metaSchema = z.object({
  clientId: z.string().min(8),
  kind: z.enum(['word', 'phrase', 'sentence']).default('word'),
  label: z.string().min(1).max(2000),
  gloss: z.string().max(2000).nullable().optional(),
  wordId: z.string().uuid().nullable().optional(),
  exampleId: z.string().uuid().nullable().optional(),
  targetId: z.string().uuid().nullable().optional(),
  sampleRate: z.number().int().positive().optional(),
  bitDepth: z.number().int().positive().optional(),
  channels: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  peakAmplitude: z.number().optional(),
  clipped: z.boolean().optional(),
});

// Rebuild same-origin audio URLs from the host-independent storage paths.
// Never serve recordings.master_url/opus_url (legacy absolute Supabase URLs).
async function withPublicUrls(rows: any[]): Promise<any[]> {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id).filter(Boolean) as string[];
  if (!ids.length) return rows;
  const idsArr = sql.raw(`ARRAY[${ids.map((id) => `'${id}'`).join(',')}]::uuid[]`);
  const r: any = await db.execute(
    sql`select id, storage_path, opus_path from public.recordings where id = any(${idsArr})`,
  );
  const pathRows = (Array.isArray(r) ? r : r.rows ?? []) as Array<{ id: string; storage_path: string | null; opus_path: string | null }>;
  const byId = new Map(pathRows.map((p) => [p.id, p]));
  return rows.map((row) => {
    const p = byId.get(row.id);
    return {
      ...row,
      master_url: recordingPublicUrl(p?.storage_path),
      opus_url: recordingPublicUrl(p?.opus_path),
    };
  });
}

// ---- GET: the speaker's own recent recordings --------------------------
export async function GET(_request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  try {
    const r: any = await db.execute(
      sql`select * from public.invite_my_recordings(${params.token}, ${100}::int)`,
    );
    const rows = (Array.isArray(r) ? r : r.rows ?? []) as any[];
    return NextResponse.json(await withPublicUrls(rows));
  } catch (err) {
    return NextResponse.json({ error: ((err as any)?.cause?.message ?? (err as Error).message) }, { status: 400 });
  }
}

// ---- POST: upload a recording (multipart) ------------------------------
export async function POST(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const ctx = await resolveInvite(params.token);
  if (!ctx) return NextResponse.json({ error: 'This recording link is not valid.' }, { status: 404 });

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

  const base = `invites/${ctx.language_id}/${meta.clientId}`;

  // Upload the lossless master (fatal). Opus is best-effort.
  let storagePath: string;
  let masterUrl: string;
  let opusPath: string | null = null;
  let opusUrl: string | null = null;
  try {
    const buf = Buffer.from(await master.arrayBuffer());
    storagePath = `${base}.wav`;
    await saveRecording(storagePath, buf);
    masterUrl = recordingPublicUrl(storagePath)!;
  } catch (err) {
    return NextResponse.json({ error: `Could not save the recording: ${((err as any)?.cause?.message ?? (err as Error).message)}` }, { status: 502 });
  }

  if (opus instanceof Blob && opus.size > 0) {
    try {
      const { ext } = compressedAudioMeta(opus.type);
      const buf = Buffer.from(await opus.arrayBuffer());
      opusPath = `${base}.${ext}`;
      await saveRecording(opusPath, buf);
      opusUrl = recordingPublicUrl(opusPath);
    } catch {
      opusPath = null;
      opusUrl = null;
    }
  }

  const fileSize = master.size + (opus instanceof Blob ? opus.size : 0);
  try {
    const r: any = await db.execute(sql`select public.invite_create_recording(
      ${params.token},
      ${meta.clientId},
      ${meta.kind},
      ${meta.label},
      ${meta.gloss ?? null},
      ${meta.wordId ?? null}::uuid,
      ${meta.exampleId ?? null}::uuid,
      ${meta.targetId ?? null}::uuid,
      ${storagePath},
      ${masterUrl},
      ${opusPath},
      ${opusUrl},
      ${'audio/wav'},
      ${meta.sampleRate ?? null}::int,
      ${meta.bitDepth ?? 16}::int,
      ${meta.channels ?? 1}::int,
      ${meta.durationMs ?? null}::int,
      ${fileSize}::bigint,
      ${meta.peakAmplitude ?? null}::real,
      ${meta.clipped ?? false}::boolean
    ) as result`);
    const rows = Array.isArray(r) ? r : r.rows ?? [];
    return NextResponse.json(rows[0]?.result, { status: 201 });
  } catch (err) {
    // Avoid orphaned audio if the row couldn't be created.
    const orphans = [storagePath, opusPath].filter(Boolean) as string[];
    if (orphans.length) await Promise.all(orphans.map((p) => deleteRecording(p).catch(() => undefined)));
    return NextResponse.json({ error: ((err as any)?.cause?.message ?? (err as Error).message) }, { status: 400 });
  }
}
