-- Add USD pricing columns to transactions table
-- Run in Supabase SQL editor or via migration

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS value_usd DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_usd DOUBLE PRECISION DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_transactions_value_usd ON transactions(value_usd DESC);

COMMENT ON COLUMN transactions.value_usd IS 'Transaction value in USD at block timestamp';
COMMENT ON COLUMN transactions.price_usd IS 'Token/native unit price in USD at block timestamp';
