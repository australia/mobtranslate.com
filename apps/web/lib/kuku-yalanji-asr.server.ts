import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  KukuYalanjiAsrResultSchema,
  type KukuYalanjiAsrResult,
} from './kuku-yalanji-speech-types';

const MAX_UPSTREAM_WAIT_MS = 300_000;
const RUNPOD_QUEUE_HEADROOM_MS = 120_000;
const RUNPOD_MAX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RUNPOD_MAX_REQUEST_BYTES = 20 * 1024 * 1024;
const RUNPOD_POLL_TIMEOUT_MS = 30_000;
const POLL_TOKEN_TTL_MS = 15 * 60 * 1000;

export interface KukuYalanjiAsrConfig {
  provider: 'direct' | 'runpod';
  endpoint: string;
  token: string;
  timeoutMs: number;
}

export interface KukuYalanjiAsrContext {
  audio: File;
  text: string;
}

export type KukuYalanjiAsrSubmission =
  | { status: 'completed'; result: KukuYalanjiAsrResult }
  | { status: 'pending'; jobId: string };

export type KukuYalanjiAsrPoll =
  | { status: 'completed'; result: KukuYalanjiAsrResult }
  | { status: 'pending' };

export class KukuYalanjiAsrError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'KukuYalanjiAsrError';
    this.status = status;
  }
}

export function loadKukuYalanjiAsrConfig(
  env: NodeJS.ProcessEnv = process.env,
): KukuYalanjiAsrConfig | null {
  const endpoint = env.MOBTRANSLATE_KUKU_ASR_ENDPOINT?.trim();
  const token = env.MOBTRANSLATE_KUKU_ASR_TOKEN?.trim();
  const runpodEndpointId = env.MOBTRANSLATE_KUKU_ASR_RUNPOD_ENDPOINT_ID?.trim();
  const runpodToken = env.RUNPOD_API_KEY?.trim();
  const provider = endpoint && token ? 'direct' : runpodEndpointId && runpodToken ? 'runpod' : null;
  if (!provider) return null;

  const requestedTimeout = Number(
    env.MOBTRANSLATE_KUKU_ASR_TIMEOUT_MS ?? MAX_UPSTREAM_WAIT_MS,
  );
  const timeoutMs =
    Number.isSafeInteger(requestedTimeout) && requestedTimeout > 0
      ? Math.min(requestedTimeout, MAX_UPSTREAM_WAIT_MS)
      : MAX_UPSTREAM_WAIT_MS;
  return {
    provider,
    endpoint:
      provider === 'direct'
        ? endpoint!
        : `https://api.runpod.ai/v2/${runpodEndpointId}`,
    token: provider === 'direct' ? token! : runpodToken!,
    timeoutMs,
  };
}

function parseResult(payload: unknown): KukuYalanjiAsrResult {
  const parsed = KukuYalanjiAsrResultSchema.safeParse(payload);
  if (!parsed.success) {
    throw new KukuYalanjiAsrError(
      'The listening test returned an invalid result.',
      502,
    );
  }
  return parsed.data;
}

function providerFailure(payload: unknown): KukuYalanjiAsrError {
  const detail = z.object({ detail: z.string() }).safeParse(payload);
  const error = z.object({ error: z.string() }).safeParse(payload);
  return new KukuYalanjiAsrError(
    detail.success
      ? detail.data.detail
      : error.success
        ? error.data.error
        : 'The listening test could not process this recording.',
    503,
  );
}

async function runpodBody(
  target: File,
  contexts: KukuYalanjiAsrContext[],
  timeoutMs: number,
): Promise<string> {
  const serialized = JSON.stringify({
    input: {
      targetWavBase64: Buffer.from(await target.arrayBuffer()).toString('base64'),
      contexts: await Promise.all(
        contexts.map(async (context) => ({
          wavBase64: Buffer.from(await context.audio.arrayBuffer()).toString('base64'),
          text: context.text,
        })),
      ),
    },
    policy: {
      executionTimeout: timeoutMs,
      ttl: Math.min(timeoutMs + RUNPOD_QUEUE_HEADROOM_MS, RUNPOD_MAX_TTL_MS),
    },
  });
  if (Buffer.byteLength(serialized) > RUNPOD_MAX_REQUEST_BYTES) {
    throw new KukuYalanjiAsrError(
      'The voice examples are too large to send. Record shorter examples and try again.',
      413,
    );
  }
  return serialized;
}

async function fetchProvider(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<{ response: Response; payload: unknown }> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'connection failed';
    throw new KukuYalanjiAsrError(
      `The listening test is unavailable right now: ${detail}`,
      503,
    );
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = providerFailure(payload);
    throw new KukuYalanjiAsrError(
      failure.message,
      response.status === 413 || response.status === 422 || response.status === 429
        ? response.status
        : 503,
    );
  }
  return { response, payload };
}

