import {
  createOpenAI,
  type OpenAILanguageModelResponsesOptions,
} from '@ai-sdk/openai';
import { generateText, tool } from 'ai';
import type { z } from 'zod';

/**
 * One structured model call: the model must call a single tool whose input
 * schema is the Zod schema, and the validated tool input is the result.
 * Nothing is ever parsed out of free text.
 */

let structuredOpenAI: ReturnType<typeof createOpenAI> | null = null;
function getStructuredOpenAI(): ReturnType<typeof createOpenAI> {
  if (!structuredOpenAI) {
    structuredOpenAI = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return structuredOpenAI;
}

export type StructuredReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export interface StructuredCallOptions<T> {
  modelId: string;
  system: string;
  prompt: string;
  toolName: string;
  toolDescription: string;
  schema: z.ZodType<T>;
  reasoningEffort: StructuredReasoningEffort;
  /**
   * Tried once more at this effort, with the time that is left, when the
   * first call ends without calling the tool (usually because reasoning used
   * up the output allowance) or runs past primaryTimeoutMs.
   */
  fallbackReasoningEffort?: StructuredReasoningEffort;
  /** How long the first attempt may take when a fallback is set. */
  primaryTimeoutMs?: number;
  /** Reasoning tokens count against this cap, so keep generous headroom. */
  maxOutputTokens: number;
  timeoutMs: number;
}

function isTimeout(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

class MissingToolCallError extends Error {
  constructor(toolName: string, finishReason: string) {
    super(`The ${toolName} step did not return a result (finish reason: ${finishReason}).`);
    this.name = 'MissingToolCallError';
  }
}

async function callOnce<T>(
  options: StructuredCallOptions<T>,
  reasoningEffort: StructuredReasoningEffort,
  timeoutMs: number,
): Promise<T> {
  const completion = await generateText({
    model: getStructuredOpenAI().responses(options.modelId),
    system: options.system,
    prompt: options.prompt,
    tools: {
      [options.toolName]: tool({
        description: options.toolDescription,
        inputSchema: options.schema,
      }),
    },
    toolChoice: { type: 'tool', toolName: options.toolName },
    maxRetries: 0,
    maxOutputTokens: options.maxOutputTokens,
    abortSignal: AbortSignal.timeout(timeoutMs),
    providerOptions: {
      openai: {
        // Every model this runs on reasons (gpt-5.x, gpt-6-luna), but the SDK
        // only recognises some names as reasoning models and silently drops
        // reasoningEffort for the rest.
        forceReasoning: true,
        reasoningEffort,
        parallelToolCalls: false,
        store: false,
        textVerbosity: 'low',
      } satisfies OpenAILanguageModelResponsesOptions,
    },
  });
  const submitted = completion.toolCalls.find(
    (call) => call.toolName === options.toolName,
  );
  if (!submitted) {
    throw new MissingToolCallError(options.toolName, completion.finishReason);
  }
  return options.schema.parse(submitted.input);
}

export async function runStructuredCall<T>(
  options: StructuredCallOptions<T>,
): Promise<{ value: T; latencyMs: number }> {
  const startedAt = Date.now();
  const firstTimeout = options.fallbackReasoningEffort
    ? Math.min(options.primaryTimeoutMs ?? options.timeoutMs, options.timeoutMs)
    : options.timeoutMs;
  try {
    const value = await callOnce(options, options.reasoningEffort, firstTimeout);
    return { value, latencyMs: Date.now() - startedAt };
  } catch (error) {
    const remaining = options.timeoutMs - (Date.now() - startedAt);
    const retryable = error instanceof MissingToolCallError || isTimeout(error);
    if (!retryable || !options.fallbackReasoningEffort || remaining < 10000) {
      throw error;
    }
    console.warn(
      `The ${options.toolName} step at ${options.reasoningEffort} effort did not finish (${(error as Error).message}); retrying at ${options.fallbackReasoningEffort} effort.`,
    );
    const value = await callOnce(options, options.fallbackReasoningEffort, remaining);
    return { value, latencyMs: Date.now() - startedAt };
  }
}
