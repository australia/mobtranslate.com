import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth-helpers';
import {
  apiGuardResponse,
  enforceAsrProviderBudget,
  enforceAsrRequestLimit,
} from '@/lib/api-rate-limit.server';
import {
  KukuYalanjiAsrError,
  createKukuYalanjiAsrPollToken,
  loadKukuYalanjiAsrConfig,
  submitKukuYalanjiSpeech,
} from '@/lib/kuku-yalanji-asr.server';
import {
  KUKU_YALANJI_VOICE_PROMPTS,
  REQUIRED_KUKU_YALANJI_VOICE_PROMPTS,
} from '@/lib/kuku-yalanji-speech-types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const runtime = 'nodejs';

const MAX_REQUEST_BYTES = 20 * 1024 * 1024;
const MAX_WAV_BYTES = 4 * 1024 * 1024;
const WAV_TYPES = new Set(['audio/wav', 'audio/x-wav', 'audio/wave']);

function validateWav(file: File, label: string): string | null {
  if (file.size < 44) return `${label} is empty.`;
  if (file.size > MAX_WAV_BYTES) return `${label} is too large.`;
  if (file.type && !WAV_TYPES.has(file.type.toLowerCase())) {
    return `${label} must be a WAV recording.`;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const sessionUser = await getSessionUser().catch(() => null);
  const userId = sessionUser?.id ?? null;
  try {
    await enforceAsrRequestLimit(request, userId);

    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_REQUEST_BYTES) {
      return NextResponse.json(
        { success: false, error: 'The voice examples are too large to send.' },
        { status: 413, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('multipart/form-data')) {
      return NextResponse.json(
        { success: false, error: 'Please record a sentence first.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: 'The voice recording form is incomplete.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const target = form.get('target');
    const promptIds = form.getAll('contextId');
    const contextAudio = form.getAll('contextAudio');

    if (!(target instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'Please record a sentence first.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (
      promptIds.length !== contextAudio.length ||
      promptIds.length < REQUIRED_KUKU_YALANJI_VOICE_PROMPTS ||
      promptIds.length > KUKU_YALANJI_VOICE_PROMPTS.length
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please record all ten voice examples first.',
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const targetError = validateWav(target, 'The sentence recording');
    if (targetError) {
      return NextResponse.json(
        { success: false, error: targetError },
        { status: 422, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const promptById = new Map(
      KUKU_YALANJI_VOICE_PROMPTS.map((prompt) => [prompt.id, prompt]),
    );
    const seen = new Set<string>();
    const contexts: { audio: File; text: string }[] = [];
    for (let index = 0; index < promptIds.length; index += 1) {
      const promptId = promptIds[index];
      const audio = contextAudio[index];
      if (typeof promptId !== 'string' || !(audio instanceof File)) {
        return NextResponse.json(
          { success: false, error: 'A voice example is incomplete.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      const prompt = promptById.get(promptId as never);
      if (!prompt || seen.has(prompt.id)) {
        return NextResponse.json(
          { success: false, error: 'A voice example is not recognized.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      const audioError = validateWav(audio, `Voice example ${index + 1}`);
      if (audioError) {
        return NextResponse.json(
          { success: false, error: audioError },
          { status: 422, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      seen.add(prompt.id);
      contexts.push({ audio, text: prompt.kuku });
    }

    const config = loadKukuYalanjiAsrConfig();
    if (!config) {
      return NextResponse.json(
        {
          success: false,
          error: 'The Kuku Yalanji listening test is temporarily unavailable.',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    await enforceAsrProviderBudget(request, userId);
    const submission = await submitKukuYalanjiSpeech(
      target,
      contexts,
      config,
    );
    if (submission.status === 'pending') {
      return NextResponse.json(
        {
          success: true,
          status: 'pending',
          pollToken: createKukuYalanjiAsrPollToken(submission.jobId, config),
          retryAfterMs: 3_000,
        },
        { status: 202, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      {
        ...submission.result,
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
        : 'The listening test could not process this recording.';
    console.error('Kuku Yalanji transient speech request failed:', {
      name: error instanceof Error ? error.name : 'unknown',
      status,
    });
    return NextResponse.json(
      { success: false, error: message },
      { status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
