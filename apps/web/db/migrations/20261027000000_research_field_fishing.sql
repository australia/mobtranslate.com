-- Fishing in the field app. Each animal (barramundi, cherabin, …) is a field
-- target with activity 'fish'; each log is one catch (kind 'presence') or a
-- spell fished with nothing caught (kind 'absence', target = what you were
-- after), with the bait, method and catch details below. Fishing places on
-- Country are as restricted as food plants: same super_admin-only API.

ALTER TABLE public.research_field_targets
  ADD COLUMN IF NOT EXISTS activity TEXT NOT NULL DEFAULT 'gather'
  CHECK (activity IN ('gather', 'fish'));

ALTER TABLE public.research_field_observations
  ADD COLUMN IF NOT EXISTS bait TEXT
    CHECK (bait IS NULL OR (btrim(bait) <> '' AND length(bait) <= 80)),
  ADD COLUMN IF NOT EXISTS method TEXT
    CHECK (method IS NULL OR method IN ('handline', 'rod', 'spear', 'net', 'trap', 'hand')),
  ADD COLUMN IF NOT EXISTS catch_count INTEGER
    CHECK (catch_count IS NULL OR catch_count BETWEEN 1 AND 500),
  ADD COLUMN IF NOT EXISTS size_cm REAL
    CHECK (size_cm IS NULL OR (size_cm > 0 AND size_cm < 1000)),
  ADD COLUMN IF NOT EXISTS kept BOOLEAN;

-- Hourly weather for the prototype area from Open-Meteo, asked for at a
-- coarse grid point (never a fishing spot). Forecast rows are overwritten by
-- observed values as days pass.
CREATE TABLE IF NOT EXISTS public.research_field_weather_hours (
  area_id TEXT NOT NULL CHECK (area_id ~ '^[a-z0-9-]+$'),
  hour TIMESTAMPTZ NOT NULL,
  temperature_c REAL,
  precipitation_mm REAL,
  pressure_hpa REAL,
  cloud_pct REAL,
  wind_kmh REAL,
  forecast BOOLEAN NOT NULL DEFAULT false,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (area_id, hour)
);

-- Hourly river level from a Queensland Government gauge on the station.
CREATE TABLE IF NOT EXISTS public.research_field_river_hours (
  site TEXT NOT NULL CHECK (site ~ '^[0-9A-Z]{4,12}$'),
  hour TIMESTAMPTZ NOT NULL,
  level_m REAL NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (site, hour)
);
