import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';

interface Limit {
  limit: number;
  windowSeconds: number;
}

interface LimitSet {
  scope: string;
  perSubject: Limit;
  global?: Limit[];
}

interface ConsumeResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

type RequestIdentity = Pick<Request, 'headers'>;

export class ApiRateLimitError extends Error {
  readonly status = 429;
  readonly retryAfterSeconds: number;

  constructor(
    message: string,
    retryAfterSeconds: number,
  ) {
    super(message);
    this.name = 'ApiRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ApiBudgetUnavailableError extends Error {
  readonly status = 503;

  constructor() {
    super('The service cannot verify its usage budget right now. Please try again shortly.');
    this.name = 'ApiBudgetUnavailableError';
  }
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function secret(): string {
  const value =
    process.env.MOBTRANSLATE_RATE_LIMIT_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim();
  if (!value) throw new ApiBudgetUnavailableError();
  return value;
}

function validAddress(value: string | null): string | null {
  if (!value) return null;
  const candidate = value.trim();
  return isIP(candidate) ? candidate : null;
}

export function clientNetworkIdentity(request: RequestIdentity): string {
  const cloudflare = validAddress(request.headers.get('cf-connecting-ip'));
  if (cloudflare) return cloudflare;

  const forwarded = request.headers
    .get('x-forwarded-for')
    ?.split(',')
    .map((part) => validAddress(part))
    .filter((part): part is string => Boolean(part));
  if (forwarded?.length) return forwarded[forwarded.length - 1];

  return validAddress(request.headers.get('x-real-ip')) ?? 'unknown';
}

export function rateLimitSubjectHash(subject: string, key: string): string {
  return createHmac('sha256', key).update(subject).digest('hex');
}

function firstRow(result: any): Record<string, unknown> | undefined {
  if (Array.isArray(result)) return result[0];
  return result?.rows?.[0];
}

async function consume(
  scope: string,
  subject: string,
  constraint: Limit,
): Promise<ConsumeResult> {
  const subjectHash = rateLimitSubjectHash(subject, secret());
  const cappedCount = constraint.limit + 1;
  try {
    const result = await db.execute(sql`
      WITH bounds AS (
        SELECT to_timestamp(
          floor(extract(epoch FROM clock_timestamp()) / ${constraint.windowSeconds})
          * ${constraint.windowSeconds}
        ) AS window_started_at
      ), bumped AS (
        INSERT INTO public.public_api_rate_limits (
          scope,
          subject_hash,
          window_seconds,
          window_started_at,
          request_count,
          expires_at
        )
        SELECT
          ${scope},
          ${subjectHash},
          ${constraint.windowSeconds},
          bounds.window_started_at,
          1,
          bounds.window_started_at
            + (${constraint.windowSeconds + 86_400} * interval '1 second')
        FROM bounds
        ON CONFLICT (scope, subject_hash, window_seconds, window_started_at)
        DO UPDATE SET
          request_count = LEAST(
            public_api_rate_limits.request_count + 1,
            ${cappedCount}
          ),
          updated_at = clock_timestamp(),
          expires_at = EXCLUDED.expires_at
        RETURNING request_count, window_started_at
      )
      SELECT
        request_count,
        GREATEST(
          1,
          CEIL(EXTRACT(EPOCH FROM (
            window_started_at
              + (${constraint.windowSeconds} * interval '1 second')
              - clock_timestamp()
          )))
        )::integer AS retry_after_seconds
      FROM bumped
    `);
    const row = firstRow(result);
    if (!row) throw new Error('Rate-limit query returned no row.');
    const count = Number(row.request_count);
    return {
      allowed: count <= constraint.limit,
      count,
      limit: constraint.limit,
      retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds) || 1),
    };
  } catch (error) {
    if (error instanceof ApiBudgetUnavailableError) throw error;
    console.error('Public API budget check failed:', error);
    throw new ApiBudgetUnavailableError();
  }
}

