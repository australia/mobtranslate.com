// Client-side fetch helpers + shared types for the recording studio.

export interface LanguageOption {
  id: string;
  code: string;
  name: string;
}

export interface SpeakerProfile {
  id: string;
  name: string;
  language_id: string | null;
  community: string | null;
  birth_year: number | null;
  age: number | null;
  gender: string | null;
  dialect: string | null;
  bio: string | null;
  cultural_consent: boolean;
}

export interface WorklistItem {
  word_id: string;
  word: string;
  gloss: string | null;
  recording_count: number;
  has_active: boolean;
  last_recorded_at: string | null;
}

export interface RecordingProgress {
  total_words: number;
  recorded_words: number;
  pending_words: number;
  total_recordings: number;
}

export interface WorklistResponse {
  items: WorklistItem[];
  hasMore: boolean;
  offset: number;
  progress: RecordingProgress | null;
}

export interface CustomTarget {
  id: string;
  language_id: string;
  word_id: string | null;
  kind: 'word' | 'phrase' | 'sentence';
  text: string;
  gloss: string | null;
  note: string | null;
  priority: number;
  status: 'pending' | 'recorded' | 'skipped' | 'archived';
  recordings?: { id: string; status: string }[];
}

export interface RecordingRow {
  id: string;
  language_id: string;
  word_id: string | null;
  target_id: string | null;
  kind: 'word' | 'phrase';
  label: string;
  gloss: string | null;
  status: 'active' | 'superseded' | 'rejected' | 'pending_upload';
  version: number;
  is_primary: boolean;
  is_correction: boolean;
  correction_note: string | null;
  master_url: string | null;
  opus_url: string | null;
  duration_ms: number | null;
  sample_rate: number | null;
  peak_amplitude: number | null;
  clipped: boolean;
  created_at: string;
  speaker?: { id: string; name: string; community: string | null } | null;
}

