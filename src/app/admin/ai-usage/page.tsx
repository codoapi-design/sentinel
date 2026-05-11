'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Bot, TrendingUp, MessageSquare, BarChart3,
  Coins, Zap, ChevronLeft, ChevronRight, Search,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface AIUsageEntry {
  user_id: string;
  chat_count: number;
  analysis_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  created_at: string;
}

interface AIStats {
  totalChats: number;
  totalAnalyses: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: string;
}

interface TopUser {
  user_id: string;
  chat_count: number;
  analysis_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
}

export default function AdminAiUsagePage() {
  const [usage, setUsage] = useState<AIUsageEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AIStats | null>(null);
  const [usageChart, setUsageChart] = useState<Array<Record<string, number | string>>>([]);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      });
      const res = await fetch(`/api/admin/ai-usage?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsage(data.usage || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setStats(data.stats || null);
        setUsageChart(data.usageChart || []);
        setTopUsers(data.topUsers || []);
      }
    } catch (error) {
      console.error('Failed to fetch AI usage:', error);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

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
            <div className="p-1.5 rounded-lg bg-[#627eea]/10">
              <MessageSquare className="h-3.5 w-3.5 text-[#627eea]" />
            </div>
            <span className="text-[10px] text-[#8a8f98]">Total Chats</span>
          </div>
          <p className="text-xl font-bold text-[#f7f8f8]">{formatNumber(stats?.totalChats || 0)}</p>
        </div>

        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-[#0052ff]/10">
              <BarChart3 className="h-3.5 w-3.5 text-[#0052ff]" />
            </div>
            <span className="text-[10px] text-[#8a8f98]">Total Analyses</span>
          </div>
          <p className="text-xl font-bold text-[#f7f8f8]">{formatNumber(stats?.totalAnalyses || 0)}</p>
        </div>

        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-[#0ecb81]/10">
              <Zap className="h-3.5 w-3.5 text-[#0ecb81]" />
            </div>
            <span className="text-[10px] text-[#8a8f98]">Input Tokens</span>
          </div>
          <p className="text-xl font-bold text-[#f7f8f8]">{formatNumber(stats?.totalInputTokens || 0)}</p>
        </div>

        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-[#f7931a]/10">
              <Zap className="h-3.5 w-3.5 text-[#f7931a]" />
            </div>
            <span className="text-[10px] text-[#8a8f98]">Output Tokens</span>
          </div>
          <p className="text-xl font-bold text-[#f7f8f8]">{formatNumber(stats?.totalOutputTokens || 0)}</p>
        </div>

        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4 col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-[#f6465d]/10">
              <Coins className="h-3.5 w-3.5 text-[#f6465d]" />
            </div>
            <span className="text-[10px] text-[#8a8f98]">Estimated Cost</span>
          </div>
          <p className="text-xl font-bold text-[#f7f8f8]">${stats?.estimatedCost || '0.00'}</p>
        </div>
      </div>

      {/* Usage Chart */}
      <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-[#627eea]" />
          <h3 className="text-sm font-semibold text-[#f7f8f8]">AI Usage (Last 30 Days)</h3>
        </div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={usageChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0a" />
              <XAxis dataKey="date" stroke="#8a8f98" fontSize={10} tickLine={false} />
              <YAxis stroke="#8a8f98" fontSize={10} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#191a1b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#8a8f98' }}
              />
              <Area type="monotone" dataKey="chats" stroke="#627eea" fill="#627eea20" strokeWidth={2} name="Chats" />
              <Area type="monotone" dataKey="analyses" stroke="#0ecb81" fill="#0ecb8120" strokeWidth={2} name="Analyses" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Users + Usage Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Users */}
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bot className="h-4 w-4 text-[#f7931a]" />
            <h3 className="text-sm font-semibold text-[#f7f8f8]">Top Users</h3>
          </div>
          <div className="space-y-3">
            {topUsers.length === 0 ? (
              <p className="text-center text-xs text-[#8a8f98] py-4">No data available</p>
            ) : (
              topUsers.map((user, i) => (
                <div key={user.user_id} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02]">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    i === 0 ? 'bg-[#f7931a]/20 text-[#f7931a]' :
                    i === 1 ? 'bg-[#8a8f98]/20 text-[#8a8f98]' :
                    i === 2 ? 'bg-[#cd7f32]/20 text-[#cd7f32]' :
                    'bg-white/5 text-[#8a8f98]'
                  }`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-[#8a8f98] font-mono truncate">{user.user_id.slice(0, 12)}...</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-[#627eea]">{user.chat_count} chats</span>
                      <span className="text-[9px] text-[#0ecb81]">{user.analysis_count} analyses</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-[#f7f8f8]">{formatNumber(user.total_input_tokens + user.total_output_tokens)}</p>
                    <p className="text-[8px] text-[#8a8f98]">tokens</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Usage Table */}
        <div className="lg:col-span-2 bg-[#0c0d0e] border border-white/5 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <h3 className="text-sm font-semibold text-[#f7f8f8]">Usage Log</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98] font-medium">User</th>
                  <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98] font-medium">Chats</th>
                  <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98] font-medium">Analyses</th>
                  <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98] font-medium">Input Tokens</th>
                  <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98] font-medium">Output Tokens</th>
                  <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98] font-medium">Cost</th>
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
                ) : usage.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-[#8a8f98]">No usage data available</td>
                  </tr>
                ) : (
                  usage.map((entry) => (
                    <tr key={entry.user_id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-2.5 text-xs text-[#d0d6e0] font-mono">
                        {entry.user_id.slice(0, 12)}...
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[#627eea]">{entry.chat_count}</td>
                      <td className="px-4 py-2.5 text-xs text-[#0ecb81]">{entry.analysis_count}</td>
                      <td className="px-4 py-2.5 text-xs text-[#d0d6e0]">{formatNumber(entry.total_input_tokens)}</td>
                      <td className="px-4 py-2.5 text-xs text-[#d0d6e0]">{formatNumber(entry.total_output_tokens)}</td>
                      <td className="px-4 py-2.5 text-xs text-[#f7931a]">
                        ${((entry.total_input_tokens * 0.000003 + entry.total_output_tokens * 0.000015)).toFixed(4)}
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
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98] disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98] disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Model Info */}
      <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bot className="h-4 w-4 text-[#627eea]" />
          <h3 className="text-sm font-semibold text-[#f7f8f8]">Model Information</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/[0.02] rounded-lg p-4">
            <p className="text-xs text-[#8a8f98] mb-1">Model Used</p>
            <p className="text-sm text-[#f7f8f8] font-mono">openai/o4-mini</p>
          </div>
          <div className="bg-white/[0.02] rounded-lg p-4">
            <p className="text-xs text-[#8a8f98] mb-1">Provider</p>
            <p className="text-sm text-[#f7f8f8]">OpenRouter</p>
          </div>
          <div className="bg-white/[0.02] rounded-lg p-4">
            <p className="text-xs text-[#8a8f98] mb-1">Input / Output Price</p>
            <p className="text-sm text-[#f7f8f8]">$0.003 / $0.015 per 1M tokens</p>
          </div>
        </div>
      </div>
    </div>
  );
}
