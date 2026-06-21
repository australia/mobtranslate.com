-- =========================================================================
-- Recording-feature hardening + registered-user speaker invites
-- =========================================================================

-- ---- Storage allowlist: accept Safari's AAC/mp4 compressed copies ----------
update storage.buckets
set allowed_mime_types = array[
  'audio/wav','audio/x-wav','audio/wave',
  'audio/webm','audio/webm;codecs=opus',
  'audio/ogg','audio/ogg;codecs=opus','audio/opus',
  'audio/mp4','audio/m4a','audio/x-m4a','audio/aac','audio/mpeg'
]
where id = 'recordings';

-- ---- Performance: kill the per-word gloss N+1 + worklist scans -------------
create index if not exists idx_translations_word_primary
  on public.translations(word_id, is_primary desc nulls last, created_at)
  include (translation);
create index if not exists idx_recordings_lang_status_word
  on public.recordings(language_id, status, word_id);
create index if not exists idx_words_language_word
  on public.words(language_id, word);

-- ---- Registered-user invites: schema ---------------------------------------
alter table public.speaker_invites
  add column if not exists mode text not null default 'anonymous',
  add column if not exists invited_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists email_sent_at timestamptz;
do $$ begin
  alter table public.speaker_invites add constraint speaker_invites_mode_check check (mode in ('anonymous','registered'));
exception when duplicate_object then null; end $$;
create unique index if not exists uniq_registered_invite
  on public.speaker_invites(language_id, invited_user_id)
  where mode = 'registered' and status = 'active';
create index if not exists idx_invites_invited_user
  on public.speaker_invites(invited_user_id) where invited_user_id is not null;
create unique index if not exists uniq_speaker_user_lang
  on public.speaker_profiles(user_id, language_id) where user_id is not null;

-- ---- Cross-language validation helper --------------------------------------
create or replace function public._assert_targets_in_language(
  p_language uuid, p_word_id uuid, p_example_id uuid, p_target_id uuid
) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_word_id is not null and not exists (select 1 from public.words w where w.id = p_word_id and w.language_id = p_language) then
    raise exception 'word does not belong to this language';
  end if;
  if p_example_id is not null and not exists (
    select 1 from public.usage_examples ue join public.words w on w.id = ue.word_id where ue.id = p_example_id and w.language_id = p_language
  ) then
    raise exception 'example does not belong to this language';
  end if;
  if p_target_id is not null and not exists (select 1 from public.recording_targets t where t.id = p_target_id and t.language_id = p_language) then
    raise exception 'target does not belong to this language';
  end if;
end $$;
revoke all on function public._assert_targets_in_language(uuid, uuid, uuid, uuid) from anon, authenticated;

