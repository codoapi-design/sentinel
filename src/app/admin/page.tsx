'use client';

import { useEffect, useState } from 'react';
import { useAdminStore } from '@/stores/admin-store';
import {
  Users,
  Wallet,
  CreditCard,
  TrendingUp,
  Activity,
  UserPlus,
  AlertTriangle,
  Bot,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalWallets: number;
  totalTransactions: number;
  starterUsers: number;
  proUsers: number;
  enterpriseUsers: number;
  usersGrowth: number;
  recentSignups: Array<{ email: string; created_at: string; plan: string }>;
  userGrowth: Array<{ date: string; count: number }>;
  aiChatsTotal: number;
  aiAnalysesTotal: number;
}

const COLORS = ['#0052ff', '#0ecb81', '#f7931a', '#627eea', '#f6465d'];

export default function AdminDashboard() {
  const { admin } = useAdminStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/admin/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#0052ff]/30 border-t-[#0052ff] rounded-full animate-spin" />
      </div>
    );
  }

  const planData = stats ? [
    { name: 'Starter', value: stats.starterUsers },
    { name: 'Pro', value: stats.proUsers },
    { name: 'Enterprise', value: stats.enterpriseUsers },
  ] : [];

  const statCards = [
    { title: 'إجمالي المستخدمين', value: stats?.totalUsers || 0, icon: Users, change: stats?.usersGrowth || 0, color: '#0052ff' },
    { title: 'الاشتراكات النشطة', value: stats?.activeUsers || 0, icon: CreditCard, change: 0, color: '#0ecb81' },
    { title: 'المحافظ المتصلة', value: stats?.totalWallets || 0, icon: Wallet, change: 0, color: '#f7931a' },
    { title: 'إجمالي المعاملات', value: stats?.totalTransactions || 0, icon: Activity, change: 0, color: '#627eea' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.title} className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: `${card.color}10` }}>
                <card.icon className="h-5 w-5" style={{ color: card.color }} />
              </div>
              {card.change > 0 && (
                <span className="flex items-center gap-1 text-xs text-[#0ecb81]">
                  <TrendingUp className="h-3 w-3" />
                  +{card.change}%
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-[#f7f8f8]">{(card.value).toLocaleString('en-US')}</p>
            <p className="text-xs text-[#8a8f98] mt-1">{card.title}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* User Growth Chart */}
        <div className="lg:col-span-2 bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">نمو المستخدمين (آخر 30 يوم)</h3>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.userGrowth || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                <XAxis dataKey="date" stroke="#8a8f98" fontSize={10} tickLine={false} />
                <YAxis stroke="#8a8f98" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#191a1b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#8a8f98' }}
                />
                <Area type="monotone" dataKey="count" stroke="#0052ff" fill="#0052ff20" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Plan Distribution */}
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">توزيع الباقات</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={planData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                  {planData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#191a1b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-2">
            {planData.map((item, i) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-[#8a8f98]">{item.name}</span>
                </div>
                <span className="text-[#f7f8f8] font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI Usage + Recent Signups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* AI Usage Stats */}
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="h-4 w-4 text-[#627eea]" />
            <h3 className="text-sm font-semibold text-[#f7f8f8]">استخدام الذكاء الاصطناعي</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/[0.02] rounded-lg p-3">
              <p className="text-lg font-bold text-[#f7f8f8]">{(stats?.aiChatsTotal || 0).toLocaleString()}</p>
              <p className="text-[10px] text-[#8a8f98]">إجمالي المحادثات</p>
            </div>
            <div className="bg-white/[0.02] rounded-lg p-3">
              <p className="text-lg font-bold text-[#f7f8f8]">{(stats?.aiAnalysesTotal || 0).toLocaleString()}</p>
              <p className="text-[10px] text-[#8a8f98]">إجمالي التحليلات</p>
            </div>
          </div>
        </div>

        {/* Recent Signups */}
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="h-4 w-4 text-[#0ecb81]" />
            <h3 className="text-sm font-semibold text-[#f7f8f8]">آخر التسجيلات</h3>
          </div>
          <div className="space-y-2.5">
            {(stats?.recentSignups || []).slice(0, 5).map((signup, i) => (
              <div key={i} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-[#0052ff]/10 flex items-center justify-center text-[10px] text-[#0052ff] font-bold shrink-0">
                    {signup.email.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs text-[#d0d6e0] truncate">{signup.email}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    signup.plan === 'enterprise' ? 'bg-[#f7931a]/10 text-[#f7931a]' :
                    signup.plan === 'pro' ? 'bg-[#0ecb81]/10 text-[#0ecb81]' :
                    'bg-[#8a8f98]/10 text-[#8a8f98]'
                  }`}>
                    {signup.plan}
                  </span>
                </div>
              </div>
            ))}
            {(!stats?.recentSignups || stats.recentSignups.length === 0) && (
              <div className="text-center py-4 text-xs text-[#8a8f98]">لا توجد تسجيلات حديثة</div>
            )}
          </div>
        </div>
      </div>

      {/* Quick System Status */}
      <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="h-4 w-4 text-[#f7931a]" />
          <h3 className="text-sm font-semibold text-[#f7f8f8]">حالة النظام</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {['Supabase', 'Alchemy API', 'OpenRouter AI', 'Telegram Bot'].map((service) => (
            <div key={service} className="flex items-center gap-2 bg-white/[0.02] rounded-lg p-3">
              <div className="w-2 h-2 rounded-full bg-[#0ecb81]" />
              <div>
                <p className="text-xs text-[#f7f8f8]">{service}</p>
                <p className="text-[10px] text-[#0ecb81]">يعمل</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
