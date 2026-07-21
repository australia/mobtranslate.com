import { createHmac } from 'node:crypto';
import { eq, gt, lt, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { db } from '@/lib/db/index';
import { translationPipelineCache } from '@/lib/db/schema';
import {
  TRANSLATION_UNAVAILABLE_MESSAGE,
  isTranslationProviderFailure,
  safeTranslationErrorDiagnostic,
} from '@/lib/translation-service-error.server';

export type TranslationCacheState = 'hit' | 'miss' | 'coalesced' | 'disabled';

export interface TranslationCacheDescriptor {
  stage: string;
  languageCode: string;
  source: string;
  dictionaryFingerprint?: string | null;
  modelId: string;
  modelVersion: string;
  contractVersion: string;
}

export interface TranslationCacheResult<T> {
  value: T;
  state: TranslationCacheState;
  key: string | null;
}

export interface TranslationCacheOptions<T> {
  descriptor: TranslationCacheDescriptor;
  schema: z.ZodType<T>;
  ttlMs: number;
  negativeTtlMs?: number;
  beforeCompute?: () => Promise<void>;
  compute: () => Promise<T>;
  secret?: string | null;
}

interface CacheIdentity {
  key: string;
  sourceFingerprint: string;
  sourceLength: number;
}

interface CachedErrorPayload {
  message: string;
  status: number;
}

const CACHE_KEY_VERSION = 'translation-cache-key-v1';
const inFlight = new Map<string, Promise<unknown>>();
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const EXPIRED_ROW_GRACE_MS = 24 * 60 * 60 * 1000;
let lastPruneAttemptAt = 0;
let pruneInFlight: Promise<void> | null = null;

export const TRANSLATION_CACHE_TTL = {
  draft: 180 * 24 * 60 * 60 * 1000,
  evidence: 90 * 24 * 60 * 60 * 1000,
  review: 30 * 24 * 60 * 60 * 1000,
  resolved: 30 * 24 * 60 * 60 * 1000,
  standardTranslation: 30 * 24 * 60 * 60 * 1000,
  transientError: 30 * 1000,
} as const;

export class CachedTranslationStageError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CachedTranslationStageError';
    this.status = status;
  }
}

export function normalizeTranslationCacheSource(source: string): string {
  return source.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function cacheSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  return (
    env.MOBTRANSLATE_TRANSLATION_CACHE_SECRET?.trim() ||
    env.BETTER_AUTH_SECRET?.trim() ||
    null
  );
}

export function createTranslationCacheIdentity(
  descriptor: TranslationCacheDescriptor,
  secret: string,
): CacheIdentity {
  const normalizedSource = normalizeTranslationCacheSource(descriptor.source);
  const sourceFingerprint = createHmac('sha256', secret)
    .update(normalizedSource)
    .digest('hex');
  const canonicalDescriptor = JSON.stringify({
    keyVersion: CACHE_KEY_VERSION,
    stage: descriptor.stage,
    languageCode: descriptor.languageCode,
    sourceFingerprint,
    dictionaryFingerprint: descriptor.dictionaryFingerprint ?? null,
    modelId: descriptor.modelId,
    modelVersion: descriptor.modelVersion,
    contractVersion: descriptor.contractVersion,
  });
  return {
    key: createHmac('sha256', secret).update(canonicalDescriptor).digest('hex'),
    sourceFingerprint,
    sourceLength: normalizedSource.length,
  };
}

function statusFromError(error: unknown): number {
  return isTranslationProviderFailure(safeTranslationErrorDiagnostic(error))
    ? 503
    : 500;
}

function messageFromError(): string {
  return TRANSLATION_UNAVAILABLE_MESSAGE;
}

