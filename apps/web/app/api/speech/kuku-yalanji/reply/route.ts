import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth-helpers';
import {
  apiGuardResponse,
  enforceChatRequestLimit,
  enforceOpenAiProviderBudget,
} from '@/lib/api-rate-limit.server';
import {
  KukuYalanjiReplyRequestSchema,
  KukuYalanjiReplyResponseSchema,
} from '@/lib/kuku-yalanji-speech-types';
import {
  createKukuYalanjiSpeechReply,
  retrieveKukuYalanjiSpeechEvidence,
} from '@/lib/kuku-yalanji-speech.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (
    process.env.MOBTRANSLATE_KUKU_SPEECH_REPLY_ENABLED?.trim() === '0' ||
    !process.env.OPENAI_API_KEY?.trim()
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Spoken replies are temporarily unavailable. You can still check what the listener heard.',
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': '3600' },
      },
    );
  }

  const sessionUser = await getSessionUser().catch(() => null);
  const userId = sessionUser?.id ?? null;
  try {
    await enforceChatRequestLimit(request, userId);
    const parsed = KukuYalanjiReplyRequestSchema.safeParse(
      await request.json(),
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please check the words you want to use and try again.',
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const evidence = await retrieveKukuYalanjiSpeechEvidence(
      parsed.data.transcript,
    );
    await enforceOpenAiProviderBudget(request, userId);
    const reply = await createKukuYalanjiSpeechReply({
      transcript: parsed.data.transcript,
      history: parsed.data.history,
      evidence,
      modelId:
        process.env.MOBTRANSLATE_KUKU_SPEECH_REPLY_MODEL?.trim() || undefined,
    });
    return NextResponse.json(
      KukuYalanjiReplyResponseSchema.parse({
        success: true,
        ...reply,
        evidence,
        validation: 'unverified_dictionary_assisted_interpretation',
      }),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const guarded = apiGuardResponse(error);
    if (guarded) return guarded;
    console.error('Kuku Yalanji private conversation reply failed:', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      {
        success: false,
        error:
          'A reply could not be prepared right now. Your words were not saved.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
