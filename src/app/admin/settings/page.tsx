'use client';

import { useEffect, useState } from 'react';
import {
  Settings, Shield, Users, Database, Server,
  Key, Bell, Globe, Mail, AlertTriangle,
  CheckCircle, RefreshCw, Save, Trash2,
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

interface AdminEntry {
  user_id: string;
  role: string;
  email: string;
  created_at: string;
}

export default function AdminSettingsPage() {
  const { admin } = useAdminStore();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [adminList, setAdminList] = useState<AdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('general');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [serviceStatuses, setServiceStatuses] = useState<Array<{ name: string; status: string; details: string }>>([]);

  const [settings, setSettings] = useState({
    siteName: 'Radareum',
    siteDescription: 'Digital Wallet Monitoring Platform',
    supportEmail: 'support@radareum.app',
    maintenanceMode: false,
    registrationEnabled: true,
    emailVerificationRequired: true,
    maxWalletsPerUser: '10',
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
          setAdminList(data.adminList || []);

          // Apply DB settings
          if (data.settings) {
            setSettings(prev => ({
              ...prev,
              siteName: data.settings.site_name || prev.siteName,
              siteDescription: data.settings.site_description || prev.siteDescription,
              supportEmail: data.settings.support_email || prev.supportEmail,
              maintenanceMode: data.settings.maintenance_mode === 'true',
              registrationEnabled: data.settings.registration_enabled !== 'false',
              emailVerificationRequired: data.settings.email_verification_required !== 'false',
              maxWalletsPerUser: data.settings.max_wallets_per_user || prev.maxWalletsPerUser,
              rateLimitWindow: data.settings.rate_limit_window || prev.rateLimitWindow,
              rateLimitMaxRequests: data.settings.rate_limit_max_requests || prev.rateLimitMaxRequests,
              telegramBotEnabled: data.settings.telegram_bot_enabled !== 'false',
              emailNotificationsEnabled: data.settings.email_notifications_enabled !== 'false',
            }));
          }
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();

    // Fetch real service status
    fetch('/api/admin/system-health')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.services) {
          setServiceStatuses(data.services);
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          data: {
            site_name: settings.siteName,
            site_description: settings.siteDescription,
            support_email: settings.supportEmail,
            maintenance_mode: settings.maintenanceMode,
            registration_enabled: settings.registrationEnabled,
            email_verification_required: settings.emailVerificationRequired,
            max_wallets_per_user: settings.maxWalletsPerUser,
            rate_limit_window: settings.rateLimitWindow,
            rate_limit_max_requests: settings.rateLimitMaxRequests,
            telegram_bot_enabled: settings.telegramBotEnabled,
            email_notifications_enabled: settings.emailNotificationsEnabled,
          },
        }),
      });
      if (res.ok) {
        setSaveMessage('Settings saved successfully');
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage('An error occurred while saving settings');
      }
    } catch {
      setSaveMessage('Connection error');
    } finally {
      setSaving(false);
    }
  };

  const isSuperAdmin = admin?.role === 'super_admin';

  const sections = [
    { id: 'general', label: 'General', icon: Globe },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'limits', label: 'Limits & Restrictions', icon: Database },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'system', label: 'System Info', icon: Server },
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
          <span className="text-sm text-[#f7f8f8]">System Settings</span>
          {saveMessage && (
            <span className={`text-xs ${saveMessage.includes('successfully') ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
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
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Settings
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
                <h3 className="text-sm font-semibold text-[#f7f8f8]">General Settings</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[#8a8f98] mb-1.5 block">Site Name</label>
                    <input
                      type="text"
                      value={settings.siteName}
                      onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                      disabled={!isSuperAdmin}
                      className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#8a8f98] mb-1.5 block">Site Description</label>
                    <input
                      type="text"
                      value={settings.siteDescription}
                      onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })}
                      disabled={!isSuperAdmin}
                      className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#8a8f98] mb-1.5 block">Support Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8f98]" />
                      <input
                        type="email"
                        value={settings.supportEmail}
                        onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                        disabled={!isSuperAdmin}
                        className="w-full bg-[#191a1b] border border-white/10 rounded-lg pl-10 pr-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-[#f7f8f8]">Maintenance & Registration</h3>
                <div className="space-y-3">
                  <label className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg cursor-pointer">
                    <div>
                      <p className="text-sm text-[#f7f8f8]">Maintenance Mode</p>
                      <p className="text-[10px] text-[#8a8f98]">Disable access for regular users</p>
                    </div>
                    <div className="relative">
                      <input type="checkbox" checked={settings.maintenanceMode} onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })} disabled={!isSuperAdmin} className="sr-only" />
                      <div className={`w-10 h-5 rounded-full transition-colors ${settings.maintenanceMode ? 'bg-[#f6465d]' : 'bg-white/10'}`}>
                        <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.maintenanceMode ? 'translate-x-5' : 'translate-x-0.5'} translate-y-0.5`} />
                      </div>
                    </div>
                  </label>
                  <label className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg cursor-pointer">
                    <div>
                      <p className="text-sm text-[#f7f8f8]">New Registration</p>
                      <p className="text-[10px] text-[#8a8f98]">Allow new account registration</p>
                    </div>
                    <div className="relative">
                      <input type="checkbox" checked={settings.registrationEnabled} onChange={(e) => setSettings({ ...settings, registrationEnabled: e.target.checked })} disabled={!isSuperAdmin} className="sr-only" />
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
              <h3 className="text-sm font-semibold text-[#f7f8f8]">Security Settings</h3>
              <div className="space-y-3">
                <label className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg cursor-pointer">
                  <div>
                    <p className="text-sm text-[#f7f8f8]">Email Verification</p>
                    <p className="text-[10px] text-[#8a8f98]">Require email confirmation before using the platform</p>
                  </div>
                  <div className="relative">
                    <input type="checkbox" checked={settings.emailVerificationRequired} onChange={(e) => setSettings({ ...settings, emailVerificationRequired: e.target.checked })} disabled={!isSuperAdmin} className="sr-only" />
                    <div className={`w-10 h-5 rounded-full transition-colors ${settings.emailVerificationRequired ? 'bg-[#0ecb81]' : 'bg-white/10'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.emailVerificationRequired ? 'translate-x-5' : 'translate-x-0.5'} translate-y-0.5`} />
                    </div>
                  </div>
                </label>
                <div>
                  <label className="text-xs text-[#8a8f98] mb-1.5 block">Rate Limit Window (minutes)</label>
                  <input type="number" value={settings.rateLimitWindow} onChange={(e) => setSettings({ ...settings, rateLimitWindow: e.target.value })} disabled={!isSuperAdmin} className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 disabled:opacity-50" />
                </div>
                <div>
                  <label className="text-xs text-[#8a8f98] mb-1.5 block">Max Requests per Window</label>
                  <input type="number" value={settings.rateLimitMaxRequests} onChange={(e) => setSettings({ ...settings, rateLimitMaxRequests: e.target.value })} disabled={!isSuperAdmin} className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 disabled:opacity-50" />
                </div>
              </div>

              {/* Admin List from DB */}
              <div className="pt-4 border-t border-white/5">
                <h4 className="text-xs font-semibold text-[#8a8f98] mb-3">Admins ({adminList.length})</h4>
                <div className="space-y-2">
                  {adminList.map((adm) => (
                    <div key={adm.user_id} className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-lg">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        adm.role === 'super_admin' ? 'bg-[#f7931a]/20 text-[#f7931a]' : 'bg-[#0052ff]/20 text-[#0052ff]'
                      }`}>
                        {(adm.email || 'A').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[#f7f8f8] truncate">{adm.email}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          adm.role === 'super_admin' ? 'bg-[#f7931a]/10 text-[#f7931a]' : 'bg-[#0052ff]/10 text-[#0052ff]'
                        }`}>
                          {adm.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Limits */}
          {activeSection === 'limits' && (
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-[#f7f8f8]">User Limits</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[#8a8f98] mb-1.5 block">Max Wallets per User</label>
                  <input type="number" value={settings.maxWalletsPerUser} onChange={(e) => setSettings({ ...settings, maxWalletsPerUser: e.target.value })} disabled={!isSuperAdmin} className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 disabled:opacity-50" />
                </div>
              </div>

              <div className="pt-4 border-t border-white/5">
                <h4 className="text-xs font-semibold text-[#8a8f98] mb-3">Plan Limits</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-white/[0.02] rounded-lg p-3">
                    <p className="text-xs text-[#8a8f98] mb-1">Starter</p>
                    <div className="text-[10px] text-[#d0d6e0] space-y-1">
                      <p>1 wallet</p>
                      <p>500 transactions</p>
                    </div>
                  </div>
                  <div className="bg-[#0ecb81]/5 rounded-lg p-3">
                    <p className="text-xs text-[#0ecb81] mb-1">Pro</p>
                    <div className="text-[10px] text-[#d0d6e0] space-y-1">
                      <p>5 wallets</p>
                      <p>5,000 transactions</p>
                    </div>
                  </div>
                  <div className="bg-[#f7931a]/5 rounded-lg p-3">
                    <p className="text-xs text-[#f7931a] mb-1">Enterprise</p>
                    <div className="text-[10px] text-[#d0d6e0] space-y-1">
                      <p>25 wallets</p>
                      <p>Unlimited transactions</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notifications */}
          {activeSection === 'notifications' && (
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-[#f7f8f8]">Notification Settings</h3>
              <div className="space-y-3">
                <label className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg cursor-pointer">
                  <div>
                    <p className="text-sm text-[#f7f8f8]">Telegram Bot</p>
                    <p className="text-[10px] text-[#8a8f98]">Send alerts via Telegram bot</p>
                  </div>
                  <div className="relative">
                    <input type="checkbox" checked={settings.telegramBotEnabled} onChange={(e) => setSettings({ ...settings, telegramBotEnabled: e.target.checked })} disabled={!isSuperAdmin} className="sr-only" />
                    <div className={`w-10 h-5 rounded-full transition-colors ${settings.telegramBotEnabled ? 'bg-[#0ecb81]' : 'bg-white/10'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.telegramBotEnabled ? 'translate-x-5' : 'translate-x-0.5'} translate-y-0.5`} />
                    </div>
                  </div>
                </label>
                <label className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg cursor-pointer">
                  <div>
                    <p className="text-sm text-[#f7f8f8]">Email Notifications</p>
                    <p className="text-[10px] text-[#8a8f98]">Send alerts via email</p>
                  </div>
                  <div className="relative">
                    <input type="checkbox" checked={settings.emailNotificationsEnabled} onChange={(e) => setSettings({ ...settings, emailNotificationsEnabled: e.target.checked })} disabled={!isSuperAdmin} className="sr-only" />
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
                <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">System Information</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Version', value: '0.3.0' },
                    { label: 'Framework', value: 'Next.js 16' },
                    { label: 'Database', value: 'Supabase' },
                    { label: 'Hosting', value: 'Vercel' },
                    { label: 'Admins', value: String(stats?.adminCount || 0) },
                    { label: 'Audit Logs', value: String(stats?.auditLogCount || 0) },
                  ].map((item) => (
                    <div key={item.label} className="bg-white/[0.02] rounded-lg p-3">
                      <p className="text-[10px] text-[#8a8f98]">{item.label}</p>
                      <p className="text-sm text-[#f7f8f8] font-medium">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">Service Status</h3>
                <div className="space-y-2">
                  {(serviceStatuses || []).length > 0 ? (
                    (serviceStatuses || []).map((service: { name: string; status: string; details: string }) => (
                      <div key={service.name} className="flex items-center justify-between p-2.5 bg-white/[0.02] rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            service.status === 'operational' ? 'bg-[#0ecb81] animate-pulse' :
                            service.status === 'degraded' ? 'bg-[#f7931a]' : 'bg-[#8a8f98]'
                          }`} />
                          <span className="text-xs text-[#f7f8f8]">{service.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-[#8a8f98]">{service.details}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            service.status === 'operational' ? 'bg-[#0ecb81]/10 text-[#0ecb81]' :
                            service.status === 'degraded' ? 'bg-[#f7931a]/10 text-[#f7931a]' :
                            'bg-[#8a8f98]/10 text-[#8a8f98]'
                          }`}>
                            {service.status === 'operational' ? 'Online' :
                             service.status === 'degraded' ? 'Degraded' : 'No Key'}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-xs text-[#8a8f98]">Loading service status...</div>
                  )}
                </div>
              </div>

              <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">System Statistics</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white/[0.02] rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-[#f7f8f8]">{stats?.totalUsers || 0}</p>
                    <p className="text-[10px] text-[#8a8f98]">Total Users</p>
                  </div>
                  <div className="bg-white/[0.02] rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-[#0ecb81]">{stats?.activeUsers || 0}</p>
                    <p className="text-[10px] text-[#8a8f98]">Active Users</p>
                  </div>
                  <div className="bg-white/[0.02] rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-[#f7931a]">{stats?.totalWallets || 0}</p>
                    <p className="text-[10px] text-[#8a8f98]">Connected Wallets</p>
                  </div>
                  <div className="bg-white/[0.02] rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-[#627eea]">{stats?.totalTransactions || 0}</p>
                    <p className="text-[10px] text-[#8a8f98]">Total Transactions</p>
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
