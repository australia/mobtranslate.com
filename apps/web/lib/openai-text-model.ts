import type { OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai';

/**
 * The OpenAI text model every part of mobtranslate uses: translation checks,
 * reverse translation, chat, speech replies, word-image planning and
 * dictionary sync (owner decision, 2026-10-20). Images and embeddings use
 * their own model families and are not covered by this.
 */
export const OPENAI_TEXT_MODEL = 'gpt-6-luna';

/** Low effort keeps replies quick; luna at low matched mini at high on checks. */
export const OPENAI_TEXT_REASONING_EFFORT = 'low' as const;

/**
 * Options for AI SDK calls on OPENAI_TEXT_MODEL. The installed SDK does not
 * recognise gpt-6-luna as a reasoning model and silently drops
 * reasoningEffort unless forceReasoning is set.
 */
export const openAiTextModelOptions = {
  openai: {
    forceReasoning: true,
    reasoningEffort: OPENAI_TEXT_REASONING_EFFORT,
  } satisfies OpenAILanguageModelResponsesOptions,
};
