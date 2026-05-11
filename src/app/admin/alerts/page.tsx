'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle, AlertCircle, Info, CheckCircle, XCircle,
  Bell, ChevronLeft, ChevronRight, Filter, Download,
  Clock, User, Zap, Plus, X, Trash2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useAdminStore } from '@/stores/admin-store';

interface Alert {
  id: string;
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  status: 'active' | 'acknowledged' | 'resolved';
  source: string;
  created_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
}

interface AlertStats {
  critical: number;
  warning: number;
  info: number;
}

export default function AdminAlertsPage() {
  const { admin } = useAdminStore();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [alertChart, setAlertChart] = useState<Array<Record<string, unknown>>>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newAlert, setNewAlert] = useState({ title: '', message: '', severity: 'info' as 'critical' | 'warning' | 'info', source: 'admin' });

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        severity: severityFilter,
        status: statusFilter,
      });
      const res = await fetch(`/api/admin/alerts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setStats(data.stats || null);
        setAlertChart(data.alertChart || []);
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    } finally {
      setLoading(false);
    }
  }, [page, severityFilter, statusFilter]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleAction = async (action: string, alertId?: string) => {
    setActionLoading(alertId || 'bulk');
    try {
      const res = await fetch('/api/admin/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, alertId }),
      });
      if (res.ok) {
        await fetchAlerts();
      }
    } catch (error) {
      console.error('Failed to handle alert:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreate = async () => {
    if (!newAlert.title || !newAlert.message) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', ...newAlert }),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setNewAlert({ title: '', message: '', severity: 'info', source: 'admin' });
        await fetchAlerts();
      }
    } catch (error) {
      console.error('Failed to create alert:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (alertId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا التنبيه؟')) return;
    try {
      const res = await fetch('/api/admin/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', alertId }),
      });
      if (res.ok) {
        await fetchAlerts();
      }
    } catch (error) {
      console.error('Failed to delete alert:', error);
    }
  };

  const severityConfig = {
    critical: { icon: XCircle, color: '#f6465d', bg: 'bg-[#f6465d]/10', border: 'border-[#f6465d]/20', label: 'حرج' },
    warning: { icon: AlertTriangle, color: '#f7931a', bg: 'bg-[#f7931a]/10', border: 'border-[#f7931a]/20', label: 'تحذير' },
    info: { icon: Info, color: '#0052ff', bg: 'bg-[#0052ff]/10', border: 'border-[#0052ff]/20', label: 'معلومات' },
  };

  const statusLabels: Record<string, string> = {
    active: 'نشط',
    acknowledged: 'تم التعرف',
    resolved: 'تم الحل',
  };

  const statusBadge: Record<string, string> = {
    active: 'bg-[#f6465d]/10 text-[#f6465d]',
    acknowledged: 'bg-[#f7931a]/10 text-[#f7931a]',
    resolved: 'bg-[#0ecb81]/10 text-[#0ecb81]',
  };

  const totalActive = stats ? stats.critical + stats.warning + stats.info : 0;
  const isSuperAdmin = admin?.role === 'super_admin';

  return (
    <div className="space-y-6">
      {/* Create Alert Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#0c0d0e] border border-white/10 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
              <h3 className="text-sm font-semibold text-[#f7f8f8]">إنشاء تنبيه جديد</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-[#8a8f98] mb-1.5 block">عنوان التنبيه</label>
                <input
                  type="text"
                  value={newAlert.title}
                  onChange={(e) => setNewAlert({ ...newAlert, title: e.target.value })}
                  className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50"
                  placeholder="مثال: مشكلة في الاتصال بقاعدة البيانات"
                />
              </div>
              <div>
                <label className="text-xs text-[#8a8f98] mb-1.5 block">التفاصيل</label>
                <textarea
                  value={newAlert.message}
                  onChange={(e) => setNewAlert({ ...newAlert, message: e.target.value })}
                  className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50 min-h-[100px]"
                  placeholder="وصف المشكلة أو التنبيه..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-[#8a8f98] mb-1.5 block">مستوى الخطورة</label>
                  <select
                    value={newAlert.severity}
                    onChange={(e) => setNewAlert({ ...newAlert, severity: e.target.value as 'critical' | 'warning' | 'info' })}
                    className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50"
                  >
                    <option value="info">معلومات</option>
                    <option value="warning">تحذير</option>
                    <option value="critical">حرج</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#8a8f98] mb-1.5 block">المصدر</label>
                  <select
                    value={newAlert.source}
                    onChange={(e) => setNewAlert({ ...newAlert, source: e.target.value })}
                    className="w-full bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f7f8f8] focus:outline-none focus:border-[#0052ff]/50"
                  >
                    <option value="admin">مدير</option>
                    <option value="system">نظام</option>
                    <option value="security">أمن</option>
                    <option value="monitoring">مراقبة</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/5">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg bg-white/5 text-[#8a8f98] hover:text-[#f7f8f8] text-sm transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newAlert.title || !newAlert.message}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0052ff] hover:bg-[#0045d1] text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {creating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="h-4 w-4" />}
                إنشاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#0c0d0e] border border-[#f6465d]/20 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-[#f6465d]/10">
                <XCircle className="h-4 w-4 text-[#f6465d]" />
              </div>
              <span className="text-sm text-[#f6465d]">تنبيهات حرجة</span>
            </div>
            {stats?.critical && stats.critical > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#f6465d] text-white text-[10px] font-bold animate-pulse">
                {stats.critical}
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-[#f7f8f8]">{stats?.critical || 0}</p>
          <p className="text-[10px] text-[#8a8f98] mt-1">تتطلب تدخل فوري</p>
        </div>

        <div className="bg-[#0c0d0e] border border-[#f7931a]/20 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-[#f7931a]/10">
                <AlertTriangle className="h-4 w-4 text-[#f7931a]" />
              </div>
              <span className="text-sm text-[#f7931a]">تحذيرات</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-[#f7f8f8]">{stats?.warning || 0}</p>
          <p className="text-[10px] text-[#8a8f98] mt-1">تحتاج مراقبة</p>
        </div>

        <div className="bg-[#0c0d0e] border border-[#0052ff]/20 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-[#0052ff]/10">
                <Info className="h-4 w-4 text-[#0052ff]" />
              </div>
              <span className="text-sm text-[#0052ff]">معلومات</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-[#f7f8f8]">{stats?.info || 0}</p>
          <p className="text-[10px] text-[#8a8f98] mt-1">للمتابعة فقط</p>
        </div>
      </div>

      {/* Alert Trend Chart */}
      <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-[#f7931a]" />
          <h3 className="text-sm font-semibold text-[#f7f8f8]">اتجاه التنبيهات (آخر 30 يوم)</h3>
        </div>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={alertChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
              <XAxis dataKey="date" stroke="#8a8f98" fontSize={10} tickLine={false} />
              <YAxis stroke="#8a8f98" fontSize={10} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#191a1b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#8a8f98' }}
              />
              <Legend />
              <Bar dataKey="critical" name="حرج" fill="#f6465d" radius={[2, 2, 0, 0]} />
              <Bar dataKey="warning" name="تحذير" fill="#f7931a" radius={[2, 2, 0, 0]} />
              <Bar dataKey="info" name="معلومات" fill="#0052ff" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters + Actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={severityFilter}
            onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
            className="bg-[#0c0d0e] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#d0d6e0] focus:outline-none focus:border-[#0052ff]/50"
          >
            <option value="">كل المستويات</option>
            <option value="critical">حرج</option>
            <option value="warning">تحذير</option>
            <option value="info">معلومات</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-[#0c0d0e] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#d0d6e0] focus:outline-none focus:border-[#0052ff]/50"
          >
            <option value="">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="acknowledged">تم التعرف</option>
            <option value="resolved">تم الحل</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0052ff] hover:bg-[#0045d1] text-white text-sm font-medium transition-colors"
            >
              <Plus className="h-4 w-4" />
              تنبيه جديد
            </button>
          )}
          <button
            onClick={() => handleAction('resolve_all')}
            disabled={actionLoading === 'bulk' || totalActive === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0ecb81]/10 text-[#0ecb81] hover:bg-[#0ecb81]/20 text-sm transition-colors disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" />
            حل الكل
          </button>
        </div>
      </div>

      {/* Alerts List */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[#0052ff]/30 border-t-[#0052ff] rounded-full animate-spin" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-12 text-center">
            <Bell className="h-10 w-10 text-[#8a8f98] mx-auto mb-3" />
            <p className="text-sm text-[#8a8f98]">لا توجد تنبيهات</p>
            <p className="text-xs text-[#8a8f98] mt-1">النظام يعمل بشكل طبيعي</p>
          </div>
        ) : (
          alerts.map((alert) => {
            const config = severityConfig[alert.severity];
            const IconComp = config.icon;

            return (
              <div
                key={alert.id}
                className={`bg-[#0c0d0e] border rounded-xl p-4 transition-colors ${
                  alert.status === 'active' ? `${config.border}` : 'border-white/5'
                } ${alert.status === 'resolved' ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg shrink-0 ${config.bg}`}>
                    <IconComp className="h-4 w-4" style={{ color: config.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-[#f7f8f8] font-medium">{alert.title}</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${statusBadge[alert.status]}`}>
                          {statusLabels[alert.status]}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#8a8f98] shrink-0">
                        {new Date(alert.created_at).toLocaleString('ar')}
                      </span>
                    </div>
                    <p className="text-xs text-[#8a8f98] mt-1">{alert.message}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-[#8a8f98]">
                        المصدر: <span className="text-[#d0d6e0]">{alert.source}</span>
                      </span>
                      {alert.acknowledged_at && (
                        <span className="text-[10px] text-[#f7931a]">
                          تم التعرف: {new Date(alert.acknowledged_at).toLocaleString('ar')}
                        </span>
                      )}
                      {alert.resolved_at && (
                        <span className="text-[10px] text-[#0ecb81]">
                          تم الحل: {new Date(alert.resolved_at).toLocaleString('ar')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {alert.status === 'active' && (
                      <>
                        <button
                          onClick={() => handleAction('acknowledge', alert.id)}
                          disabled={actionLoading === alert.id}
                          className="px-2.5 py-1.5 rounded-lg bg-[#f7931a]/10 text-[#f7931a] hover:bg-[#f7931a]/20 text-[10px] transition-colors disabled:opacity-50"
                        >
                          تعرف
                        </button>
                        <button
                          onClick={() => handleAction('resolve', alert.id)}
                          disabled={actionLoading === alert.id}
                          className="px-2.5 py-1.5 rounded-lg bg-[#0ecb81]/10 text-[#0ecb81] hover:bg-[#0ecb81]/20 text-[10px] transition-colors disabled:opacity-50"
                        >
                          حل
                        </button>
                      </>
                    )}
                    {alert.status === 'acknowledged' && (
                      <button
                        onClick={() => handleAction('resolve', alert.id)}
                        disabled={actionLoading === alert.id}
                        className="px-2.5 py-1.5 rounded-lg bg-[#0ecb81]/10 text-[#0ecb81] hover:bg-[#0ecb81]/20 text-[10px] transition-colors disabled:opacity-50"
                      >
                        حل
                      </button>
                    )}
                    {isSuperAdmin && (
                      <button
                        onClick={() => handleDelete(alert.id)}
                        className="p-1.5 rounded-lg hover:bg-[#f6465d]/10 text-[#8a8f98] hover:text-[#f6465d] transition-colors"
                        title="حذف"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <span className="text-xs text-[#8a8f98]">
            عرض {((page - 1) * 20) + 1} - {Math.min(page * 20, total)} من {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98] disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="text-xs text-[#f7f8f8]">{page}</span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98] disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
