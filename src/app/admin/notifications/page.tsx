'use client';

import { useEffect, useState } from 'react';
import {
  Bell, Mail, MessageSquare, Send, Edit3, Eye, Save, X,
  ToggleLeft, ToggleRight, Search, FileText, Zap,
} from 'lucide-react';
import { useAdminStore } from '@/stores/admin-store';

interface NotificationTemplate {
  id: string;
  name: string;
  key: string;
  channel: 'email' | 'telegram' | 'both';
  subject: string;
  body: string;
  is_active: boolean;
  description: string;
  updated_at: string;
}

const channelIcons: Record<string, typeof Mail> = {
  email: Mail,
  telegram: MessageSquare,
  both: Send,
};

const channelLabels: Record<string, string> = {
  email: 'Email',
  telegram: 'Telegram',
  both: 'Email + Telegram',
};

const channelColors: Record<string, string> = {
  email: 'bg-[#0052ff]/10 text-[#0052ff]',
  telegram: 'bg-[#627eea]/10 text-[#627eea]',
  both: 'bg-[#f7931a]/10 text-[#f7931a]',
};

const defaultTemplates: NotificationTemplate[] = [
  {
    id: '1',
    name: 'New Account Registration',
    key: 'welcome',
    channel: 'email',
    subject: 'Welcome to Radareum!',
    body: 'Hello {{name}},\n\nThank you for registering with Radareum - the digital wallet monitoring platform.\n\nYou can now connect your wallets and start monitoring your assets.\n\nBest regards,\nRadareum Team',
    is_active: true,
    description: 'Sent when a new user registers',
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'Email Verification',
    key: 'email_verification',
    channel: 'email',
    subject: 'Email Verification - Radareum',
    body: 'Hello {{name}},\n\nPlease verify your email address using the following link:\n{{verification_link}}\n\nThe link is valid for 24 hours.',
    is_active: true,
    description: 'Sent to verify email address',
    updated_at: new Date().toISOString(),
  },
  {
    id: '3',
    name: 'Security Alert',
    key: 'security_alert',
    channel: 'both',
    subject: 'Security Alert - Radareum',
    body: 'Security Alert!\n\nSuspicious activity has been detected on your account.\nActivity: {{activity}}\nTime: {{time}}\nIP: {{ip}}\n\nIf this was not you, please change your password immediately.',
    is_active: true,
    description: 'Sent when suspicious activity is detected',
    updated_at: new Date().toISOString(),
  },
  {
    id: '4',
    name: 'Large Transaction Alert',
    key: 'large_transaction',
    channel: 'telegram',
    subject: 'Large Transaction - Radareum',
    body: 'A large transaction has been detected!\n\nAmount: {{amount}} {{token}}\nFrom: {{from_address}}\nTo: {{to_address}}\nNetwork: {{network}}\n\nTransaction link: {{tx_link}}',
    is_active: true,
    description: 'Sent when a large transaction is detected from wallet',
    updated_at: new Date().toISOString(),
  },
  {
    id: '5',
    name: 'Subscription Renewal',
    key: 'subscription_renewal',
    channel: 'email',
    subject: 'Subscription Renewal Reminder - Radareum',
    body: 'Hello {{name}},\n\nYour {{plan}} plan subscription expires on {{expiry_date}}.\n\nRenew now to continue enjoying all features.\n\nRenewal link: {{renewal_link}}',
    is_active: true,
    description: 'Sent before subscription expires',
    updated_at: new Date().toISOString(),
  },
  {
    id: '6',
    name: 'Weekly Report',
    key: 'weekly_report',
    channel: 'email',
    subject: 'Weekly Report - Radareum',
    body: 'Hello {{name}},\n\nHere is your wallet summary for this week:\n\nTotal Assets: ${{total_value}}\nChange: {{change_percent}}%\nBest Performer: {{best_performer}}\nWorst Performer: {{worst_performer}}\n\nMore details in your dashboard.',
    is_active: false,
    description: 'Weekly wallet performance report',
    updated_at: new Date().toISOString(),
  },
  {
    id: '7',
    name: 'Plan Change',
    key: 'plan_change',
    channel: 'email',
    subject: 'Your Plan Has Changed - Radareum',
    body: 'Hello {{name}},\n\nYour plan has been changed from {{old_plan}} to {{new_plan}}.\n\nYour new features are now available in your account.',
    is_active: true,
    description: 'Sent when plan is changed',
    updated_at: new Date().toISOString(),
  },
  {
    id: '8',
    name: 'New Wallet Connected',
    key: 'wallet_connected',
    channel: 'telegram',
    subject: 'New Wallet - Radareum',
    body: 'A new wallet has been connected!\n\nAddress: {{wallet_address}}\nNetwork: {{network}}\n\nIf this was not you, please contact support immediately.',
    is_active: true,
    description: 'Sent when a new wallet is connected',
    updated_at: new Date().toISOString(),
  },
];

