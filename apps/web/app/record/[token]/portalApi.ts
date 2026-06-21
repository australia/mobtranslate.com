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

// ---- Transport abstraction: lets PortalApp serve both the anonymous token
// portal and the signed-in (registered-user) portal from one component. ----
export interface PortalTransport {
  languageId: string;
  languageCode: string;
  languageName: string;
  speakerName: string | null;
  speakerId: string | null;
  uploadEndpoint: string;
  worklist(params: { kind: 'word' | 'sentence'; filter: 'pending' | 'recorded' | 'all'; limit?: number }): Promise<{ items: PortalWorkItem[] }>;
  addTarget(input: { kind: 'word' | 'sentence'; text: string; gloss?: string | null }): Promise<{ id: string; text: string; gloss: string | null; kind: string }>;
  myRecordings(): Promise<MyRecording[]>;
}

export function tokenTransport(
  token: string,
  ctx: { language_id: string; language_code: string; language_name: string; speaker_name: string | null; speaker_id: string | null },
): PortalTransport {
  return {
    languageId: ctx.language_id,
    languageCode: ctx.language_code,
    languageName: ctx.language_name,
    speakerName: ctx.speaker_name,
    speakerId: ctx.speaker_id,
    uploadEndpoint: `/api/public/invite/${token}/recordings`,
    worklist: (p) => fetchPortalWorklist(token, p),
    addTarget: (i) => addPortalTarget(token, i),
    myRecordings: () => fetchMyRecordings(token),
  };
}

export function authTransport(ctx: {
  language_id: string;
  language_code: string;
  language_name: string;
}): PortalTransport {
  const base = '/api/v2/authenticated/recordings';
  return {
    languageId: ctx.language_id,
    languageCode: ctx.language_code,
    languageName: ctx.language_name,
    speakerName: null, // the server links the speaker to the signed-in user
    speakerId: null,
    uploadEndpoint: base,
    async worklist(p) {
      const sp = new URLSearchParams({ languageId: ctx.language_id, kind: p.kind, filter: p.filter, limit: String(p.limit ?? 30) });
      return jsonOrThrow(await fetch(`${base}/worklist?${sp}`, { cache: 'no-store' }));
    },
    async addTarget(i) {
      return jsonOrThrow(
        await fetch(`${base}/targets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ languageId: ctx.language_id, ...i }),
        }),
      );
    },
    async myRecordings() {
      return jsonOrThrow(await fetch(`${base}?languageId=${ctx.language_id}`, { cache: 'no-store' }));
    },
  };
}
