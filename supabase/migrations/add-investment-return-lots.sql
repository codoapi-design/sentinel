-- Investment return (since connected): cost lots + wallet baseline markers.
-- Applied manually in Supabase SQL editor if migrations are not auto-run.
-- Soft-fail in app code if tables/columns are missing (same pattern as portfolio_snapshots).

-- Baseline markers on wallets (portfolio value / time at first connect sync)
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS investment_baseline_at TIMESTAMPTZ;

ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS investment_baseline_value_usd NUMERIC;

CREATE TABLE IF NOT EXISTS public.investment_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  token_symbol TEXT NOT NULL,
  token_address TEXT,
  network TEXT NOT NULL DEFAULT 'ethereum',
  chain_id INTEGER NOT NULL DEFAULT 1,
  quantity_open NUMERIC NOT NULL DEFAULT 0,
  cost_per_unit_usd NUMERIC NOT NULL DEFAULT 0,
  cost_basis_usd NUMERIC NOT NULL DEFAULT 0,
  closed_cost_basis_usd NUMERIC NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'baseline'
    CHECK (source IN ('baseline', 'receive', 'swap', 'sync')),
  closed_at TIMESTAMPTZ,
  realized_pnl_usd NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investment_lots_wallet_status
  ON public.investment_lots (wallet_id, status);

CREATE INDEX IF NOT EXISTS idx_investment_lots_wallet_token
  ON public.investment_lots (wallet_id, network, token_address)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_investment_lots_user
  ON public.investment_lots (user_id);

ALTER TABLE public.investment_lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own investment lots" ON public.investment_lots;
CREATE POLICY "Users can view own investment lots"
  ON public.investment_lots FOR SELECT
  USING (auth.uid() = user_id);

-- Allow authenticated owners to manage their lots (sync uses service role which bypasses RLS;
-- these policies keep cookie/user clients consistent if used later).
DROP POLICY IF EXISTS "Users can insert own investment lots" ON public.investment_lots;
CREATE POLICY "Users can insert own investment lots"
  ON public.investment_lots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own investment lots" ON public.investment_lots;
CREATE POLICY "Users can update own investment lots"
  ON public.investment_lots FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own investment lots" ON public.investment_lots;
CREATE POLICY "Users can delete own investment lots"
  ON public.investment_lots FOR DELETE
  USING (auth.uid() = user_id);