-- Admin write access via RLS so the API can use the authenticated user client
-- (least privilege; no service-role key required). Admins = super_admin /
-- dictionary_admin, resolved through the existing user_has_role() helper.
-- Also: worklist read functions + progress functions for the studio.

-- ---- worklist + progress functions (SECURITY DEFINER) ------------------
create or replace function public.recording_worklist(
  p_language uuid,
  p_filter text default 'pending',
  p_q text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  word_id uuid,
  word text,
  gloss text,
  recording_count bigint,
  has_active boolean,
  last_recorded_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with rec as (
    select r.word_id,
           count(*) as total_count,
           count(*) filter (where r.status = 'active') as active_count,
           max(r.created_at) as last_at
    from public.recordings r
    where r.word_id is not null
    group by r.word_id
  )
  select
    w.id,
    w.word,
    (select t.translation
       from public.translations t
      where t.word_id = w.id
      order by t.is_primary desc nulls last, t.created_at asc
      limit 1) as gloss,
    coalesce(rec.total_count, 0) as recording_count,
    coalesce(rec.active_count, 0) > 0 as has_active,
    rec.last_at
  from public.words w
  left join rec on rec.word_id = w.id
  where w.language_id = p_language
    and (p_q is null or p_q = '' or w.word ilike '%' || p_q || '%')
    and (
      p_filter = 'all'
      or (p_filter = 'pending' and coalesce(rec.active_count, 0) = 0)
      or (p_filter = 'recorded' and coalesce(rec.active_count, 0) > 0)
    )
  order by (coalesce(rec.active_count, 0) > 0) asc, w.word asc
  limit p_limit offset p_offset
$$;

create or replace function public.recording_progress(p_language uuid)
returns table (
  total_words bigint,
  recorded_words bigint,
  pending_words bigint,
  total_recordings bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.words w where w.language_id = p_language) as total_words,
    (select count(distinct r.word_id) from public.recordings r
       where r.language_id = p_language and r.status = 'active' and r.word_id is not null) as recorded_words,
    (select count(*) from public.words w where w.language_id = p_language)
      - (select count(distinct r.word_id) from public.recordings r
           where r.language_id = p_language and r.status = 'active' and r.word_id is not null) as pending_words,
    (select count(*) from public.recordings r
       where r.language_id = p_language and r.status = 'active') as total_recordings
$$;

-- ---- recordings --------------------------------------------------------
create policy "Admins manage recordings (insert)" on public.recordings
  for insert with check (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));
create policy "Admins manage recordings (update)" on public.recordings
  for update using (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']))
  with check (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));
create policy "Admins manage recordings (delete)" on public.recordings
  for delete using (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));
create policy "Admins view all recordings" on public.recordings
  for select using (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));

-- ---- recording_targets -------------------------------------------------
create policy "Admins manage targets (insert)" on public.recording_targets
  for insert with check (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));
create policy "Admins manage targets (update)" on public.recording_targets
  for update using (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']))
  with check (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));
create policy "Admins manage targets (delete)" on public.recording_targets
  for delete using (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));

-- ---- speaker_profiles --------------------------------------------------
create policy "Admins manage speakers (insert)" on public.speaker_profiles
  for insert with check (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));
create policy "Admins manage speakers (update)" on public.speaker_profiles
  for update using (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']))
  with check (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));

-- ---- storage objects (recordings bucket) -------------------------------
create policy "Admins upload recordings" on storage.objects
  for insert with check (bucket_id = 'recordings' and public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));
create policy "Admins update recordings" on storage.objects
  for update using (bucket_id = 'recordings' and public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));
create policy "Admins delete recordings" on storage.objects
  for delete using (bucket_id = 'recordings' and public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));
