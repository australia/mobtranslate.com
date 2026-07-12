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

// better-auth requires an Origin (CSRF). React Native fetch doesn't set one, so
// we send the site's own trusted origin on auth + write requests.
const ORIGIN = API_BASE;
function jsonHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', Origin: ORIGIN, Referer: `${ORIGIN}/`, ...authHeaders() };
}

/** Fire-and-forget client activity event → backend → Discord. Never throws. */
export function trackEvent(type: string, meta?: Record<string, any>): void {
  try {
    fetch(`${API_BASE}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ type, meta: { source: 'app', ...meta } }),
    }).catch(() => {});
  } catch { /* ignore */ }
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

export interface WordExample { id?: string; text: string; translation?: string }
export interface WordDetail {
  id: string; word: string; languageCode: string;
  pronunciation?: string; wordClass?: string; wordType?: string;
  definitions: string[]; translations: string[];
  examples: WordExample[];
}

export async function getWord(id: string): Promise<WordDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v2/public/words/${id}`);
    if (!res.ok) return null;
    const d = await json<any>(res);
    // The endpoint returns the word object directly (it has a `word` STRING
    // field), but some variants wrap it as { word: {...} }. Pick correctly.
    const w = d?.id ? d : (d?.word && typeof d.word === 'object' ? d.word : d);
    return {
      id: w.id,
      word: w.word,
      languageCode: w.language?.code || w.language_code || '',
      pronunciation: w.phonetic_transcription ?? undefined,
      wordClass: w.word_class?.name ?? w.word_class?.abbreviation ?? undefined,
      wordType: w.word_type ?? undefined,
      definitions: (w.definitions ?? []).map((x: any) => x.definition).filter(Boolean),
      translations: (w.translations ?? []).map((x: any) => x.translation).filter(Boolean),
      examples: (w.usage_examples ?? w.examples ?? [])
        .map((x: any) => ({ id: x.id, text: x.example ?? x.example_text ?? x.text ?? '', translation: x.translation ?? undefined }))
        .filter((e: any) => e.text),
    };
  } catch {
    return null;
  }
}

// ---- Dictionary browse (paginated, A–Z) ------------------------------------
export interface BrowseWord { id: string; word: string; meaning: string; pos?: string }
export interface BrowsePage { words: BrowseWord[]; letters: string[]; hasNext: boolean; page: number }

const POS_LABEL = (t?: string) => (t || '').replace(/[-_]/g, ' ').trim() || undefined;

export async function browseWords(code: string, opts: { page?: number; letter?: string } = {}): Promise<BrowsePage> {
  const p = new URLSearchParams({ page: String(opts.page ?? 1), limit: '60' });
  if (opts.letter) p.set('letter', opts.letter);
  try {
    const res = await fetch(`${API_BASE}/api/dictionaries/${code}/words?${p.toString()}`);
    const d = await json<any>(res);
    // This endpoint returns translations/definitions as arrays of STRINGS (older
    // endpoints used objects) — handle both.
    const first = (arr: any[]): string => {
      const x = arr?.[0];
      return typeof x === 'string' ? x : (x?.translation || x?.definition || '');
    };
    const rows: any[] = d.data ?? d.words ?? [];
    const words: BrowseWord[] = rows.map((w) => ({
      id: w.id, word: w.word,
      meaning: first(w.translations) || first(w.definitions) || w.definition || w.meaning || '',
      pos: POS_LABEL(w.type ?? w.word_type ?? w.word_class?.name),
    })).filter((w) => w.id && w.word);
    const pg = d.pagination ?? {};
    return { words, letters: d.availableLetters ?? [], hasNext: !!(pg.hasNext ?? pg.has_next), page: pg.page ?? (opts.page ?? 1) };
  } catch {
    return { words: [], letters: [], hasNext: false, page: 1 };
  }
}

