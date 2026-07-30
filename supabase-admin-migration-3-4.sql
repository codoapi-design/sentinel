-- المرحلة 3+4: جداول إضافية لداشبورد الأدمن
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. جدول تنبيهات النظام
-- ============================================
CREATE TABLE IF NOT EXISTS system_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
  source TEXT NOT NULL DEFAULT 'system',
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- تفعيل RLS
ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;

-- المديرون يمكنهم قراءة التنبيهات
CREATE POLICY "Admins can read alerts" ON system_alerts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- المديرون يمكنهم إدراج تنبيهات
CREATE POLICY "Admins can insert alerts" ON system_alerts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- المديرون يمكنهم تحديث التنبيهات
CREATE POLICY "Admins can update alerts" ON system_alerts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- Index للأداء
CREATE INDEX IF NOT EXISTS idx_system_alerts_status ON system_alerts(status);
CREATE INDEX IF NOT EXISTS idx_system_alerts_severity ON system_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_system_alerts_created ON system_alerts(created_at DESC);

-- ============================================
-- 2. جدول صفحات المحتوى
-- ============================================
CREATE TABLE IF NOT EXISTS content_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  meta_description TEXT DEFAULT '',
  is_published BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- تفعيل RLS
ALTER TABLE content_pages ENABLE ROW LEVEL SECURITY;

-- الصفحات المنشورة يمكن قراءتها من الجميع
CREATE POLICY "Published pages are public" ON content_pages
  FOR SELECT USING (is_published = true);

-- المديرون يمكنهم قراءة كل الصفحات
CREATE POLICY "Admins can read all pages" ON content_pages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- المديرون يمكنهم إدراج صفحات
CREATE POLICY "Admins can insert pages" ON content_pages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- المديرون يمكنهم تحديث الصفحات
CREATE POLICY "Admins can update pages" ON content_pages
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- Index للأداء
CREATE INDEX IF NOT EXISTS idx_content_pages_slug ON content_pages(slug);
CREATE INDEX IF NOT EXISTS idx_content_pages_published ON content_pages(is_published);

-- ============================================
-- 3. جدول قوالب الإشعارات
-- ============================================
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT UNIQUE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'telegram', 'both')),
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  description TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- تفعيل RLS
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

-- المديرون يمكنهم قراءة القوالب
CREATE POLICY "Admins can read templates" ON notification_templates
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- المديرون يمكنهم تعديل القوالب
CREATE POLICY "Admins can manage templates" ON notification_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- ============================================
-- 4. جدول استخدام مفاتيح API
-- ============================================
CREATE TABLE IF NOT EXISTS api_key_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  status_code INTEGER NOT NULL,
  response_time_ms INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- تفعيل RLS
ALTER TABLE api_key_usage ENABLE ROW LEVEL SECURITY;

-- المديرون يمكنهم قراءة سجلات الاستخدام
CREATE POLICY "Admins can read api usage" ON api_key_usage
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- السماح بإدراج سجلات الاستخدام (من API نفسه)
CREATE POLICY "System can insert api usage" ON api_key_usage
  FOR INSERT WITH CHECK (true);

