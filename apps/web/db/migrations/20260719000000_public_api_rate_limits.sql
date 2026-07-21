-- Persistent fixed-window budgets for public routes that can trigger external
-- inference. Subjects are HMAC digests; raw IP addresses and user IDs are not
-- stored in this table.

CREATE TABLE IF NOT EXISTS public.public_api_rate_limits (
  scope VARCHAR(96) NOT NULL,
  subject_hash VARCHAR(64) NOT NULL,
  window_seconds INTEGER NOT NULL CHECK (window_seconds > 0),
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (scope, subject_hash, window_seconds, window_started_at)
);

CREATE INDEX IF NOT EXISTS public_api_rate_limits_expiry_idx
  ON public.public_api_rate_limits (expires_at);

COMMENT ON TABLE public.public_api_rate_limits IS
  'HMAC-keyed fixed-window request and provider budgets; stores no raw client identifiers.';

