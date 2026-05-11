-- ============================================
-- Sentinel Admin Dashboard - Database Schema
-- Execute this in Supabase SQL Editor
-- ============================================

-- 1. جدول المستخدمين الإداريين
CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. جدول ملفات المستخدمين الموسعة (خطة، حالة، إحصائيات)
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'pro', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
  ban_reason TEXT,
  wallet_count INTEGER DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(email)
);

-- 3. جدول سجل التدقيق (كل إجراء إداري)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. جدول استخدام الذكاء الاصطناعي
CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  chat_count INTEGER DEFAULT 0,
  analysis_count INTEGER DEFAULT 0,
  last_reset_date TEXT NOT NULL DEFAULT '',
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- فهارس الأداء
-- ============================================
CREATE INDEX IF NOT EXISTS idx_audit_log_admin_id ON audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_plan ON user_profiles(plan);
CREATE INDEX IF NOT EXISTS idx_user_profiles_status ON user_profiles(status);
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_active ON user_profiles(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON ai_usage(user_id);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- سياسات admin_users
CREATE POLICY "Admin users can read admin_users"
  ON admin_users FOR SELECT
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

CREATE POLICY "Super admin can insert admin_users"
  ON admin_users FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND role = 'super_admin'));

-- سياسات user_profiles
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin can view all profiles"
  ON user_profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

CREATE POLICY "Admin can update all profiles"
  ON user_profiles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

CREATE POLICY "Admin can insert any profile"
  ON user_profiles FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

-- سياسات audit_log
CREATE POLICY "Admin can view audit log"
  ON audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

CREATE POLICY "Admin can insert audit log"
  ON audit_log FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

-- سياسات ai_usage
CREATE POLICY "Users can view own ai usage"
  ON ai_usage FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai usage"
  ON ai_usage FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ai usage"
  ON ai_usage FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admin can view all ai usage"
  ON ai_usage FOR SELECT
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

CREATE POLICY "Admin can update all ai usage"
  ON ai_usage FOR UPDATE
  USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

-- ============================================
-- Triggers
-- ============================================
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_usage_updated_at
  BEFORE UPDATE ON ai_usage FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- دالة إنشاء ملف مستخدم تلقائياً عند التسجيل
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (user_id, email, full_name, plan, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'starter',
    'active'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================
-- إضافة أول أدمن (استبدل YOUR_USER_ID بمعرف حسابك)
-- INSERT INTO admin_users (user_id, role) VALUES ('YOUR_USER_ID', 'super_admin');
-- ============================================
