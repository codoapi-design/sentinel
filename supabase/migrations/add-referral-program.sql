-- ============================================
-- Referral Program
-- Run in Supabase SQL Editor
-- ============================================

CREATE TABLE IF NOT EXISTS referral_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL UNIQUE,
  payout_wallet TEXT NOT NULL,
  total_referrals INTEGER NOT NULL DEFAULT 0,
  paid_conversions INTEGER NOT NULL DEFAULT 0,
  total_commission_usd NUMERIC(14, 4) NOT NULL DEFAULT 0,
  activation_rewards_granted INTEGER NOT NULL DEFAULT 0,
  reward_plan_id TEXT,
  reward_plan_active_until TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_profiles_code ON referral_profiles (referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_profiles_commission ON referral_profiles (total_commission_usd DESC);

CREATE TABLE IF NOT EXISTS referral_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES referral_profiles(user_id) ON DELETE CASCADE,
  referred_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'signed_up', 'converted', 'rejected')),
  signed_up_at TIMESTAMPTZ,
  commission_period_end TIMESTAMPTZ,
  first_paid_at TIMESTAMPTZ,
  total_commission_usd NUMERIC(14, 4) NOT NULL DEFAULT 0,
  activation_reward_granted BOOLEAN NOT NULL DEFAULT false,
  ip_hash TEXT,
  fingerprint_hash TEXT,
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_attr_referrer ON referral_attributions (referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_attr_code ON referral_attributions (referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_attr_status ON referral_attributions (status);

CREATE TABLE IF NOT EXISTS referral_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES referral_profiles(user_id) ON DELETE CASCADE,
  referred_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  attribution_id UUID REFERENCES referral_attributions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('commission', 'activation_reward', 'blocked', 'join')),
  plan_id TEXT,
  amount_usd NUMERIC(14, 4) NOT NULL DEFAULT 0,
  commission_pct NUMERIC(6, 4),
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_events_referrer ON referral_events (referrer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_events_type ON referral_events (event_type, created_at DESC);

-- Optional: store referred_by on profile for quick lookup
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- RLS (service role bypasses; cookie client needs policies)
ALTER TABLE referral_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_profiles_select_own ON referral_profiles;
CREATE POLICY referral_profiles_select_own ON referral_profiles
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS referral_profiles_insert_own ON referral_profiles;
CREATE POLICY referral_profiles_insert_own ON referral_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS referral_profiles_update_own ON referral_profiles;
CREATE POLICY referral_profiles_update_own ON referral_profiles
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS referral_attributions_select_own ON referral_attributions;
CREATE POLICY referral_attributions_select_own ON referral_attributions
  FOR SELECT USING (
    auth.uid() = referrer_user_id OR auth.uid() = referred_user_id
  );

DROP POLICY IF EXISTS referral_events_select_own ON referral_events;
CREATE POLICY referral_events_select_own ON referral_events
  FOR SELECT USING (auth.uid() = referrer_user_id);

-- Public leaderboard read via service role in API (no open policy needed)
