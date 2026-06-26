import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { requireRole } from '@/lib/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['super_admin', 'dictionary_admin'];
const TTS_DIR = process.env.MOBTRANSLATE_TTS_DIR || '/mnt/donto-data/mobtranslate-storage/tts';

/**
 * Stream a stored TTS clip by generation id for the admin "Explore" console.
 * Deliberately does NOT touch play_count — an admin audition is not a user play.
 */
export async function GET(request: NextRequest) {
  const { response } = await requireRole(ADMIN_ROLES);
  if (response) return response;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const res: any = await db.execute(
    sql`select storage_path, format from public.tts_generations where id = ${id} limit 1`,
  );
  const row = (Array.isArray(res) ? res : res?.rows ?? [])[0];
  if (!row?.storage_path) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Guard against path traversal: the stored path must resolve under TTS_DIR.
  const abs = path.resolve(TTS_DIR, row.storage_path);
  if (!abs.startsWith(path.resolve(TTS_DIR))) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  const buf = await fs.readFile(abs).catch(() => null);
  if (!buf) return NextResponse.json({ error: 'Audio file missing' }, { status: 404 });

  return new NextResponse(buf as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': row.format === 'wav' ? 'audio/wav' : 'audio/mpeg',
      'Content-Length': String(buf.length),
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
