// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  createKukuYalanjiAsrPollToken,
  loadKukuYalanjiAsrConfig,
  pollKukuYalanjiSpeech,
  submitKukuYalanjiSpeech,
  type KukuYalanjiAsrConfig,
  verifyKukuYalanjiAsrPollToken,
} from '@/lib/kuku-yalanji-asr.server';

function result() {
  return {
    success: true,
    transcript: 'ngayu binal bama',
    language: 'kuku_yalanji',
    model: 'omniASR_LLM_7B_ZS',
    validation: 'experimental_same_speaker_voice_examples',
    decoder: { beamSize: 5 },
    timing: { queueMs: 0, inferenceMs: 815 },
    audio: {
      target: {
        duration_seconds: 1.5,
        sample_rate: 16_000,
        channels: 1,
        sample_width_bytes: 2,
      },
      contextCount: 1,
      contextSeconds: 1,
      retained: false,
    },
  } as const;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const audio = new File([new Uint8Array(64)], 'voice.wav', { type: 'audio/wav' });

describe('Kuku Yalanji ASR provider client', () => {
  it('stays disabled without a complete provider configuration', () => {
    expect(loadKukuYalanjiAsrConfig({})).toBeNull();
    expect(
      loadKukuYalanjiAsrConfig({ MOBTRANSLATE_KUKU_ASR_ENDPOINT: 'https://example.test' }),
    ).toBeNull();
  });

  it('prefers an explicitly configured direct service', () => {
    expect(
      loadKukuYalanjiAsrConfig({
        MOBTRANSLATE_KUKU_ASR_ENDPOINT: 'https://asr.example.test/v1/transcribe',
        MOBTRANSLATE_KUKU_ASR_TOKEN: 'secret',
        MOBTRANSLATE_KUKU_ASR_RUNPOD_ENDPOINT_ID: 'endpoint-id',
        RUNPOD_API_KEY: 'runpod-secret',
      }),
    ).toMatchObject({
      provider: 'direct',
      endpoint: 'https://asr.example.test/v1/transcribe',
      token: 'secret',
    });
  });

  it('builds a bounded RunPod endpoint configuration', () => {
    expect(
      loadKukuYalanjiAsrConfig({
        MOBTRANSLATE_KUKU_ASR_RUNPOD_ENDPOINT_ID: 'endpoint-id',
        RUNPOD_API_KEY: 'runpod-secret',
        MOBTRANSLATE_KUKU_ASR_TIMEOUT_MS: '120000',
      }),
    ).toEqual({
      provider: 'runpod',
      endpoint: 'https://api.runpod.ai/v2/endpoint-id',
      token: 'runpod-secret',
      timeoutMs: 120000,
    });
  });

  it('falls back to the bounded default for a malformed timeout', () => {
    expect(
      loadKukuYalanjiAsrConfig({
        MOBTRANSLATE_KUKU_ASR_RUNPOD_ENDPOINT_ID: 'endpoint-id',
        RUNPOD_API_KEY: 'runpod-secret',
        MOBTRANSLATE_KUKU_ASR_TIMEOUT_MS: 'not-a-number',
      }),
    ).toMatchObject({
      endpoint: 'https://api.runpod.ai/v2/endpoint-id',
      timeoutMs: 300000,
    });
  });

  it('forwards multipart audio to the temporary direct service', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(result()));
    const config: KukuYalanjiAsrConfig = {
      provider: 'direct',
      endpoint: 'https://asr.example.test/v1/transcribe',
      token: 'secret',
      timeoutMs: 120000,
    };

    const response = await submitKukuYalanjiSpeech(
      audio,
      [{ audio, text: 'dingkar jalbu karrkay' }],
      config,
      fetchMock as typeof fetch,
    );

    expect(response).toMatchObject({
      status: 'completed',
      result: { transcript: 'ngayu binal bama' },
    });
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.headers).toEqual({ Authorization: 'Bearer secret' });
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('wraps audio as base64 and enqueues an asynchronous RunPod job', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ id: 'runpod-job-1234', status: 'IN_QUEUE' }),
    );
    const config: KukuYalanjiAsrConfig = {
      provider: 'runpod',
      endpoint: 'https://api.runpod.ai/v2/endpoint-id',
      token: 'runpod-secret',
      timeoutMs: 120000,
    };

    const response = await submitKukuYalanjiSpeech(
      audio,
      [{ audio, text: 'dingkar jalbu karrkay' }],
      config,
      fetchMock as typeof fetch,
    );

    expect(response).toEqual({ status: 'pending', jobId: 'runpod-job-1234' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.runpod.ai/v2/endpoint-id/run');
    const init = fetchMock.mock.calls[0][1]!;
    const body = JSON.parse(init.body as string);
    expect(body.input.targetWavBase64).toBe(Buffer.from(new Uint8Array(64)).toString('base64'));
    expect(body.input.contexts[0]).toMatchObject({ text: 'dingkar jalbu karrkay' });
    expect(body.policy).toEqual({ executionTimeout: 120000, ttl: 240000 });
  });

  it('polls RunPod without resending audio and parses the completed result', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ id: 'runpod-job-1234', status: 'COMPLETED', output: result() }),
    );
    const config: KukuYalanjiAsrConfig = {
      provider: 'runpod',
      endpoint: 'https://api.runpod.ai/v2/endpoint-id',
      token: 'runpod-secret',
      timeoutMs: 120000,
    };

    await expect(
      pollKukuYalanjiSpeech('runpod-job-1234', config, fetchMock as typeof fetch),
    ).resolves.toMatchObject({
      status: 'completed',
      result: { transcript: 'ngayu binal bama' },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.runpod.ai/v2/endpoint-id/status/runpod-job-1234',
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET');
  });

  it('signs short-lived opaque poll capabilities and rejects tampering', () => {
    const config: KukuYalanjiAsrConfig = {
      provider: 'runpod',
      endpoint: 'https://api.runpod.ai/v2/endpoint-id',
      token: 'runpod-secret',
      timeoutMs: 120000,
    };
    const token = createKukuYalanjiAsrPollToken('runpod-job-1234', config, 1_000);
    expect(verifyKukuYalanjiAsrPollToken(token, config, 2_000)).toBe('runpod-job-1234');
    expect(() => verifyKukuYalanjiAsrPollToken(`${token}x`, config, 2_000)).toThrow(
      'not recognized',
    );
    expect(() => verifyKukuYalanjiAsrPollToken(token, config, 16 * 60 * 1000)).toThrow(
      'expired',
    );
  });

  it('rejects a RunPod payload that expands beyond the provider limit', async () => {
    const fetchMock = vi.fn();
    const largeAudio = new File(
      [new Uint8Array(4 * 1024 * 1024)],
      'large.wav',
      { type: 'audio/wav' },
    );
    const config: KukuYalanjiAsrConfig = {
      provider: 'runpod',
      endpoint: 'https://api.runpod.ai/v2/endpoint-id',
      token: 'runpod-secret',
      timeoutMs: 120000,
    };

    await expect(
      submitKukuYalanjiSpeech(
        largeAudio,
        Array.from({ length: 4 }, () => ({
          audio: largeAudio,
          text: 'dingkar jalbu karrkay',
        })),
        config,
        fetchMock as typeof fetch,
      ),
    ).rejects.toMatchObject({ status: 413 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
