import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth-helpers';
import { discordTranslate } from '@/lib/discord';
import { publicInferenceEndpointLabel } from '@/lib/models/distribution';
import { findModel, findRelease, loadModelRegistry } from '@/lib/models/registry';
import type { TranslateV2Response } from '@/lib/models/types';
import {
  apiGuardResponse,
  enforceCustomModelProviderBudget,
  enforceTranslationRequestLimit,
} from '@/lib/api-rate-limit.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RequestSchema = z.object({
  modelId: z.string().min(1),
  version: z.string().min(1),
  direction: z.string().min(1),
  text: z.string().trim().min(1).max(400),
  maxNewTokens: z.number().int().min(1).max(512).optional(),
  numBeams: z.number().int().min(1).max(8).optional(),
  noRepeatNgramSize: z.number().int().min(0).max(12).optional(),
  repetitionPenalty: z.number().min(1).max(2).optional(),
  lengthPenalty: z.number().min(0.1).max(2).optional(),
});

const DEFAULT_SERVED_MODEL_ID = 'kuku-yalanji-nllb-lora';
const DEFAULT_SERVED_VERSION = 'v24.3-joint-lexeme-dose29-s3598-20260715';

function setupPayload(): TranslateV2Response['setup'] {
  return {
    envVar: 'MOBTRANSLATE_TRANSLATE_V2_ENDPOINT',
    expectedRequest: [
      'modelId',
      'version',
      'direction',
      'text',
      'maxNewTokens',
      'numBeams',
      'noRepeatNgramSize',
      'repetitionPenalty',
      'lengthPenalty',
    ],
    runCommand:
      'python training/translation/serve_v2_infer.py --model-dir /path/to/exact-v21.2-base --adapter-dir /path/to/v24.3-adapter --adapter-sha256 dd61583a60df2d538989e963e104cb626d78965d300e4e473e9a82ef59c04502 --model-id v24.3-joint-lexeme-dose29-s3598-20260715 --no-repeat-ngram-size 4 --repetition-penalty 1.10 --length-penalty 1.0 --host 127.0.0.1 --port 7955',
  };
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const sessionUser = await getSessionUser().catch(() => null);
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        status: 'invalid_request',
        error: 'Request must include modelId, version, direction, and non-empty text.',
      } satisfies TranslateV2Response,
      { status: 400 },
    );
  }

  try {
    await enforceTranslationRequestLimit(request, sessionUser?.id ?? null);
  } catch (error) {
    return apiGuardResponse(error) ?? NextResponse.json(
      { success: false, status: 'endpoint_error', error: 'Request guard failed.' } satisfies TranslateV2Response,
      { status: 503 },
    );
  }

  const registry = loadModelRegistry();
  const model = findModel(registry, parsed.data.modelId);
  const release = model ? findRelease(model, parsed.data.version) : null;

  if (!model || !release || !release.directions.includes(parsed.data.direction)) {
    return NextResponse.json(
      {
        success: false,
        status: 'model_not_found',
        error: 'That model version or direction is not registered.',
      } satisfies TranslateV2Response,
      { status: 404 },
    );
  }

  const responseModel = {
    id: model.id,
    name: model.name,
    version: release.version,
    status: release.status,
    direction: parsed.data.direction,
    baseModel: release.baseModel,
    dataset: release.dataset,
  };
  const sourceLang = release.serving?.sourceLang ?? 'eng_Latn';
  const targetLang = release.serving?.targetLang ?? 'gvn_Latn';
  const servedModelId = process.env.MOBTRANSLATE_TRANSLATE_V2_MODEL_ID || DEFAULT_SERVED_MODEL_ID;
  const servedVersion = process.env.MOBTRANSLATE_TRANSLATE_V2_VERSION || DEFAULT_SERVED_VERSION;

  const endpoint = process.env.MOBTRANSLATE_TRANSLATE_V2_ENDPOINT;
  if (!endpoint) {
    return NextResponse.json(
      {
        success: false,
        status: 'not_configured',
        error: 'No translate/v2 inference endpoint is configured for this deployment.',
        latencyMs: Date.now() - startedAt,
        model: responseModel,
        endpoint: { configured: false },
        setup: setupPayload(),
      } satisfies TranslateV2Response,
      { status: 503 },
    );
  }

  if (parsed.data.modelId !== servedModelId || parsed.data.version !== servedVersion) {
    return NextResponse.json(
      {
        success: false,
        status: 'endpoint_error',
        error: `The live inference service is currently loaded with ${servedVersion}. Switch to that release to run a live translation, or inspect the saved evaluation outputs for ${release.version}.`,
        latencyMs: Date.now() - startedAt,
        model: responseModel,
        endpoint: { configured: true, url: publicInferenceEndpointLabel(endpoint) },
      } satisfies TranslateV2Response,
      { status: 409 },
    );
  }

  try {
    await enforceCustomModelProviderBudget(request, sessionUser?.id ?? null);
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: model.id,
        version: release.version,
        direction: parsed.data.direction,
        text: parsed.data.text,
        sourceLang,
        targetLang,
        task: 'translate',
        maxNewTokens: parsed.data.maxNewTokens ?? 208,
        numBeams: parsed.data.numBeams ?? 1,
        noRepeatNgramSize: parsed.data.noRepeatNgramSize ?? 4,
        repetitionPenalty: parsed.data.repetitionPenalty ?? 1.1,
        lengthPenalty: parsed.data.lengthPenalty ?? 1,
      }),
      signal: AbortSignal.timeout(Number(process.env.MOBTRANSLATE_TRANSLATE_V2_TIMEOUT_MS ?? 55000)),
    });

    const contentType = upstream.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json') ? await upstream.json() : { translation: await upstream.text() };

    if (!upstream.ok) {
      const error = payload?.error || `Inference endpoint returned HTTP ${upstream.status}`;
      if (upstream.status === 429) {
        return NextResponse.json(
          {
            success: false,
            status: 'endpoint_error',
            error,
            latencyMs: Date.now() - startedAt,
            model: responseModel,
            endpoint: { configured: true, url: publicInferenceEndpointLabel(endpoint) },
          } satisfies TranslateV2Response,
          { status: 429 },
        );
      }
      throw new Error(error);
    }

    const candidate = payload.translation ?? payload.kuku;
    const translation = typeof candidate === 'string' ? candidate.trim() : '';
    if (!translation) {
      throw new Error('Inference endpoint returned no translation text.');
    }

    const sourceIsEnglish = sourceLang.toLowerCase().startsWith('eng_');
    void discordTranslate({
      language: sourceIsEnglish ? targetLang : sourceLang,
      englishText: sourceIsEnglish ? parsed.data.text : translation,
      indigenousText: sourceIsEnglish ? translation : parsed.data.text,
      gloss: typeof payload.gloss === 'string' ? payload.gloss : undefined,
      mode: 'model-v2',
      user: sessionUser,
    });

    return NextResponse.json({
      success: true,
      status: 'ok',
      translation,
      gloss: typeof payload.gloss === 'string' ? payload.gloss : undefined,
      latencyMs: Date.now() - startedAt,
      model: responseModel,
      endpoint: { configured: true, url: publicInferenceEndpointLabel(endpoint) },
    } satisfies TranslateV2Response);
  } catch (error) {
    const guardResponse = apiGuardResponse(error);
    if (guardResponse) return guardResponse;
    const message = error instanceof Error ? error.message : 'Unknown inference endpoint failure.';
    return NextResponse.json(
      {
        success: false,
        status: 'endpoint_error',
        error: message,
        latencyMs: Date.now() - startedAt,
        model: responseModel,
        endpoint: { configured: true, url: publicInferenceEndpointLabel(endpoint) },
      } satisfies TranslateV2Response,
      { status: 502 },
    );
  }
}