// ---- Word artwork (server-generated + cached, language-specific) -----------
export async function getWordImage(code: string, word: string, meaning?: string, id?: string): Promise<string | null> {
  try {
    const p = new URLSearchParams({ lang: code, word });
    if (meaning) p.set('meaning', meaning);
    if (id) p.set('id', id);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 80000);
    const res = await fetch(`${API_BASE}/api/word-image?${p.toString()}`, { headers: { 'User-Agent': 'curl/8.5.0' }, signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (!res.ok) return null;
    const d = await json<{ imageUrl?: string | null }>(res);
    return d.imageUrl ?? null;
  } catch { return null; }
}

// ---- Word thumbnails (peek-only; cached images, never generates) -----------
export async function getWordThumbs(code: string, words: string[]): Promise<Record<string, string | null>> {
  if (words.length === 0) return {};
  try {
    const p = new URLSearchParams({ lang: code, words: words.join(','), _t: String(Date.now()) });
    const res = await fetch(`${API_BASE}/api/word-images?${p.toString()}`, { headers: { 'User-Agent': 'curl/8.5.0' }, cache: 'no-store' as any });
    if (!res.ok) return {};
    const d = await json<{ images?: Record<string, string | null> }>(res);
    return d.images ?? {};
  } catch { return {}; }
}

// ---- Place names (for the map) ---------------------------------------------
export interface Place { id: string; word: string; meaning?: string; latitude?: number | null; longitude?: number | null }
export async function getPlaces(code: string): Promise<{ places: Place[]; withCoords: number }> {
  try {
    const res = await fetch(`${API_BASE}/api/v2/public/places?lang=${encodeURIComponent(code)}`);
    if (!res.ok) return { places: [], withCoords: 0 };
    const d = await json<any>(res);
    return { places: d.places ?? [], withCoords: d.withCoords ?? 0 };
  } catch { return { places: [], withCoords: 0 }; }
}

// ---- Recording studio ------------------------------------------------------
export interface WorklistItem { key: string; label: string; gloss?: string | null; recording_count: number; has_active: boolean }
export interface VoiceTotals { clips: number; words: number; sentences: number; minutes: number }

export async function selfEnroll(languageId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/v2/authenticated/recordings/self-enroll`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ languageId }),
    });
  } catch { /* ignore */ }
}

export async function getWorklist(languageId: string, kind: 'word' | 'sentence', filter: 'pending' | 'recorded' | 'all' = 'pending', offset = 0): Promise<{ items: WorklistItem[]; hasMore: boolean }> {
  try {
    const p = new URLSearchParams({ languageId, kind, filter, limit: '40', offset: String(offset) });
    const res = await fetch(`${API_BASE}/api/v2/authenticated/recordings/worklist?${p.toString()}`, { headers: authHeaders() });
    if (!res.ok) return { items: [], hasMore: false };
    const d = await json<any>(res);
    return { items: d.items ?? [], hasMore: !!d.hasMore };
  } catch { return { items: [], hasMore: false }; }
}

export async function getVoiceTotals(): Promise<VoiceTotals | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v2/me/voice`, { headers: authHeaders() });
    if (!res.ok) return null;
    const d = await json<any>(res);
    const t = d.totals ?? {};
    return { clips: t.clips ?? 0, words: t.words ?? 0, sentences: t.sentences ?? 0, minutes: t.minutes ?? 0 };
  } catch { return null; }
}

// ---- Corrections / suggestions --------------------------------------------
export type ImprovementType = 'definition' | 'translation' | 'example' | 'pronunciation' | 'grammar' | 'cultural_context';

/** Suggest a correction to a specific dictionary word (any signed-in user). */
export async function submitWordImprovement(
  wordId: string,
  body: { type: ImprovementType; fieldName?: string; suggestedValue: string; currentValue?: string; reason?: string },
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v2/words/${wordId}/improvements`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      improvement_type: body.type,
      field_name: body.fieldName ?? body.type,
      current_value: body.currentValue ?? undefined,
      suggested_value: body.suggestedValue,
      improvement_reason: body.reason ?? undefined,
    }),
  });
  if (!res.ok) {
    const msg = res.status === 401 ? 'Please sign in to suggest a correction.' : (await res.json().catch(() => ({})))?.error || 'Could not submit.';
    throw new Error(msg);
  }
}

/** Suggest a better translation for a phrase that isn't a single word. */
export async function submitTranslationCorrection(
  body: { languageCode: string; sourceText: string; currentTranslation?: string; suggestedTranslation: string; reason?: string },
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v2/translation-corrections`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = res.status === 401 ? 'Please sign in to suggest a correction.' : (await res.json().catch(() => ({})))?.error || 'Could not submit.';
    throw new Error(msg);
  }
}

// ---- Add a usage example to a word -----------------------------------------
export async function createExample(wordId: string, exampleText: string, translation?: string): Promise<WordExample | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v2/words/${wordId}/examples`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...authHeaders() },
      body: JSON.stringify({ exampleText, translation: translation || null }),
    });
    if (!res.ok) {
      const msg = res.status === 401 ? 'Please sign in to add an example.' : ((await res.json().catch(() => ({})))?.error || 'Could not add example.');
      throw new Error(msg);
    }
    const d = await json<any>(res);
    return { id: d.id, text: d.example, translation: d.translation ?? undefined };
  } catch (e: any) { throw e; }
}

// ---- Suggest where a place name sits on the map (drag-a-pin) ----------------
export async function suggestPlaceLocation(wordId: string, latitude: number, longitude: number, note?: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v2/words/${wordId}/location-suggestion`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...authHeaders() },
    body: JSON.stringify({ latitude, longitude, note: note || null }),
  });
  if (!res.ok) {
    const msg = res.status === 401 ? 'Please sign in to suggest a location.' : ((await res.json().catch(() => ({})))?.error || 'Could not submit your suggestion.');
    throw new Error(msg);
  }
}

