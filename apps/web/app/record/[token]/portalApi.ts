// Client helpers for the no-login speaker portal (all token-scoped).

export interface PortalWorkItem {
  key: string; // word_id or example_id
  label: string;
  gloss: string | null;
  recording_count: number;
  has_active: boolean;
}

export interface MyRecording {
  id: string;
  label: string;
  gloss: string | null;
  kind: string;
  duration_ms: number | null;
  master_url: string | null;
  opus_url: string | null;
  created_at: string;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchPortalWorklist(
  token: string,
  params: { kind: 'word' | 'sentence'; filter: 'pending' | 'recorded' | 'all'; q?: string; limit?: number; offset?: number },
): Promise<{ items: PortalWorkItem[]; hasMore: boolean; offset: number; kind: string }> {
  const sp = new URLSearchParams({
    kind: params.kind,
    filter: params.filter,
    q: params.q ?? '',
    limit: String(params.limit ?? 30),
    offset: String(params.offset ?? 0),
  });
  return jsonOrThrow(await fetch(`/api/public/invite/${token}/worklist?${sp}`, { cache: 'no-store' }));
}

export async function addPortalTarget(
  token: string,
  input: { kind: 'word' | 'sentence'; text: string; gloss?: string | null },
): Promise<{ id: string; text: string; gloss: string | null; kind: string }> {
  return jsonOrThrow(
    await fetch(`/api/public/invite/${token}/targets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function fetchMyRecordings(token: string): Promise<MyRecording[]> {
  return jsonOrThrow(await fetch(`/api/public/invite/${token}/recordings`, { cache: 'no-store' }));
}
