-- Seed provider_health table with initial data for all blockchain providers
-- This ensures the admin API monitoring page has data from the start

INSERT INTO provider_health (provider, is_available, latency_ms, error_count, last_checked_at, last_error, rate_limit_remaining)
VALUES
  ('covalent', true, null, 0, null, null, null),
  ('zerion', true, null, 0, null, null, null),
  ('alchemy', true, null, 0, null, null, null),
  ('debank', true, null, 0, null, null, null)
ON CONFLICT (provider) DO UPDATE SET
  is_available = EXCLUDED.is_available,
  error_count = EXCLUDED.error_count;
