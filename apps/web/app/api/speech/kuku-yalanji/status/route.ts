import { NextResponse } from 'next/server';
import { loadKukuYalanjiAsrConfig } from '@/lib/kuku-yalanji-asr.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function repliesEnabled(): boolean {
  return (
    process.env.MOBTRANSLATE_KUKU_SPEECH_REPLY_ENABLED?.trim() !== '0' &&
    Boolean(process.env.OPENAI_API_KEY?.trim())
  );
}

export function GET() {
  return NextResponse.json(
    {
      listeningAvailable: Boolean(loadKukuYalanjiAsrConfig()),
      replyAvailable: repliesEnabled(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
