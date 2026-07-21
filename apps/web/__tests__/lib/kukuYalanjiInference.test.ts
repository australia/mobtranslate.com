// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  KUKU_YALANJI_HUGGING_FACE_ENDPOINT,
  KUKU_YALANJI_MODEL_ID,
  KUKU_YALANJI_V24_VERSION,
  KukuYalanjiInferenceError,
  loadKukuYalanjiModelConfig,
  translateWithKukuYalanjiModel,
  type KukuYalanjiModelConfig,
} from '../../lib/kuku-yalanji-inference.server';

const config: KukuYalanjiModelConfig = {
  endpoint: 'http://127.0.0.1:7955/translate',
  modelId: KUKU_YALANJI_MODEL_ID,
  version: KUKU_YALANJI_V24_VERSION,
  timeoutMs: 55000,
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function modelResponse(overrides: Record<string, unknown> = {}) {
  return {
    translation: 'Jalbu-ngku bana nyajin.',
    kuku: 'Jalbu-ngku bana nyajin.',
    model: config.version,
    modelId: config.modelId,
    apiVersion: 'v1',
    task: 'translate',
    languageCode: 'kuku_yalanji',
    languageName: 'Kuku Yalanji',
    languageTag: 'gvn',
    sourceLang: 'eng_Latn',
    targetLang: 'gvn_Latn',
    ms: 12630,
    queueMs: 25,
    validation: 'unverified_research_preview',
    notice: 'Unverified research output.',
    ...overrides,
  };
}

describe('Kuku Yalanji homepage inference', () => {
  it('is disabled unless the operator explicitly enables it', () => {
    expect(loadKukuYalanjiModelConfig({})).toBeNull();
  });

  it('loads the version-bound endpoint configuration', () => {
    expect(
      loadKukuYalanjiModelConfig({
        MOBTRANSLATE_HOMEPAGE_KUKU_MODEL_ENABLED: '1',
        MOBTRANSLATE_TRANSLATE_V2_ENDPOINT: config.endpoint,
        MOBTRANSLATE_TRANSLATE_V2_MODEL_ID: config.modelId,
        MOBTRANSLATE_TRANSLATE_V2_VERSION: config.version,
        MOBTRANSLATE_TRANSLATE_V2_TIMEOUT_MS: '55000',
      }),
    ).toEqual(config);
  });

  it('uses the pinned Hugging Face Space when the route is enabled without an override', () => {
    expect(
      loadKukuYalanjiModelConfig({
        MOBTRANSLATE_HOMEPAGE_KUKU_MODEL_ENABLED: '1',
      }),
    ).toMatchObject({
      endpoint: KUKU_YALANJI_HUGGING_FACE_ENDPOINT,
      modelId: KUKU_YALANJI_MODEL_ID,
      version: KUKU_YALANJI_V24_VERSION,
    });
  });

  it('sends the translate task and accepts the exact configured version', async () => {
    const fetchMock = vi.fn(async () => response(modelResponse()));

    const result = await translateWithKukuYalanjiModel(
      'The woman saw the water.',
      config,
      fetchMock as typeof fetch,
    );

    expect(result.translation).toBe('Jalbu-ngku bana nyajin.');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      text: 'The woman saw the water.',
      language: 'kuku_yalanji',
    });
  });

  it('fails closed when the endpoint serves a different model', async () => {
    const fetchMock = vi.fn(async () =>
      response(modelResponse({ model: 'wrong-version' })),
    );

    await expect(
      translateWithKukuYalanjiModel('woman', config, fetchMock as typeof fetch),
    ).rejects.toMatchObject<KukuYalanjiInferenceError>({ status: 503 });
  });

  it('preserves the bounded-service busy response', async () => {
    const fetchMock = vi.fn(async () =>
      response({ error: 'The translator is busy.' }, 429),
    );

    await expect(
      translateWithKukuYalanjiModel('woman', config, fetchMock as typeof fetch),
    ).rejects.toMatchObject<KukuYalanjiInferenceError>({
      status: 429,
      message: 'The translator is busy.',
    });
  });
});
