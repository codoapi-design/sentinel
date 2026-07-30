-- إضافة عمود التحقق بخطوتين لجدول الأدمن
-- Run this in Supabase SQL Editor

-- إضافة عمود two_factor_enabled لجدول admin_users
ALTER TABLE admin_users
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;

-- إضافة عموم totp_secret لتخزين مفتاح المصادقة
ALTER TABLE admin_users
ADD COLUMN IF NOT EXISTS totp_secret TEXT;

-- إنشاء جدول إعدادات النظام
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- تفعيل RLS على جدول الإعدادات
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- السماح فقط للمديرين بقراءة الإعدادات
CREATE POLICY "Admins can read settings" ON system_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- السماح فقط للمدير الأعلى بتعديل الإعدادات
CREATE POLICY "Super admins can update settings" ON system_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- إدراج إعدادات افتراضية
INSERT INTO system_settings (key, value) VALUES
  ('general', '{"siteName": "Radareum", "siteDescription": "منصة مراقبة المحافظ الرقمية", "supportEmail": "support@radareum.app", "maintenanceMode": false, "registrationEnabled": true}'),
  ('security', '{"emailVerificationRequired": true, "rateLimitWindow": 15, "rateLimitMaxRequests": 100}'),
  ('ai', '{"model": "openai/o4-mini", "dailyLimit": 50, "maxTokens": 4096}'),
  ('limits', '{"maxWalletsPerUser": 10, "maxApiKeysPerUser": 5}'),
  ('notifications', '{"telegramBotEnabled": true, "emailNotificationsEnabled": true}')
ON CONFLICT (key) DO NOTHING;
