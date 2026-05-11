'use client';

import { useEffect, useState } from 'react';
import {
  Settings, Shield, Users, Database, Server,
  Key, Bell, Globe, Mail, Bot, AlertTriangle,
  CheckCircle, RefreshCw, Save,
} from 'lucide-react';
import { useAdminStore } from '@/stores/admin-store';

interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  totalWallets: number;
  totalTransactions: number;
  adminCount: number;
  auditLogCount: number;
}

export default function AdminSettingsPage() {
  const { admin } = useAdminStore();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('general');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Settings state
  const [settings, setSettings] = useState({
    siteName: 'Sentinel',
    siteDescription: 'منصة مراقبة المحافظ الرقمية',
    supportEmail: 'support@sentinel.app',
    maintenanceMode: false,
    registrationEnabled: true,
    emailVerificationRequired: true,
    maxWalletsPerUser: '10',
    maxApiKeysPerUser: '5',
    aiModel: 'openai/o4-mini',
    aiDailyLimit: '50',
    aiMaxTokens: '4096',
    rateLimitWindow: '15',
    rateLimitMaxRequests: '100',
    telegramBotEnabled: true,
    emailNotificationsEnabled: true,
  });

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/admin/settings');
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats || null);
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', data: settings }),
      });
      if (res.ok) {
        setSaveMessage('تم حفظ الإعدادات بنجاح');
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage('حدث خطأ أثناء حفظ الإعدادات');
      }
    } catch {
      setSaveMessage('حدث خطأ في الاتصال');
    } finally {
      setSaving(false);
    }
  };

  const isSuperAdmin = admin?.role === 'super_admin';

  const sections = [
    { id: 'general', label: 'عام', icon: Globe },
    { id: 'security', label: 'الأمان', icon: Shield },
    { id: 'ai', label: 'الذكاء الاصطناعي', icon: Bot },
    { id: 'limits', label: 'الحدود والقيود', icon: Database },
    { id: 'notifications', label: 'الإشعارات', icon: Bell },
    { id: 'system', label: 'معلومات النظام', icon: Server },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#0052ff]/30 border-t-[#0052ff] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Save Bar */}
      <div className="flex items-center justify-between bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <Settings className="h-4 w-4 text-[#8a8f98]" />
          <span className="text-sm text-[#f7f8f8]">إعدادات النظام</span>
          {saveMessage && (
            <span className={`text-xs ${saveMessage.includes('نجاح') ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
              {saveMessage}
            </span>
          )}
        </div>
        {isSuperAdmin && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0052ff] hover:bg-[#0045d1] text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ الإعدادات
          </button>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Settings Nav */}
        <div className="lg:w-[200px] shrink-0">
          <nav className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                  activeSection === section.id
                    ? 'bg-[#0052ff]/10 text-[#0052ff]'
                    : 'text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-white/5'
                }`}
              >
                <section.icon className="h-4 w-4" />
                {section.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Settings Content */}
        <div className="flex-1 space-y-4">
          {/* General */}
          {activeSection === 'general' && (
            <div className="space-y-4">
              <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-[#f7f8f8]">الإعدادات العامة</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[#8a8f98] mb-1.5 block">اسم الموقع</label>
                    <input
                      type="text"
                      value={settings.siteName}
                      onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                      disabled={!isSuperAdmin}
                      className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#8a8f98] mb-1.5 block">وصف الموقع</label>
                    <input
                      type="text"
                      value={settings.siteDescription}
                      onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })}
                      disabled={!isSuperAdmin}
                      className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#8a8f98] mb-1.5 block">بريد الدعم</label>
                    <div className="relative">
                      <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8f98]" />
                      <input
                        type="email"
                        value={settings.supportEmail}
                        onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                        disabled={!isSuperAdmin}
                        className="w-full bg-[#191a1b] border border-white/10 rounded-lg pr-10 pl-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-[#f7f8f8]">الصيانة والتسجيل</h3>
                <div className="space-y-3">
                  <label className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg cursor-pointer">
                    <div>
                      <p className="text-sm text-[#f7f8f8]">وضع الصيانة</p>
                      <p className="text-[10px] text-[#8a8f98]">تعطيل الوصول للمستخدمين العاديين</p>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={settings.maintenanceMode}
                        onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                        disabled={!isSuperAdmin}
                        className="sr-only"
                      />
                      <div className={`w-10 h-5 rounded-full transition-colors ${settings.maintenanceMode ? 'bg-[#f6465d]' : 'bg-white/10'}`}>
                        <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.maintenanceMode ? 'translate-x-5' : 'translate-x-0.5'} translate-y-0.5`} />
                      </div>
                    </div>
                  </label>
                  <label className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg cursor-pointer">
                    <div>
                      <p className="text-sm text-[#f7f8f8]">التسجيل الجديد</p>
                      <p className="text-[10px] text-[#8a8f98]">السماح بتسجيل حسابات جديدة</p>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={settings.registrationEnabled}
                        onChange={(e) => setSettings({ ...settings, registrationEnabled: e.target.checked })}
                        disabled={!isSuperAdmin}
                        className="sr-only"
                      />
                      <div className={`w-10 h-5 rounded-full transition-colors ${settings.registrationEnabled ? 'bg-[#0ecb81]' : 'bg-white/10'}`}>
                        <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.registrationEnabled ? 'translate-x-5' : 'translate-x-0.5'} translate-y-0.5`} />
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Security */}
          {activeSection === 'security' && (
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-[#f7f8f8]">إعدادات الأمان</h3>
              <div className="space-y-3">
                <label className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg cursor-pointer">
                  <div>
                    <p className="text-sm text-[#f7f8f8]">تفعيل البريد الإلكتروني</p>
                    <p className="text-[10px] text-[#8a8f98]">يتطلب تأكيد البريد قبل استخدام المنصة</p>
                  </div>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={settings.emailVerificationRequired}
                      onChange={(e) => setSettings({ ...settings, emailVerificationRequired: e.target.checked })}
                      disabled={!isSuperAdmin}
                      className="sr-only"
                    />
                    <div className={`w-10 h-5 rounded-full transition-colors ${settings.emailVerificationRequired ? 'bg-[#0ecb81]' : 'bg-white/10'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.emailVerificationRequired ? 'translate-x-5' : 'translate-x-0.5'} translate-y-0.5`} />
                    </div>
                  </div>
                </label>

                <div>
                  <label className="text-xs text-[#8a8f98] mb-1.5 block">نافرة تحديد المعدل (دقيقة)</label>
                  <input
                    type="number"
                    value={settings.rateLimitWindow}
                    onChange={(e) => setSettings({ ...settings, rateLimitWindow: e.target.value })}
                    disabled={!isSuperAdmin}
                    className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#8a8f98] mb-1.5 block">الحد الأقصى للطلبات في النافرة</label>
                  <input
                    type="number"
                    value={settings.rateLimitMaxRequests}
                    onChange={(e) => setSettings({ ...settings, rateLimitMaxRequests: e.target.value })}
                    disabled={!isSuperAdmin}
                    className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Admin List */}
              <div className="pt-4 border-t border-white/5">
                <h4 className="text-xs font-semibold text-[#8a8f98] mb-3">المديرون ({stats?.adminCount || 0})</h4>
                <div className="bg-white/[0.02] rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#f7931a]/20 flex items-center justify-center text-xs text-[#f7931a] font-bold">
                      SA
                    </div>
                    <div>
                      <p className="text-xs text-[#f7f8f8]">Super Admin</p>
                      <p className="text-[10px] text-[#f7931a]">مدير أعلى</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI Settings */}
          {activeSection === 'ai' && (
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-[#f7f8f8]">إعدادات الذكاء الاصطناعي</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#8a8f98] mb-1.5 block">النموذج</label>
                  <select
                    value={settings.aiModel}
                    onChange={(e) => setSettings({ ...settings, aiModel: e.target.value })}
                    disabled={!isSuperAdmin}
                    className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 disabled:opacity-50"
                  >
                    <option value="openai/o4-mini">OpenAI o4-mini</option>
                    <option value="openai/gpt-4o-mini">OpenAI GPT-4o-mini</option>
                    <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                    <option value="google/gemini-pro">Gemini Pro</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#8a8f98] mb-1.5 block">الحد اليومي لكل مستخدم</label>
                  <input
                    type="number"
                    value={settings.aiDailyLimit}
                    onChange={(e) => setSettings({ ...settings, aiDailyLimit: e.target.value })}
                    disabled={!isSuperAdmin}
                    className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8a8f98] mb-1.5 block">الحد الأقصى للـ Tokens</label>
                  <input
                    type="number"
                    value={settings.aiMaxTokens}
                    onChange={(e) => setSettings({ ...settings, aiMaxTokens: e.target.value })}
                    disabled={!isSuperAdmin}
                    className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 disabled:opacity-50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Limits */}
          {activeSection === 'limits' && (
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-[#f7f8f8]">حدود المستخدمين</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[#8a8f98] mb-1.5 block">الحد الأقصى للمحافظ لكل مستخدم</label>
                  <input
                    type="number"
                    value={settings.maxWalletsPerUser}
                    onChange={(e) => setSettings({ ...settings, maxWalletsPerUser: e.target.value })}
                    disabled={!isSuperAdmin}
                    className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8a8f98] mb-1.5 block">الحد الأقصى لمفاتيح API لكل مستخدم</label>
                  <input
                    type="number"
                    value={settings.maxApiKeysPerUser}
                    onChange={(e) => setSettings({ ...settings, maxApiKeysPerUser: e.target.value })}
                    disabled={!isSuperAdmin}
                    className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Current Plan Limits */}
              <div className="pt-4 border-t border-white/5">
                <h4 className="text-xs font-semibold text-[#8a8f98] mb-3">حدود الباقات</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-white/[0.02] rounded-lg p-3">
                    <p className="text-xs text-[#8a8f98] mb-1">Starter</p>
                    <div className="text-[10px] text-[#d0d6e0] space-y-1">
                      <p>3 محافظ</p>
                      <p>1 مفتاح API</p>
                      <p>10 محادثات AI/يوم</p>
                    </div>
                  </div>
                  <div className="bg-[#0ecb81]/5 rounded-lg p-3">
                    <p className="text-xs text-[#0ecb81] mb-1">Pro</p>
                    <div className="text-[10px] text-[#d0d6e0] space-y-1">
                      <p>10 محافظ</p>
                      <p>3 مفاتيح API</p>
                      <p>50 محادثة AI/يوم</p>
                    </div>
                  </div>
                  <div className="bg-[#f7931a]/5 rounded-lg p-3">
                    <p className="text-xs text-[#f7931a] mb-1">Enterprise</p>
                    <div className="text-[10px] text-[#d0d6e0] space-y-1">
                      <p>غير محدود محافظ</p>
                      <p>غير محدود API</p>
                      <p>غير محدود AI</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notifications */}
          {activeSection === 'notifications' && (
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-[#f7f8f8]">إعدادات الإشعارات</h3>
              <div className="space-y-3">
                <label className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg cursor-pointer">
                  <div>
                    <p className="text-sm text-[#f7f8f8]">بوت تيليجرام</p>
                    <p className="text-[10px] text-[#8a8f98]">إرسال التنبيهات عبر بوت تيليجرام</p>
                  </div>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={settings.telegramBotEnabled}
                      onChange={(e) => setSettings({ ...settings, telegramBotEnabled: e.target.checked })}
                      disabled={!isSuperAdmin}
                      className="sr-only"
                    />
                    <div className={`w-10 h-5 rounded-full transition-colors ${settings.telegramBotEnabled ? 'bg-[#0ecb81]' : 'bg-white/10'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.telegramBotEnabled ? 'translate-x-5' : 'translate-x-0.5'} translate-y-0.5`} />
                    </div>
                  </div>
                </label>

                <label className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg cursor-pointer">
                  <div>
                    <p className="text-sm text-[#f7f8f8]">إشعارات البريد</p>
                    <p className="text-[10px] text-[#8a8f98]">إرسال التنبيهات عبر البريد الإلكتروني</p>
                  </div>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={settings.emailNotificationsEnabled}
                      onChange={(e) => setSettings({ ...settings, emailNotificationsEnabled: e.target.checked })}
                      disabled={!isSuperAdmin}
                      className="sr-only"
                    />
                    <div className={`w-10 h-5 rounded-full transition-colors ${settings.emailNotificationsEnabled ? 'bg-[#0ecb81]' : 'bg-white/10'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.emailNotificationsEnabled ? 'translate-x-5' : 'translate-x-0.5'} translate-y-0.5`} />
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* System Info */}
          {activeSection === 'system' && (
            <div className="space-y-4">
              <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">معلومات النظام</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'الإصدار', value: '0.2.0' },
                    { label: 'الإطار', value: 'Next.js 16' },
                    { label: 'قاعدة البيانات', value: 'Supabase' },
                    { label: 'الاستضافة', value: 'Vercel' },
                    { label: 'المديرون', value: String(stats?.adminCount || 0) },
                    { label: 'سجلات التدقيق', value: String(stats?.auditLogCount || 0) },
                  ].map((item) => (
                    <div key={item.label} className="bg-white/[0.02] rounded-lg p-3">
                      <p className="text-[10px] text-[#8a8f98]">{item.label}</p>
                      <p className="text-sm text-[#f7f8f8] font-medium">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* System Health */}
              <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">حالة الخدمات</h3>
                <div className="space-y-2">
                  {[
                    { name: 'Supabase (Auth + DB)', status: 'connected' },
                    { name: 'Alchemy API (Blockchain)', status: 'connected' },
                    { name: 'OpenRouter (AI)', status: 'connected' },
                    { name: 'Telegram Bot', status: 'connected' },
                    { name: 'Email (AWS SES)', status: 'connected' },
                  ].map((service) => (
                    <div key={service.name} className="flex items-center justify-between p-2.5 bg-white/[0.02] rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#0ecb81]" />
                        <span className="text-xs text-[#f7f8f8]">{service.name}</span>
                      </div>
                      <span className="text-[10px] text-[#0ecb81]">متصل</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats Summary */}
              <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">إحصائيات النظام</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white/[0.02] rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-[#f7f8f8]">{stats?.totalUsers || 0}</p>
                    <p className="text-[10px] text-[#8a8f98]">إجمالي المستخدمين</p>
                  </div>
                  <div className="bg-white/[0.02] rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-[#0ecb81]">{stats?.activeUsers || 0}</p>
                    <p className="text-[10px] text-[#8a8f98]">مستخدمين نشطين</p>
                  </div>
                  <div className="bg-white/[0.02] rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-[#f7931a]">{stats?.totalWallets || 0}</p>
                    <p className="text-[10px] text-[#8a8f98]">محافظ متصلة</p>
                  </div>
                  <div className="bg-white/[0.02] rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-[#627eea]">{stats?.totalTransactions || 0}</p>
                    <p className="text-[10px] text-[#8a8f98]">إجمالي المعاملات</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
