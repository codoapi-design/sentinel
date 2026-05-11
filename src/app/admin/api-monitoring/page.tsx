'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Key, Activity, AlertTriangle, CheckCircle, XCircle,
  Search, ChevronLeft, ChevronRight, Clock, Zap,
  TrendingUp, BarChart3,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';

interface ApiKeyEntry {
  id: string;
  name: string;
  user_id: string;
  key_prefix: string;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  request_count: number;
  created_at: string;
}

interface ApiStats {
  totalKeys: number;
  activeKeys: number;
  expiredKeys: number;
  requests24h: number;
  errorRate: number;
}

interface TopEndpoint {
  endpoint: string;
  count: number;
}

export default function AdminApiMonitoringPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ApiStats | null>(null);
  const [topEndpoints, setTopEndpoints] = useState<TopEndpoint[]>([]);
  const [usageChart, setUsageChart] = useState<Array<Record<string, number | string>>>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      });
      const res = await fetch(`/api/admin/api-monitoring?${params}`);
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.apiKeys || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setStats(data.stats || null);
        setTopEndpoints(data.topEndpoints || []);
        setUsageChart(data.usageChart || []);
      }
    } catch (error) {
      console.error('Failed to fetch API monitoring:', error);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-[#0052ff]/10">
              <Key className="h-3.5 w-3.5 text-[#0052ff]" />
            </div>
            <span className="text-[10px] text-[#8a8f98]">إجمالي المفاتيح</span>
          </div>
          <p className="text-xl font-bold text-[#f7f8f8]">{stats?.totalKeys || 0}</p>
        </div>

        <div className="bg-[#0c0d0e] border border-[#0ecb81]/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-[#0ecb81]/10">
              <CheckCircle className="h-3.5 w-3.5 text-[#0ecb81]" />
            </div>
            <span className="text-[10px] text-[#8a8f98]">مفاتيح نشطة</span>
          </div>
          <p className="text-xl font-bold text-[#0ecb81]">{stats?.activeKeys || 0}</p>
        </div>

        <div className="bg-[#0c0d0e] border border-[#f6465d]/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-[#f6465d]/10">
              <XCircle className="h-3.5 w-3.5 text-[#f6465d]" />
            </div>
            <span className="text-[10px] text-[#8a8f98]">مفاتيح منتهية</span>
          </div>
          <p className="text-xl font-bold text-[#f6465d]">{stats?.expiredKeys || 0}</p>
        </div>

        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-[#627eea]/10">
              <Activity className="h-3.5 w-3.5 text-[#627eea]" />
            </div>
            <span className="text-[10px] text-[#8a8f98]">طلبات 24h</span>
          </div>
          <p className="text-xl font-bold text-[#f7f8f8]">{formatNumber(stats?.requests24h || 0)}</p>
        </div>

        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4 col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <div className={`p-1.5 rounded-lg ${(stats?.errorRate || 0) > 5 ? 'bg-[#f6465d]/10' : 'bg-[#0ecb81]/10'}`}>
              <AlertTriangle className={`h-3.5 w-3.5 ${(stats?.errorRate || 0) > 5 ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`} />
            </div>
            <span className="text-[10px] text-[#8a8f98]">معدل الأخطاء</span>
          </div>
          <p className={`text-xl font-bold ${(stats?.errorRate || 0) > 5 ? 'text-[#f6465d]' : 'text-[#0ecb81]'}`}>
            {stats?.errorRate || 0}%
          </p>
        </div>
      </div>

      {/* Usage Chart + Top Endpoints */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Usage Chart */}
        <div className="lg:col-span-2 bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-[#627eea]" />
            <h3 className="text-sm font-semibold text-[#f7f8f8]">طلبات API (آخر 24 ساعة)</h3>
          </div>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usageChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                <XAxis dataKey="hour" stroke="#8a8f98" fontSize={10} tickLine={false} />
                <YAxis stroke="#8a8f98" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#191a1b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#8a8f98' }}
                />
                <Area type="monotone" dataKey="total" stroke="#0052ff" fill="#0052ff20" strokeWidth={2} name="إجمالي الطلبات" />
                <Area type="monotone" dataKey="errors" stroke="#f6465d" fill="#f6465d20" strokeWidth={2} name="الأخطاء" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Endpoints */}
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-[#f7931a]" />
            <h3 className="text-sm font-semibold text-[#f7f8f8]">أكثر النقاط استخداماً</h3>
          </div>
          <div className="space-y-2.5">
            {topEndpoints.length === 0 ? (
              <p className="text-center text-xs text-[#8a8f98] py-4">لا توجد بيانات</p>
            ) : (
              topEndpoints.map((ep, i) => {
                const maxCount = topEndpoints[0]?.count || 1;
                return (
                  <div key={ep.endpoint} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[#d0d6e0] font-mono truncate" dir="ltr">{ep.endpoint}</span>
                      <span className="text-[10px] text-[#8a8f98] shrink-0">{ep.count}</span>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-1">
                      <div
                        className="bg-[#0052ff] h-1 rounded-full transition-all"
                        style={{ width: `${(ep.count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* API Keys Table */}
      <div className="bg-[#0c0d0e] border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h3 className="text-sm font-semibold text-[#f7f8f8]">مفاتيح API</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-right px-4 py-2.5 text-xs text-[#8a8f98] font-medium">الاسم</th>
                <th className="text-right px-4 py-2.5 text-xs text-[#8a8f98] font-medium">المفتاح</th>
                <th className="text-right px-4 py-2.5 text-xs text-[#8a8f98] font-medium">الحالة</th>
                <th className="text-right px-4 py-2.5 text-xs text-[#8a8f98] font-medium">الطلبات</th>
                <th className="text-right px-4 py-2.5 text-xs text-[#8a8f98] font-medium">آخر استخدام</th>
                <th className="text-right px-4 py-2.5 text-xs text-[#8a8f98] font-medium">ينتهي في</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-[#8a8f98]">
                    <div className="flex justify-center">
                      <div className="w-6 h-6 border-2 border-[#0052ff]/30 border-t-[#0052ff] rounded-full animate-spin" />
                    </div>
                  </td>
                </tr>
              ) : apiKeys.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-[#8a8f98]">لا توجد مفاتيح API</td>
                </tr>
              ) : (
                apiKeys.map((key) => {
                  const isExpired = key.expires_at && new Date(key.expires_at) < new Date();

                  return (
                    <tr key={key.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2.5 text-xs text-[#f7f8f8]">{key.name}</td>
                      <td className="px-4 py-2.5 text-xs text-[#8a8f98] font-mono">{key.key_prefix}••••</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          !key.is_active ? 'bg-[#8a8f98]/10 text-[#8a8f98]' :
                          isExpired ? 'bg-[#f6465d]/10 text-[#f6465d]' :
                          'bg-[#0ecb81]/10 text-[#0ecb81]'
                        }`}>
                          {!key.is_active ? 'معطّل' : isExpired ? 'منتهي' : 'نشط'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#d0d6e0]">{formatNumber(key.request_count)}</td>
                      <td className="px-4 py-2.5 text-xs text-[#8a8f98]">
                        {key.last_used_at ? new Date(key.last_used_at).toLocaleString('ar') : 'لم يُستخدم'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#8a8f98]">
                        {key.expires_at ? new Date(key.expires_at).toLocaleDateString('ar') : 'لا ينتهي'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
            <span className="text-xs text-[#8a8f98]">صفحة {page} من {totalPages}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98] disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
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

      {/* Rate Limiting Info */}
      <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-[#f7931a]" />
          <h3 className="text-sm font-semibold text-[#f7f8f8]">حدود المعدل (Rate Limiting)</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white/[0.02] rounded-lg p-3">
            <p className="text-xs text-[#8a8f98] mb-1">Starter</p>
            <p className="text-sm text-[#f7f8f8]">100 طلب/ساعة</p>
          </div>
          <div className="bg-[#0ecb81]/5 rounded-lg p-3">
            <p className="text-xs text-[#0ecb81] mb-1">Pro</p>
            <p className="text-sm text-[#f7f8f8]">500 طلب/ساعة</p>
          </div>
          <div className="bg-[#f7931a]/5 rounded-lg p-3">
            <p className="text-xs text-[#f7931a] mb-1">Enterprise</p>
            <p className="text-sm text-[#f7f8f8]">غير محدود</p>
          </div>
        </div>
      </div>
    </div>
  );
}
