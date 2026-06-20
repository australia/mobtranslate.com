-- The worklist/progress RPCs are admin-only; anon never needs them.
revoke execute on function public.recording_worklist(uuid, text, text, int, int) from anon;
revoke execute on function public.recording_progress(uuid) from anon;
