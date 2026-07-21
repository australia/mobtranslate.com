import { NextRequest, NextResponse } from 'next/server';
import { contentTypeFor, readRecording } from '@/lib/storage';
import { resolveSentenceAudioAccess } from '@/lib/recording/speech-access.server';

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

  let sentenceAccess: 'public' | 'private' | null = null;
  if (storagePath.startsWith('sentences/')) {
    const access = await resolveSentenceAudioAccess(storagePath).catch(() => 'denied' as const);
    if (access === 'denied') {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    sentenceAccess = access;
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
        sentenceAccess === 'public'
          ? 'public, max-age=60, must-revalidate'
          : sentenceAccess === 'private'
            ? 'private, no-store'
            : 'public, max-age=31536000, immutable',
      ...(sentenceAccess ? { Vary: 'Cookie' } : {}),
    },
  });
}
