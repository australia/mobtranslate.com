import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-helpers';
import {
  apiGuardResponse,
  enforceAsrStatusRequestLimit,
} from '@/lib/api-rate-limit.server';
import {
  KukuYalanjiAsrError,
  loadKukuYalanjiAsrConfig,
  pollKukuYalanjiSpeech,
  verifyKukuYalanjiAsrPollToken,
} from '@/lib/kuku-yalanji-asr.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

const StatusRequestSchema = z.object({
  pollToken: z.string().min(32).max(512),
});

export async function POST(request: NextRequest) {
  const sessionUser = await getSessionUser().catch(() => null);
  const userId = sessionUser?.id ?? null;
  try {
    await enforceAsrStatusRequestLimit(request, userId);
    const parsed = StatusRequestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'The listening request is not recognized.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const config = loadKukuYalanjiAsrConfig();
    if (!config || config.provider !== 'runpod') {
      return NextResponse.json(
        { success: false, error: 'The Kuku Yalanji listening test is temporarily unavailable.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const jobId = verifyKukuYalanjiAsrPollToken(parsed.data.pollToken, config);
    const result = await pollKukuYalanjiSpeech(jobId, config);
    if (result.status === 'pending') {
      return NextResponse.json(
        {
          success: true,
          status: 'pending',
          pollToken: parsed.data.pollToken,
          retryAfterMs: 3_000,
        },
        { status: 202, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      {
        ...result.result,
        notice:
          'This is an early listening test. Check the words before using them or asking for a reply.',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const guarded = apiGuardResponse(error);
    if (guarded) return guarded;
    const status = error instanceof KukuYalanjiAsrError ? error.status : 500;
    const message =
      error instanceof KukuYalanjiAsrError
        ? error.message
        : 'The listening test could not check this recording.';
    console.error('Kuku Yalanji speech status check failed:', {
      name: error instanceof Error ? error.name : 'unknown',
      status,
    });
    return NextResponse.json(
      { success: false, error: message },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
