-- The group of living things a field target belongs to. The engine draws most
-- of a model's continental background from places where people recorded that
-- group (any reptile for a goanna, any plant for a yam), so public records and
-- background share the same collecting bias. Set from the classes of the
-- target's public records when they are fetched.

ALTER TABLE public.research_field_targets
  ADD COLUMN IF NOT EXISTS sampling_group TEXT
  CHECK (sampling_group IS NULL OR sampling_group IN ('plants', 'reptiles', 'mammals', 'fish', 'crustaceans'));