// ---- Existing recordings (playback) ----------------------------------------
export interface ExistingRecording { id: string; url: string; durationMs?: number | null; speaker?: string; isMine?: boolean }

async function fetchRecordings(url: string): Promise<ExistingRecording[]> {
  try {
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) return [];
    const d = await json<any>(res);
    const abs = (u?: string) => (!u ? u : u.startsWith('http') ? u : `${API_BASE}${u}`);
    return (d.recordings ?? []).map((r: any) => ({
      id: r.id, url: abs(r.url || r.master_url), durationMs: r.duration_ms,
      speaker: r.speaker_name, isMine: r.is_mine,
    })).filter((r: ExistingRecording) => r.url);
  } catch { return []; }
}
export function getWordRecordings(wordId: string): Promise<ExistingRecording[]> {
  return fetchRecordings(`${API_BASE}/api/v2/words/${wordId}/recordings`);
}
export function getExampleRecordings(exampleId: string): Promise<ExistingRecording[]> {
  return fetchRecordings(`${API_BASE}/api/v2/examples/${exampleId}/recordings`);
}

export async function addSentenceTarget(languageId: string, text: string, gloss: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/v2/authenticated/recordings/targets`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ languageId, kind: 'sentence', text, gloss: gloss || null }),
    });
    return res.ok;
  } catch { return false; }
}

// ---- Elder sentence-recording studio (curator/admin only) ------------------
// In-person studio where a curator/admin drives the tablet and an Elder records
// synthetic Kuku Yalanji sentences, corrects the text, skips, or marks bad.
// Hits the SAME W1 sentence-corpus routes as the web studio (role-gated server-
// side). recordedVia is stamped 'app' so each clip's provenance is honest.
const STUDIO_BASE = `${API_BASE}/api/v2/recordings/sentence-corpus`;

export interface StudioSpeaker {
  id: string; name: string; community?: string | null; dialect?: string | null;
  gender?: string | null; age?: number | null; bio?: string | null;
  cultural_consent: boolean; training_consent: boolean;
  clips: number; minutes: number;
}
export interface StudioSentence {
  id: string; corpus_sentence_id: number | null;
  kuku_text: string; english_text: string; original_kuku: string;
  analysis?: string | null; frame?: string | null; tier?: number | null;
  confidence?: string | null; status: string; priority: number;
  batch_label?: string | null; times_skipped: number; already_fixed: boolean;
}
export interface StudioProgress {
  total: number; done: number; pending: number; skipped: number;
  recorded: number; markedBad: number; position: number;
}
export type StudioAccess = 'ok' | 'unauthenticated' | 'forbidden' | 'error';
export type ReviewAction = 'fixed' | 'marked_bad' | 'skipped' | 'approved_as_is';

/** Probe whether the signed-in user may operate the studio (curator/admin). The
 *  server enforces the role on every studio route; this just mirrors it for the UI. */
export async function getStudioAccess(): Promise<StudioAccess> {
  try {
    const res = await fetch(`${STUDIO_BASE}/speakers`, { headers: authHeaders() });
    if (res.ok) return 'ok';
    if (res.status === 401) return 'unauthenticated';
    if (res.status === 403) return 'forbidden';
    return 'error';
  } catch { return 'error'; }
}

export async function getStudioSpeakers(): Promise<StudioSpeaker[]> {
  const res = await fetch(`${STUDIO_BASE}/speakers`, { headers: authHeaders() });
  const d = await json<any>(res);
  if (!res.ok) throw new Error(d?.error || `Could not load speakers (${res.status})`);
  return Array.isArray(d) ? d : [];
}

export async function createStudioSpeaker(body: {
  name: string; community?: string | null; dialect?: string | null;
  gender?: string | null; age?: number | null; bio?: string | null;
  culturalConsent: boolean; trainingConsent?: boolean; consentNote?: string | null;
}): Promise<StudioSpeaker> {
  const res = await fetch(`${STUDIO_BASE}/speakers`, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify(body),
  });
  const d = await json<any>(res);
  if (!res.ok) throw new Error(d?.error || `Could not add speaker (${res.status})`);
  return d as StudioSpeaker;
}

export async function getNextSentence(
  speakerId?: string | null, batch = 'tts-priority-v1',
): Promise<{ sentence: StudioSentence | null; progress: StudioProgress }> {
  const p = new URLSearchParams({ batch });
  if (speakerId) p.set('speakerId', speakerId);
  const res = await fetch(`${STUDIO_BASE}/next?${p.toString()}`, { headers: authHeaders() });
  const d = await json<any>(res);
  if (!res.ok) throw new Error(d?.error || `Could not load the next sentence (${res.status})`);
  return { sentence: d.sentence ?? null, progress: d.progress };
}

/** Append an Elder judgment to the review ledger (fix / skip / mark bad / approve). */
export async function reviewSentence(body: {
  sentenceId: string; speakerId?: string | null; action: ReviewAction;
  newKuku?: string | null; reason?: string | null;
}): Promise<void> {
  const res = await fetch(`${STUDIO_BASE}/review`, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d?.error || `Could not save your review (${res.status})`);
  }
}

export interface SentenceTakeMeta {
  clientId: string; sentenceId: string; speakerId: string; spokenKuku: string;
  durationMs?: number; channels?: number; clipped?: boolean;
  culturalConsent?: boolean; trainingConsent?: boolean;
}
/** Upload one captured take to the W1 sentence-corpus upload contract
 *  (multipart: `master` audio file + JSON `meta`). Stamps recordedVia='app'.
 *  clientId is the server-side idempotency key, so a retry never double-stores.
 *  Throws on failure so the caller can queue the take for later (offline-tolerant). */
export async function uploadSentenceTake(meta: SentenceTakeMeta, fileUri: string): Promise<void> {
  const result = await uploadAsync(`${STUDIO_BASE}/upload`, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'master',
    mimeType: 'audio/m4a',
    parameters: { meta: JSON.stringify({ ...meta, recordedVia: 'app' }) },
    headers: authHeaders(),
  });
  if (result.status < 200 || result.status >= 300) {
    let msg = `Upload failed (${result.status})`;
    try { msg = JSON.parse(result.body)?.error || msg; } catch { /* keep */ }
    if (result.status === 401) msg = 'Please sign in again to save recordings.';
    throw new Error(msg);
  }
}

// ---- Auth (better-auth) ----------------------------------------------------
export interface SessionUser { id: string; email: string; name?: string | null }

export async function signIn(email: string, password: string): Promise<SessionUser> {
  const res = await fetch(`${API_BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: jsonHeaders(),
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
    headers: jsonHeaders(),
    body: JSON.stringify({ name, email, password }),
  });
  const data = await json<any>(res);
  if (!res.ok || data?.error) throw new Error(data?.message || data?.error?.message || 'Sign up failed');
  captureCookie(res);
  return data.user as SessionUser;
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/get-session`, { headers: { Origin: ORIGIN, ...authHeaders() } });
    if (!res.ok) return null;
    const data = await json<any>(res);
    return data?.user ?? null;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/auth/sign-out`, { method: 'POST', headers: { Origin: ORIGIN, ...authHeaders() } });
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
  wordId?: string | null;
  exampleId?: string | null;
  targetId?: string | null;
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

