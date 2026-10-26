import 'server-only';

/**
 * Client for field-modeld (services/field-models), the localhost model
 * service. It holds no observations of its own: every fit request carries
 * them, so this database stays the system of record.
 */

export class EngineUnavailableError extends Error {}

function engineUrl(path: string): string {
  const base = process.env.FIELD_MODELS_URL || 'http://127.0.0.1:7877';
  return `${base}${path}`;
}

export async function engineFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const token = process.env.FIELD_MODELS_TOKEN;
  if (!token) throw new EngineUnavailableError('FIELD_MODELS_TOKEN is not configured');
  const { timeoutMs = 60_000, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('authorization', `Bearer ${token}`);
  try {
    return await fetch(engineUrl(path), { ...rest, headers, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new EngineUnavailableError(error instanceof Error ? error.message : 'field-modeld is unreachable');
  }
}

export async function engineJson<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ status: number; body: T }> {
  const response = await engineFetch(path, init);
  const body = (await response.json().catch(() => ({ error: 'invalid engine response' }))) as T;
  return { status: response.status, body };
}

export type EngineHealth = {
  ok: boolean;
  registryId: string;
  regionalMissing: string[];
  area: { id: string; title: string; bounds: { west: number; south: number; east: number; north: number } } | null;
  areaReady: boolean;
};

export async function engineHealth(): Promise<EngineHealth | null> {
  try {
    const response = await fetch(engineUrl('/health'), { cache: 'no-store', signal: AbortSignal.timeout(5_000) });
    return response.ok ? ((await response.json()) as EngineHealth) : null;
  } catch {
    return null;
  }
}
