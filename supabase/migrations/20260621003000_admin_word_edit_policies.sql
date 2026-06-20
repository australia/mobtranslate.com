-- Admin (super_admin / dictionary_admin) write access for the word-edit
-- suggestion + apply flow, via the authenticated user client (RLS, no service key).
create policy "Admins update words" on public.words
  for update using (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']))
  with check (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));

create policy "Admins update definitions" on public.definitions
  for update using (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']))
  with check (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));
create policy "Admins insert definitions" on public.definitions
  for insert with check (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));

create policy "Admins update translations" on public.translations
  for update using (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']))
  with check (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));
create policy "Admins insert translations" on public.translations
  for insert with check (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));

create policy "Admins manage suggestions (update)" on public.word_improvement_suggestions
  for update using (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']))
  with check (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));

create policy "Admins insert revisions" on public.word_revisions
  for insert with check (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));
create policy "Admins view revisions" on public.word_revisions
  for select using (public.user_has_role(auth.uid(), array['super_admin','dictionary_admin']));