/** Add a pronunciation to a specific word — any signed-in user (no invite needed). */
export async function uploadWordRecording(wordId: string, fileUri: string, durationMs?: number): Promise<void> {
  await uploadToEndpoint(`${API_BASE}/api/v2/words/${wordId}/recordings`, fileUri, durationMs);
}
/** Add a recording to a specific example sentence — any signed-in user. */
export async function uploadExampleRecording(exampleId: string, fileUri: string, durationMs?: number): Promise<void> {
  await uploadToEndpoint(`${API_BASE}/api/v2/examples/${exampleId}/recordings`, fileUri, durationMs);
}

async function uploadToEndpoint(url: string, fileUri: string, durationMs?: number): Promise<void> {
  const meta: Record<string, any> = { clientId: `${Date.now()}-${Math.floor(Math.random() * 1e9)}` };
  if (durationMs != null) meta.durationMs = durationMs;
  const result = await uploadAsync(url, fileUri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.MULTIPART,
    fieldName: 'master',
    mimeType: 'audio/m4a',
    parameters: { meta: JSON.stringify(meta) },
    headers: authHeaders(),
  });
  if (result.status < 200 || result.status >= 300) {
    let msg = `Save failed (${result.status})`;
    try { msg = JSON.parse(result.body)?.error || msg; } catch { /* keep */ }
    if (result.status === 401) msg = 'Please sign in again to save recordings.';
    throw new Error(msg);
  }
}
