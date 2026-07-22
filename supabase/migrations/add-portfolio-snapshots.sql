-- Daily portfolio value snapshots for real performance charts.
-- Applied manually in Supabase SQL editor if migrations are not auto-run.

CREATE TABLE IF NOT EXISTS public.portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  total_value_usd NUMERIC NOT NULL DEFAULT 0,
  token_value_usd NUMERIC NOT NULL DEFAULT 0,
  defi_value_usd NUMERIC NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'sync',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wallet_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_wallet_date
  ON public.portfolio_snapshots (wallet_id, snapshot_date DESC);

ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own portfolio snapshots" ON public.portfolio_snapshots;
CREATE POLICY "Users can view own portfolio snapshots"
  ON public.portfolio_snapshots FOR SELECT
  USING (auth.uid() = user_id);
