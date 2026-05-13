'use client';

import { useEffect, useState } from 'react';
import { useAdminStore } from '@/stores/admin-store';
import {
  Users, Wallet, CreditCard, TrendingUp, Activity,
  UserPlus, AlertTriangle, Bot, Zap, Globe, ArrowUpRight,
  ArrowDownRight, Clock, RefreshCw, Radio, Database,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
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

interface ProviderInfo {
  id: string;
  name: string;
  apiKey: { configured: boolean; masked: string | null; envKey: string };
  health: { isAvailable: boolean; latencyMs: number | null; errorCount: number; lastChecked: string | null };
}

interface ProviderSummary {
  totalProviders: number;
  configuredProviders: number;
  availableProviders: number;
  degradedProviders: number;
}

const COLORS = ['#0052ff', '#0ecb81', '#f7931a', '#627eea', '#f6465d'];

export default function AdminDashboard() {
  const { admin } = useAdminStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providerSummary, setProviderSummary] = useState<ProviderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    async function fetchAll() {
      try {
        // Fetch stats
        const statsRes = await fetch('/api/admin/stats');
        if (statsRes.ok) {
          const data = await statsRes.json();
          setStats(data);
        }

        // Fetch provider status
        const providerRes = await fetch('/api/admin/providers');
        if (providerRes.ok) {
          const result = await providerRes.json();
          setProviders(result.data?.providers || []);
          setProviderSummary(result.data?.summary || null);
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
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

  const estimatedMRR = (stats?.proUsers || 0) * 29 + (stats?.enterpriseUsers || 0) * 99;

  const statCards = [
    { title: 'Total Users', value: stats?.totalUsers || 0, icon: Users, change: stats?.usersGrowth || 0, color: '#0052ff' },
    { title: 'Active Subscriptions', value: stats?.activeUsers || 0, icon: CreditCard, change: 0, color: '#0ecb81' },
    { title: 'Connected Wallets', value: stats?.totalWallets || 0, icon: Wallet, change: 0, color: '#f7931a' },
    { title: 'Total Transactions', value: stats?.totalTransactions || 0, icon: Activity, change: 0, color: '#627eea' },
  ];

  // Provider status for quick display
  const providerCards = providers.map(p => ({
    id: p.id,
    name: p.name.split(' ')[0],
    configured: p.apiKey.configured,
    available: p.health.isAvailable,
    latency: p.health.latencyMs,
  }));

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
                  <ArrowUpRight className="h-3 w-3" />
                  +{card.change}%
                </span>
              )}
              {card.change < 0 && (
                <span className="flex items-center gap-1 text-xs text-[#f6465d]">
                  <ArrowDownRight className="h-3 w-3" />
                  {card.change}%
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-[#f7f8f8]">{(card.value).toLocaleString('en-US')}</p>
            <p className="text-xs text-[#8a8f98] mt-1">{card.title}</p>
          </div>
        ))}
      </div>

      {/* Revenue + Quick Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[#0c0d0e] border border-[#0ecb81]/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="h-4 w-4 text-[#0ecb81]" />
            <span className="text-[10px] text-[#8a8f98]">Estimated Monthly Revenue</span>
          </div>
          <p className="text-lg font-bold text-[#0ecb81]">${estimatedMRR.toLocaleString()}</p>
          <p className="text-[9px] text-[#8a8f98]">Pro x$29 + Enterprise x$99</p>
        </div>
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="h-4 w-4 text-[#627eea]" />
            <span className="text-[10px] text-[#8a8f98]">AI Chats</span>
          </div>
          <p className="text-lg font-bold text-[#f7f8f8]">{(stats?.aiChatsTotal || 0).toLocaleString()}</p>
          <p className="text-[9px] text-[#8a8f98]">Total since launch</p>
        </div>
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-[#f7931a]" />
            <span className="text-[10px] text-[#8a8f98]">AI Analyses</span>
          </div>
          <p className="text-lg font-bold text-[#f7f8f8]">{(stats?.aiAnalysesTotal || 0).toLocaleString()}</p>
          <p className="text-[9px] text-[#8a8f98]">Total since launch</p>
        </div>
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="h-4 w-4 text-[#0052ff]" />
            <span className="text-[10px] text-[#8a8f98]">Conversion Rate</span>
          </div>
          <p className="text-lg font-bold text-[#f7f8f8]">
            {stats?.totalUsers ? Math.round(((stats.proUsers + stats.enterpriseUsers) / stats.totalUsers) * 100) : 0}%
          </p>
          <p className="text-[9px] text-[#8a8f98]">Paying users</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* User Growth Chart */}
        <div className="lg:col-span-2 bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#f7f8f8]">User Growth</h3>
            <div className="flex items-center gap-1">
              {(['7d', '30d', '90d'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-2 py-1 rounded text-[10px] transition-colors ${
                    timeRange === range ? 'bg-[#0052ff]/10 text-[#0052ff]' : 'text-[#8a8f98] hover:text-[#f7f8f8]'
                  }`}
                >
                  {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
                </button>
              ))}
            </div>
          </div>
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
                <Area type="monotone" dataKey="count" stroke="#0052ff" fill="#0052ff20" strokeWidth={2} name="Users" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Plan Distribution */}
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">Plan Distribution</h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={planData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={4} dataKey="value">
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
          <div className="mt-2 space-y-1.5">
            {planData.map((item, i) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                  <span className="text-[#8a8f98]">{item.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[#f7f8f8] font-medium">{item.value}</span>
                  <span className="text-[9px] text-[#8a8f98]">
                    ({stats?.totalUsers ? Math.round((item.value / stats.totalUsers) * 100) : 0}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Provider Status + Recent Signups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Blockchain Providers Status (REAL DATA) */}
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-[#0052ff]" />
              <h3 className="text-sm font-semibold text-[#f7f8f8]">Blockchain Providers</h3>
            </div>
            <span className="text-[10px] text-[#8a8f98]">
              {providerSummary?.configuredProviders || 0}/{providerSummary?.totalProviders || 4} configured
            </span>
          </div>
          <div className="space-y-2">
            {providerCards.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    !p.configured ? 'bg-[#8a8f98]' :
                    p.available ? 'bg-[#0ecb81] animate-pulse' : 'bg-[#f6465d]'
                  }`} />
                  <span className="text-xs text-[#f7f8f8] font-medium">{p.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  {!p.configured ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#8a8f98]/10 text-[#8a8f98]">No Key</span>
                  ) : p.available ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#0ecb81]/10 text-[#0ecb81]">Online</span>
                  ) : (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#f6465d]/10 text-[#f6465d]">Offline</span>
                  )}
                  {p.latency ? (
                    <span className={`text-[9px] ${
                      p.latency < 200 ? 'text-[#0ecb81]' : p.latency < 500 ? 'text-[#f7931a]' : 'text-[#f6465d]'
                    }`}>
                      {p.latency}ms
                    </span>
                  ) : (
                    <span className="text-[9px] text-[#8a8f98]">--</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Signups */}
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="h-4 w-4 text-[#0ecb81]" />
            <h3 className="text-sm font-semibold text-[#f7f8f8]">Recent Signups</h3>
          </div>
          <div className="space-y-2.5">
            {(stats?.recentSignups || []).slice(0, 6).map((signup, i) => (
              <div key={i} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-[#0052ff]/10 flex items-center justify-center text-[10px] text-[#0052ff] font-bold shrink-0">
                    {signup.email.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs text-[#d0d6e0] truncate block">{signup.email}</span>
                    <span className="text-[9px] text-[#8a8f98]">{new Date(signup.created_at).toLocaleDateString('en-US')}</span>
                  </div>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${
                  signup.plan === 'enterprise' ? 'bg-[#f7931a]/10 text-[#f7931a]' :
                  signup.plan === 'pro' ? 'bg-[#0ecb81]/10 text-[#0ecb81]' :
                  'bg-[#8a8f98]/10 text-[#8a8f98]'
                }`}>
                  {signup.plan}
                </span>
              </div>
            ))}
            {(!stats?.recentSignups || stats.recentSignups.length === 0) && (
              <div className="text-center py-4 text-xs text-[#8a8f98]">No recent signups</div>
            )}
          </div>
        </div>
      </div>

      {/* AI Usage Overview */}
      <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bot className="h-4 w-4 text-[#627eea]" />
          <h3 className="text-sm font-semibold text-[#f7f8f8]">AI Overview</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white/[0.02] rounded-lg p-3">
            <p className="text-lg font-bold text-[#f7f8f8]">{(stats?.aiChatsTotal || 0).toLocaleString()}</p>
            <p className="text-[10px] text-[#8a8f98]">Total Chats</p>
          </div>
          <div className="bg-white/[0.02] rounded-lg p-3">
            <p className="text-lg font-bold text-[#f7f8f8]">{(stats?.aiAnalysesTotal || 0).toLocaleString()}</p>
            <p className="text-[10px] text-[#8a8f98]">Total Analyses</p>
          </div>
          <div className="bg-white/[0.02] rounded-lg p-3">
            <p className="text-lg font-bold text-[#627eea]">openai/o4-mini</p>
            <p className="text-[10px] text-[#8a8f98]">Model Used</p>
          </div>
          <div className="bg-white/[0.02] rounded-lg p-3">
            <p className="text-lg font-bold text-[#f7931a]">OpenRouter</p>
            <p className="text-[10px] text-[#8a8f98]">Service Provider</p>
          </div>
        </div>
      </div>
    </div>
  );
}
