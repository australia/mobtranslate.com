import { z } from 'zod';
import type { HybridLanguageContract } from './hybrid-translation-registry.server';
import {
  renderExpectedControlledTranslation,
  type ControlledTranslationRequest,
} from './controlled-translation.server';

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

export const ControlledHybridModelResultSchema = z.object({
  translation: z.string().trim().min(1),
  modelTemplate: z.string().trim().min(1),
  route: z.literal('controlled_slot'),
  model: z.string().trim().min(1),
  modelId: z.string().trim().min(1),
  apiVersion: z.string().trim().min(1),
  task: z.string().trim().min(1),
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

export type ControlledHybridModelResult = z.infer<
  typeof ControlledHybridModelResultSchema
>;

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

function generationEndpoint(translationEndpoint: string): string {
  const endpoint = new URL(translationEndpoint);
  if (!endpoint.pathname.endsWith('/v1/translate')) {
    throw new HybridModelInferenceError(
      'The configured model endpoint has no versioned generation route.',
      503,
    );
  }
  endpoint.pathname = endpoint.pathname.replace(/\/v1\/translate$/, '/v1/generate');
  return endpoint.toString();
}

export async function translateWithControlledHybridModel(
  request: ControlledTranslationRequest,
  contract: HybridLanguageContract,
  fetchImpl: typeof fetch = fetch,
): Promise<ControlledHybridModelResult> {
  let upstream: Response;
  try {
    upstream = await fetchImpl(generationEndpoint(contract.endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: request.modelText,
        task: request.task,
        language: contract.languageCode,
        bindings: request.bindings,
      }),
      signal: AbortSignal.timeout(contract.timeoutMs),
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof HybridModelInferenceError) throw error;
    const detail = error instanceof Error ? error.message : 'connection failed';
    throw new HybridModelInferenceError(
      `${contract.languageName} controlled translation is temporarily unavailable: ${detail}`,
      503,
    );
  }

  const payload = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const message =
      payload && typeof payload.error === 'string'
        ? payload.error
        : `${contract.languageName} inference returned HTTP ${upstream.status}`;
    throw new HybridModelInferenceError(message, 503);
  }
  const parsed = ControlledHybridModelResultSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HybridModelInferenceError(
      `${contract.languageName} inference returned an invalid controlled response.`,
      502,
    );
  }
  const result = parsed.data;
  const expectedTranslation = renderExpectedControlledTranslation(request);
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
    result.task !== request.task ? `task ${result.task}` : null,
    result.modelTemplate !== request.modelTemplate
      ? `template ${result.modelTemplate}`
      : null,
    result.translation !== expectedTranslation
      ? `translation ${result.translation}`
      : null,
  ].filter(Boolean);
  if (identityErrors.length > 0) {
    throw new HybridModelInferenceError(
      `The inference endpoint violated the controlled contract (${identityErrors.join(', ')}).`,
      503,
    );
  }
  return result;
}
