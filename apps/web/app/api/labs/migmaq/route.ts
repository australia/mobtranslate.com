import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-helpers';
import { discordTranslate } from '@/lib/discord';
import {
  apiGuardResponse,
  enforceCustomModelProviderBudget,
  enforceTranslationRequestLimit,
} from '@/lib/api-rate-limit.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ENDPOINT = process.env.MOBTRANSLATE_LABS_MIGMAQ_ENDPOINT?.trim();
const TIMEOUT_MS = Number(process.env.MOBTRANSLATE_LABS_MIGMAQ_TIMEOUT_MS ?? 55000);
const MODEL_FALLBACK = 'migmaq-nllb-lora-1.0.0-rc1';
const MAX_CHARS = 400;

const RequestSchema = z.object({
  text: z.string().trim().min(1).max(MAX_CHARS),
});

type MigmaqResponse = {
  success: boolean;
  translation?: string;
  latencyMs?: number;
  model?: string;
  error?: string;
};

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const sessionUser = await getSessionUser().catch(() => null);
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((issue) => issue.code === 'too_big');
    return NextResponse.json(
      {
        success: false,
        error: tooLong
          ? `Please shorten your sentence to ${MAX_CHARS} characters or less.`
          : 'Please enter an English sentence to translate.',
      } satisfies MigmaqResponse,
      { status: tooLong ? 413 : 400 },
    );
  }

  try {
    await enforceTranslationRequestLimit(request, sessionUser?.id ?? null);
  } catch (error) {
    return apiGuardResponse(error) ?? NextResponse.json(
      { success: false, error: 'Request guard failed.' } satisfies MigmaqResponse,
      { status: 503 },
    );
  }

  if (!ENDPOINT) {
    return NextResponse.json(
      {
        success: false,
        error: 'Custom model inference is paused. Use the dictionary-guided translator on the homepage for now.',
      } satisfies MigmaqResponse,
      { status: 503 },
    );
  }

  try {
    await enforceCustomModelProviderBudget(request, sessionUser?.id ?? null);
    const upstream = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: parsed.data.text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const payload = await upstream.json().catch(() => null as Record<string, unknown> | null);

    if (upstream.status === 429 || upstream.status === 413) {
      const fallback = upstream.status === 429
        ? 'The translator is busy right now. Please try again in a moment.'
        : `Please shorten your sentence to ${MAX_CHARS} characters or less.`;
      return NextResponse.json(
        { success: false, error: (payload?.error as string) || fallback } satisfies MigmaqResponse,
        { status: upstream.status },
      );
    }
    if (!upstream.ok || !payload) {
      throw new Error((payload?.error as string) || `Inference service returned HTTP ${upstream.status}`);
    }

    const candidate = payload.translation ?? payload.kuku;
    const translation = typeof candidate === 'string' ? candidate.trim() : '';
    if (!translation) throw new Error('The model did not return a translation.');
    void discordTranslate({
      language: "Mi'gmaq (mic)",
      englishText: parsed.data.text,
      indigenousText: translation,
      mode: 'model-1.0.0-rc1',
      user: sessionUser,
    });

    return NextResponse.json({
      success: true,
      translation,
      latencyMs: typeof payload.ms === 'number' ? payload.ms : Date.now() - startedAt,
      model: typeof payload.model === 'string' ? payload.model : MODEL_FALLBACK,
    } satisfies MigmaqResponse);
  } catch (error) {
    const guardResponse = apiGuardResponse(error);
    if (guardResponse) return guardResponse;
    const message =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'The translator took too long to respond. Please try again.'
        : error instanceof Error
          ? error.message
          : 'Translation failed. Please try again.';
    return NextResponse.json({ success: false, error: message } satisfies MigmaqResponse, {
      status: 502,
    });
  }
}