async function readCache<T>(
  identity: CacheIdentity,
  schema: z.ZodType<T>,
): Promise<{ value?: T; error?: CachedErrorPayload } | null> {
  const now = new Date().toISOString();
  const rows = await db
    .select({
      status: translationPipelineCache.status,
      payload: translationPipelineCache.payload,
      errorMessage: translationPipelineCache.errorMessage,
      errorStatus: translationPipelineCache.errorStatus,
    })
    .from(translationPipelineCache)
    .where(
      sql`${translationPipelineCache.cacheKey} = ${identity.key} AND ${translationPipelineCache.expiresAt} > ${now}`,
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  await db
    .update(translationPipelineCache)
    .set({
      hitCount: sql`${translationPipelineCache.hitCount} + 1`,
      lastHitAt: now,
      updatedAt: now,
    })
    .where(eq(translationPipelineCache.cacheKey, identity.key));

  if (row.status === 'error') {
    return {
      error: {
        message:
          row.errorMessage || 'Translation stage temporarily unavailable.',
        status: row.errorStatus || 503,
      },
    };
  }

  const parsed = schema.safeParse(row.payload);
  return parsed.success ? { value: parsed.data } : null;
}

async function writeReady<T>(
  descriptor: TranslationCacheDescriptor,
  identity: CacheIdentity,
  value: T,
  ttlMs: number,
): Promise<void> {
  const now = new Date();
  const row = {
    cacheKey: identity.key,
    stage: descriptor.stage,
    languageCode: descriptor.languageCode,
    sourceFingerprint: identity.sourceFingerprint,
    sourceLength: identity.sourceLength,
    dictionaryFingerprint: descriptor.dictionaryFingerprint ?? null,
    modelId: descriptor.modelId,
    modelVersion: descriptor.modelVersion,
    contractVersion: descriptor.contractVersion,
    status: 'ready',
    payload: value,
    errorMessage: null,
    errorStatus: null,
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    updatedAt: now.toISOString(),
  };
  await db.insert(translationPipelineCache).values(row).onConflictDoUpdate({
    target: translationPipelineCache.cacheKey,
    set: row,
  });
}

async function writeError(
  descriptor: TranslationCacheDescriptor,
  identity: CacheIdentity,
  error: unknown,
  ttlMs: number,
): Promise<void> {
  const now = new Date();
  const row = {
    cacheKey: identity.key,
    stage: descriptor.stage,
    languageCode: descriptor.languageCode,
    sourceFingerprint: identity.sourceFingerprint,
    sourceLength: identity.sourceLength,
    dictionaryFingerprint: descriptor.dictionaryFingerprint ?? null,
    modelId: descriptor.modelId,
    modelVersion: descriptor.modelVersion,
    contractVersion: descriptor.contractVersion,
    status: 'error',
    payload: null,
    errorMessage: messageFromError(),
    errorStatus: statusFromError(error),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    updatedAt: now.toISOString(),
  };
  await db.insert(translationPipelineCache).values(row).onConflictDoUpdate({
    target: translationPipelineCache.cacheKey,
    set: row,
  });
}

async function pruneExpiredRows(): Promise<void> {
  const now = Date.now();
  if (now - lastPruneAttemptAt < PRUNE_INTERVAL_MS || pruneInFlight) return;
  lastPruneAttemptAt = now;
  pruneInFlight = db
    .delete(translationPipelineCache)
    .where(
      lt(
        translationPipelineCache.expiresAt,
        new Date(now - EXPIRED_ROW_GRACE_MS).toISOString(),
      ),
    )
    .then(() => undefined)
    .catch((error) => {
      console.error(
        'Translation cache pruning failed:',
        safeTranslationErrorDiagnostic(error),
      );
    })
    .finally(() => {
      pruneInFlight = null;
    });
  await pruneInFlight;
}

export async function withTranslationCache<T>(
  options: TranslationCacheOptions<T>,
): Promise<TranslationCacheResult<T>> {
  const secret = options.secret === undefined ? cacheSecret() : options.secret;
  if (!secret) {
    await options.beforeCompute?.();
    return { value: await options.compute(), state: 'disabled', key: null };
  }

  void pruneExpiredRows();

  const identity = createTranslationCacheIdentity(options.descriptor, secret);
  try {
    const cached = await readCache(identity, options.schema);
    if (cached?.error) {
      throw new CachedTranslationStageError(
        cached.error.message,
        cached.error.status,
      );
    }
    if (cached?.value !== undefined) {
      return { value: cached.value, state: 'hit', key: identity.key };
    }
  } catch (error) {
    if (error instanceof CachedTranslationStageError) throw error;
    console.error(
      'Translation cache read failed; computing directly:',
      safeTranslationErrorDiagnostic(error),
    );
  }

  const existing = inFlight.get(identity.key) as Promise<T> | undefined;
  if (existing) {
    return {
      value: await existing,
      state: 'coalesced',
      key: identity.key,
    };
  }

  // Caller-specific request/provider budgets belong outside the shared
  // computation promise and negative cache. A 429 must never poison this cache
  // key for unrelated callers.
  await options.beforeCompute?.();
  const computation = Promise.resolve().then(options.compute);
  inFlight.set(identity.key, computation);
  try {
    const value = await computation;
    try {
      await writeReady(options.descriptor, identity, value, options.ttlMs);
    } catch (error) {
      console.error(
        'Translation cache write failed; returning result:',
        safeTranslationErrorDiagnostic(error),
      );
    }
    return { value, state: 'miss', key: identity.key };
  } catch (error) {
    if ((options.negativeTtlMs ?? 0) > 0) {
      try {
        await writeError(
          options.descriptor,
          identity,
          error,
          options.negativeTtlMs!,
        );
      } catch (cacheError) {
        console.error(
          'Translation negative-cache write failed:',
          safeTranslationErrorDiagnostic(cacheError),
        );
      }
    }
    throw error;
  } finally {
    inFlight.delete(identity.key);
  }
}

export async function countLiveTranslationCacheRows(): Promise<number> {
  const now = new Date().toISOString();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(translationPipelineCache)
    .where(gt(translationPipelineCache.expiresAt, now));
  return rows[0]?.count ?? 0;
}
