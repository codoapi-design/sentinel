-- Dashboard read models: precomputed summaries for instant UI hydrate.
-- Source of truth remains transactions + asset_positions.

CREATE TABLE IF NOT EXISTS public.wallet_financial_summary (
  wallet_id UUID PRIMARY KEY REFERENCES public.wallets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  inflow_usd NUMERIC NOT NULL DEFAULT 0,
  outflow_usd NUMERIC NOT NULL DEFAULT 0,
  net_flow_usd NUMERIC NOT NULL DEFAULT 0,
  gas_fees_usd NUMERIC NOT NULL DEFAULT 0,
  trading_volume_usd NUMERIC NOT NULL DEFAULT 0,
  tx_count INTEGER NOT NULL DEFAULT 0,
  priced_cashflow_count INTEGER NOT NULL DEFAULT 0,
  unpriced_count INTEGER NOT NULL DEFAULT 0,
  excluded_activity_count INTEGER NOT NULL DEFAULT 0,
  methodology TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_financial_summary_user
  ON public.wallet_financial_summary (user_id);

CREATE TABLE IF NOT EXISTS public.wallet_dimension_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN ('client', 'network', 'type', 'asset')),
  dimension_key TEXT NOT NULL,
  label TEXT,
  tx_count INTEGER NOT NULL DEFAULT 0,
  volume_usd NUMERIC NOT NULL DEFAULT 0,
  inflow_usd NUMERIC NOT NULL DEFAULT 0,
  outflow_usd NUMERIC NOT NULL DEFAULT 0,
  top_token TEXT,
  last_tx_date TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wallet_id, dimension, dimension_key)
);

CREATE INDEX IF NOT EXISTS idx_wallet_dimension_stats_wallet_dim
  ON public.wallet_dimension_stats (wallet_id, dimension);

CREATE INDEX IF NOT EXISTS idx_wallet_dimension_stats_user
  ON public.wallet_dimension_stats (user_id);

-- Detail-page filter indexes on source transactions
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_counterparty
  ON public.transactions (wallet_id, counterparty);

CREATE INDEX IF NOT EXISTS idx_transactions_wallet_network
  ON public.transactions (wallet_id, network);

CREATE INDEX IF NOT EXISTS idx_transactions_wallet_type
  ON public.transactions (wallet_id, type);

CREATE INDEX IF NOT EXISTS idx_transactions_wallet_token
  ON public.transactions (wallet_id, token_symbol);

ALTER TABLE public.wallet_financial_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_dimension_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own wallet financial summary" ON public.wallet_financial_summary;
CREATE POLICY "Users can view own wallet financial summary"
  ON public.wallet_financial_summary FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own wallet dimension stats" ON public.wallet_dimension_stats;
CREATE POLICY "Users can view own wallet dimension stats"
  ON public.wallet_dimension_stats FOR SELECT
  USING (auth.uid() = user_id);
