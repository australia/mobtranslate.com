-- =============================================================
-- Sentence recording studio: elder-in-person TTS corpus capture +
-- elder verification/correction of the synthetic training corpus.
--
-- Elders visit in person; for each Kuku Yalanji sentence they RECORD it,
-- FIX the text (then record the fixed version), SKIP it, or MARK IT BAD.
-- Output = (a) a growing TTS speech corpus (sentence_recordings), and
-- (b) elder-verified/corrected sentence pairs (sentence_reviews) that upgrade
-- the synthetic corpus whose rights are 'pending_elder_verification'.
--
-- Design contracts (provenance must be airtight):
--   * recording_sentences.original_kuku is IMMUTABLE once imported (the exact
--     synthetic surface). kuku_text is the current/authoritative surface and
--     only changes through a logged 'fixed' review.
--   * sentence_reviews is an APPEND-ONLY ledger — one row per elder judgment,
--     never updated or deleted, so every correction/approval is provenance.
--   * sentence_recordings are versioned, never destructively overwritten: a
--     re-record marks the prior take status='superseded' and inserts a new
--     'active' take; audio files are never deleted on re-record.
--
-- Reuses the existing recording infrastructure: speaker_profiles (speakers +
-- consent), the box-filesystem storage under MOBTRANSLATE_STORAGE_DIR served
-- via /api/storage/recordings/*, and update_updated_at_column().
-- Authz is enforced in app code (RLS is dropped in the migrated DB).
-- =============================================================

-- ---- The queue: sentences to be recorded / verified --------------------
create table if not exists public.recording_sentences (
  id uuid primary key default gen_random_uuid(),
  language_id uuid references public.languages(id) on delete set null,
  corpus_source text not null default 'synthetic-v1',   -- provenance of the sentence
  corpus_sentence_id integer,                            -- synthetic.db sentences.id
  kuku_text text not null,                               -- current / authoritative surface
  english_text text not null,
  original_kuku text not null,                           -- immutable as-imported synthetic surface
  -- imported provenance (from synthetic.db) — read-only context for reviewers + export
  analysis text,                                         -- Patz morpheme analysis + gloss
  frame text,                                            -- grammatical frame
  tier integer,                                          -- 1-6 difficulty ladder
  confidence text,                                       -- 'high'/'medium' or a numeric string
  words_used jsonb not null default '[]'::jsonb,         -- dictionary bases used
  -- queue lifecycle
  status text not null default 'pending'
    check (status in ('pending','recorded','fixed_recorded','marked_bad','skipped')),
  priority integer not null default 0,                   -- higher = surfaced first
  batch_label text,                                      -- e.g. 'tts-priority-v1'
  times_skipped integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (corpus_source, corpus_sentence_id)             -- idempotent re-import
);

create index if not exists idx_recording_sentences_status on public.recording_sentences(status);
create index if not exists idx_recording_sentences_queue
  on public.recording_sentences(priority desc, id asc) where status = 'pending';
create index if not exists idx_recording_sentences_language on public.recording_sentences(language_id);
create index if not exists idx_recording_sentences_batch on public.recording_sentences(batch_label);

-- ---- The captured audio (the TTS speech corpus) ------------------------
create table if not exists public.sentence_recordings (
  id uuid primary key default gen_random_uuid(),
  sentence_id uuid not null references public.recording_sentences(id) on delete cascade,
  speaker_id uuid references public.speaker_profiles(id) on delete set null,
  recorded_by uuid references auth.users(id),            -- operator who captured it
  -- the exact text spoken for THIS take (snapshot of kuku_text at record time)
  spoken_kuku text not null,
  -- box-filesystem storage (host-independent paths; build URLs at render time)
  audio_path text not null,                              -- lossless WAV master object path
  opus_path text,                                        -- compressed copy object path
  mime text not null default 'audio/wav',
  master_format text not null default 'wav',
  -- audio quality metadata (mirrors public.recordings for the readiness model)
  sample_rate integer,
  bit_depth integer default 16,
  channels integer default 1,
  duration_ms integer,
  file_size_bytes bigint,
  peak_amplitude real,
  clipped boolean not null default false,
  -- provenance / consent snapshot (self-describing rights per clip)
  recorded_via text not null default 'web' check (recorded_via in ('web','app')),
  cultural_consent boolean not null default true,
  training_consent boolean not null default false,
  -- non-destructive versioning
  status text not null default 'active'
    check (status in ('active','superseded','rejected')),
  supersedes_id uuid references public.sentence_recordings(id) on delete set null,
  client_id text unique,                                 -- idempotency key from the browser
  created_at timestamptz not null default now()
);

create index if not exists idx_sentence_recordings_sentence on public.sentence_recordings(sentence_id);
create index if not exists idx_sentence_recordings_speaker on public.sentence_recordings(speaker_id);
create index if not exists idx_sentence_recordings_status on public.sentence_recordings(status);
create index if not exists idx_sentence_recordings_active
  on public.sentence_recordings(sentence_id) where status = 'active';

-- ---- Append-only elder-judgment ledger ---------------------------------
-- Every elder decision (fix / mark bad / skip / approve-as-is) is one row.
-- NEVER updated or deleted — this is the verification provenance that upgrades
-- the synthetic corpus from 'pending_elder_verification'.
create table if not exists public.sentence_reviews (
  id uuid primary key default gen_random_uuid(),
  sentence_id uuid not null references public.recording_sentences(id) on delete cascade,
  speaker_id uuid references public.speaker_profiles(id) on delete set null,
  reviewer_user_id uuid references auth.users(id),       -- operator driving the tablet
  action text not null check (action in ('fixed','marked_bad','skipped','approved_as_is')),
  previous_kuku text,                                    -- surface before a fix
  new_kuku text,                                         -- surface after a fix
  reason text,                                           -- optional note (esp. for marked_bad)
  created_at timestamptz not null default now()
);

create index if not exists idx_sentence_reviews_sentence on public.sentence_reviews(sentence_id, created_at);
create index if not exists idx_sentence_reviews_action on public.sentence_reviews(action);
create index if not exists idx_sentence_reviews_speaker on public.sentence_reviews(speaker_id);

-- ---- updated_at trigger (reuse existing helper) ------------------------
drop trigger if exists update_recording_sentences_updated_at on public.recording_sentences;
create trigger update_recording_sentences_updated_at before update on public.recording_sentences
  for each row execute function update_updated_at_column();
