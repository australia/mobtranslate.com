import { z } from 'zod';
import type { HybridLanguageContract } from './hybrid-translation-registry.server';

export const HybridModelResultSchema = z.object({
  translation: z.string().trim().min(1),
  kuku: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1),
  modelId: z.string().trim().min(1),
  apiVersion: z.string().trim().min(1),
  task: z.literal('translate'),
  languageCode: z.string().trim().min(1),
  languageName: z.string().trim().min(1),
  languageTag: z.string().trim().min(1),
  sourceLang: z.string().trim().min(1),
  targetLang: z.string().trim().min(1),
  ms: z.number().nonnegative(),
  queueMs: z.number().nonnegative(),
  validation: z.literal('unverified_research_preview'),
  notice: z.string().trim().min(1),
});

export type HybridModelResult = z.infer<typeof HybridModelResultSchema>;

export class HybridModelInferenceError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'HybridModelInferenceError';
  }
}

export async function translateWithHybridModel(
  text: string,
  contract: HybridLanguageContract,
  fetchImpl: typeof fetch = fetch,
): Promise<HybridModelResult> {
  let upstream: Response;
  try {
    upstream = await fetchImpl(contract.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: contract.languageCode }),
      signal: AbortSignal.timeout(contract.timeoutMs),
      cache: 'no-store',
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'connection failed';
    throw new HybridModelInferenceError(
      `${contract.languageName} translation is temporarily unavailable: ${detail}`,
      503,
    );
  }

  const payload = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const message =
      payload && typeof payload.error === 'string'
        ? payload.error
        : `${contract.languageName} inference returned HTTP ${upstream.status}`;
    const status =
      upstream.status === 413 || upstream.status === 429
        ? upstream.status
        : 503;
    throw new HybridModelInferenceError(message, status);
  }

  const parsed = HybridModelResultSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HybridModelInferenceError(
      `${contract.languageName} inference returned an invalid response.`,
      502,
    );
  }
  const result = parsed.data;
  const identityErrors = [
    result.languageCode !== contract.languageCode
      ? `language ${result.languageCode}`
      : null,
    result.model !== contract.modelVersion ? `version ${result.model}` : null,
    result.modelId !== contract.modelId ? `model ${result.modelId}` : null,
    result.sourceLang !== contract.sourceLang
      ? `source token ${result.sourceLang}`
      : null,
    result.targetLang !== contract.targetLang
      ? `target token ${result.targetLang}`
      : null,
  ].filter(Boolean);
  if (identityErrors.length > 0) {
    throw new HybridModelInferenceError(
      `The inference endpoint is serving the wrong contract (${identityErrors.join(', ')}).`,
      503,
    );
  }
  if (result.kuku != null && result.kuku !== result.translation) {
    throw new HybridModelInferenceError(
      'The inference endpoint returned inconsistent translation fields.',
      502,
    );
  }

  return result;
}
