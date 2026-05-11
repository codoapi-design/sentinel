'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp, Users, Wallet, Activity, Bot, CreditCard,
  ArrowUpRight, ArrowDownRight, Calendar, RefreshCw,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, PieChart, Pie, Cell,
} from 'recharts';

interface AnalyticsData {
  users: {
    total: number;
    new: number;
    active: number;
    growth: Array<{ date: string; new: number; cumulative: number }>;
    engagement: {
      avgWalletsPerUser: string;
      avgTxPerUser: string;
      paidUserPercentage: number;
      activeUserPercentage: number;
    };
  };
  revenue: {
    mrr: number;
    arr: number;
    byPlan: Array<{ plan: string; revenue: number; users: number }>;
  };
  wallets: {
    total: number;
    networks: Array<{ network: string; count: number }>;
  };
  transactions: {
    total: number;
    growth: Array<{ date: string; count: number; sent: number; received: number }>;
  };
  ai: {
    totalChats: number;
    totalAnalyses: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCost: string;
    growth: Array<{ date: string; chats: number; analyses: number }>;
  };
}

const COLORS = ['#0052ff', '#0ecb81', '#f7931a', '#627eea', '#f6465d', '#8b5cf6'];

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [activeTab, setActiveTab] = useState<'users' | 'revenue' | 'wallets' | 'transactions' | 'ai'>('users');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics?range=${timeRange}`);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const tabs = [
    { id: 'users' as const, label: 'المستخدمين', icon: Users },
    { id: 'revenue' as const, label: 'الإيرادات', icon: CreditCard },
    { id: 'wallets' as const, label: 'المحافظ', icon: Wallet },
    { id: 'transactions' as const, label: 'المعاملات', icon: Activity },
    { id: 'ai' as const, label: 'الذكاء الاصطناعي', icon: Bot },
  ];

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#0052ff]/30 border-t-[#0052ff] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Time Range */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-[#0052ff]" />
          <h2 className="text-lg font-bold text-[#f7f8f8]">تحليلات المنصة</h2>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[#8a8f98]" />
          <div className="flex items-center gap-1 bg-[#0c0d0e] border border-white/5 rounded-lg p-1">
            {(['7d', '30d', '90d', '1y'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                  timeRange === range ? 'bg-[#0052ff] text-white' : 'text-[#8a8f98] hover:text-[#f7f8f8]'
                }`}
              >
                {range === '7d' ? '7 أيام' : range === '30d' ? '30 يوم' : range === '90d' ? '90 يوم' : 'سنة'}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            className="p-2 rounded-lg hover:bg-white/5 text-[#8a8f98] hover:text-[#f7f8f8] transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-3">
          <p className="text-[10px] text-[#8a8f98] mb-1">إجمالي المستخدمين</p>
          <p className="text-lg font-bold text-[#f7f8f8]">{formatNumber(data?.users.total || 0)}</p>
          {data?.users.new && data.users.new > 0 && (
            <span className="flex items-center gap-0.5 text-[9px] text-[#0ecb81]">
              <ArrowUpRight className="h-2.5 w-2.5" />+{data.users.new} جديد
            </span>
          )}
        </div>
        <div className="bg-[#0c0d0e] border border-[#0ecb81]/10 rounded-xl p-3">
          <p className="text-[10px] text-[#0ecb81] mb-1">الإيراد الشهري</p>
          <p className="text-lg font-bold text-[#0ecb81]">${formatNumber(data?.revenue.mrr || 0)}</p>
          <span className="text-[9px] text-[#8a8f98]">ARR: ${formatNumber(data?.revenue.arr || 0)}</span>
        </div>
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-3">
          <p className="text-[10px] text-[#8a8f98] mb-1">المحافظ المتصلة</p>
          <p className="text-lg font-bold text-[#f7f8f8]">{formatNumber(data?.wallets.total || 0)}</p>
          <span className="text-[9px] text-[#8a8f98]">عبر {data?.wallets.networks.length || 0} شبكات</span>
        </div>
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-3">
          <p className="text-[10px] text-[#8a8f98] mb-1">المعاملات</p>
          <p className="text-lg font-bold text-[#f7f8f8]">{formatNumber(data?.transactions.total || 0)}</p>
          <span className="text-[9px] text-[#8a8f98]">إجمالي منذ البداية</span>
        </div>
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-3">
          <p className="text-[10px] text-[#627eea] mb-1">محادثات AI</p>
          <p className="text-lg font-bold text-[#f7f8f8]">{formatNumber(data?.ai.totalChats || 0)}</p>
          <span className="text-[9px] text-[#8a8f98]">{formatNumber(data?.ai.totalAnalyses || 0)} تحليل</span>
        </div>
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-3">
          <p className="text-[10px] text-[#f7931a] mb-1">تكلفة AI</p>
          <p className="text-lg font-bold text-[#f7f8f8]">${data?.ai.estimatedCost || '0.00'}</p>
          <span className="text-[9px] text-[#8a8f98]">تقديرية</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-[#0c0d0e] border border-white/5 rounded-xl p-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-[#0052ff]/10 text-[#0052ff]'
                : 'text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-white/5'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* User Growth Chart */}
          <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">نمو المستخدمين</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.users.growth || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                  <XAxis dataKey="date" stroke="#8a8f98" fontSize={10} tickLine={false} />
                  <YAxis stroke="#8a8f98" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#191a1b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                    labelStyle={{ color: '#8a8f98' }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="cumulative" stroke="#0052ff" fill="#0052ff20" strokeWidth={2} name="إجمالي المستخدمين" />
                  <Area type="monotone" dataKey="new" stroke="#0ecb81" fill="#0ecb8120" strokeWidth={2} name="مستخدمين جدد" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Engagement Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
              <p className="text-xs text-[#8a8f98] mb-2">متوسط المحافظ/مستخدم</p>
              <p className="text-2xl font-bold text-[#f7f8f8]">{data?.users.engagement.avgWalletsPerUser || '0'}</p>
            </div>
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
              <p className="text-xs text-[#8a8f98] mb-2">متوسط المعاملات/مستخدم</p>
              <p className="text-2xl font-bold text-[#f7f8f8]">{data?.users.engagement.avgTxPerUser || '0'}</p>
            </div>
            <div className="bg-[#0c0d0e] border border-[#0ecb81]/10 rounded-xl p-4">
              <p className="text-xs text-[#8a8f98] mb-2">نسبة المدفوعين</p>
              <p className="text-2xl font-bold text-[#0ecb81]">{data?.users.engagement.paidUserPercentage || 0}%</p>
            </div>
            <div className="bg-[#0c0d0e] border border-[#0052ff]/10 rounded-xl p-4">
              <p className="text-xs text-[#8a8f98] mb-2">نسبة النشاط</p>
              <p className="text-2xl font-bold text-[#0052ff]">{data?.users.engagement.activeUserPercentage || 0}%</p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'revenue' && (
        <div className="space-y-4">
          {/* Revenue by Plan */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">الإيرادات حسب الباقة</h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data?.revenue.byPlan.filter(p => p.revenue > 0) || []}
                      cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="revenue"
                    >
                      {(data?.revenue.byPlan.filter(p => p.revenue > 0) || []).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#191a1b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                      formatter={(value: number) => [`$${value}`, 'الإيراد']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1.5">
                {(data?.revenue.byPlan || []).map((item, i) => (
                  <div key={item.plan} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                      <span className="text-[#8a8f98]">{item.plan}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[#f7f8f8] font-medium">${item.revenue}/شهر</span>
                      <span className="text-[9px] text-[#8a8f98]">({item.users} مستخدم)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">ملخص الإيرادات</h3>
              <div className="space-y-4">
                <div className="bg-[#0ecb81]/5 rounded-xl p-5">
                  <p className="text-xs text-[#0ecb81] mb-1">الإيراد المتكرر الشهري (MRR)</p>
                  <p className="text-3xl font-bold text-[#0ecb81]">${(data?.revenue.mrr || 0).toLocaleString()}</p>
                  <p className="text-[10px] text-[#8a8f98] mt-1">Pro x$29 + Enterprise x$99</p>
                </div>
                <div className="bg-[#0052ff]/5 rounded-xl p-5">
                  <p className="text-xs text-[#0052ff] mb-1">الإيراد السنوي المتوقع (ARR)</p>
                  <p className="text-3xl font-bold text-[#0052ff]">${(data?.revenue.arr || 0).toLocaleString()}</p>
                  <p className="text-[10px] text-[#8a8f98] mt-1">MRR x 12</p>
                </div>
                <div className="bg-white/[0.02] rounded-xl p-4">
                  <p className="text-xs text-[#8a8f98] mb-2">ARPU (متوسط الإيراد لكل مستخدم)</p>
                  <p className="text-xl font-bold text-[#f7f8f8]">
                    ${(data?.users.total ? ((data.revenue.mrr) / data.users.total).toFixed(2) : '0.00')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'wallets' && (
        <div className="space-y-4">
          {/* Wallet Network Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">توزيع الشبكات</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.wallets.networks || []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                    <XAxis type="number" stroke="#8a8f98" fontSize={10} tickLine={false} />
                    <YAxis type="category" dataKey="network" stroke="#8a8f98" fontSize={10} tickLine={false} width={70} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#191a1b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Bar dataKey="count" fill="#0052ff" radius={[0, 4, 4, 0]} name="عدد المحافظ" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">إحصائيات المحافظ</h3>
              <div className="space-y-3">
                <div className="bg-white/[0.02] rounded-xl p-4">
                  <p className="text-xs text-[#8a8f98] mb-1">إجمالي المحافظ</p>
                  <p className="text-2xl font-bold text-[#f7f8f8]">{(data?.wallets.total || 0).toLocaleString()}</p>
                </div>
                <div className="bg-white/[0.02] rounded-xl p-4">
                  <p className="text-xs text-[#8a8f98] mb-1">عدد الشبكات النشطة</p>
                  <p className="text-2xl font-bold text-[#f7f8f8]">{data?.wallets.networks.length || 0}</p>
                </div>
                {(data?.wallets.networks || []).map((network) => (
                  <div key={network.network} className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg">
                    <span className="text-xs text-[#d0d6e0]">{network.network}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-white/5 rounded-full h-1.5">
                        <div
                          className="bg-[#0052ff] h-1.5 rounded-full"
                          style={{ width: `${(network.count / (data?.wallets.total || 1)) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-[#8a8f98]">{network.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="space-y-4">
          <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">حجم المعاملات</h3>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.transactions.growth || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                  <XAxis dataKey="date" stroke="#8a8f98" fontSize={10} tickLine={false} />
                  <YAxis stroke="#8a8f98" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#191a1b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                    labelStyle={{ color: '#8a8f98' }}
                  />
                  <Legend />
                  <Bar dataKey="sent" name="مرسلة" fill="#f6465d" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="received" name="مستلمة" fill="#0ecb81" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-white/[0.02] rounded-lg p-3">
                <p className="text-xs text-[#8a8f98] mb-1">إجمالي المعاملات</p>
                <p className="text-xl font-bold text-[#f7f8f8]">{(data?.transactions.total || 0).toLocaleString()}</p>
              </div>
              <div className="bg-white/[0.02] rounded-lg p-3">
                <p className="text-xs text-[#8a8f98] mb-1">متوسط/يوم</p>
                <p className="text-xl font-bold text-[#f7f8f8]">
                  {data?.transactions.growth.length
                    ? Math.round(data.transactions.total / Math.max(data.transactions.growth.length, 1))
                    : 0}
                </p>
              </div>
              <div className="bg-white/[0.02] rounded-lg p-3">
                <p className="text-xs text-[#8a8f98] mb-1">أيام نشطة</p>
                <p className="text-xl font-bold text-[#f7f8f8]">{data?.transactions.growth.length || 0}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ai' && (
        <div className="space-y-4">
          {/* AI Usage Chart */}
          <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">استخدام الذكاء الاصطناعي</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.ai.growth || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                  <XAxis dataKey="date" stroke="#8a8f98" fontSize={10} tickLine={false} />
                  <YAxis stroke="#8a8f98" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#191a1b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                    labelStyle={{ color: '#8a8f98' }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="chats" stroke="#627eea" fill="#627eea20" strokeWidth={2} name="محادثات" />
                  <Area type="monotone" dataKey="analyses" stroke="#0ecb81" fill="#0ecb8120" strokeWidth={2} name="تحليلات" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AI Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
              <p className="text-[10px] text-[#8a8f98] mb-1">المحادثات</p>
              <p className="text-xl font-bold text-[#627eea]">{formatNumber(data?.ai.totalChats || 0)}</p>
            </div>
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
              <p className="text-[10px] text-[#8a8f98] mb-1">التحليلات</p>
              <p className="text-xl font-bold text-[#0ecb81]">{formatNumber(data?.ai.totalAnalyses || 0)}</p>
            </div>
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
              <p className="text-[10px] text-[#8a8f98] mb-1">Input Tokens</p>
              <p className="text-xl font-bold text-[#f7f8f8]">{formatNumber(data?.ai.totalInputTokens || 0)}</p>
            </div>
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
              <p className="text-[10px] text-[#8a8f98] mb-1">Output Tokens</p>
              <p className="text-xl font-bold text-[#f7f8f8]">{formatNumber(data?.ai.totalOutputTokens || 0)}</p>
            </div>
            <div className="bg-[#0c0d0e] border border-[#f7931a]/10 rounded-xl p-4">
              <p className="text-[10px] text-[#f7931a] mb-1">التكلفة التقديرية</p>
              <p className="text-xl font-bold text-[#f7931a]">${data?.ai.estimatedCost || '0.00'}</p>
            </div>
          </div>

          {/* Model Info */}
          <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">معلومات النموذج والتكلفة</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white/[0.02] rounded-lg p-4">
                <p className="text-xs text-[#8a8f98] mb-1">النموذج</p>
                <p className="text-sm text-[#627eea] font-mono">openai/o4-mini</p>
              </div>
              <div className="bg-white/[0.02] rounded-lg p-4">
                <p className="text-xs text-[#8a8f98] mb-1">سعر Input</p>
                <p className="text-sm text-[#f7f8f8]">$3.00 / 1M tokens</p>
              </div>
              <div className="bg-white/[0.02] rounded-lg p-4">
                <p className="text-xs text-[#8a8f98] mb-1">سعر Output</p>
                <p className="text-sm text-[#f7f8f8]">$15.00 / 1M tokens</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
