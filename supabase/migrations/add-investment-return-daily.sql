-- Daily investment-return PnL snapshots for the "Return since connected" chart.
-- Soft-fail in app code if the table is missing (same pattern as portfolio_snapshots).
-- Applied manually in Supabase SQL editor if migrations are not auto-run.

CREATE TABLE IF NOT EXISTS public.investment_return_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  total_pnl_usd NUMERIC NOT NULL DEFAULT 0,
  unrealized_pnl_usd NUMERIC NOT NULL DEFAULT 0,
  realized_pnl_usd NUMERIC NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'sync',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wallet_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_investment_return_daily_wallet_date
  ON public.investment_return_daily (wallet_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_investment_return_daily_user
  ON public.investment_return_daily (user_id);

ALTER TABLE public.investment_return_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own investment return daily" ON public.investment_return_daily;
CREATE POLICY "Users can view own investment return daily"
  ON public.investment_return_daily FOR SELECT
  USING (auth.uid() = user_id);

-- Sync uses service role (bypasses RLS). Owner policies keep cookie clients consistent.
DROP POLICY IF EXISTS "Users can insert own investment return daily" ON public.investment_return_daily;
CREATE POLICY "Users can insert own investment return daily"
  ON public.investment_return_daily FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own investment return daily" ON public.investment_return_daily;
CREATE POLICY "Users can update own investment return daily"
  ON public.investment_return_daily FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own investment return daily" ON public.investment_return_daily;
CREATE POLICY "Users can delete own investment return daily"
  ON public.investment_return_daily FOR DELETE
  USING (auth.uid() = user_id);
