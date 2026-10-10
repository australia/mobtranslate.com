-- Community contributions to the Country encyclopedia: photos, notes (words,
-- uses, corrections) and proposals for whole new pages. Everything is shown
-- as soon as it is posted, labelled as a community contribution; curators can
-- hide. Merging contributions into the written entries is a later, separate
-- step, so this table keeps each one whole and attributed.

CREATE TABLE IF NOT EXISTS public.country_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  language_code TEXT NOT NULL CHECK (language_code ~ '^[a-z_]+$'),
  -- 'entry:<slug>' or 'place:<slug>' for an existing page; 'new' for a proposal.
  target TEXT NOT NULL CHECK (target ~ '^(entry|place):[a-z0-9-]+$' OR target = 'new'),
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'note', 'page')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contributor_name TEXT NOT NULL CHECK (btrim(contributor_name) <> ''),
  title TEXT,
  words TEXT,
  body TEXT,
  place_text TEXT,
  when_text TEXT,
  photo_path TEXT CHECK (photo_path IS NULL OR photo_path ~ '^[a-z_]+/[a-z0-9-]+/[0-9a-f-]{36}\.webp$'),
  photo_width INTEGER CHECK (photo_width IS NULL OR photo_width > 0),
  photo_height INTEGER CHECK (photo_height IS NULL OR photo_height > 0),
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
  hidden_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  hidden_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((kind = 'page') = (target = 'new')),
  CHECK (kind <> 'photo' OR photo_path IS NOT NULL),
  CHECK ((photo_path IS NULL) = (photo_width IS NULL) AND (photo_path IS NULL) = (photo_height IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_country_contributions_target
  ON public.country_contributions (language_code, target, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_country_contributions_recent
  ON public.country_contributions (language_code, created_at DESC);