-- Index للأداء
CREATE INDEX IF NOT EXISTS idx_api_key_usage_key ON api_key_usage(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_created ON api_key_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_endpoint ON api_key_usage(endpoint);

-- ============================================
-- 5. إدراج بيانات افتراضية
-- ============================================

-- إدراج قوالب إشعارات افتراضية
INSERT INTO notification_templates (name, key, channel, subject, body, is_active, description) VALUES
  ('تسجيل حساب جديد', 'welcome', 'email', 'مرحباً بك في Radareum!', 'مرحباً {{name}}،\n\nشكراً لتسجيلك في Radareum - منصة مراقبة المحافظ الرقمية.\n\nيمكنك الآن ربط محافظك وبدء مراقبة أصولك.\n\nمع التحية،\nفريق Radareum', true, 'يُرسل عند تسجيل مستخدم جديد'),
  ('تأكيد البريد الإلكتروني', 'email_verification', 'email', 'تأكيد البريد الإلكتروني - Radareum', 'مرحباً {{name}}،\n\nيرجى تأكيد بريدك الإلكتروني عبر الرابط التالي:\n{{verification_link}}\n\nالرابط صالح لمدة 24 ساعة.', true, 'يُرسل لتأكيد البريد الإلكتروني'),
  ('تنبيه أمني', 'security_alert', 'both', 'تنبيه أمني - Radareum', 'تنبيه أمني!\n\nتم اكتشاف نشاط مشبوه في حسابك.\nالنشاط: {{activity}}\nالوقت: {{time}}\nIP: {{ip}}\n\nإذا لم تكن أنت، يرجى تغيير كلمة المرور فوراً.', true, 'يُرسل عند اكتشاف نشاط مشبوه'),
  ('تنبيه تحويل كبير', 'large_transaction', 'telegram', 'تحويل كبير - Radareum', 'تم رصد تحويل كبير!\n\nالمبلغ: {{amount}} {{token}}\nمن: {{from_address}}\nإلى: {{to_address}}\nالشبكة: {{network}}', true, 'يُرسل عند رصد تحويل كبير'),
  ('تجديد الاشتراك', 'subscription_renewal', 'email', 'تذكير تجديد الاشتراك - Radareum', 'مرحباً {{name}}،\n\nاشتراكك في باقة {{plan}} ينتهي في {{expiry_date}}.\n\nجدد الآن للاستمرار في الاستفادة من جميع الميزات.', true, 'يُرسل قبل انتهاء الاشتراك'),
  ('تقرير أسبوعي', 'weekly_report', 'email', 'التقرير الأسبوعي - Radareum', 'مرحباً {{name}}،\n\nإليك ملخص محفظتك لهذا الأسبوع:\n\nإجمالي الأصول: ${{total_value}}\nالتغير: {{change_percent}}%', false, 'تقرير أسبوعي بأداء المحفظة'),
  ('تغيير الباقة', 'plan_change', 'email', 'تم تغيير باقتك - Radareum', 'مرحباً {{name}}،\n\nتم تغيير باقتك من {{old_plan}} إلى {{new_plan}}.\n\nالميزات الجديدة متاحة الآن في حسابك.', true, 'يُرسل عند تغيير الباقة'),
  ('ربط محفظة جديدة', 'wallet_connected', 'telegram', 'محفظة جديدة - Radareum', 'تم ربط محفظة جديدة!\n\nالعنوان: {{wallet_address}}\nالشبكة: {{network}}\n\nإذا لم تكن أنت، يرجى التواصل مع الدعم فوراً.', true, 'يُرسل عند ربط محفظة جديدة')
ON CONFLICT (key) DO NOTHING;

-- إدراج تنبيهات نظام تجريبية
INSERT INTO system_alerts (title, message, severity, source) VALUES
  ('تم تشغيل نظام التنبيهات', 'نظام التنبيهات يعمل بشكل طبيعي. سيتم إشعارك بأي مشاكل تلقائياً.', 'info', 'system'),
  ('فحص أمني دوري', 'تم إكمال الفحص الأمني الدوري بنجاح. لا توجد ثغرات مكتشفة.', 'info', 'security')
ON CONFLICT DO NOTHING;

-- إدراج صفحات محتوى افتراضية
INSERT INTO content_pages (title, slug, content, meta_description, is_published) VALUES
  ('شروط الاستخدام', 'terms', '<h1>شروط الاستخدام</h1><p>باستخدامك لمنصة Radareum، فإنك توافق على الشروط والأحكام التالية...</p>', 'شروط استخدام منصة Radareum لمراقبة المحافظ الرقمية', true),
  ('سياسة الخصوصية', 'privacy', '<h1>سياسة الخصوصية</h1><p>نحن في Radareum نحترم خصوصيتك ونلتزم بحماية بياناتك الشخصية...</p>', 'سياسة خصوصية منصة Radareum', true),
  ('الأسئلة الشائعة', 'faq', '<h1>الأسئلة الشائعة</h1><h2>ما هي Radareum؟</h2><p>Radareum هي منصة متقدمة لمراقبة وإدارة المحافظ الرقمية...</p>', 'الأسئلة الشائعة حول منصة Radareum', true)
ON CONFLICT (slug) DO NOTHING;
