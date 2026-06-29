/**
 * MobTranslate API client. Same backend as the website.
 * Auth: better-auth email/password. We capture the session cookie from sign-in
 * and (a) persist it, (b) attach it to requests — including the native file
 * upload, which doesn't share React Native's implicit cookie jar.
 */
import * as SecureStore from 'expo-secure-store';
import { uploadAsync, FileSystemUploadType } from 'expo-file-system/legacy';

export const API_BASE = 'https://mobtranslate.com';
const COOKIE_KEY = 'mt_session_cookie';

let sessionCookie: string | null = null;

/** Pull the better-auth session cookie out of a Set-Cookie header. */
function captureCookie(res: Response) {
  try {
    const raw = res.headers.get('set-cookie');
    if (!raw) return;
    const m = raw.match(/(?:__Secure-)?better-auth\.session_token=[^;,]+/);
    if (m) {
      sessionCookie = m[0];
      SecureStore.setItemAsync(COOKIE_KEY, sessionCookie).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

/** Load the persisted cookie at app start (call before first authed request). */
export async function loadAuth(): Promise<void> {
  try {
    sessionCookie = await SecureStore.getItemAsync(COOKIE_KEY);
  } catch {
    sessionCookie = null;
  }
}

function authHeaders(): Record<string, string> {
  return sessionCookie ? { Cookie: sessionCookie } : {};
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
export interface Language { id: string; code: string; name: string; native_name?: string | null }

export async function getLanguages(): Promise<Language[]> {
  const res = await fetch(`${API_BASE}/api/v2/languages`);
  const data = await json<Language[]>(res);
  return Array.isArray(data) ? data : [];
}

// ---- Translate -------------------------------------------------------------
export async function translate(code: string, text: string): Promise<{ translation: string; gloss?: string }> {
  const res = await fetch(`${API_BASE}/api/translate/${code}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, mode: 'translate' }),
  });
  const data = await json<{ translation?: string; gloss?: string; error?: string }>(res);
  if (data.error) throw new Error(data.error);
  return { translation: data.translation ?? '', gloss: data.gloss };
}

// ---- Pronunciation ---------------------------------------------------------
export function ttsUrl(code: string, text: string): string {
  return `${API_BASE}/api/tts?lang=${encodeURIComponent(code)}&text=${encodeURIComponent(text)}`;
}

// ---- Dictionary search -----------------------------------------------------
export interface SearchHit { wordId: string; word: string; meaning: string; languageCode: string }

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
    hits.push({ wordId: w.id, word: w.word, meaning: r.definition || r.translation || '', languageCode: w.language?.code || code });
  }
  return hits;
}

export interface WordDetail { id: string; word: string; languageCode: string; definitions: string[]; examples: { text: string; translation?: string }[] }

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
      examples: (w.usage_examples ?? w.examples ?? [])
        .map((x: any) => ({ text: x.example_text ?? x.text ?? '', translation: x.translation ?? undefined }))
        .filter((e: any) => e.text),
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
  captureCookie(res);
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
  captureCookie(res);
  return data.user as SessionUser;
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/get-session`, { headers: authHeaders() });
    if (!res.ok) return null;
    const data = await json<any>(res);
    return data?.user ?? null;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/auth/sign-out`, { method: 'POST', headers: authHeaders() });
  } catch {
    /* ignore */
  }
  sessionCookie = null;
  SecureStore.deleteItemAsync(COOKIE_KEY).catch(() => {});
}

// ---- Recording upload (native multipart — avoids RN FormData file-part bug) -
export interface UploadMeta {
  clientId: string;
  languageId: string;
  kind: 'word' | 'phrase' | 'sentence';
  label: string;
  gloss?: string | null;
  durationMs?: number;
}

export async function uploadRecording(meta: UploadMeta, fileUri: string): Promise<void> {
  const result = await uploadAsync(`${API_BASE}/api/v2/authenticated/recordings`, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'master',
    mimeType: 'audio/m4a',
    parameters: { meta: JSON.stringify(meta) },
    headers: authHeaders(),
  });
  if (result.status < 200 || result.status >= 300) {
    let msg = `Upload failed (${result.status})`;
    try { msg = JSON.parse(result.body)?.error || msg; } catch { /* keep */ }
    throw new Error(msg);
  }
}