export default function AdminNotificationsPage() {
  const { admin } = useAdminStore();
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<NotificationTemplate | null>(null);
  const [testSending, setTestSending] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/notifications');
      if (res.ok) {
        const data = await res.json();
        if (data.templates && data.templates.length > 0) {
          setTemplates(data.templates as NotificationTemplate[]);
        } else {
          // Use default templates if none in DB
          setTemplates(defaultTemplates);
        }
      } else {
        setTemplates(defaultTemplates);
      }
    } catch {
      setTemplates(defaultTemplates);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleSave = async () => {
    if (!editingTemplate) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingTemplate.id,
          subject: editingTemplate.subject,
          body: editingTemplate.body,
          is_active: editingTemplate.is_active,
          channel: editingTemplate.channel,
        }),
      });
      if (res.ok) {
        setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? editingTemplate : t));
        setEditingTemplate(null);
      }
    } catch (error) {
      console.error('Failed to save template:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = (template: NotificationTemplate) => {
    setTemplates(prev => prev.map(t =>
      t.id === template.id ? { ...t, is_active: !t.is_active } : t
    ));
    // Save to API
    fetch('/api/admin/notifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: template.id, is_active: !template.is_active }),
    });
  };

  const handleTestSend = async (template: NotificationTemplate) => {
    setTestSending(template.id);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_send', templateId: template.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult(data.message || 'Sent successfully');
      } else {
        setTestResult('Send failed: ' + (data.error || 'Unknown error'));
      }
    } catch {
      setTestResult('Send failed');
    } finally {
      setTestSending(null);
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  const filteredTemplates = templates.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.key.toLowerCase().includes(search.toLowerCase());
    const matchChannel = !channelFilter || t.channel === channelFilter;
    return matchSearch && matchChannel;
  });

  const availableVariables = [
    { name: '{{name}}', desc: 'User name' },
    { name: '{{email}}', desc: 'Email address' },
    { name: '{{plan}}', desc: 'Current plan' },
    { name: '{{wallet_address}}', desc: 'Wallet address' },
    { name: '{{amount}}', desc: 'Amount' },
    { name: '{{token}}', desc: 'Token symbol' },
    { name: '{{network}}', desc: 'Network' },
    { name: '{{time}}', desc: 'Time' },
    { name: '{{ip}}', desc: 'IP address' },
  ];

  return (
    <div className="space-y-4">
      {/* Editor Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#0c0d0e] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h3 className="text-sm font-semibold text-[#f7f8f8]">Edit: {editingTemplate.name}</h3>
              <button onClick={() => setEditingTemplate(null)} className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[#8a8f98] mb-1.5 block">Template Name</label>
                  <input
                    type="text"
                    value={editingTemplate.name}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                    className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8a8f98] mb-1.5 block">Channel</label>
                  <select
                    value={editingTemplate.channel}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, channel: e.target.value as NotificationTemplate['channel'] })}
                    className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50"
                  >
                    <option value="email">Email</option>
                    <option value="telegram">Telegram</option>
                    <option value="both">Email + Telegram</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-[#8a8f98] mb-1.5 block">Subject</label>
                <input
                  type="text"
                  value={editingTemplate.subject}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                  className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50"
                />
              </div>

              <div>
                <label className="text-xs text-[#8a8f98] mb-1.5 block">Content</label>
                <textarea
                  value={editingTemplate.body}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                  className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 min-h-[200px] font-mono"
                  dir="ltr"
                />
              </div>

              {/* Available Variables */}
              <div>
                <p className="text-[10px] text-[#8a8f98] mb-2">Available Variables:</p>
                <div className="flex flex-wrap gap-1.5">
                  {availableVariables.map((v) => (
                    <button
                      key={v.name}
                      onClick={() => setEditingTemplate({ ...editingTemplate, body: editingTemplate.body + v.name })}
                      className="px-2 py-1 rounded bg-white/[0.03] border border-white/5 text-[10px] text-[#d0d6e0] font-mono hover:border-[#0052ff]/30 transition-colors"
                      title={v.desc}
                    >
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/5">
              <button
                onClick={() => setEditingTemplate(null)}
                className="px-4 py-2 rounded-lg bg-white/5 text-[#8a8f98] hover:text-[#f7f8f8] text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setPreviewTemplate(editingTemplate)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-[#8a8f98] hover:text-[#f7f8f8] text-sm transition-colors"
              >
                <Eye className="h-4 w-4" />
                Preview
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0052ff] hover:bg-[#0045d1] text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#0c0d0e] border border-white/10 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h3 className="text-sm font-semibold text-[#f7f8f8]">Preview: {previewTemplate.name}</h3>
              <button onClick={() => setPreviewTemplate(null)} className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              <div className="bg-[#191a1b] rounded-xl p-4">
                <p className="text-xs text-[#8a8f98] mb-1">Subject:</p>
                <p className="text-sm text-[#f7f8f8] mb-3">{previewTemplate.subject}</p>
                <div className="border-t border-white/5 pt-3">
                  <p className="text-xs text-[#8a8f98] mb-1">Content:</p>
                  <div className="text-sm text-[#d0d6e0] whitespace-pre-wrap" dir="ltr">
                    {previewTemplate.body}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8f98]" />
            <input
              type="text"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#0c0d0e] border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-[#d0d6e0] placeholder-[#8a8f98] w-[240px] focus:outline-none focus:border-[#0052ff]/50"
            />
          </div>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="bg-[#0c0d0e] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#d0d6e0] focus:outline-none focus:border-[#0052ff]/50"
          >
            <option value="">All Channels</option>
            <option value="email">Email</option>
            <option value="telegram">Telegram</option>
            <option value="both">Email + Telegram</option>
          </select>
        </div>

        <div className="text-xs text-[#8a8f98]">
          {templates.filter(t => t.is_active).length} / {templates.length} templates active
        </div>
      </div>

      {/* Test Result Banner */}
      {testResult && (
        <div className={`rounded-xl p-3 text-xs ${
          testResult.includes('failed') ? 'bg-[#f6465d]/10 text-[#f6465d] border border-[#f6465d]/20' : 'bg-[#0ecb81]/10 text-[#0ecb81] border border-[#0ecb81]/20'
        }`}>
          {testResult}
        </div>
      )}

      {/* Templates List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-[#0052ff]/30 border-t-[#0052ff] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTemplates.map((template) => {
            const ChannelIcon = channelIcons[template.channel] || Mail;

            return (
              <div
                key={template.id}
                className={`bg-[#0c0d0e] border rounded-xl p-4 transition-colors ${
                  template.is_active ? 'border-white/5 hover:border-white/10' : 'border-white/[0.03] opacity-70'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${channelColors[template.channel]}`}>
                        <ChannelIcon className="h-3.5 w-3.5" />
                      </div>
                      <p className="text-sm text-[#f7f8f8] font-medium">{template.name}</p>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-[#8a8f98] font-mono">
                        {template.key}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#8a8f98] mt-1">{template.description}</p>
                    <p className="text-[10px] text-[#8a8f98] mt-0.5">Subject: {template.subject}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Toggle Active */}
                    <button
                      onClick={() => toggleActive(template)}
                      className="transition-colors"
                      title={template.is_active ? 'Disable' : 'Enable'}
                    >
                      {template.is_active ? (
                        <ToggleRight className="h-6 w-6 text-[#0ecb81]" />
                      ) : (
                        <ToggleLeft className="h-6 w-6 text-[#8a8f98]" />
                      )}
                    </button>

                    <button
                      onClick={() => setEditingTemplate({ ...template })}
                      className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98] hover:text-[#0052ff] transition-colors"
                      title="Edit"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>

                    <button
                      onClick={() => setPreviewTemplate(template)}
                      className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98] hover:text-[#0ecb81] transition-colors"
                      title="Preview"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>

                    <button
                      onClick={() => handleTestSend(template)}
                      disabled={testSending === template.id}
                      className="p-1.5 rounded-lg hover:bg-[#627eea]/10 text-[#8a8f98] hover:text-[#627eea] transition-colors disabled:opacity-50"
                      title="Test Send"
                    >
                      <Zap className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
