/**
 * MobTranslate API client. Talks to the same backend as the website.
 * Auth uses better-auth's email/password endpoints; React Native persists the
 * session cookie automatically and resends it on later requests.
 */
export const API_BASE = 'https://mobtranslate.com';

export interface Language {
  id: string;
  code: string;
  name: string;
  native_name?: string | null;
}

export interface SearchHit {
  wordId: string;
  word: string;
  meaning: string;
  languageCode: string;
}

async function json<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || `Request failed (${res.status})`);
  }
}

// ---- Languages -------------------------------------------------------------
export async function getLanguages(): Promise<Language[]> {
  const res = await fetch(`${API_BASE}/api/v2/languages`);
  const data = await json<Language[]>(res);
  return Array.isArray(data) ? data : [];
}

// ---- Translate -------------------------------------------------------------
export async function translate(
  code: string,
  text: string,
): Promise<{ translation: string; gloss?: string }> {
  const res = await fetch(`${API_BASE}/api/translate/${code}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, mode: 'translate' }),
  });
  const data = await json<{ success?: boolean; translation?: string; gloss?: string; error?: string }>(res);
  if (data.error) throw new Error(data.error);
  return { translation: data.translation ?? '', gloss: data.gloss };
}

// ---- Text to speech (pronunciation) ---------------------------------------
export function ttsUrl(code: string, text: string): string {
  return `${API_BASE}/api/tts?lang=${encodeURIComponent(code)}&text=${encodeURIComponent(text)}`;
}

// ---- Dictionary search -----------------------------------------------------
export async function searchWords(code: string, q: string): Promise<SearchHit[]> {
  if (!q.trim()) return [];
  const res = await fetch(
    `${API_BASE}/api/v2/public/search?q=${encodeURIComponent(q)}&dictionary_code=${encodeURIComponent(code)}&limit=40`,
  );
  const data = await json<{ results?: any[] }>(res);
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const r of data.results ?? []) {
    const w = r.word;
    if (!w?.id || seen.has(w.id)) continue;
    seen.add(w.id);
    hits.push({
      wordId: w.id,
      word: w.word,
      meaning: r.definition || r.translation || '',
      languageCode: w.language?.code || code,
    });
  }
  return hits;
}

export interface WordDetail {
  id: string;
  word: string;
  languageCode: string;
  definitions: string[];
  examples: { text: string; translation?: string }[];
}

export async function getWord(id: string): Promise<WordDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v2/public/words/${id}`);
    if (!res.ok) return null;
    const d = await json<any>(res);
    const w = d.word ?? d;
    return {
      id: w.id,
      word: w.word,
      languageCode: w.language?.code || w.language_code || '',
      definitions: (w.definitions ?? []).map((x: any) => x.definition).filter(Boolean),
      examples: (w.usage_examples ?? w.examples ?? []).map((x: any) => ({
        text: x.example_text ?? x.text ?? '',
        translation: x.translation ?? undefined,
      })).filter((e: any) => e.text),
    };
  } catch {
    return null;
  }
}

// ---- Auth (better-auth) ----------------------------------------------------
export interface SessionUser { id: string; email: string; name?: string | null }

export async function signIn(email: string, password: string): Promise<SessionUser> {
  const res = await fetch(`${API_BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await json<any>(res);
  if (!res.ok || data?.error) throw new Error(data?.message || data?.error?.message || 'Sign in failed');
  return data.user as SessionUser;
}

export async function signUp(name: string, email: string, password: string): Promise<SessionUser> {
  const res = await fetch(`${API_BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  const data = await json<any>(res);
  if (!res.ok || data?.error) throw new Error(data?.message || data?.error?.message || 'Sign up failed');
  return data.user as SessionUser;
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/get-session`);
    if (!res.ok) return null;
    const data = await json<any>(res);
    return data?.user ?? null;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/auth/sign-out`, { method: 'POST' });
  } catch {
    /* ignore */
  }
}

// ---- Recording upload ------------------------------------------------------
export interface UploadMeta {
  clientId: string;
  languageId: string;
  kind: 'word' | 'phrase' | 'sentence';
  label: string;
  gloss?: string | null;
  durationMs?: number;
}

export async function uploadRecording(meta: UploadMeta, fileUri: string): Promise<void> {
  const form = new FormData();
  form.append('meta', JSON.stringify(meta));
  // React Native multipart file part.
  form.append('master', {
    uri: fileUri,
    name: `${meta.clientId}.m4a`,
    type: 'audio/m4a',
  } as any);
  const res = await fetch(`${API_BASE}/api/v2/authenticated/recordings`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const data = await json<any>(res).catch(() => ({}));
    throw new Error(data?.error || `Upload failed (${res.status})`);
  }
}