-- ---- invite_create_recording WITH cross-language validation ----------------
create or replace function public.invite_create_recording(
  p_token text, p_client_id text, p_kind text, p_label text, p_gloss text,
  p_word_id uuid, p_example_id uuid, p_target_id uuid,
  p_storage_path text, p_master_url text, p_opus_path text, p_opus_url text,
  p_mime text, p_sample_rate int, p_bit_depth int, p_channels int,
  p_duration_ms int, p_file_size bigint, p_peak real, p_clipped boolean
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare inv public.speaker_invites; existing public.recordings; rec public.recordings; v_primary boolean;
begin
  inv := public._invite_row(p_token);
  if inv.id is null then raise exception 'invalid invite'; end if;
  select * into existing from public.recordings where client_id = p_client_id limit 1;
  if existing.id is not null then return to_jsonb(existing); end if;
  perform public._assert_targets_in_language(inv.language_id, p_word_id, p_example_id, p_target_id);
  select not exists (
    select 1 from public.recordings r
    where r.status = 'active' and r.is_primary
      and ((p_word_id is not null and r.word_id = p_word_id)
        or (p_example_id is not null and r.example_id = p_example_id)
        or (p_target_id is not null and r.target_id = p_target_id))
  ) into v_primary;
  insert into public.recordings(
    language_id, word_id, target_id, example_id, kind, label, gloss, speaker_id,
    recorded_by, storage_path, master_url, master_format, opus_path, opus_url, mime_type,
    sample_rate, bit_depth, channels, duration_ms, file_size_bytes, peak_amplitude, clipped,
    status, version, is_primary, client_id
  ) values (
    inv.language_id, p_word_id, p_target_id, p_example_id, coalesce(p_kind,'word'), p_label,
    nullif(btrim(coalesce(p_gloss,'')),''), inv.speaker_id, inv.created_by, p_storage_path, p_master_url,
    'wav', p_opus_path, p_opus_url, coalesce(p_mime,'audio/wav'), p_sample_rate, coalesce(p_bit_depth,16),
    coalesce(p_channels,1), p_duration_ms, p_file_size, p_peak, coalesce(p_clipped,false),
    'active', 1, v_primary, p_client_id
  ) returning * into rec;
  if p_target_id is not null then update public.recording_targets set status = 'recorded' where id = p_target_id; end if;
  update public.speaker_invites set last_used_at = now() where id = inv.id;
  return to_jsonb(rec);
end $$;
grant execute on function public.invite_create_recording(text, text, text, text, text, uuid, uuid, uuid, text, text, text, text, text, int, int, int, int, bigint, real, boolean) to anon;

-- ---- Authenticated (registered-user) portal functions ----------------------
create or replace function public._auth_registered_lang(p_user uuid, p_language uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.speaker_invites i
    where i.invited_user_id = p_user and i.language_id = p_language
      and i.mode = 'registered' and i.status = 'active' and (i.expires_at is null or i.expires_at > now())
  )
$$;
revoke all on function public._auth_registered_lang(uuid, uuid) from anon;

create or replace function public.auth_my_invites()
returns table (language_id uuid, language_code text, language_name text, invited_at timestamptz, my_recordings bigint)
language sql stable security definer set search_path = public as $$
  select i.language_id, l.code, l.name, i.created_at,
    coalesce((select count(*) from public.recordings r
      join public.speaker_profiles sp on sp.id = r.speaker_id
      where sp.user_id = auth.uid() and r.language_id = i.language_id and r.status = 'active'), 0)
  from public.speaker_invites i
  join public.languages l on l.id = i.language_id
  where i.invited_user_id = auth.uid() and i.mode = 'registered' and i.status = 'active'
    and (i.expires_at is null or i.expires_at > now())
  order by i.created_at desc
$$;
grant execute on function public.auth_my_invites() to authenticated;

create or replace function public.auth_worklist(
  p_language_id uuid, p_kind text default 'word', p_filter text default 'pending',
  p_q text default null, p_limit int default 30, p_offset int default 0
)
returns table (key uuid, label text, gloss text, recording_count bigint, has_active boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._auth_registered_lang(auth.uid(), p_language_id) then raise exception 'no active invite'; end if;
  if p_kind = 'sentence' then
    return query select w.example_id, w.text, w.gloss, w.recording_count, w.has_active
      from public.recording_sentence_worklist(p_language_id, p_filter, p_q, p_limit, p_offset) w;
  else
    return query select w.word_id, w.word, w.gloss, w.recording_count, w.has_active
      from public.recording_worklist(p_language_id, p_filter, p_q, p_limit, p_offset) w;
  end if;
end $$;
grant execute on function public.auth_worklist(uuid, text, text, text, int, int) to authenticated;

create or replace function public.auth_add_target(p_language_id uuid, p_kind text, p_text text, p_gloss text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare rec public.recording_targets;
begin
  if not public._auth_registered_lang(auth.uid(), p_language_id) then raise exception 'no active invite'; end if;
  if coalesce(btrim(p_text),'') = '' then raise exception 'text required'; end if;
  insert into public.recording_targets(language_id, kind, text, gloss, status, created_by)
  values (p_language_id, coalesce(p_kind,'word'), btrim(p_text), nullif(btrim(p_gloss),''), 'pending', auth.uid())
  returning * into rec;
  return to_jsonb(rec);
end $$;
grant execute on function public.auth_add_target(uuid, text, text, text) to authenticated;

create or replace function public.auth_my_recordings(p_language_id uuid, p_limit int default 100)
returns table (id uuid, label text, gloss text, kind text, duration_ms int, master_url text, opus_url text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public._auth_registered_lang(auth.uid(), p_language_id) then raise exception 'no active invite'; end if;
  return query
    select r.id, r.label, r.gloss, r.kind, r.duration_ms, r.master_url, r.opus_url, r.created_at
    from public.recordings r join public.speaker_profiles sp on sp.id = r.speaker_id
    where sp.user_id = auth.uid() and r.language_id = p_language_id and r.status = 'active'
    order by r.created_at desc limit least(p_limit, 200);
end $$;
grant execute on function public.auth_my_recordings(uuid, int) to authenticated;

create or replace function public.auth_create_recording(
  p_language_id uuid, p_client_id text, p_kind text, p_label text, p_gloss text,
  p_word_id uuid, p_example_id uuid, p_target_id uuid,
  p_storage_path text, p_master_url text, p_opus_path text, p_opus_url text,
  p_mime text, p_sample_rate int, p_bit_depth int, p_channels int,
  p_duration_ms int, p_file_size bigint, p_peak real, p_clipped boolean
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare existing public.recordings; rec public.recordings; v_primary boolean; v_sid uuid;
begin
  if not public._auth_registered_lang(auth.uid(), p_language_id) then raise exception 'no active invite'; end if;
  select * into existing from public.recordings where client_id = p_client_id limit 1;
  if existing.id is not null then return to_jsonb(existing); end if;
  perform public._assert_targets_in_language(p_language_id, p_word_id, p_example_id, p_target_id);
  select id into v_sid from public.speaker_profiles where user_id = auth.uid() and language_id = p_language_id limit 1;
  if v_sid is null then
    insert into public.speaker_profiles(user_id, language_id, name, created_by)
    values (auth.uid(), p_language_id,
      coalesce((select display_name from public.user_profiles where user_id = auth.uid()),
               (select username from public.user_profiles where user_id = auth.uid()), 'Speaker'),
      auth.uid())
    returning id into v_sid;
  end if;
  select not exists (
    select 1 from public.recordings r
    where r.status = 'active' and r.is_primary
      and ((p_word_id is not null and r.word_id = p_word_id)
        or (p_example_id is not null and r.example_id = p_example_id)
        or (p_target_id is not null and r.target_id = p_target_id))
  ) into v_primary;
  insert into public.recordings(
    language_id, word_id, target_id, example_id, kind, label, gloss, speaker_id,
    recorded_by, storage_path, master_url, master_format, opus_path, opus_url, mime_type,
    sample_rate, bit_depth, channels, duration_ms, file_size_bytes, peak_amplitude, clipped,
    status, version, is_primary, client_id
  ) values (
    p_language_id, p_word_id, p_target_id, p_example_id, coalesce(p_kind,'word'), p_label,
    nullif(btrim(coalesce(p_gloss,'')),''), v_sid, auth.uid(), p_storage_path, p_master_url,
    'wav', p_opus_path, p_opus_url, coalesce(p_mime,'audio/wav'), p_sample_rate, coalesce(p_bit_depth,16),
    coalesce(p_channels,1), p_duration_ms, p_file_size, p_peak, coalesce(p_clipped,false),
    'active', 1, v_primary, p_client_id
  ) returning * into rec;
  if p_target_id is not null then update public.recording_targets set status = 'recorded' where id = p_target_id; end if;
  return to_jsonb(rec);
end $$;
grant execute on function public.auth_create_recording(uuid, text, text, text, text, uuid, uuid, uuid, text, text, text, text, text, int, int, int, int, bigint, real, boolean) to authenticated;

-- ---- Storage: authenticated users upload only under users/ -----------------
create policy "Registered uploads (auth insert)" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = 'users');