const BASE = '/api/v2/admin/recordings';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchWorklist(params: {
  languageId: string;
  filter: 'pending' | 'recorded' | 'all';
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<WorklistResponse> {
  const sp = new URLSearchParams({
    languageId: params.languageId,
    filter: params.filter,
    q: params.q ?? '',
    limit: String(params.limit ?? 40),
    offset: String(params.offset ?? 0),
  });
  return jsonOrThrow(await fetch(`${BASE}/worklist?${sp}`, { cache: 'no-store' }));
}

// ---- Sentences (dictionary example sentences) --------------------------
export interface SentenceItem {
  example_id: string;
  text: string;
  gloss: string | null;
  recording_count: number;
  has_active: boolean;
}

export async function fetchSentences(params: {
  languageId: string;
  filter: 'pending' | 'recorded' | 'all';
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: SentenceItem[]; hasMore: boolean; offset: number }> {
  const sp = new URLSearchParams({
    languageId: params.languageId,
    filter: params.filter,
    q: params.q ?? '',
    limit: String(params.limit ?? 40),
    offset: String(params.offset ?? 0),
  });
  return jsonOrThrow(await fetch(`${BASE}/sentences?${sp}`, { cache: 'no-store' }));
}

// ---- Corpus stats + export (TTS dashboard) -----------------------------
export interface CorpusStats {
  total_recordings: number;
  total_seconds: number;
  word_recordings: number;
  phrase_recordings: number;
  sentence_recordings: number;
  distinct_speakers: number;
  clipped_count: number;
  too_short: number;
  too_long: number;
  b_lt1: number;
  b_1_3: number;
  b_3_10: number;
  b_10_30: number;
  b_gt30: number;
}

export async function fetchCorpusStats(languageId: string, speakerId?: string | null): Promise<CorpusStats> {
  const sp = new URLSearchParams({ languageId });
  if (speakerId) sp.set('speakerId', speakerId);
  return jsonOrThrow(await fetch(`${BASE}/stats?${sp}`, { cache: 'no-store' }));
}

export interface ExportItem {
  id: string;
  file: string;
  text: string;
  normalized: string;
  duration_ms: number | null;
  sample_rate: number | null;
  kind: string;
  speaker: string | null;
  url: string;
}

export async function fetchExport(languageId: string, speakerId?: string | null): Promise<{ count: number; totalSeconds: number; items: ExportItem[] }> {
  const sp = new URLSearchParams({ languageId });
  if (speakerId) sp.set('speakerId', speakerId);
  return jsonOrThrow(await fetch(`${BASE}/export?${sp}`, { cache: 'no-store' }));
}

export async function fetchTargets(languageId: string, status = 'pending'): Promise<CustomTarget[]> {
  const sp = new URLSearchParams({ languageId, status });
  return jsonOrThrow(await fetch(`${BASE}/targets?${sp}`, { cache: 'no-store' }));
}

export async function createTarget(input: {
  languageId: string;
  kind: 'word' | 'phrase' | 'sentence';
  text: string;
  gloss?: string | null;
  note?: string | null;
}): Promise<CustomTarget> {
  return jsonOrThrow(
    await fetch(`${BASE}/targets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateTarget(
  id: string,
  patch: Partial<{ status: CustomTarget['status']; text: string; gloss: string | null; note: string | null; priority: number }>,
): Promise<CustomTarget> {
  return jsonOrThrow(
    await fetch(`${BASE}/targets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  );
}

// ---- Speaker invites (no-login recording links) ------------------------
export interface SpeakerInvite {
  id: string;
  token: string;
  label: string | null;
  status: 'active' | 'revoked';
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  url: string;
  speaker?: { id: string; name: string } | null;
}

export async function fetchInvites(languageId: string): Promise<SpeakerInvite[]> {
  const sp = new URLSearchParams({ languageId });
  return jsonOrThrow(await fetch(`${BASE}/invites?${sp}`, { cache: 'no-store' }));
}

export async function createInvite(input: {
  languageId: string;
  speakerId?: string | null;
  speakerName?: string | null;
  label?: string | null;
}): Promise<SpeakerInvite> {
  return jsonOrThrow(
    await fetch(`${BASE}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function setInviteStatus(id: string, status: 'active' | 'revoked'): Promise<SpeakerInvite> {
  return jsonOrThrow(
    await fetch(`${BASE}/invites/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
  );
}

export async function fetchSpeakers(languageId: string): Promise<SpeakerProfile[]> {
  const sp = new URLSearchParams({ languageId });
  return jsonOrThrow(await fetch(`${BASE}/speakers?${sp}`, { cache: 'no-store' }));
}

export async function createSpeaker(input: {
  name: string;
  languageId?: string | null;
  community?: string | null;
  age?: number | null;
  birthYear?: number | null;
  gender?: string | null;
  dialect?: string | null;
  bio?: string | null;
  culturalConsent?: boolean;
}): Promise<SpeakerProfile> {
  return jsonOrThrow(
    await fetch(`${BASE}/speakers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function fetchRecordings(params: { languageId?: string; wordId?: string; status?: string }): Promise<RecordingRow[]> {
  const sp = new URLSearchParams();
  if (params.languageId) sp.set('languageId', params.languageId);
  if (params.wordId) sp.set('wordId', params.wordId);
  if (params.status) sp.set('status', params.status);
  return jsonOrThrow(await fetch(`${BASE}?${sp}`, { cache: 'no-store' }));
}

export async function patchRecording(
  id: string,
  patch: Partial<{ status: 'active' | 'rejected' | 'superseded'; isPrimary: boolean; gloss: string | null }>,
): Promise<RecordingRow> {
  return jsonOrThrow(
    await fetch(`${BASE}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  );
}

export async function deleteRecording(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete failed');
}

// ---- Word editing (suggestions / revisions) ----------------------------
export type EditableWordField = 'word' | 'phonetic_transcription' | 'notes' | 'word_type' | 'definition' | 'translation';

export interface WordEditSnapshot {
  id: string;
  language_id: string;
  word: string;
  phonetic_transcription: string | null;
  notes: string | null;
  word_type: string | null;
  primaryDefinition: { id: string; definition: string } | null;
  primaryTranslation: { id: string; translation: string } | null;
  pendingSuggestions: {
    id: string;
    improvement_type: string;
    field_name: string | null;
    suggested_value: unknown;
    status: string;
    created_at: string;
  }[];
}

export interface WordEditChange {
  field: EditableWordField;
  current: string | null;
  suggested: string | null;
  rowId?: string | null;
}

export interface WordEditResult {
  applied: number;
  queued: number;
  selfApprove: boolean;
}

export async function fetchWordEdit(wordId: string): Promise<WordEditSnapshot> {
  return jsonOrThrow(await fetch(`/api/v2/admin/words/${wordId}`, { cache: 'no-store' }));
}

export async function submitWordEdit(wordId: string, changes: WordEditChange[], reason?: string): Promise<WordEditResult> {
  return jsonOrThrow(
    await fetch(`/api/v2/admin/words/${wordId}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes, reason }),
    }),
  );
}
