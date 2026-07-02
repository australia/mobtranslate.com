-- Generic bilingual / parallel corpus storage.
--
-- This is intentionally not Bible-specific. eBible is the first importer, but
-- the same shape supports dictionaries, story corpora, elicited speaker
-- sentences, subtitles, public-domain books, and future language pairs.

create table if not exists public.parallel_corpus_editions (
  id uuid primary key default gen_random_uuid(),
  language_id uuid references public.languages(id) on delete set null,
  source_family text not null,
  source_code text not null,
  title text not null,
  short_title text,
  language_code text,
  language_name text,
  iso_639_3 text,
  region text,
  description text,
  source_url text,
  details_url text,
  copyright_notice text,
  license_name text,
  license_url text,
  rights_statement text,
  rights_status text not null default 'unknown',
  canonical_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_family, source_code)
);

create index if not exists idx_parallel_corpus_editions_language
  on public.parallel_corpus_editions(language_id);

create index if not exists idx_parallel_corpus_editions_source
  on public.parallel_corpus_editions(source_family, source_code);

create table if not exists public.parallel_corpus_artifacts (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid references public.parallel_corpus_editions(id) on delete cascade,
  artifact_type text not null,
  format text,
  source_url text,
  local_path text not null,
  sha256 text,
  byte_size bigint,
  http_headers jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (edition_id, artifact_type, local_path)
);

create index if not exists idx_parallel_corpus_artifacts_edition
  on public.parallel_corpus_artifacts(edition_id);

create table if not exists public.parallel_corpus_import_runs (
  id uuid primary key default gen_random_uuid(),
  source_family text not null,
  run_slug text not null,
  corpus_root text,
  source_edition_id uuid references public.parallel_corpus_editions(id) on delete set null,
  target_edition_id uuid references public.parallel_corpus_editions(id) on delete set null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  notes text,
  unique (source_family, run_slug)
);

create index if not exists idx_parallel_corpus_import_runs_started
  on public.parallel_corpus_import_runs(started_at desc);

create table if not exists public.parallel_corpus_segments (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.parallel_corpus_editions(id) on delete cascade,
  segment_kind text not null default 'verse',
  canonical_ref text not null,
  sequence_key text not null,
  book_code text,
  book_name text,
  chapter integer,
  verse_label text,
  verse_start integer,
  verse_end integer,
  verse_start_suffix text,
  verse_end_suffix text,
  segment_index integer not null default 0,
  text text not null,
  text_normalized text not null,
  source_format text,
  source_file text,
  source_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (edition_id, segment_kind, canonical_ref, segment_index)
);

create index if not exists idx_parallel_corpus_segments_edition_ref
  on public.parallel_corpus_segments(edition_id, canonical_ref);

create index if not exists idx_parallel_corpus_segments_ref
  on public.parallel_corpus_segments(book_code, chapter, verse_start, verse_end);

create index if not exists idx_parallel_corpus_segments_text_trgm
  on public.parallel_corpus_segments using gin (text_normalized gin_trgm_ops);

create table if not exists public.parallel_corpus_pairs (
  id uuid primary key default gen_random_uuid(),
  source_segment_id uuid not null references public.parallel_corpus_segments(id) on delete cascade,
  target_segment_id uuid not null references public.parallel_corpus_segments(id) on delete cascade,
  source_edition_id uuid not null references public.parallel_corpus_editions(id) on delete cascade,
  target_edition_id uuid not null references public.parallel_corpus_editions(id) on delete cascade,
  source_language_id uuid references public.languages(id) on delete set null,
  target_language_id uuid references public.languages(id) on delete set null,
  pair_kind text not null,
  canonical_ref text not null,
  source_text text not null,
  target_text text not null,
  alignment_method text not null,
  alignment_confidence numeric(5,4) not null,
  alignment_status text not null default 'auto_aligned',
  rights_status text not null default 'rights_review_needed',
  approved_for_training boolean not null default false,
  train_split text not null default 'unassigned',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_segment_id, target_segment_id, pair_kind, alignment_method)
);

create index if not exists idx_parallel_corpus_pairs_editions
  on public.parallel_corpus_pairs(source_edition_id, target_edition_id);

create index if not exists idx_parallel_corpus_pairs_ref
  on public.parallel_corpus_pairs(canonical_ref);

create index if not exists idx_parallel_corpus_pairs_training
  on public.parallel_corpus_pairs(approved_for_training, train_split, pair_kind);

create or replace view public.parallel_corpus_pair_export as
select
  p.id,
  p.pair_kind,
  p.canonical_ref,
  se.source_family as source_family,
  se.source_code as source_code,
  te.source_code as target_code,
  sl.code as source_language_code,
  tl.code as target_language_code,
  p.source_text,
  p.target_text,
  p.alignment_method,
  p.alignment_confidence,
  p.alignment_status,
  p.rights_status,
  p.approved_for_training,
  p.train_split,
  p.metadata,
  p.created_at
from public.parallel_corpus_pairs p
join public.parallel_corpus_editions se on se.id = p.source_edition_id
join public.parallel_corpus_editions te on te.id = p.target_edition_id
left join public.languages sl on sl.id = p.source_language_id
left join public.languages tl on tl.id = p.target_language_id;

