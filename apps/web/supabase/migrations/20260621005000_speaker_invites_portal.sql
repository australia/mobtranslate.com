-- No-login speaker recording portal: invite tokens + token-validated functions.

create table if not exists public.speaker_invites (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  language_id uuid not null references public.languages(id) on delete cascade,
  speaker_id uuid references public.speaker_profiles(id) on delete set null,
  label text,
  status text not null default 'active' check (status in ('active','revoked')),
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);
create index if not exists idx_speaker_invites_language on public.speaker_invites(language_id);
create index if not exists idx_speaker_invites_token on public.speaker_invites(token);

alter table public.speaker_invites enable row level security;
create policy "Admins manage invites" on public.speaker_invites
  for all using (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']))
  with check (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));

create or replace function public._invite_row(p_token text)
returns public.speaker_invites
language sql stable security definer set search_path = public as $$
  select * from public.speaker_invites
  where token = p_token and status = 'active' and (expires_at is null or expires_at > now())
  limit 1
$$;

create or replace function public.invite_context(p_token text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(j) from (
    select i.id as invite_id, i.label, i.language_id,
      l.code as language_code, l.name as language_name,
      i.speaker_id, sp.name as speaker_name,
      (select count(*) from public.recordings r where r.speaker_id = i.speaker_id and r.status = 'active') as my_recordings
    from public.speaker_invites i
    join public.languages l on l.id = i.language_id
    left join public.speaker_profiles sp on sp.id = i.speaker_id
    where i.token = p_token and i.status = 'active' and (i.expires_at is null or i.expires_at > now())
  ) j
$$;

create or replace function public.invite_worklist(
  p_token text, p_kind text default 'word', p_filter text default 'pending',
  p_q text default null, p_limit int default 30, p_offset int default 0
)
returns table (key uuid, label text, gloss text, recording_count bigint, has_active boolean)
language plpgsql stable security definer set search_path = public as $$
declare inv public.speaker_invites;
begin
  inv := public._invite_row(p_token);
  if inv.id is null then return; end if;
  if p_kind = 'sentence' then
    return query select w.example_id, w.text, w.gloss, w.recording_count, w.has_active
      from public.recording_sentence_worklist(inv.language_id, p_filter, p_q, p_limit, p_offset) w;
  else
    return query select w.word_id, w.word, w.gloss, w.recording_count, w.has_active
      from public.recording_worklist(inv.language_id, p_filter, p_q, p_limit, p_offset) w;
  end if;
end $$;

create or replace function public.invite_add_target(
  p_token text, p_kind text, p_text text, p_gloss text default null
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare inv public.speaker_invites; rec public.recording_targets;
begin
  inv := public._invite_row(p_token);
  if inv.id is null then raise exception 'invalid invite'; end if;
  if coalesce(btrim(p_text),'') = '' then raise exception 'text required'; end if;
  insert into public.recording_targets(language_id, kind, text, gloss, status, created_by)
  values (inv.language_id, coalesce(p_kind,'word'), btrim(p_text), nullif(btrim(p_gloss),''), 'pending', inv.created_by)
  returning * into rec;
  return to_jsonb(rec);
end $$;

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

  if p_target_id is not null then
    update public.recording_targets set status = 'recorded' where id = p_target_id;
  end if;
  update public.speaker_invites set last_used_at = now() where id = inv.id;

  return to_jsonb(rec);
end $$;

create or replace function public.invite_my_recordings(p_token text, p_limit int default 50)
returns table (id uuid, label text, gloss text, kind text, duration_ms int, master_url text, opus_url text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare inv public.speaker_invites;
begin
  inv := public._invite_row(p_token);
  if inv.id is null then return; end if;
  return query
    select r.id, r.label, r.gloss, r.kind, r.duration_ms, r.master_url, r.opus_url, r.created_at
    from public.recordings r
    where r.speaker_id = inv.speaker_id and r.status = 'active'
    order by r.created_at desc limit least(p_limit, 200);
end $$;

grant execute on function public.invite_context(text) to anon;
grant execute on function public.invite_worklist(text, text, text, text, int, int) to anon;
grant execute on function public.invite_add_target(text, text, text, text) to anon;
grant execute on function public.invite_create_recording(text, text, text, text, text, uuid, uuid, uuid, text, text, text, text, text, int, int, int, int, bigint, real, boolean) to anon;
grant execute on function public.invite_my_recordings(text, int) to anon;
revoke all on function public._invite_row(text) from anon, authenticated;

create policy "Invite uploads (anon insert)" on storage.objects
  for insert to anon
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = 'invites');
