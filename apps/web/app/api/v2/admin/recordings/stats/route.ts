import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/recording/server';

export const runtime = 'nodejs';

// Corpus statistics for the TTS dashboard (optionally scoped to one speaker).
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const languageId = searchParams.get('languageId');
  const speakerId = searchParams.get('speakerId');
  if (!languageId) return NextResponse.json({ error: 'languageId required' }, { status: 400 });

  const { data, error } = await auth.supabase.rpc('recording_corpus_stats', {
    p_language: languageId,
    p_speaker: speakerId || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(Array.isArray(data) ? data[0] : data);
}
