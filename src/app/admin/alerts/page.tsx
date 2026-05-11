'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle, AlertCircle, Info, CheckCircle, XCircle,
  Bell, ChevronLeft, ChevronRight, Filter, Download,
  Clock, User, Zap,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

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

  return (
    <div className="space-y-6">
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
                  {alert.status === 'active' && (
                    <div className="flex items-center gap-1.5 shrink-0">
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
                    </div>
                  )}
                  {alert.status === 'acknowledged' && (
                    <button
                      onClick={() => handleAction('resolve', alert.id)}
                      disabled={actionLoading === alert.id}
                      className="px-2.5 py-1.5 rounded-lg bg-[#0ecb81]/10 text-[#0ecb81] hover:bg-[#0ecb81]/20 text-[10px] transition-colors disabled:opacity-50 shrink-0"
                    >
                      حل
                    </button>
                  )}
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
