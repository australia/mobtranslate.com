import { NextRequest, NextResponse } from 'next/server';
import { contentTypeFor, readRecording } from '@/lib/storage';
import { resolveSentenceAudioAccess } from '@/lib/recording/speech-access.server';
import { resolveDictionaryAudioAccess } from '@/lib/recording/dictionary-recording-access.server';

export const runtime = 'nodejs';

// Serves recording audio from the box filesystem (replaces Supabase Storage
// public URLs). Access is evaluated on every request so a withdrawn permission
// takes effect without leaving a long-lived public cache behind.
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await context.params;
  const storagePath = (segments || []).join('/');
  if (!storagePath) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const access = storagePath.startsWith('sentences/')
    ? await resolveSentenceAudioAccess(storagePath).catch(() => 'denied' as const)
    : await resolveDictionaryAudioAccess(storagePath).catch(() => 'denied' as const);
  if (access === 'denied') {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
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
      'Cache-Control':
        access === 'public'
          ? 'public, max-age=60, must-revalidate'
          : 'private, no-store',
      Vary: 'Cookie',
    },
  });
}
