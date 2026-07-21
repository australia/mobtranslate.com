-- Provenance for recordings imported from external language resources.
-- This is additive: imported audio remains in `recordings`, while source,
-- license, checksums, and mapping decisions stay independently auditable.

create table if not exists public.recording_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  source_url text not null,
  attribution_text text not null,
  license_name text not null,
  license_url text not null,
  commercial_use_allowed boolean not null default false,
  terms_checked_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recording_import_entries (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.recording_sources(id) on delete restrict,
  external_entry_id text not null,
  source_headword text not null,
  normalized_headword text not null,
  source_entry_url text not null,
  mapping_status text not null,
  mapping_reason text not null,
  word_id uuid references public.words(id) on delete set null,
  candidate_word_ids uuid[] not null default '{}'::uuid[],
  source_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  imported_at timestamptz,
  unique (source_id, external_entry_id),
  constraint recording_import_entries_mapping_status_check check (
    mapping_status in ('exact_existing', 'created_from_source', 'review_required', 'error')
  )
);

create table if not exists public.recording_import_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.recording_sources(id) on delete restrict,
  operation text not null,
  status text not null default 'running',
  entry_manifest_sha256 text not null,
  audio_manifest_sha256 text not null,
  configuration jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint recording_import_runs_operation_check check (operation in ('import', 'verify')),
  constraint recording_import_runs_status_check check (status in ('running', 'completed', 'failed')),
  constraint recording_import_runs_entry_sha256_check check (entry_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  constraint recording_import_runs_audio_sha256_check check (audio_manifest_sha256 ~ '^[0-9a-f]{64}$')
);

create table if not exists public.recording_import_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.recording_import_runs(id) on delete restrict,
  import_entry_id uuid references public.recording_import_entries(id) on delete set null,
  external_entry_id text,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.recording_external_refs (
  recording_id uuid primary key references public.recordings(id) on delete cascade,
  source_id uuid not null references public.recording_sources(id) on delete restrict,
  import_entry_id uuid references public.recording_import_entries(id) on delete set null,
  external_recording_id text not null,
  source_entry_url text not null,
  source_audio_url text not null,
  speaker_code text,
  content_sha256 text not null,
  fetched_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_id, external_recording_id),
  constraint recording_external_refs_sha256_check check (content_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists recording_import_entries_status_idx
  on public.recording_import_entries(source_id, mapping_status);
create index if not exists recording_import_entries_word_idx
  on public.recording_import_entries(word_id) where word_id is not null;
create index if not exists recording_import_entries_normalized_idx
  on public.recording_import_entries(source_id, normalized_headword);
create index if not exists recording_external_refs_source_idx
  on public.recording_external_refs(source_id);
create index if not exists recording_external_refs_import_entry_idx
  on public.recording_external_refs(import_entry_id) where import_entry_id is not null;
create index if not exists recording_external_refs_audio_url_idx
  on public.recording_external_refs(source_audio_url);
create index if not exists recording_import_runs_source_idx
  on public.recording_import_runs(source_id, started_at desc);
create index if not exists recording_import_events_run_idx
  on public.recording_import_events(run_id, created_at);
create index if not exists recording_import_events_entry_idx
  on public.recording_import_events(import_entry_id) where import_entry_id is not null;

comment on table public.recording_sources is
  'External recording collections and the reuse terms checked at import time.';
comment on table public.recording_import_entries is
  'One durable source-entry mapping decision, including ambiguous candidates and the raw parsed payload.';
comment on table public.recording_external_refs is
  'Source URL, speaker code, checksum, and import identity for one locally served recording.';
comment on table public.recording_import_runs is
  'Immutable import and verification run ledger with manifest hashes and aggregate results.';
comment on table public.recording_import_events is
  'Append-only per-entry decisions and errors emitted by an import run.';

alter table public.recording_sources enable row level security;
alter table public.recording_import_entries enable row level security;
alter table public.recording_external_refs enable row level security;
alter table public.recording_import_runs enable row level security;
alter table public.recording_import_events enable row level security;

drop policy if exists "Recording sources are viewable by everyone" on public.recording_sources;
create policy "Recording sources are viewable by everyone"
  on public.recording_sources for select to public using (true);

drop policy if exists "Imported recording mappings are viewable by everyone" on public.recording_import_entries;
create policy "Imported recording mappings are viewable by everyone"
  on public.recording_import_entries for select to public using (true);

drop policy if exists "External recording references are viewable by everyone" on public.recording_external_refs;
create policy "External recording references are viewable by everyone"
  on public.recording_external_refs for select to public using (true);