async function enforce(
  request: RequestIdentity,
  userId: string | null,
  limits: LimitSet,
): Promise<void> {
  const subject = userId
    ? `user:${userId}`
    : `network:${clientNetworkIdentity(request)}`;
  const subjectResult = await consume(
    `${limits.scope}:subject`,
    subject,
    limits.perSubject,
  );
  if (!subjectResult.allowed) {
    throw new ApiRateLimitError(
      'Too many requests. Please wait a moment and try again.',
      subjectResult.retryAfterSeconds,
    );
  }

  for (const globalLimit of limits.global ?? []) {
    const globalResult = await consume(
      `${limits.scope}:global`,
      'global',
      globalLimit,
    );
    if (!globalResult.allowed) {
      throw new ApiRateLimitError(
        'The service has reached its current usage limit. Please try again later.',
        globalResult.retryAfterSeconds,
      );
    }
  }
}

export function enforceTranslationRequestLimit(
  request: RequestIdentity,
  userId: string | null,
): Promise<void> {
  return enforce(request, userId, {
    scope: 'request:translation',
    perSubject: {
      limit: positiveInteger('MOBTRANSLATE_RATE_TRANSLATION_10M', 60),
      windowSeconds: 600,
    },
    global: [
      {
        limit: positiveInteger('MOBTRANSLATE_RATE_TRANSLATION_GLOBAL_MINUTE', 240),
        windowSeconds: 60,
      },
    ],
  });
}

export function enforceChatRequestLimit(
  request: RequestIdentity,
  userId: string | null,
): Promise<void> {
  return enforce(request, userId, {
    scope: 'request:chat',
    perSubject: {
      limit: positiveInteger('MOBTRANSLATE_RATE_CHAT_10M', 30),
      windowSeconds: 600,
    },
    global: [
      {
        limit: positiveInteger('MOBTRANSLATE_RATE_CHAT_GLOBAL_MINUTE', 120),
        windowSeconds: 60,
      },
    ],
  });
}

export function enforceImageRequestLimit(
  request: RequestIdentity,
  userId: string | null,
): Promise<void> {
  return enforce(request, userId, {
    scope: 'request:word-image',
    perSubject: {
      limit: positiveInteger('MOBTRANSLATE_RATE_IMAGE_HOUR', 30),
      windowSeconds: 3600,
    },
    global: [
      {
        limit: positiveInteger('MOBTRANSLATE_RATE_IMAGE_GLOBAL_MINUTE', 120),
        windowSeconds: 60,
      },
    ],
  });
}

export function enforceTtsRequestLimit(
  request: RequestIdentity,
  userId: string | null,
): Promise<void> {
  return enforce(request, userId, {
    scope: 'request:tts',
    perSubject: {
      limit: positiveInteger('MOBTRANSLATE_RATE_TTS_10M', 60),
      windowSeconds: 600,
    },
    global: [
      {
        limit: positiveInteger('MOBTRANSLATE_RATE_TTS_GLOBAL_MINUTE', 240),
        windowSeconds: 60,
      },
    ],
  });
}

export function enforceAsrRequestLimit(
  request: RequestIdentity,
  userId: string | null,
): Promise<void> {
  return enforce(request, userId, {
    scope: 'request:kuku-asr',
    perSubject: {
      limit: positiveInteger('MOBTRANSLATE_RATE_ASR_10M', 20),
      windowSeconds: 600,
    },
    global: [
      {
        limit: positiveInteger('MOBTRANSLATE_RATE_ASR_GLOBAL_MINUTE', 30),
        windowSeconds: 60,
      },
    ],
  });
}

export function enforceAsrStatusRequestLimit(
  request: RequestIdentity,
  userId: string | null,
): Promise<void> {
  return enforce(request, userId, {
    scope: 'request:kuku-asr-status',
    perSubject: {
      limit: positiveInteger('MOBTRANSLATE_RATE_ASR_STATUS_10M', 240),
      windowSeconds: 600,
    },
    global: [
      {
        limit: positiveInteger('MOBTRANSLATE_RATE_ASR_STATUS_GLOBAL_MINUTE', 600),
        windowSeconds: 60,
      },
    ],
  });
}

export function enforceEventRequestLimit(
  request: RequestIdentity,
  userId: string | null,
): Promise<void> {
  return enforce(request, userId, {
    scope: 'request:event',
    perSubject: {
      limit: positiveInteger('MOBTRANSLATE_RATE_EVENT_10M', 120),
      windowSeconds: 600,
    },
    global: [
      {
        limit: positiveInteger('MOBTRANSLATE_RATE_EVENT_GLOBAL_MINUTE', 600),
        windowSeconds: 60,
      },
    ],
  });
}

