/** Backwards-compatible Kuku facade over the shared model-inference client. */
import {
  HybridModelInferenceError,
  HybridModelResultSchema,
  translateWithHybridModel,
  type HybridModelResult,
} from './hybrid-model-inference.server';
import {
  HYBRID_SPACE_ENDPOINT,
  KUKU_YALANJI_HYBRID_DEFINITION,
  loadHybridLanguageContract,
} from './hybrid-translation-registry.server';

export const KUKU_YALANJI_LANGUAGE_CODE = 'kuku_yalanji';
export const KUKU_YALANJI_MODEL_ID = KUKU_YALANJI_HYBRID_DEFINITION.modelId;
export const KUKU_YALANJI_V24_VERSION =
  KUKU_YALANJI_HYBRID_DEFINITION.modelVersion;
export const KUKU_YALANJI_HUGGING_FACE_ENDPOINT = HYBRID_SPACE_ENDPOINT;
export const KUKU_YALANJI_HUGGING_FACE_REPOSITORY =
  KUKU_YALANJI_HYBRID_DEFINITION.repository;
export const KukuYalanjiModelResultSchema = HybridModelResultSchema;

export interface KukuYalanjiModelConfig {
  endpoint: string;
  modelId: string;
  version: string;
  timeoutMs: number;
}

export type KukuYalanjiModelResult = HybridModelResult;
export { HybridModelInferenceError as KukuYalanjiInferenceError };

export function loadKukuYalanjiModelConfig(
  env: NodeJS.ProcessEnv = process.env,
): KukuYalanjiModelConfig | null {
  const contract = loadHybridLanguageContract(KUKU_YALANJI_LANGUAGE_CODE, env);
  if (!contract) return null;
  return {
    endpoint: contract.endpoint,
    modelId: contract.modelId,
    version: contract.modelVersion,
    timeoutMs: contract.timeoutMs,
  };
}

export async function translateWithKukuYalanjiModel(
  text: string,
  config: KukuYalanjiModelConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<KukuYalanjiModelResult> {
  return translateWithHybridModel(
    text,
    {
      ...KUKU_YALANJI_HYBRID_DEFINITION,
      endpoint: config.endpoint,
      modelId: config.modelId,
      modelVersion: config.version,
      timeoutMs: config.timeoutMs,
      reviewModelId: '',
    },
    fetchImpl,
  ).catch((error) => {
    if (error instanceof HybridModelInferenceError) throw error;
    throw new HybridModelInferenceError(
      'Kuku Yalanji translation is temporarily unavailable.',
      503,
    );
  });
}
