-- One-shot, re-runnable migration of the 35 GoTrue users (auth.users) into the
-- better-auth tables, PRESERVING the UUID id so every public FK stays linked.
-- The bcrypt hash from auth.users.encrypted_password becomes the credential
-- account password (verified by the bcrypt hook in lib/auth.ts).

INSERT INTO public."user" (id, name, email, email_verified, created_at, updated_at)
SELECT
  u.id::text,
  COALESCE(NULLIF(p.username, ''), split_part(u.email, '@', 1), ''),
  u.email,
  true,
  COALESCE(u.created_at, now()),
  COALESCE(u.updated_at, now())
FROM auth.users u
LEFT JOIN public.user_profiles p ON p.user_id = u.id
WHERE u.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."account" (id, account_id, provider_id, user_id, password, created_at, updated_at)
SELECT
  gen_random_uuid()::text,
  u.id::text,
  'credential',
  u.id::text,
  u.encrypted_password,
  now(),
  now()
FROM auth.users u
WHERE u.encrypted_password IS NOT NULL
  AND u.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public."account" a
    WHERE a.user_id = u.id::text AND a.provider_id = 'credential'
  );