export async function submitKukuYalanjiSpeech(
  target: File,
  contexts: KukuYalanjiAsrContext[],
  config: KukuYalanjiAsrConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<KukuYalanjiAsrSubmission> {
  const headers: HeadersInit = { Authorization: `Bearer ${config.token}` };
  if (config.provider === 'direct') {
    const form = new FormData();
    form.append('target', target, 'target.wav');
    for (const [index, context] of contexts.entries()) {
      form.append('context_audio', context.audio, `voice-example-${index + 1}.wav`);
      form.append('context_text', context.text);
    }
    const { payload } = await fetchProvider(
      config.endpoint,
      { method: 'POST', headers, body: form },
      config.timeoutMs,
      fetchImpl,
    );
    return { status: 'completed', result: parseResult(payload) };
  }

  headers['Content-Type'] = 'application/json';
  const { payload } = await fetchProvider(
    `${config.endpoint}/run`,
    {
      method: 'POST',
      headers,
      body: await runpodBody(target, contexts, config.timeoutMs),
    },
    RUNPOD_POLL_TIMEOUT_MS,
    fetchImpl,
  );
  const envelope = z
    .object({
      id: z.string().min(8).max(160),
      status: z.string(),
      output: z.unknown().optional(),
    })
    .safeParse(payload);
  if (!envelope.success) {
    throw new KukuYalanjiAsrError(
      'The listening worker did not accept the recording.',
      502,
    );
  }
  if (envelope.data.status === 'COMPLETED') {
    return { status: 'completed', result: parseResult(envelope.data.output) };
  }
  if (!['IN_QUEUE', 'IN_PROGRESS'].includes(envelope.data.status)) {
    throw providerFailure(envelope.data.output);
  }
  return { status: 'pending', jobId: envelope.data.id };
}

export async function pollKukuYalanjiSpeech(
  jobId: string,
  config: KukuYalanjiAsrConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<KukuYalanjiAsrPoll> {
  if (config.provider !== 'runpod' || !/^[A-Za-z0-9_-]{8,160}$/.test(jobId)) {
    throw new KukuYalanjiAsrError('The listening request is not recognized.', 400);
  }
  const { payload } = await fetchProvider(
    `${config.endpoint}/status/${encodeURIComponent(jobId)}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.token}` },
    },
    RUNPOD_POLL_TIMEOUT_MS,
    fetchImpl,
  );
  const envelope = z
    .object({ status: z.string(), output: z.unknown().optional() })
    .safeParse(payload);
  if (!envelope.success) {
    throw new KukuYalanjiAsrError(
      'The listening worker returned an invalid status.',
      502,
    );
  }
  if (['IN_QUEUE', 'IN_PROGRESS'].includes(envelope.data.status)) {
    return { status: 'pending' };
  }
  if (envelope.data.status !== 'COMPLETED') {
    throw providerFailure(envelope.data.output);
  }
  const output = envelope.data.output;
  if (output && typeof output === 'object' && 'success' in output && output.success === false) {
    const message =
      'error' in output && typeof output.error === 'string'
        ? output.error
        : 'The listening model could not process this recording.';
    throw new KukuYalanjiAsrError(message, 422);
  }
  return { status: 'completed', result: parseResult(output) };
}

const PollPayloadSchema = z.object({
  version: z.literal(1),
  jobId: z.string().regex(/^[A-Za-z0-9_-]{8,160}$/),
  expiresAt: z.number().int().positive(),
});

export function createKukuYalanjiAsrPollToken(
  jobId: string,
  config: KukuYalanjiAsrConfig,
  now = Date.now(),
): string {
  const payload = PollPayloadSchema.parse({
    version: 1,
    jobId,
    expiresAt: now + POLL_TOKEN_TTL_MS,
  });
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', config.token).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyKukuYalanjiAsrPollToken(
  token: string,
  config: KukuYalanjiAsrConfig,
  now = Date.now(),
): string {
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new KukuYalanjiAsrError('The listening request is not recognized.', 400);
  }
  const [encoded, suppliedSignature] = parts;
  const expectedSignature = createHmac('sha256', config.token)
    .update(encoded)
    .digest('base64url');
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new KukuYalanjiAsrError('The listening request is not recognized.', 400);
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
  } catch {
    throw new KukuYalanjiAsrError('The listening request is not recognized.', 400);
  }
  const parsed = PollPayloadSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.expiresAt < now) {
    throw new KukuYalanjiAsrError('The listening request has expired. Please try again.', 410);
  }
  return parsed.data.jobId;
}
