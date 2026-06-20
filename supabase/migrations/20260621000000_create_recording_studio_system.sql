-- =============================================================
-- Recording Studio: native-speaker audio capture system
-- speaker_profiles, recording_targets, recordings + storage bucket
-- =============================================================

-- ---- Speaker provenance ------------------------------------------------
create table if not exists public.speaker_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  language_id uuid references public.languages(id) on delete set null,
  community text,                         -- e.g. "Mossman Gorge"
  birth_year int,
  age int,
  gender text,
  dialect text,
  bio text,
  cultural_consent boolean not null default true,  -- consent to publish recordings
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---- Worklist: words/phrases queued to be recorded ---------------------
-- A target either points at an existing dictionary word (word_id) or holds
-- standalone text for a brand-new word/phrase the speaker wants recorded.
create table if not exists public.recording_targets (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references public.languages(id) on delete cascade,
  word_id uuid references public.words(id) on delete cascade,
  kind text not null default 'word' check (kind in ('word','phrase')),
  text text not null,                     -- the word/phrase to be spoken
  gloss text,                             -- english meaning / context
  note text,                              -- instructions for the speaker
  priority int not null default 0,        -- higher = surfaced first
  status text not null default 'pending'
    check (status in ('pending','recorded','skipped','archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---- Recordings: the captured audio ------------------------------------
create table if not exists public.recordings (
  id uuid primary key default gen_random_uuid(),
  language_id uuid not null references public.languages(id) on delete cascade,
  word_id uuid references public.words(id) on delete set null,
  target_id uuid references public.recording_targets(id) on delete set null,
  kind text not null default 'word' check (kind in ('word','phrase')),
  label text not null,                    -- denormalized text that was spoken
  gloss text,
  speaker_id uuid references public.speaker_profiles(id) on delete set null,
  recorded_by uuid references auth.users(id),  -- admin who captured it
  -- storage (lossless master + optional compressed stream copy)
  storage_path text not null,             -- master (WAV) object path
  master_url text,
  master_format text not null default 'wav',
  opus_path text,                         -- compressed variant object path
  opus_url text,
  mime_type text,
  -- audio quality metadata
  sample_rate int,
  bit_depth int,
  channels int,
  duration_ms int,
  file_size_bytes bigint,
  peak_amplitude real,                    -- 0..1, for clip detection / QA
  clipped boolean default false,
  -- lifecycle & non-destructive versioning
  status text not null default 'active'
    check (status in ('active','superseded','rejected','pending_upload')),
  version int not null default 1,
  supersedes_id uuid references public.recordings(id) on delete set null,
  is_correction boolean not null default false,
  correction_note text,
  is_primary boolean not null default true,
  client_id text unique,                  -- idempotency key from the browser
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---- Indexes -----------------------------------------------------------
create index if not exists idx_recordings_language on public.recordings(language_id);
create index if not exists idx_recordings_word on public.recordings(word_id);
create index if not exists idx_recordings_target on public.recordings(target_id);
create index if not exists idx_recordings_speaker on public.recordings(speaker_id);
create index if not exists idx_recordings_status on public.recordings(status);
create index if not exists idx_recordings_active_word
  on public.recordings(word_id) where status = 'active';
create index if not exists idx_targets_language_status on public.recording_targets(language_id, status);
create index if not exists idx_targets_word on public.recording_targets(word_id);
create index if not exists idx_speakers_language on public.speaker_profiles(language_id);

-- ---- updated_at triggers (reuse existing helper) -----------------------
create trigger update_speaker_profiles_updated_at before update on public.speaker_profiles
  for each row execute function update_updated_at_column();
create trigger update_recording_targets_updated_at before update on public.recording_targets
  for each row execute function update_updated_at_column();
create trigger update_recordings_updated_at before update on public.recordings
  for each row execute function update_updated_at_column();

-- ---- Row Level Security ------------------------------------------------
-- Writes happen exclusively through the service-role key in admin API routes
-- (after an explicit role check), so no public write policies are defined.
-- Public SELECT lets the dictionary front-end play approved recordings.
alter table public.speaker_profiles enable row level security;
alter table public.recording_targets enable row level security;
alter table public.recordings enable row level security;

create policy "Active speakers are viewable by everyone" on public.speaker_profiles
  for select using (is_active = true);

create policy "Active recordings are viewable by everyone" on public.recordings
  for select using (status = 'active');

-- recording_targets are an internal worklist; visible to authenticated users only
create policy "Targets viewable by authenticated users" on public.recording_targets
  for select using (auth.uid() is not null);

-- ---- Storage bucket ----------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recordings', 'recordings', true, 78643200,  -- 75 MB ceiling per object
  array['audio/wav','audio/x-wav','audio/wave','audio/webm','audio/ogg','audio/opus','audio/mpeg']
)
on conflict (id) do nothing;

-- Public read of recording objects (bucket is public); writes via service role.
create policy "Public read of recordings bucket" on storage.objects
  for select using (bucket_id = 'recordings');
