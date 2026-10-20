import { OpenAI } from 'openai';

/**
 * One embedding space is shared by the index builder and the runtime
 * retriever. Changing either constant requires rebuilding every index.
 */
export const EVIDENCE_EMBEDDING_MODEL = 'text-embedding-3-small';
export const EVIDENCE_EMBEDDING_DIMENSIONS = 512;

const MAX_BATCH_INPUTS = 256;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  return status === undefined || status === 429 || status >= 500;
}

async function embedBatch(
  inputs: string[],
  signal?: AbortSignal,
  attempts = 4,
): Promise<number[][]> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await getClient().embeddings.create(
        {
          model: EVIDENCE_EMBEDDING_MODEL,
          dimensions: EVIDENCE_EMBEDDING_DIMENSIONS,
          input: inputs,
        },
        { signal },
      );
      const vectors = [...response.data]
        .sort((left, right) => left.index - right.index)
        .map((item) => item.embedding);
      if (vectors.length !== inputs.length) {
        throw new Error(
          `Embedding response had ${vectors.length} vectors for ${inputs.length} inputs.`,
        );
      }
      return vectors;
    } catch (error) {
      if (attempt >= attempts || !isRetryable(error) || signal?.aborted) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}

/** Embed texts in order. Empty strings are not sent and come back as null. */
export async function embedTexts(
  texts: readonly string[],
  options: { signal?: AbortSignal; batchSize?: number } = {},
): Promise<(number[] | null)[]> {
  const batchSize = Math.min(options.batchSize ?? MAX_BATCH_INPUTS, MAX_BATCH_INPUTS);
  const result: (number[] | null)[] = texts.map(() => null);
  const pending = texts
    .map((text, index) => ({ text: text.trim(), index }))
    .filter((item) => item.text.length > 0);
  for (let start = 0; start < pending.length; start += batchSize) {
    const batch = pending.slice(start, start + batchSize);
    const vectors = await embedBatch(
      batch.map((item) => item.text),
      options.signal,
    );
    batch.forEach((item, offset) => {
      result[item.index] = vectors[offset];
    });
  }
  return result;
}

export function vectorLiteral(vector: readonly number[]): string {
  return `[${vector.map((value) => (Number.isFinite(value) ? value.toFixed(7) : '0')).join(',')}]`;
}
