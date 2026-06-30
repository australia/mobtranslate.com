import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireUser, uploadAudio, removeAudio } from '@/lib/recording/server';
import { recordingPublicUrl } from '@/lib/storage';
import { compressedAudioMeta } from '@/lib/recording/types';
import { getSessionUser } from '@/lib/auth-helpers';
import { discordRecording } from '@/lib/discord';

export const runtime = 'nodejs';
export const maxDuration = 60;

const metaSchema = z.object({
  clientId: z.string().min(8),
  languageId: z.string().uuid(),
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

// ---- GET: my recordings for a language ----
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;
  const languageId = new URL(request.url).searchParams.get('languageId');
  if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 });
  try {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('request.jwt.claim.sub', ${auth.user.id}, true)`);
      const r: any = await tx.execute(
        sql`select * from public.auth_my_recordings(${languageId}::uuid, ${100}::int)`,
      );
      return (Array.isArray(r) ? r : r.rows ?? []) as any[];
    });
    return NextResponse.json(await withPublicUrls(rows));
  } catch (err) {
    return NextResponse.json({ error: ((err as any)?.cause?.message ?? (err as Error).message) }, { status: 400 });
  }
}

// ---- POST: upload a recording as the signed-in (invited) user ----
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.error) return auth.error;

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

  const base = `users/${auth.user.id}/${meta.clientId}`;
  let storagePath: string;
  let masterUrl: string;
  let opusPath: string | null = null;
  let opusUrl: string | null = null;
  try {
    const up = await uploadAudio(`${base}.wav`, await master.arrayBuffer(), 'audio/wav');
    storagePath = up.path;
    masterUrl = up.url;
  } catch (err) {
    return NextResponse.json({ error: `Could not save the recording: ${((err as any)?.cause?.message ?? (err as Error).message)}` }, { status: 502 });
  }
  if (opus instanceof Blob && opus.size > 0) {
    try {
      const { ext, contentType } = compressedAudioMeta(opus.type);
      const upo = await uploadAudio(`${base}.${ext}`, await opus.arrayBuffer(), contentType);
      opusPath = upo.path;
      opusUrl = upo.url;
    } catch {
      opusPath = null;
      opusUrl = null;
    }
  }

  const fileSize = master.size + (opus instanceof Blob ? opus.size : 0);
  // auth_create_recording reads auth.uid() from the request.jwt.claim.sub GUC.
  try {
    const data = await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('request.jwt.claim.sub', ${auth.user.id}, true)`);
      const r: any = await tx.execute(sql`select public.auth_create_recording(
        ${meta.languageId}::uuid,
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
      return rows[0]?.result;
    });
    // Best-effort activity event (never blocks the response).
    void getSessionUser()
      .then((u) =>
        discordRecording({
          language: meta.languageId,
          label: meta.label,
          gloss: meta.gloss ?? null,
          kind: meta.kind,
          durationMs: meta.durationMs ?? null,
          user: u,
        }),
      )
      .catch(() => undefined);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const orphans = [storagePath, opusPath].filter(Boolean) as string[];
    if (orphans.length) await Promise.all(orphans.map((p) => removeAudio(p).catch(() => undefined)));
    return NextResponse.json({ error: ((err as any)?.cause?.message ?? (err as Error).message) }, { status: 400 });
  }
}
