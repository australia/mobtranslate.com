import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logTranslationRequest } from '@/lib/usage-log';
import { getSessionUser } from '@/lib/auth-helpers';
import { discordTranslate } from '@/lib/discord';
import {
  apiGuardResponse,
  enforceCustomModelProviderBudget,
  enforceTranslationRequestLimit,
} from '@/lib/api-rate-limit.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Server-side only. The inference service listens on loopback and is never
// exposed to the browser; this route is the single proxy in front of it.
const ENDPOINT = process.env.MOBTRANSLATE_LABS_V2_ENDPOINT?.trim();
const TIMEOUT_MS = Number(process.env.MOBTRANSLATE_LABS_V2_TIMEOUT_MS ?? 55000);
const MODEL_FALLBACK = 'v21.2-claude-balanced-replay-guarded-20260714';
const MAX_CHARS = 400;

const RequestSchema = z.object({
  text: z.string().trim().min(1).max(MAX_CHARS),
});

interface LabsV2Response {
  success: boolean;
  translation?: string;
  latencyMs?: number;
  model?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const sessionUser = await getSessionUser().catch(() => null);
  const userId = sessionUser?.id ?? null;

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((i) => i.code === 'too_big');
    return NextResponse.json(
      {
        success: false,
        error: tooLong
          ? `Please shorten your sentence to ${MAX_CHARS} characters or less.`
          : 'Please enter an English sentence to translate.',
      } satisfies LabsV2Response,
      { status: tooLong ? 413 : 400 },
    );
  }
  const text = parsed.data.text;

  try {
    await enforceTranslationRequestLimit(request, userId);
  } catch (error) {
    return apiGuardResponse(error) ?? NextResponse.json(
      { success: false, error: 'Request guard failed.' } satisfies LabsV2Response,
      { status: 503 },
    );
  }

  if (!ENDPOINT) {
    return NextResponse.json(
      {
        success: false,
        error: 'Custom model inference is paused while a stronger Kuku Yalanji candidate is evaluated. Use the dictionary-guided translator on the homepage for now.',
      } satisfies LabsV2Response,
      { status: 503 },
    );
  }

  try {
    await enforceCustomModelProviderBudget(request, userId);
    const upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const payload = await upstream.json().catch(() => null as Record<string, unknown> | null);

    // Pass through the service's load-shedding / oversize signals cleanly.
    if (upstream.status === 429 || upstream.status === 413) {
      const error =
        (payload?.error as string) ||
        (upstream.status === 429
          ? 'The translator is busy right now. Please try again in a moment.'
          : `Please shorten your sentence to ${MAX_CHARS} characters or less.`);
      return NextResponse.json({ success: false, error } satisfies LabsV2Response, {
        status: upstream.status,
      });
    }

    if (!upstream.ok || !payload) {
      throw new Error((payload?.error as string) || `Inference service returned HTTP ${upstream.status}`);
    }

    const translation = typeof payload.kuku === 'string' ? payload.kuku.trim() : '';
    if (!translation) {
      throw new Error('The model did not return a translation.');
    }
    const model = typeof payload.model === 'string' ? payload.model : MODEL_FALLBACK;
    const latencyMs = typeof payload.ms === 'number' ? payload.ms : Date.now() - startedAt;

    void logTranslationRequest({
      kind: 'translate',
      source: 'labs_v2',
      languageCode: 'gvn',
      inputText: text,
      outputText: translation,
      userId,
      model,
      durationMs: Date.now() - startedAt,
    });
    void discordTranslate({
      language: 'Kuku Yalanji (gvn)',
      englishText: text,
      indigenousText: translation,
      mode: 'model-v21.2-guarded',
      user: sessionUser,
    });

    return NextResponse.json({
      success: true,
      translation,
      latencyMs,
      model,
    } satisfies LabsV2Response);
  } catch (error) {
    const guardResponse = apiGuardResponse(error);
    if (guardResponse) return guardResponse;
    const message =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'The translator took too long to respond. Please try again.'
        : error instanceof Error
          ? error.message
          : 'Translation failed. Please try again.';
    void logTranslationRequest({
      kind: 'translate',
      source: 'labs_v2',
      languageCode: 'gvn',
      inputText: text,
      userId,
      status: 'error',
      error: message,
      model: MODEL_FALLBACK,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ success: false, error: message } satisfies LabsV2Response, {
      status: 502,
    });
  }
}
