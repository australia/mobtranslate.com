import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { findModel, findRelease, loadModelRegistry } from '@/lib/models/registry';
import type { TranslateV2Response } from '@/lib/models/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RequestSchema = z.object({
  modelId: z.string().min(1),
  version: z.string().min(1),
  direction: z.string().min(1),
  text: z.string().trim().min(1).max(4000),
  maxNewTokens: z.number().int().min(1).max(512).optional(),
  numBeams: z.number().int().min(1).max(8).optional(),
  noRepeatNgramSize: z.number().int().min(0).max(12).optional(),
  repetitionPenalty: z.number().min(1).max(2).optional(),
  lengthPenalty: z.number().min(0.1).max(2).optional(),
});

function publicEndpointLabel(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return 'configured';
  }
}

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
      'python training/translation/serve_nllb_lora.py --model-dir /path/to/merged --host 0.0.0.0 --port 8765',
  };
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
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

  try {
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
        maxNewTokens: parsed.data.maxNewTokens ?? 192,
        numBeams: parsed.data.numBeams ?? 4,
        noRepeatNgramSize: parsed.data.noRepeatNgramSize ?? 4,
        repetitionPenalty: parsed.data.repetitionPenalty ?? 1.15,
        lengthPenalty: parsed.data.lengthPenalty ?? 0.8,
      }),
      signal: AbortSignal.timeout(Number(process.env.MOBTRANSLATE_TRANSLATE_V2_TIMEOUT_MS ?? 55000)),
    });

    const contentType = upstream.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json') ? await upstream.json() : { translation: await upstream.text() };

    if (!upstream.ok) {
      throw new Error(payload?.error || `Inference endpoint returned HTTP ${upstream.status}`);
    }

    const translation = typeof payload.translation === 'string' ? payload.translation.trim() : '';
    if (!translation) {
      throw new Error('Inference endpoint returned no translation text.');
    }

    return NextResponse.json({
      success: true,
      status: 'ok',
      translation,
      gloss: typeof payload.gloss === 'string' ? payload.gloss : undefined,
      latencyMs: Date.now() - startedAt,
      model: responseModel,
      endpoint: { configured: true, url: publicEndpointLabel(endpoint) },
    } satisfies TranslateV2Response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown inference endpoint failure.';
    return NextResponse.json(
      {
        success: false,
        status: 'endpoint_error',
        error: message,
        latencyMs: Date.now() - startedAt,
        model: responseModel,
        endpoint: { configured: true, url: publicEndpointLabel(endpoint) },
      } satisfies TranslateV2Response,
      { status: 502 },
    );
  }
}
