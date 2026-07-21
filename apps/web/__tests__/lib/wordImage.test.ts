// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => (model: string) => ({ model }),
}));
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => mocks.generateText(...args),
  tool: (definition: unknown) => definition,
}));

import { composeImagePrompt } from '@/lib/word-image';

describe('dictionary image prompt composition', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    mocks.generateText.mockReset();
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it('uses required schema-validated tool calls and culturally neutral guidance', async () => {
    mocks.generateText
      .mockResolvedValueOnce({
        toolCalls: [
          {
            toolName: 'submit',
            input: {
              category: 'people',
              subject: 'A small group sharing a meal at a plain table.',
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        toolCalls: [
          {
            toolName: 'submit',
            input: { prompt: 'Original neutral watercolour scene.' },
          },
        ],
      });

    await expect(
      composeImagePrompt('kuku_yalanji', 'family', 'family; relatives'),
    ).resolves.toBe('Original neutral watercolour scene.');

    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    for (const [options] of mocks.generateText.mock.calls) {
      expect(options.toolChoice).toEqual({ type: 'tool', toolName: 'submit' });
      expect(options.tools.submit.inputSchema).toBeDefined();
    }
    const planningSystem = mocks.generateText.mock.calls[0][0].system;
    const composingSystem = mocks.generateText.mock.calls[1][0].system;
    expect(planningSystem).toContain('Do not infer clothing, tools');
    expect(planningSystem).not.toContain('man →');
    expect(composingSystem).toContain('Do not imitate or evoke Indigenous art');
    expect(composingSystem).not.toContain('ANCIENT');
  });
});
