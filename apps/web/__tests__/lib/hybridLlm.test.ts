// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const generateText = vi.fn();
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateText(...args),
  tool: (definition: unknown) => definition,
}));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => ({ responses: (modelId: string) => ({ modelId }) }),
}));

const { runStructuredCall } = await import('../../lib/hybrid-llm.server');

const schema = z.object({ answer: z.string() });
const options = {
  modelId: 'model',
  system: 'system',
  prompt: 'prompt',
  toolName: 'submit',
  toolDescription: 'Submit.',
  schema,
  reasoningEffort: 'high' as const,
  maxOutputTokens: 1000,
  timeoutMs: 60_000,
};

function effortOf(call: number): string {
  return generateText.mock.calls[call][0].providerOptions.openai.reasoningEffort;
}

describe('structured model calls', () => {
  beforeEach(() => generateText.mockReset());

  it('returns the validated tool input', async () => {
    generateText.mockResolvedValueOnce({
      toolCalls: [{ toolName: 'submit', input: { answer: 'yes' } }],
      finishReason: 'tool-calls',
    });
    await expect(runStructuredCall(options)).resolves.toMatchObject({ value: { answer: 'yes' } });
  });

  it('retries at the fallback effort when reasoning uses up the output allowance', async () => {
    generateText
      .mockResolvedValueOnce({ toolCalls: [], finishReason: 'length' })
      .mockResolvedValueOnce({
        toolCalls: [{ toolName: 'submit', input: { answer: 'retried' } }],
        finishReason: 'tool-calls',
      });
    const result = await runStructuredCall({ ...options, fallbackReasoningEffort: 'medium' });
    expect(result.value).toEqual({ answer: 'retried' });
    expect([effortOf(0), effortOf(1)]).toEqual(['high', 'medium']);
  });

  it('retries at the fallback effort when the first attempt runs past its time', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    generateText.mockRejectedValueOnce(timeout).mockResolvedValueOnce({
      toolCalls: [{ toolName: 'submit', input: { answer: 'in time' } }],
      finishReason: 'tool-calls',
    });
    const result = await runStructuredCall({
      ...options,
      fallbackReasoningEffort: 'medium',
      primaryTimeoutMs: 20_000,
    });
    expect(result.value).toEqual({ answer: 'in time' });
  });

  it('does not retry other failures or calls without a fallback', async () => {
    generateText.mockRejectedValueOnce(Object.assign(new Error('bad request'), { status: 400 }));
    await expect(
      runStructuredCall({ ...options, fallbackReasoningEffort: 'medium' }),
    ).rejects.toThrow('bad request');

    generateText.mockResolvedValueOnce({ toolCalls: [], finishReason: 'length' });
    await expect(runStructuredCall(options)).rejects.toThrow('finish reason: length');
    expect(generateText).toHaveBeenCalledTimes(2);
  });
});
