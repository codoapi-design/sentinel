-- Migration: Create missing tables for Sentinel
-- Tables: api_keys, asset_positions, defi_positions

-- ─── API Keys Table ───
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  request_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own API keys" ON api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own API keys" ON api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own API keys" ON api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own API keys" ON api_keys FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all API keys" ON api_keys FOR SELECT USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
);

-- ─── API Key Usage Table ───
CREATE TABLE IF NOT EXISTS api_key_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT DEFAULT 'GET',
  status_code INTEGER DEFAULT 200,
  response_time_ms INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE api_key_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view API key usage" ON api_key_usage FOR SELECT USING (
  EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
);

-- ─── Asset Positions Table ───
CREATE TABLE IF NOT EXISTS asset_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  chain TEXT NOT NULL DEFAULT 'ethereum',
  token_address TEXT,
  token_symbol TEXT NOT NULL DEFAULT 'UNKNOWN',
  token_name TEXT DEFAULT '',
  balance TEXT DEFAULT '0',
  value_usd NUMERIC DEFAULT 0,
  price_usd NUMERIC DEFAULT 0,
  change_24h NUMERIC,
  is_spam BOOLEAN DEFAULT false,
  logo_url TEXT,
  provider TEXT DEFAULT 'covalent',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE asset_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own asset positions" ON asset_positions FOR SELECT USING (
  EXISTS (SELECT 1 FROM wallets WHERE id = asset_positions.wallet_id AND user_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_asset_positions_wallet ON asset_positions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_asset_positions_chain ON asset_positions(chain);

-- ─── DeFi Positions Table ───
CREATE TABLE IF NOT EXISTS defi_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  protocol_id TEXT DEFAULT '',
  protocol_name TEXT DEFAULT '',
  chain TEXT NOT NULL DEFAULT 'ethereum',
  type TEXT DEFAULT 'unknown',
  supplied_value_usd NUMERIC DEFAULT 0,
  borrowed_value_usd NUMERIC DEFAULT 0,
  net_value_usd NUMERIC DEFAULT 0,
  health_factor NUMERIC,
  apy NUMERIC,
  logo_url TEXT,
  provider TEXT DEFAULT 'debank',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE defi_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own DeFi positions" ON defi_positions FOR SELECT USING (
  EXISTS (SELECT 1 FROM wallets WHERE id = defi_positions.wallet_id AND user_id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_defi_positions_wallet ON defi_positions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_defi_positions_chain ON defi_positions(chain);
