-- Field models (super-admin research): things logged on foot in the bush —
-- a yam, a soak, a stand of trees — and the suitability models fitted from
-- them by the field-modeld service. Locations of food plants and other
-- resources on Country are restricted knowledge; these tables are only read
-- through /api/admin/research/field, which requires super_admin.

CREATE TABLE IF NOT EXISTS public.research_field_targets (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  -- Names searched in the Atlas of Living Australia for public records.
  scientific_names TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.research_field_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Generated on the phone, so a retried offline upload cannot duplicate a find.
  client_id TEXT NOT NULL UNIQUE CHECK (client_id ~ '^[A-Za-z0-9-]{8,64}$'),
  target_id TEXT NOT NULL REFERENCES public.research_field_targets(id) ON DELETE CASCADE,
  -- 'presence' = found it here; 'absence' = searched here and it is not here.
  kind TEXT NOT NULL CHECK (kind IN ('presence', 'absence')),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m DOUBLE PRECISION CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  altitude_m DOUBLE PRECISION,
  observed_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  photo_path TEXT CHECK (photo_path IS NULL OR photo_path ~ '^[a-z0-9-]+/[0-9a-f-]{36}\.webp$'),
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_research_field_observations_target
  ON public.research_field_observations (target_id, observed_at DESC)
  WHERE deleted_at IS NULL;

-- Public occurrence records (ALA) kept separate from the operator's own finds.
CREATE TABLE IF NOT EXISTS public.research_field_public_records (
  target_id TEXT NOT NULL REFERENCES public.research_field_targets(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('ala')),
  record_id TEXT NOT NULL,
  scientific_name TEXT,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  uncertainty_m DOUBLE PRECISION,
  event_date TEXT,
  basis_of_record TEXT,
  dataset TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (target_id, source, record_id)
);

CREATE TABLE IF NOT EXISTS public.research_field_models (
  -- The id field-modeld assigned; its artefacts live in the service's data dir.
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
  target_id TEXT NOT NULL REFERENCES public.research_field_targets(id) ON DELETE CASCADE,
  card JSONB NOT NULL,
  field_presences INTEGER NOT NULL DEFAULT 0,
  field_absences INTEGER NOT NULL DEFAULT 0,
  public_records INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_research_field_models_target
  ON public.research_field_models (target_id, created_at DESC);
