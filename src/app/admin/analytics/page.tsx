'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp, Users, Wallet, Activity, CreditCard,
  ArrowUpRight, Calendar, RefreshCw,
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
}

const COLORS = ['#0052ff', '#0ecb81', '#f7931a', '#627eea', '#f6465d', '#8b5cf6'];

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [activeTab, setActiveTab] = useState<'users' | 'revenue' | 'wallets' | 'transactions'>('users');

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
    { id: 'users' as const, label: 'Users', icon: Users },
    { id: 'revenue' as const, label: 'Revenue', icon: CreditCard },
    { id: 'wallets' as const, label: 'Wallets', icon: Wallet },
    { id: 'transactions' as const, label: 'Transactions', icon: Activity },
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
          <h2 className="text-lg font-bold text-[#f7f8f8]">Platform Analytics</h2>
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
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : range === '90d' ? '90 Days' : '1 Year'}
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
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-3">
          <p className="text-[10px] text-[#8a8f98] mb-1">Total Users</p>
          <p className="text-lg font-bold text-[#f7f8f8]">{formatNumber(data?.users.total || 0)}</p>
          {data?.users.new && data.users.new > 0 && (
            <span className="flex items-center gap-0.5 text-[9px] text-[#0ecb81]">
              <ArrowUpRight className="h-2.5 w-2.5" />+{data.users.new} new
            </span>
          )}
        </div>
        <div className="bg-[#0c0d0e] border border-[#0ecb81]/10 rounded-xl p-3">
          <p className="text-[10px] text-[#0ecb81] mb-1">Monthly Revenue</p>
          <p className="text-lg font-bold text-[#0ecb81]">${formatNumber(data?.revenue.mrr || 0)}</p>
          <span className="text-[9px] text-[#8a8f98]">ARR: ${formatNumber(data?.revenue.arr || 0)}</span>
        </div>
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-3">
          <p className="text-[10px] text-[#8a8f98] mb-1">Connected Wallets</p>
          <p className="text-lg font-bold text-[#f7f8f8]">{formatNumber(data?.wallets.total || 0)}</p>
          <span className="text-[9px] text-[#8a8f98]">Across {data?.wallets.networks.length || 0} networks</span>
        </div>
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-3">
          <p className="text-[10px] text-[#8a8f98] mb-1">Transactions</p>
          <p className="text-lg font-bold text-[#f7f8f8]">{formatNumber(data?.transactions.total || 0)}</p>
          <span className="text-[9px] text-[#8a8f98]">All time total</span>
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
            <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">User Growth</h3>
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
                  <Area type="monotone" dataKey="cumulative" stroke="#0052ff" fill="#0052ff20" strokeWidth={2} name="Total Users" />
                  <Area type="monotone" dataKey="new" stroke="#0ecb81" fill="#0ecb8120" strokeWidth={2} name="New Users" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Engagement Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
              <p className="text-xs text-[#8a8f98] mb-2">Avg Wallets/User</p>
              <p className="text-2xl font-bold text-[#f7f8f8]">{data?.users.engagement.avgWalletsPerUser || '0'}</p>
            </div>
            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
              <p className="text-xs text-[#8a8f98] mb-2">Avg Transactions/User</p>
              <p className="text-2xl font-bold text-[#f7f8f8]">{data?.users.engagement.avgTxPerUser || '0'}</p>
            </div>
            <div className="bg-[#0c0d0e] border border-[#0ecb81]/10 rounded-xl p-4">
              <p className="text-xs text-[#8a8f98] mb-2">Paid User Ratio</p>
              <p className="text-2xl font-bold text-[#0ecb81]">{data?.users.engagement.paidUserPercentage || 0}%</p>
            </div>
            <div className="bg-[#0c0d0e] border border-[#0052ff]/10 rounded-xl p-4">
              <p className="text-xs text-[#8a8f98] mb-2">Activity Rate</p>
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
              <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">Revenue by Plan</h3>
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
                      formatter={(value: number) => [`$${value}`, 'Revenue']}
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
                      <span className="text-[#f7f8f8] font-medium">${item.revenue}/month</span>
                      <span className="text-[9px] text-[#8a8f98]">({item.users} users)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">Revenue Summary</h3>
              <div className="space-y-4">
                <div className="bg-[#0ecb81]/5 rounded-xl p-5">
                  <p className="text-xs text-[#0ecb81] mb-1">Monthly Recurring Revenue (MRR)</p>
                  <p className="text-3xl font-bold text-[#0ecb81]">${(data?.revenue.mrr || 0).toLocaleString()}</p>
                  <p className="text-[10px] text-[#8a8f98] mt-1">Pro x$29 + Enterprise x$99</p>
                </div>
                <div className="bg-[#0052ff]/5 rounded-xl p-5">
                  <p className="text-xs text-[#0052ff] mb-1">Annual Recurring Revenue (ARR)</p>
                  <p className="text-3xl font-bold text-[#0052ff]">${(data?.revenue.arr || 0).toLocaleString()}</p>
                  <p className="text-[10px] text-[#8a8f98] mt-1">MRR x 12</p>
                </div>
                <div className="bg-white/[0.02] rounded-xl p-4">
                  <p className="text-xs text-[#8a8f98] mb-2">ARPU (Average Revenue Per User)</p>
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
              <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">Network Distribution</h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.wallets.networks || []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
                    <XAxis type="number" stroke="#8a8f98" fontSize={10} tickLine={false} />
                    <YAxis type="category" dataKey="network" stroke="#8a8f98" fontSize={10} tickLine={false} width={70} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#191a1b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Bar dataKey="count" fill="#0052ff" radius={[0, 4, 4, 0]} name="Wallet Count" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">Wallet Statistics</h3>
              <div className="space-y-3">
                <div className="bg-white/[0.02] rounded-xl p-4">
                  <p className="text-xs text-[#8a8f98] mb-1">Total Wallets</p>
                  <p className="text-2xl font-bold text-[#f7f8f8]">{(data?.wallets.total || 0).toLocaleString()}</p>
                </div>
                <div className="bg-white/[0.02] rounded-xl p-4">
                  <p className="text-xs text-[#8a8f98] mb-1">Active Networks</p>
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
            <h3 className="text-sm font-semibold text-[#f7f8f8] mb-4">Transaction Volume</h3>
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
                  <Bar dataKey="sent" name="Sent" fill="#f6465d" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="received" name="Received" fill="#0ecb81" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-white/[0.02] rounded-lg p-3">
                <p className="text-xs text-[#8a8f98] mb-1">Total Transactions</p>
                <p className="text-xl font-bold text-[#f7f8f8]">{(data?.transactions.total || 0).toLocaleString()}</p>
              </div>
              <div className="bg-white/[0.02] rounded-lg p-3">
                <p className="text-xs text-[#8a8f98] mb-1">Average/Day</p>
                <p className="text-xl font-bold text-[#f7f8f8]">
                  {data?.transactions.growth.length
                    ? Math.round(data.transactions.total / Math.max(data.transactions.growth.length, 1))
                    : 0}
                </p>
              </div>
              <div className="bg-white/[0.02] rounded-lg p-3">
                <p className="text-xs text-[#8a8f98] mb-1">Active Days</p>
                <p className="text-xl font-bold text-[#f7f8f8]">{data?.transactions.growth.length || 0}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
