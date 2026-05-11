'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Search, Download, ChevronLeft, ChevronRight,
  CreditCard, TrendingUp, Users, Crown,
  Filter,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from 'recharts';

interface Subscription {
  user_id: string;
  email: string;
  full_name: string;
  plan: string;
  status: string;
  created_at: string;
  last_active_at: string | null;
  wallet_count: number;
}

interface Stats {
  starter: number;
  pro: number;
  enterprise: number;
}

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [planChart, setPlanChart] = useState<Array<Record<string, unknown>>>([]);

  const fetchSubscriptions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        search,
        plan: planFilter,
      });
      const res = await fetch(`/api/admin/subscriptions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data.subscriptions || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setStats(data.stats || null);
        setPlanChart(data.planChart || []);
      }
    } catch (error) {
      console.error('Failed to fetch subscriptions:', error);
    } finally {
      setLoading(false);
    }
  }, [page, search, planFilter]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const exportCSV = () => {
    const headers = ['البريد', 'الاسم', 'الباقة', 'الحالة', 'تاريخ التسجيل'];
    const rows = subscriptions.map(u => [
      u.email, u.full_name, u.plan, u.status,
      u.created_at?.split('T')[0],
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sentinel-subscriptions-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const planBadge = (plan: string) => {
    const styles: Record<string, string> = {
      starter: 'bg-[#8a8f98]/10 text-[#8a8f98] border-[#8a8f98]/20',
      pro: 'bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/20',
      enterprise: 'bg-[#f7931a]/10 text-[#f7931a] border-[#f7931a]/20',
    };
    return styles[plan] || styles.starter;
  };

  const planLabels: Record<string, string> = {
    starter: 'Starter',
    pro: 'Pro',
    enterprise: 'Enterprise',
  };

  const planIcons: Record<string, string> = {
    starter: '🥉',
    pro: '🥈',
    enterprise: '🥇',
  };

  const totalSubs = stats ? stats.starter + stats.pro + stats.enterprise : 0;

  return (
    <div className="space-y-6">
      {/* Plan Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-[#8a8f98]/10">
                <Users className="h-4 w-4 text-[#8a8f98]" />
              </div>
              <span className="text-sm text-[#8a8f98]">Starter</span>
            </div>
            <span className="text-lg">🥉</span>
          </div>
          <p className="text-2xl font-bold text-[#f7f8f8]">{stats?.starter || 0}</p>
          <div className="mt-2 w-full bg-white/5 rounded-full h-1.5">
            <div
              className="bg-[#8a8f98] h-1.5 rounded-full transition-all"
              style={{ width: `${totalSubs ? ((stats?.starter || 0) / totalSubs) * 100 : 0}%` }}
            />
          </div>
          <p className="text-[10px] text-[#8a8f98] mt-1">
            {totalSubs ? Math.round(((stats?.starter || 0) / totalSubs) * 100) : 0}% من الإجمالي
          </p>
        </div>

        <div className="bg-[#0c0d0e] border border-[#0ecb81]/10 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-[#0ecb81]/10">
                <CreditCard className="h-4 w-4 text-[#0ecb81]" />
              </div>
              <span className="text-sm text-[#0ecb81]">Pro</span>
            </div>
            <span className="text-lg">🥈</span>
          </div>
          <p className="text-2xl font-bold text-[#f7f8f8]">{stats?.pro || 0}</p>
          <div className="mt-2 w-full bg-white/5 rounded-full h-1.5">
            <div
              className="bg-[#0ecb81] h-1.5 rounded-full transition-all"
              style={{ width: `${totalSubs ? ((stats?.pro || 0) / totalSubs) * 100 : 0}%` }}
            />
          </div>
          <p className="text-[10px] text-[#0ecb81] mt-1">
            {totalSubs ? Math.round(((stats?.pro || 0) / totalSubs) * 100) : 0}% من الإجمالي
          </p>
        </div>

        <div className="bg-[#0c0d0e] border border-[#f7931a]/10 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-[#f7931a]/10">
                <Crown className="h-4 w-4 text-[#f7931a]" />
              </div>
              <span className="text-sm text-[#f7931a]">Enterprise</span>
            </div>
            <span className="text-lg">🥇</span>
          </div>
          <p className="text-2xl font-bold text-[#f7f8f8]">{stats?.enterprise || 0}</p>
          <div className="mt-2 w-full bg-white/5 rounded-full h-1.5">
            <div
              className="bg-[#f7931a] h-1.5 rounded-full transition-all"
              style={{ width: `${totalSubs ? ((stats?.enterprise || 0) / totalSubs) * 100 : 0}%` }}
            />
          </div>
          <p className="text-[10px] text-[#f7931a] mt-1">
            {totalSubs ? Math.round(((stats?.enterprise || 0) / totalSubs) * 100) : 0}% من الإجمالي
          </p>
        </div>
      </div>

      {/* Plan Growth Chart */}
      <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-[#0052ff]" />
          <h3 className="text-sm font-semibold text-[#f7f8f8]">نمو الاشتراكات (آخر 12 شهر)</h3>
        </div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={planChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
              <XAxis dataKey="month" stroke="#8a8f98" fontSize={10} tickLine={false} />
              <YAxis stroke="#8a8f98" fontSize={10} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#191a1b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#8a8f98' }}
              />
              <Legend />
              <Bar dataKey="starter" name="Starter" fill="#8a8f98" radius={[2, 2, 0, 0]} />
              <Bar dataKey="pro" name="Pro" fill="#0ecb81" radius={[2, 2, 0, 0]} />
              <Bar dataKey="enterprise" name="Enterprise" fill="#f7931a" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters + Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8f98]" />
              <input
                type="text"
                placeholder="بحث بالبريد أو الاسم..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="bg-[#0c0d0e] border border-white/10 rounded-lg pr-10 pl-4 py-2 text-sm text-[#d0d6e0] placeholder-[#8a8f98] w-[260px] focus:outline-none focus:border-[#0052ff]/50"
              />
            </div>

            <select
              value={planFilter}
              onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
              className="bg-[#0c0d0e] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#d0d6e0] focus:outline-none focus:border-[#0052ff]/50"
            >
              <option value="">كل الباقات</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>

          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[#8a8f98] hover:text-[#f7f8f8] text-sm transition-colors"
          >
            <Download className="h-4 w-4" />
            تصدير CSV
          </button>
        </div>

        {/* Subscriptions Table */}
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-right px-4 py-3 text-xs text-[#8a8f98] font-medium">المستخدم</th>
                  <th className="text-right px-4 py-3 text-xs text-[#8a8f98] font-medium">الباقة</th>
                  <th className="text-right px-4 py-3 text-xs text-[#8a8f98] font-medium">الحالة</th>
                  <th className="text-right px-4 py-3 text-xs text-[#8a8f98] font-medium">المحافظ</th>
                  <th className="text-right px-4 py-3 text-xs text-[#8a8f98] font-medium">تاريخ التسجيل</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-[#8a8f98]">
                      <div className="flex justify-center">
                        <div className="w-6 h-6 border-2 border-[#0052ff]/30 border-t-[#0052ff] rounded-full animate-spin" />
                      </div>
                    </td>
                  </tr>
                ) : subscriptions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-[#8a8f98]">لا توجد اشتراكات</td>
                  </tr>
                ) : (
                  subscriptions.map((sub) => (
                    <tr key={sub.user_id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#0052ff]/10 flex items-center justify-center text-xs text-[#0052ff] font-bold shrink-0">
                            {(sub.full_name || sub.email).charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[#f7f8f8] truncate text-xs font-medium">{sub.full_name || 'بدون اسم'}</p>
                            <p className="text-[#8a8f98] truncate text-[10px]">{sub.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${planBadge(sub.plan)}`}>
                          {planIcons[sub.plan]} {planLabels[sub.plan] || sub.plan}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          sub.status === 'active' ? 'bg-[#0ecb81]/10 text-[#0ecb81]' :
                          sub.status === 'suspended' ? 'bg-[#f7931a]/10 text-[#f7931a]' :
                          'bg-[#f6465d]/10 text-[#f6465d]'
                        }`}>
                          {sub.status === 'active' ? 'نشط' : sub.status === 'suspended' ? 'معلق' : 'محظور'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#d0d6e0]">{sub.wallet_count}</td>
                      <td className="px-4 py-3 text-xs text-[#8a8f98]">
                        {new Date(sub.created_at).toLocaleDateString('ar')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
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
      </div>
    </div>
  );
}
