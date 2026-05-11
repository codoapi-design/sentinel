'use client';

import { useEffect, useState } from 'react';
import {
  Bell, Mail, MessageSquare, Send, Edit3, Eye, Save, X,
  ToggleLeft, ToggleRight, Search, FileText,
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
  email: 'بريد إلكتروني',
  telegram: 'تيليجرام',
  both: 'بريد + تيليجرام',
};

const channelColors: Record<string, string> = {
  email: 'bg-[#0052ff]/10 text-[#0052ff]',
  telegram: 'bg-[#627eea]/10 text-[#627eea]',
  both: 'bg-[#f7931a]/10 text-[#f7931a]',
};

const defaultTemplates: NotificationTemplate[] = [
  {
    id: '1',
    name: 'تسجيل حساب جديد',
    key: 'welcome',
    channel: 'email',
    subject: 'مرحباً بك في Sentinel!',
    body: 'مرحباً {{name}}،\n\nشكراً لتسجيلك في Sentinel - منصة مراقبة المحافظ الرقمية.\n\nيمكنك الآن ربط محافظك وبدء مراقبة أصولك.\n\nمع التحية،\nفريق Sentinel',
    is_active: true,
    description: 'يُرسل عند تسجيل مستخدم جديد',
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'تأكيد البريد الإلكتروني',
    key: 'email_verification',
    channel: 'email',
    subject: 'تأكيد البريد الإلكتروني - Sentinel',
    body: 'مرحباً {{name}}،\n\nيرجى تأكيد بريدك الإلكتروني عبر الرابط التالي:\n{{verification_link}}\n\nالرابط صالح لمدة 24 ساعة.',
    is_active: true,
    description: 'يُرسل لتأكيد البريد الإلكتروني',
    updated_at: new Date().toISOString(),
  },
  {
    id: '3',
    name: 'تنبيه أمني',
    key: 'security_alert',
    channel: 'both',
    subject: 'تنبيه أمني - Sentinel',
    body: 'تنبيه أمني!\n\nتم اكتشاف نشاط مشبوه في حسابك.\nالنشاط: {{activity}}\nالوقت: {{time}}\nIP: {{ip}}\n\nإذا لم تكن أنت، يرجى تغيير كلمة المرور فوراً.',
    is_active: true,
    description: 'يُرسل عند اكتشاف نشاط مشبوه',
    updated_at: new Date().toISOString(),
  },
  {
    id: '4',
    name: 'تنبيه تحويل كبير',
    key: 'large_transaction',
    channel: 'telegram',
    subject: 'تحويل كبير - Sentinel',
    body: 'تم رصد تحويل كبير!\n\nالمبلغ: {{amount}} {{token}}\nمن: {{from_address}}\nإلى: {{to_address}}\nالشبكة: {{network}}\n\nرابط المعاملة: {{tx_link}}',
    is_active: true,
    description: 'يُرسل عند رصد تحويل كبير من المحفظة',
    updated_at: new Date().toISOString(),
  },
  {
    id: '5',
    name: 'تجديد الاشتراك',
    key: 'subscription_renewal',
    channel: 'email',
    subject: 'تذكير تجديد الاشتراك - Sentinel',
    body: 'مرحباً {{name}}،\n\nاشتراكك في باقة {{plan}} ينتهي في {{expiry_date}}.\n\nجدد الآن للاستمرار في الاستفادة من جميع الميزات.\n\nرابط التجديد: {{renewal_link}}',
    is_active: true,
    description: 'يُرسل قبل انتهاء الاشتراك',
    updated_at: new Date().toISOString(),
  },
  {
    id: '6',
    name: 'تقرير أسبوعي',
    key: 'weekly_report',
    channel: 'email',
    subject: 'التقرير الأسبوعي - Sentinel',
    body: 'مرحباً {{name}}،\n\nإليك ملخص محفظتك لهذا الأسبوع:\n\nإجمالي الأصول: ${{total_value}}\nالتغير: {{change_percent}}%\nأفضل أداء: {{best_performer}}\nأسوأ أداء: {{worst_performer}}\n\nتفاصيل أكثر في لوحة التحكم.',
    is_active: false,
    description: 'تقرير أسبوعي بأداء المحفظة',
    updated_at: new Date().toISOString(),
  },
  {
    id: '7',
    name: 'تغيير الباقة',
    key: 'plan_change',
    channel: 'email',
    subject: 'تم تغيير باقتك - Sentinel',
    body: 'مرحباً {{name}}،\n\nتم تغيير باقتك من {{old_plan}} إلى {{new_plan}}.\n\nالميزات الجديدة متاحة الآن في حسابك.',
    is_active: true,
    description: 'يُرسل عند تغيير الباقة',
    updated_at: new Date().toISOString(),
  },
  {
    id: '8',
    name: 'ربط محفظة جديدة',
    key: 'wallet_connected',
    channel: 'telegram',
    subject: 'محفظة جديدة - Sentinel',
    body: 'تم ربط محفظة جديدة!\n\nالعنوان: {{wallet_address}}\nالشبكة: {{network}}\n\nإذا لم تكن أنت، يرجى التواصل مع الدعم فوراً.',
    is_active: true,
    description: 'يُرسل عند ربط محفظة جديدة',
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

  const filteredTemplates = templates.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.key.toLowerCase().includes(search.toLowerCase());
    const matchChannel = !channelFilter || t.channel === channelFilter;
    return matchSearch && matchChannel;
  });

  const availableVariables = [
    { name: '{{name}}', desc: 'اسم المستخدم' },
    { name: '{{email}}', desc: 'البريد الإلكتروني' },
    { name: '{{plan}}', desc: 'الباقة الحالية' },
    { name: '{{wallet_address}}', desc: 'عنوان المحفظة' },
    { name: '{{amount}}', desc: 'المبلغ' },
    { name: '{{token}}', desc: 'رمز التوكن' },
    { name: '{{network}}', desc: 'الشبكة' },
    { name: '{{time}}', desc: 'الوقت' },
    { name: '{{ip}}', desc: 'عنوان IP' },
  ];

  return (
    <div className="space-y-4">
      {/* Editor Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#0c0d0e] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h3 className="text-sm font-semibold text-[#f7f8f8]">تعديل: {editingTemplate.name}</h3>
              <button onClick={() => setEditingTemplate(null)} className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[#8a8f98] mb-1.5 block">اسم القالب</label>
                  <input
                    type="text"
                    value={editingTemplate.name}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                    className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-[#8a8f98] mb-1.5 block">القناة</label>
                  <select
                    value={editingTemplate.channel}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, channel: e.target.value as NotificationTemplate['channel'] })}
                    className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50"
                  >
                    <option value="email">بريد إلكتروني</option>
                    <option value="telegram">تيليجرام</option>
                    <option value="both">بريد + تيليجرام</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-[#8a8f98] mb-1.5 block">الموضوع</label>
                <input
                  type="text"
                  value={editingTemplate.subject}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                  className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50"
                />
              </div>

              <div>
                <label className="text-xs text-[#8a8f98] mb-1.5 block">المحتوى</label>
                <textarea
                  value={editingTemplate.body}
                  onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                  className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 min-h-[200px] font-mono"
                  dir="ltr"
                />
              </div>

              {/* Available Variables */}
              <div>
                <p className="text-[10px] text-[#8a8f98] mb-2">المتغيرات المتاحة:</p>
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
                إلغاء
              </button>
              <button
                onClick={() => setPreviewTemplate(editingTemplate)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-[#8a8f98] hover:text-[#f7f8f8] text-sm transition-colors"
              >
                <Eye className="h-4 w-4" />
                معاينة
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0052ff] hover:bg-[#0045d1] text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="h-4 w-4" />}
                حفظ
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
              <h3 className="text-sm font-semibold text-[#f7f8f8]">معاينة: {previewTemplate.name}</h3>
              <button onClick={() => setPreviewTemplate(null)} className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              <div className="bg-[#191a1b] rounded-xl p-4">
                <p className="text-xs text-[#8a8f98] mb-1">الموضوع:</p>
                <p className="text-sm text-[#f7f8f8] mb-3">{previewTemplate.subject}</p>
                <div className="border-t border-white/5 pt-3">
                  <p className="text-xs text-[#8a8f98] mb-1">المحتوى:</p>
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
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8f98]" />
            <input
              type="text"
              placeholder="بحث في القوالب..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-[#0c0d0e] border border-white/10 rounded-lg pr-10 pl-4 py-2 text-sm text-[#d0d6e0] placeholder-[#8a8f98] w-[240px] focus:outline-none focus:border-[#0052ff]/50"
            />
          </div>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="bg-[#0c0d0e] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#d0d6e0] focus:outline-none focus:border-[#0052ff]/50"
          >
            <option value="">كل القنوات</option>
            <option value="email">بريد إلكتروني</option>
            <option value="telegram">تيليجرام</option>
            <option value="both">بريد + تيليجرام</option>
          </select>
        </div>

        <div className="text-xs text-[#8a8f98]">
          {templates.filter(t => t.is_active).length} / {templates.length} قالب مفعّل
        </div>
      </div>

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
                    <p className="text-[10px] text-[#8a8f98] mt-0.5">الموضوع: {template.subject}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Toggle Active */}
                    <button
                      onClick={() => toggleActive(template)}
                      className="transition-colors"
                      title={template.is_active ? 'تعطيل' : 'تفعيل'}
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
                      title="تعديل"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>

                    <button
                      onClick={() => setPreviewTemplate(template)}
                      className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98] hover:text-[#0ecb81] transition-colors"
                      title="معاينة"
                    >
                      <Eye className="h-3.5 w-3.5" />
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
