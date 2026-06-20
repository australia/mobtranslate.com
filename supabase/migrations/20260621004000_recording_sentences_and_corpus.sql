-- Sentence/script recording support + corpus statistics for TTS data collection.
alter table public.recordings drop constraint if exists recordings_kind_check;
alter table public.recordings add constraint recordings_kind_check check (kind in ('word','phrase','sentence'));
alter table public.recording_targets drop constraint if exists recording_targets_kind_check;
alter table public.recording_targets add constraint recording_targets_kind_check check (kind in ('word','phrase','sentence'));

alter table public.recordings add column if not exists example_id uuid references public.usage_examples(id) on delete set null;
create index if not exists idx_recordings_example on public.recordings(example_id) where example_id is not null;

create or replace function public.recording_sentence_worklist(
  p_language uuid, p_filter text default 'pending', p_q text default null, p_limit int default 40, p_offset int default 0
)
returns table (example_id uuid, text text, gloss text, recording_count bigint, has_active boolean)
language sql stable security definer set search_path = public
as $$
  with ex as (
    select distinct on (lower(btrim(ue.example_text))) ue.id, ue.example_text, ue.translation
    from public.usage_examples ue join public.words w on w.id = ue.word_id
    where w.language_id = p_language and coalesce(btrim(ue.example_text),'') <> ''
    order by lower(btrim(ue.example_text)), ue.created_at asc
  ),
  rec as (
    select r.example_id, count(*) total_count, count(*) filter (where r.status='active') active_count
    from public.recordings r where r.example_id is not null group by r.example_id
  )
  select ex.id, ex.example_text, ex.translation, coalesce(rec.total_count,0), coalesce(rec.active_count,0) > 0
  from ex left join rec on rec.example_id = ex.id
  where (p_q is null or p_q='' or ex.example_text ilike '%'||p_q||'%')
    and (p_filter='all' or (p_filter='pending' and coalesce(rec.active_count,0)=0) or (p_filter='recorded' and coalesce(rec.active_count,0)>0))
  order by (coalesce(rec.active_count,0) > 0) asc, ex.example_text asc
  limit p_limit offset p_offset
$$;

create or replace function public.recording_corpus_stats(p_language uuid, p_speaker uuid default null)
returns table (
  total_recordings bigint, total_seconds numeric, word_recordings bigint, phrase_recordings bigint,
  sentence_recordings bigint, distinct_speakers bigint, clipped_count bigint, too_short bigint, too_long bigint,
  b_lt1 bigint, b_1_3 bigint, b_3_10 bigint, b_10_30 bigint, b_gt30 bigint
)
language sql stable security definer set search_path = public
as $$
  with r as (
    select * from public.recordings
    where language_id = p_language and status='active' and (p_speaker is null or speaker_id = p_speaker)
  )
  select count(*), round(coalesce(sum(duration_ms),0)/1000.0,1),
    count(*) filter (where kind='word'), count(*) filter (where kind='phrase'), count(*) filter (where kind='sentence'),
    count(distinct speaker_id), count(*) filter (where clipped),
    count(*) filter (where coalesce(duration_ms,0) < 400), count(*) filter (where coalesce(duration_ms,0) > 30000),
    count(*) filter (where coalesce(duration_ms,0) < 1000), count(*) filter (where duration_ms >= 1000 and duration_ms < 3000),
    count(*) filter (where duration_ms >= 3000 and duration_ms < 10000), count(*) filter (where duration_ms >= 10000 and duration_ms <= 30000),
    count(*) filter (where duration_ms > 30000)
  from r
$$;

revoke execute on function public.recording_sentence_worklist(uuid, text, text, int, int) from anon;
revoke execute on function public.recording_corpus_stats(uuid, uuid) from anon;
