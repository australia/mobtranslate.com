-- Family members may share one phone in the field: each find records the
-- name the person logging typed in, alongside the signed-in account.
ALTER TABLE public.research_field_observations
  ADD COLUMN IF NOT EXISTS logged_by_name TEXT
  CHECK (logged_by_name IS NULL OR (btrim(logged_by_name) <> '' AND length(logged_by_name) <= 80));
