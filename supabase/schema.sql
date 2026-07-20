-- ============================================
-- CryptoBooks - Full Database Schema
-- Supabase (PostgreSQL) + Alchemy API
-- ============================================

-- 1. جدول إعدادات البريد الإلكتروني
CREATE TABLE IF NOT EXISTS email_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  verified BOOLEAN DEFAULT false,
  enabled BOOLEAN DEFAULT false,

  -- قواعد التنبيهات
  inbound_above JSONB DEFAULT '{"enabled": false, "amount": 1000}',
  outbound_above JSONB DEFAULT '{"enabled": false, "amount": 500}',
  portfolio_reaches JSONB DEFAULT '{"enabled": false, "amount": 80000}',
  asset_rises JSONB DEFAULT '{"enabled": false, "percentage": 5, "asset": "ETH"}',
  asset_drops JSONB DEFAULT '{"enabled": false, "percentage": 5, "asset": "ETH"}',
  daily_summary JSONB DEFAULT '{"enabled": false, "time": "09:00"}',
  weekly_report JSONB DEFAULT '{"enabled": false, "day": "الاثنين"}',
  gas_exceeds JSONB DEFAULT '{"enabled": false, "amount": 50}',
  monthly_report JSONB DEFAULT '{"enabled": false, "day": 1}',
  large_transaction JSONB DEFAULT '{"enabled": false, "amount": 5000}',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id)
);

-- 2. جدول رموز التحقق
CREATE TABLE IF NOT EXISTS email_verification_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. جدول سجل الإيميلات المرسلة
CREATE TABLE IF NOT EXISTS email_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  type TEXT NOT NULL, -- 'verification', 'alert', 'daily_summary', 'weekly_report', 'monthly_report'
  subject TEXT,
  status TEXT DEFAULT 'sent', -- 'sent', 'failed', 'bounced'
  ses_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_email_settings_user_id ON email_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_user_id ON email_verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_code ON email_verification_codes(code) WHERE used = false;
CREATE INDEX IF NOT EXISTS idx_email_log_user_id ON email_log(user_id);
CREATE INDEX IF NOT EXISTS idx_email_log_type ON email_log(type);
CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log(created_at);

-- 5. Row Level Security (RLS)
ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

-- سياسات الأمان: المستخدم يرى ويعدل بياناته فقط
CREATE POLICY "Users can view own email settings"
  ON email_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email settings"
  ON email_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own email settings"
  ON email_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own verification codes"
  ON email_verification_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own verification codes"
  ON email_verification_codes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own verification codes"
  ON email_verification_codes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own email log"
  ON email_log FOR SELECT
  USING (auth.uid() = user_id);

-- 6. دالة تنظيف رموز التحقق المنتهية الصلاحية
CREATE OR REPLACE FUNCTION cleanup_expired_verification_codes()
RETURNS void AS $$
BEGIN
  DELETE FROM email_verification_codes
  WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Trigger لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_email_settings_updated_at
  BEFORE UPDATE ON email_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- جدول المحافظ (Wallets)
-- ============================================

CREATE TABLE IF NOT EXISTS wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address TEXT, -- EVM (nullable when only non-EVM addresses are set)
  solana_address TEXT,
  tron_address TEXT,
  bitcoin_address TEXT,
  label TEXT NOT NULL,
  last_synced_block BIGINT DEFAULT NULL,
  last_synced_at TIMESTAMPTZ DEFAULT NULL,
  is_syncing BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT wallets_at_least_one_address CHECK (
    address IS NOT NULL
    OR solana_address IS NOT NULL
    OR tron_address IS NOT NULL
    OR bitcoin_address IS NOT NULL
  )
);

-- فهارس المحافظ
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets(address);
CREATE UNIQUE INDEX IF NOT EXISTS wallets_user_evm_address_uidx
  ON wallets (user_id, address) WHERE address IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wallets_user_solana_address_uidx
  ON wallets (user_id, solana_address) WHERE solana_address IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wallets_user_tron_address_uidx
  ON wallets (user_id, tron_address) WHERE tron_address IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wallets_user_bitcoin_address_uidx
  ON wallets (user_id, bitcoin_address) WHERE bitcoin_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallets_syncing ON wallets(is_syncing) WHERE is_syncing = true;

-- RLS للمحافظ
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallets"
  ON wallets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wallets"
  ON wallets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wallets"
  ON wallets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own wallets"
  ON wallets FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger تحديث updated_at للمحافظ
CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON wallets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- جدول المعاملات (Transactions)
-- ============================================

CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,

  -- بيانات البلوكتشين
  tx_hash TEXT NOT NULL,
  block_number BIGINT DEFAULT 0,
  timestamp BIGINT NOT NULL,
  date TEXT NOT NULL,

  -- العناوين
  from_addr TEXT NOT NULL DEFAULT '',
  to_addr TEXT NOT NULL DEFAULT '',

  -- القيم
  value_wei TEXT DEFAULT '0',
  value_eth DOUBLE PRECISION DEFAULT 0,
  gas_used INTEGER DEFAULT 0,
  gas_price_wei TEXT DEFAULT '0',
  gas_fee_eth DOUBLE PRECISION DEFAULT 0,

  -- الحالة
  status BOOLEAN DEFAULT true,

  -- التصنيف
  type TEXT NOT NULL DEFAULT 'income',  -- income, expense, trade, defi, staking, gas
  type_ar TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL DEFAULT 'in',  -- in, out, self, mixed

  -- الطريقة والبروتوكول
  method_id TEXT,
  method_name TEXT,
  protocol TEXT,
  protocol_ar TEXT,

  -- الشبكة
  network TEXT NOT NULL DEFAULT 'ethereum',
  network_ar TEXT NOT NULL DEFAULT 'إيثريوم',

  -- معلومات التوكن (لنقل ERC-20)
  token_symbol TEXT,
  token_name TEXT,
  token_address TEXT,
  token_value DOUBLE PRECISION DEFAULT 0,
  token_decimals INTEGER DEFAULT 18,

  -- الطرف المقابل
  counterparty TEXT,
  counterparty_label TEXT,

  -- بيانات خام إضافية
  raw_data JSONB DEFAULT NULL,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- ضمان عدم تكرار المعاملة لكل محفظة وشبكة
  UNIQUE(tx_hash, wallet_id, network)
);

-- فهارس المعاملات
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_network ON transactions(network);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_counterparty ON transactions(counterparty);
CREATE INDEX IF NOT EXISTS idx_transactions_from_addr ON transactions(from_addr);
CREATE INDEX IF NOT EXISTS idx_transactions_to_addr ON transactions(to_addr);
CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(tx_hash);

-- RLS للمعاملات
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  USING (
    wallet_id IN (
      SELECT id FROM wallets WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own transactions"
  ON transactions FOR INSERT
  WITH CHECK (
    wallet_id IN (
      SELECT id FROM wallets WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own transactions"
  ON transactions FOR UPDATE
  USING (
    wallet_id IN (
      SELECT id FROM wallets WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own transactions"
  ON transactions FOR DELETE
  USING (
    wallet_id IN (
      SELECT id FROM wallets WHERE user_id = auth.uid()
    )
  );

-- Trigger تحديث updated_at للمعاملات
CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- جدول العملاء (Clients)
-- ============================================

CREATE TABLE IF NOT EXISTS clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  notes TEXT DEFAULT '',
  color TEXT DEFAULT '#8a8f98',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(user_id, address)
);

-- فهارس العملاء
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_address ON clients(address);

-- RLS للعملاء
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clients"
  ON clients FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own clients"
  ON clients FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own clients"
  ON clients FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own clients"
  ON clients FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger تحديث updated_at للعملاء
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- دالة الحصول على إحصائيات المحفظة
-- ============================================

CREATE OR REPLACE FUNCTION get_wallet_stats(p_wallet_id UUID)
RETURNS TABLE (
  total_transactions BIGINT,
  total_income DOUBLE PRECISION,
  total_expenses DOUBLE PRECISION,
  total_gas DOUBLE PRECISION,
  total_trade DOUBLE PRECISION,
  total_defi DOUBLE PRECISION,
  total_staking DOUBLE PRECISION,
  unique_counterparties BIGINT,
  networks TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) AS total_transactions,
    COALESCE(SUM(CASE WHEN type = 'income' THEN value_eth ELSE 0 END), 0) AS total_income,
    COALESCE(SUM(CASE WHEN type = 'expense' THEN value_eth ELSE 0 END), 0) AS total_expenses,
    COALESCE(SUM(CASE WHEN type = 'gas' THEN gas_fee_eth ELSE 0 END), 0) AS total_gas,
    COALESCE(SUM(CASE WHEN type = 'trade' THEN value_eth ELSE 0 END), 0) AS total_trade,
    COALESCE(SUM(CASE WHEN type = 'defi' THEN value_eth ELSE 0 END), 0) AS total_defi,
    COALESCE(SUM(CASE WHEN type = 'staking' THEN value_eth ELSE 0 END), 0) AS total_staking,
    COUNT(DISTINCT counterparty) AS unique_counterparties,
    ARRAY_AGG(DISTINCT network) AS networks
  FROM transactions
  WHERE wallet_id = p_wallet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
