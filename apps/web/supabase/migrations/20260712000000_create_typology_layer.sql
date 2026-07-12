-- Australian languages typology layer (Task C: the grammatical-knowledge layer).
--
-- A LAYERED data model over openly-licensed sources (all CC-BY-4.0): Grambank v1.0.3,
-- WALS v2020.4, Glottolog 5.3, AIATSIS AUSTLANG. Grambank's 195 variables are a STANDARDIZED
-- CROSS-LINGUISTIC BASELINE, not an exhaustive grammar representation.
--
--   L1  typology_features (layer='grambank')      + typology_language_features
--   L1s typology_features (layer='wals')          + typology_language_features (provenance-tagged)
--   L2  typology_features (layer='aus_extension') + typology_language_features
--   L3  typology_constructions                    (primary descriptive-data layer)
--   sim typology_similarity (grambank_recorded_agreement, n_joint, per-domain)
--   clu typology_clusters + typology_languages.cluster
--
-- All additive + idempotent (CREATE ... IF NOT EXISTS). These are read-only reference tables owned
-- by the typology pipeline; they do NOT touch the dictionary tables. Populated by
-- tools/australian-languages/import_typology.py (idempotent upsert from the research-mount artifacts).

-- ---------- languages (registry subset relevant to typology) ----------
CREATE TABLE IF NOT EXISTS public.typology_languages (
  glottocode            varchar(20) PRIMARY KEY,
  name                  text,
  iso639_3              varchar(3),
  family                text,
  subgroup_glottocode   varchar(20),
  subgroup_name         text,
  latitude              double precision,
  longitude             double precision,
  austlang_codes        jsonb DEFAULT '[]'::jsonb,
  endangerment          text,
  grambank_coded        integer DEFAULT 0,
  grambank_total        integer DEFAULT 195,
  wals_coded            integer DEFAULT 0,
  aus_extension_coded   integer DEFAULT 0,
  cluster               integer,
  has_dictionary        boolean DEFAULT false,
  dictionary_code       text,
  updated_at            timestamptz DEFAULT now()
);

-- ---------- feature catalogs (baseline + WALS supplement + extension) ----------
-- layer discriminator keeps the three catalogs in one table without merging their value spaces.
CREATE TABLE IF NOT EXISTS public.typology_features (
  id               text NOT NULL,
  layer            text NOT NULL CHECK (layer IN ('grambank','wals','aus_extension')),
  name             text,
  gloss            text,
  coding_question  text,
  value_space      jsonb,
  domain           text,
  grambank_groups  jsonb DEFAULT '[]'::jsonb,
  multistate       boolean DEFAULT false,
  derivation_source text,
  coverage_langs   integer DEFAULT 0,
  PRIMARY KEY (id, layer)
);
CREATE INDEX IF NOT EXISTS typology_features_layer_idx ON public.typology_features(layer);
CREATE INDEX IF NOT EXISTS typology_features_domain_idx ON public.typology_features(layer, domain);

-- ---------- language x feature values (unknown / N/A / not_recorded kept DISTINCT) ----------
CREATE TABLE IF NOT EXISTS public.typology_language_features (
  glottocode   varchar(20) NOT NULL,
  layer        text NOT NULL CHECK (layer IN ('grambank','wals','aus_extension')),
  feature_id   text NOT NULL,
  value        text,                 -- raw value: 0/1/2/3 (grambank), code/meaning (wals), aux value
  status       text,                 -- 'coded' | 'unknown' ('?') | 'not_applicable' ('N/A') | 'not_recorded'
  derivation   text,                 -- aus_extension: how the value was derived (WALS/Grambank source)
  comment      text,
  PRIMARY KEY (glottocode, layer, feature_id)
);
CREATE INDEX IF NOT EXISTS typology_langfeat_lang_idx ON public.typology_language_features(glottocode, layer);
CREATE INDEX IF NOT EXISTS typology_langfeat_feat_idx ON public.typology_language_features(layer, feature_id);
CREATE INDEX IF NOT EXISTS typology_langfeat_status_idx ON public.typology_language_features(status);

-- ---------- L3 construction records (primary descriptive-data layer) ----------
CREATE TABLE IF NOT EXISTS public.typology_constructions (
  id                    text PRIMARY KEY,
  glottocode            varchar(20) NOT NULL,
  domain                text,
  construction_name     text,
  description           text,
  example               jsonb,        -- {form, gloss, translation}
  source                jsonb,        -- {work, section, via}
  analyst_confidence    text,
  community_terminology text,         -- NULL pending community consultation
  license               text
);
CREATE INDEX IF NOT EXISTS typology_constructions_lang_idx ON public.typology_constructions(glottocode);
CREATE INDEX IF NOT EXISTS typology_constructions_domain_idx ON public.typology_constructions(glottocode, domain);

-- ---------- pairwise similarity (baseline layer only) ----------
-- metric NAME is 'grambank_recorded_agreement' — agreement over JOINTLY-CODED Grambank features.
CREATE TABLE IF NOT EXISTS public.typology_similarity (
  lang_a                      varchar(20) NOT NULL,
  lang_b                      varchar(20) NOT NULL,
  grambank_recorded_agreement double precision NOT NULL,
  n_joint                     integer NOT NULL,        -- >= 30 by construction
  per_domain                  jsonb,                    -- {domain: {agreement, n_joint}}
  PRIMARY KEY (lang_a, lang_b)
);
CREATE INDEX IF NOT EXISTS typology_similarity_a_idx ON public.typology_similarity(lang_a, grambank_recorded_agreement DESC);
CREATE INDEX IF NOT EXISTS typology_similarity_b_idx ON public.typology_similarity(lang_b, grambank_recorded_agreement DESC);

-- ---------- clusters (k-medoids over 1 - grambank_recorded_agreement) ----------
CREATE TABLE IF NOT EXISTS public.typology_clusters (
  cluster                    integer PRIMARY KEY,
  size                       integer,
  dominant_subgroup_glottocode varchar(20),
  subgroup_purity            double precision,
  members                    jsonb            -- [{glottocode, name}]
);

COMMENT ON TABLE public.typology_similarity IS
  'Pairwise grambank_recorded_agreement (agreement over jointly-coded Grambank features, n_joint>=30). NOT a claim of overall grammatical similarity.';
COMMENT ON TABLE public.typology_features IS
  'Grambank (baseline), WALS (supplement), and Australia-extension feature catalogs. Grambank is a standardized cross-linguistic BASELINE, not an exhaustive grammar.';
