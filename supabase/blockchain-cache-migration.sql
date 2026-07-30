-- ============================================================
-- Radareum Hybrid Blockchain Architecture - Database Migration
-- ============================================================
--
-- Creates cache tables and indexes for the hybrid data provider system:
--   1. blockchain_cache - General-purpose cache for API responses
--   2. sync_status - Track sync state per wallet/provider/data_type
--   3. provider_health - Track provider availability and latency
--   4. provider_costs - Track API costs for billing optimization
--
-- Also adds missing columns to existing tables for the new architecture.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Blockchain Cache Table
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blockchain_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  data_type TEXT NOT NULL CHECK (data_type IN ('portfolio', 'transactions', 'defi', 'nfts', 'pnl')),
  provider TEXT NOT NULL CHECK (provider IN ('covalent', 'zerion', 'alchemy', 'debank', 'cache')),
  payload JSONB NOT NULL DEFAULT '{}',
  fetched_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
  expires_at BIGINT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- One cache entry per wallet + data type
  UNIQUE(wallet_address, data_type)
);

-- Index for fast cache lookups
CREATE INDEX IF NOT EXISTS idx_blockchain_cache_lookup
  ON public.blockchain_cache (wallet_address, data_type, expires_at);

-- Index for cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_blockchain_cache_expiry
  ON public.blockchain_cache (expires_at);

-- ────────────────────────────────────────────────────────────
-- 2. Sync Status Table (enhanced)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sync_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  data_type TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'syncing', 'completed', 'failed')),
  records_synced INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- One status per wallet + provider + data type
  UNIQUE(wallet_id, provider, data_type)
);

CREATE INDEX IF NOT EXISTS idx_sync_status_wallet
  ON public.sync_status (wallet_id, status);

-- ────────────────────────────────────────────────────────────
-- 3. Provider Health Table
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.provider_health (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE CHECK (provider IN ('covalent', 'zerion', 'alchemy', 'debank')),
  is_available BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  latency_ms INTEGER,
  error_count INTEGER NOT NULL DEFAULT 0,
  rate_limit_remaining INTEGER,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed provider health entries
INSERT INTO public.provider_health (provider, is_available) VALUES
  ('covalent', true),
  ('zerion', true),
  ('alchemy', true),
  ('debank', true)
ON CONFLICT (provider) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 4. Provider Costs Table
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.provider_costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('covalent', 'zerion', 'alchemy', 'debank')),
  endpoint TEXT NOT NULL,
  cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  records_fetched INTEGER NOT NULL DEFAULT 0,
  user_id UUID,
  wallet_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_costs_date
  ON public.provider_costs (provider, created_at);

-- ────────────────────────────────────────────────────────────
-- 5. Add chain_id column to asset_positions if missing
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'asset_positions' AND column_name = 'chain_id'
  ) THEN
    ALTER TABLE public.asset_positions ADD COLUMN chain_id INTEGER DEFAULT 1;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 6. Add chain_id to defi_positions if missing
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'defi_positions' AND column_name = 'chain_id'
  ) THEN
    ALTER TABLE public.defi_positions ADD COLUMN chain_id INTEGER DEFAULT 1;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 7. Add protocol_id to defi_positions if missing
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'defi_positions' AND column_name = 'protocol_id'
  ) THEN
    ALTER TABLE public.defi_positions ADD COLUMN protocol_id TEXT DEFAULT '';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 8. Add change_24h and is_verified to asset_positions
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'asset_positions' AND column_name = 'change_24h'
  ) THEN
    ALTER TABLE public.asset_positions ADD COLUMN change_24h NUMERIC DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'asset_positions' AND column_name = 'is_verified'
  ) THEN
    ALTER TABLE public.asset_positions ADD COLUMN is_verified BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'asset_positions' AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE public.asset_positions ADD COLUMN logo_url TEXT DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'asset_positions' AND column_name = 'balance_raw'
  ) THEN
    ALTER TABLE public.asset_positions ADD COLUMN balance_raw TEXT DEFAULT '0';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 9. RLS Policies for new tables
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.blockchain_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_costs ENABLE ROW LEVEL SECURITY;

-- Cache: users can only read their own wallets' cache
DROP POLICY IF EXISTS "Users can read own wallet cache" ON public.blockchain_cache;
CREATE POLICY "Users can read own wallet cache" ON public.blockchain_cache
  FOR SELECT USING (
    wallet_address IN (
      SELECT address FROM public.wallets WHERE user_id = auth.uid()
    )
  );

-- Sync status: users can read their own wallets' sync status
DROP POLICY IF EXISTS "Users can read own sync status" ON public.sync_status;
CREATE POLICY "Users can read own sync status" ON public.sync_status
  FOR SELECT USING (
    wallet_id IN (
      SELECT id FROM public.wallets WHERE user_id = auth.uid()
    )
  );

-- Provider health: readable by all authenticated users
DROP POLICY IF EXISTS "Authenticated users can read provider health" ON public.provider_health;
CREATE POLICY "Authenticated users can read provider health" ON public.provider_health
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Provider costs: only admins
DROP POLICY IF EXISTS "Admins can read provider costs" ON public.provider_costs;
CREATE POLICY "Admins can read provider costs" ON public.provider_costs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- ────────────────────────────────────────────────────────────
-- 10. Updated_at triggers for new tables
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_blockchain_cache_updated_at ON public.blockchain_cache;
CREATE TRIGGER update_blockchain_cache_updated_at
  BEFORE UPDATE ON public.blockchain_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sync_status_updated_at ON public.sync_status;
CREATE TRIGGER update_sync_status_updated_at
  BEFORE UPDATE ON public.sync_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_provider_health_updated_at ON public.provider_health;
CREATE TRIGGER update_provider_health_updated_at
  BEFORE UPDATE ON public.provider_health
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ────────────────────────────────────────────────────────────
-- 11. Cleanup function: remove expired cache entries
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cleanup_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM public.blockchain_cache WHERE expires_at < (extract(epoch from now()) * 1000)::bigint;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 12. Grant permissions
-- ────────────────────────────────────────────────────────────

-- Service role has full access
GRANT ALL ON public.blockchain_cache TO service_role;
GRANT ALL ON public.sync_status TO service_role;
GRANT ALL ON public.provider_health TO service_role;
GRANT ALL ON public.provider_costs TO service_role;

-- Authenticated users have read access
GRANT SELECT ON public.blockchain_cache TO authenticated;
GRANT SELECT ON public.sync_status TO authenticated;
GRANT SELECT ON public.provider_health TO authenticated;
