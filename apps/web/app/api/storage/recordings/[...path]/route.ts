import { NextRequest, NextResponse } from 'next/server';
import { contentTypeFor, readRecording } from '@/lib/storage';

export const runtime = 'nodejs';

// Serves recording audio from the box filesystem (replaces Supabase Storage
// public URLs). Public, read-only.
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await context.params;
  const storagePath = (segments || []).join('/');
  if (!storagePath) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let data: Buffer | null;
  try {
    data = await readRecording(storagePath);
  } catch {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      'Content-Type': contentTypeFor(storagePath),
      'Content-Length': String(data.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