export function enforceOpenAiProviderBudget(
  request: RequestIdentity,
  userId: string | null,
): Promise<void> {
  return enforce(request, userId, {
    scope: 'provider:openai',
    perSubject: {
      limit: positiveInteger('MOBTRANSLATE_BUDGET_OPENAI_10M', 20),
      windowSeconds: 600,
    },
    global: [
      {
        limit: positiveInteger('MOBTRANSLATE_BUDGET_OPENAI_HOUR', 60),
        windowSeconds: 3600,
      },
      {
        limit: positiveInteger('MOBTRANSLATE_BUDGET_OPENAI_DAY', 300),
        windowSeconds: 86_400,
      },
    ],
  });
}

export function enforceHuggingFaceProviderBudget(
  request: RequestIdentity,
  userId: string | null,
): Promise<void> {
  return enforce(request, userId, {
    scope: 'provider:huggingface',
    perSubject: {
      limit: positiveInteger('MOBTRANSLATE_BUDGET_HF_10M', 30),
      windowSeconds: 600,
    },
    global: [
      {
        limit: positiveInteger('MOBTRANSLATE_BUDGET_HF_HOUR', 120),
        windowSeconds: 3600,
      },
      {
        limit: positiveInteger('MOBTRANSLATE_BUDGET_HF_DAY', 600),
        windowSeconds: 86_400,
      },
    ],
  });
}

export function enforceImageProviderBudget(
  request: RequestIdentity,
  userId: string | null,
): Promise<void> {
  return enforce(request, userId, {
    scope: 'provider:openai-image',
    perSubject: {
      limit: positiveInteger('MOBTRANSLATE_BUDGET_IMAGE_DAY_PER_SUBJECT', 5),
      windowSeconds: 86_400,
    },
    global: [
      {
        limit: positiveInteger('MOBTRANSLATE_BUDGET_IMAGE_DAY', 20),
        windowSeconds: 86_400,
      },
    ],
  });
}

export function enforceCustomModelProviderBudget(
  request: RequestIdentity,
  userId: string | null,
): Promise<void> {
  return enforce(request, userId, {
    scope: 'provider:custom-model',
    perSubject: {
      limit: positiveInteger('MOBTRANSLATE_BUDGET_CUSTOM_MODEL_10M', 30),
      windowSeconds: 600,
    },
    global: [
      {
        limit: positiveInteger('MOBTRANSLATE_BUDGET_CUSTOM_MODEL_HOUR', 120),
        windowSeconds: 3600,
      },
    ],
  });
}

export function enforceTtsProviderBudget(
  request: RequestIdentity,
  userId: string | null,
): Promise<void> {
  return enforce(request, userId, {
    scope: 'provider:tts',
    perSubject: {
      limit: positiveInteger('MOBTRANSLATE_BUDGET_TTS_10M', 20),
      windowSeconds: 600,
    },
    global: [
      {
        limit: positiveInteger('MOBTRANSLATE_BUDGET_TTS_HOUR', 120),
        windowSeconds: 3600,
      },
    ],
  });
}

export function enforceAsrProviderBudget(
  request: RequestIdentity,
  userId: string | null,
): Promise<void> {
  return enforce(request, userId, {
    scope: 'provider:kuku-asr',
    perSubject: {
      limit: positiveInteger('MOBTRANSLATE_BUDGET_ASR_10M', 20),
      windowSeconds: 600,
    },
    global: [
      {
        limit: positiveInteger('MOBTRANSLATE_BUDGET_ASR_HOUR', 120),
        windowSeconds: 3600,
      },
      {
        limit: positiveInteger('MOBTRANSLATE_BUDGET_ASR_DAY', 600),
        windowSeconds: 86_400,
      },
    ],
  });
}

export function apiGuardResponse(error: unknown): Response | null {
  if (error instanceof ApiRateLimitError) {
    return Response.json(
      { success: false, error: error.message },
      {
        status: error.status,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(error.retryAfterSeconds),
        },
      },
    );
  }
  if (error instanceof ApiBudgetUnavailableError) {
    return Response.json(
      { success: false, error: error.message },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return null;
}
