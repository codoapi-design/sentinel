'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Wallet, Activity, Bot, Mail, Shield,
  CheckCircle, XCircle, Ban, Clock,
} from 'lucide-react';

interface UserProfile {
  user_id: string;
  email: string;
  full_name: string;
  plan: string;
  status: string;
  ban_reason: string | null;
  wallet_count: number;
  transaction_count: number;
  last_active_at: string | null;
  created_at: string;
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [wallets, setWallets] = useState<Array<Record<string, unknown>>>([]);
  const [transactions, setTransactions] = useState<Array<Record<string, unknown>>>([]);
  const [aiUsage, setAiUsage] = useState<Record<string, unknown> | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch(`/api/admin/users/${userId}`);
        if (res.ok) {
          const data = await res.json();
          setProfile(data.profile);
          setWallets(data.wallets || []);
          setTransactions(data.transactions || []);
          setAiUsage(data.aiUsage);
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
      } finally {
        setLoading(false);
      }
    }
    if (userId) fetchUser();
  }, [userId]);

  const updateUser = async (updates: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setProfile(prev => prev ? { ...prev, ...updates } as UserProfile : null);
      }
    } catch (error) {
      console.error('Failed to update user:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#0052ff]/30 border-t-[#0052ff] rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-16 text-[#8a8f98]">
        <p>User not found</p>
        <button onClick={() => router.push('/admin/users')} className="mt-4 text-[#0052ff] text-sm hover:underline">
          Back to users list
        </button>
      </div>
    );
  }

  const planBadge: Record<string, string> = {
    starter: 'bg-[#8a8f98]/10 text-[#8a8f98]',
    pro: 'bg-[#0ecb81]/10 text-[#0ecb81]',
    enterprise: 'bg-[#f7931a]/10 text-[#f7931a]',
  };
  const statusBadge: Record<string, string> = {
    active: 'bg-[#0ecb81]/10 text-[#0ecb81]',
    suspended: 'bg-[#f7931a]/10 text-[#f7931a]',
    banned: 'bg-[#f6465d]/10 text-[#f6465d]',
  };
  const statusLabels: Record<string, string> = { active: 'Active', suspended: 'Suspended', banned: 'Banned' };
  const planLabels: Record<string, string> = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'wallets', label: `Wallets (${wallets.length})` },
    { id: 'transactions', label: `Transactions (${transactions.length})` },
    { id: 'ai', label: 'AI Usage' },
  ];

  return (
    <div className="space-y-5">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/admin/users')} className="p-2 rounded-lg hover:bg-white/5 text-[#8a8f98]">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-[#f7f8f8]">{profile.full_name || profile.email}</h2>
          <p className="text-xs text-[#8a8f98]">{profile.email}</p>
        </div>
        <span className={`text-xs px-3 py-1 rounded-full ${planBadge[profile.plan] || planBadge.starter}`}>
          {planLabels[profile.plan]}
        </span>
        <span className={`text-xs px-3 py-1 rounded-full ${statusBadge[profile.status] || statusBadge.active}`}>
          {statusLabels[profile.status]}
        </span>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
          <Wallet className="h-4 w-4 text-[#f7931a] mb-2" />
          <p className="text-lg font-bold text-[#f7f8f8]">{profile.wallet_count}</p>
          <p className="text-[10px] text-[#8a8f98]">Wallets</p>
        </div>
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
          <Activity className="h-4 w-4 text-[#627eea] mb-2" />
          <p className="text-lg font-bold text-[#f7f8f8]">{profile.transaction_count}</p>
          <p className="text-[10px] text-[#8a8f98]">Transactions</p>
        </div>
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
          <Bot className="h-4 w-4 text-[#0052ff] mb-2" />
          <p className="text-lg font-bold text-[#f7f8f8]">{(aiUsage as Record<string, unknown>)?.chat_count as number || 0}</p>
          <p className="text-[10px] text-[#8a8f98]">AI Chats</p>
        </div>
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
          <Clock className="h-4 w-4 text-[#0ecb81] mb-2" />
          <p className="text-sm font-bold text-[#f7f8f8]">
            {profile.last_active_at ? new Date(profile.last_active_at).toLocaleDateString('en') : '—'}
          </p>
          <p className="text-[10px] text-[#8a8f98]">Last Active</p>
        </div>
      </div>

      {/* Admin Actions */}
      <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-[#8a8f98] mb-3">Admin Actions</h3>
        <div className="flex flex-wrap gap-2">
          {/* Change Plan */}
          {(['starter', 'pro', 'enterprise'] as const).map((p) => (
            <button
              key={p}
              onClick={() => updateUser({ plan: p })}
              disabled={profile.plan === p}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                profile.plan === p ? 'bg-[#0052ff]/10 text-[#0052ff] border border-[#0052ff]/20' : 'bg-white/5 text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-white/10'
              }`}
            >
              {planLabels[p]}
            </button>
          ))}

          <div className="w-px bg-white/10 mx-1" />

          {/* Status Actions */}
          {profile.status === 'active' && (
            <button onClick={() => updateUser({ status: 'suspended' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#f7931a]/10 text-[#f7931a] hover:bg-[#f7931a]/20 transition-colors">
              <Ban className="h-3 w-3" /> Suspend
            </button>
          )}
          {profile.status === 'suspended' && (
            <button onClick={() => updateUser({ status: 'active' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#0ecb81]/10 text-[#0ecb81] hover:bg-[#0ecb81]/20 transition-colors">
              <CheckCircle className="h-3 w-3" /> Activate
            </button>
          )}
          {profile.status !== 'banned' ? (
            <button onClick={() => { const r = prompt('Ban reason:'); if (r) updateUser({ status: 'banned', ban_reason: r }); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#f6465d]/10 text-[#f6465d] hover:bg-[#f6465d]/20 transition-colors">
              <XCircle className="h-3 w-3" /> Ban
            </button>
          ) : (
            <button onClick={() => updateUser({ status: 'active', ban_reason: null })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#0ecb81]/10 text-[#0ecb81] hover:bg-[#0ecb81]/20 transition-colors">
              <CheckCircle className="h-3 w-3" /> Unban
            </button>
          )}
        </div>
        {profile.ban_reason && (
          <p className="mt-2 text-xs text-[#f6465d]">Ban reason: {profile.ban_reason}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/5 pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs transition-colors border-b-2 -mb-px ${
              activeTab === tab.id ? 'text-[#0052ff] border-[#0052ff]' : 'text-[#8a8f98] border-transparent hover:text-[#f7f8f8]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-[#8a8f98] mb-3">Account Info</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-[#8a8f98]">Email:</span> <span className="text-[#f7f8f8]">{profile.email}</span></div>
              <div><span className="text-[#8a8f98]">Name:</span> <span className="text-[#f7f8f8]">{profile.full_name || '—'}</span></div>
              <div><span className="text-[#8a8f98]">Registered:</span> <span className="text-[#f7f8f8]">{new Date(profile.created_at).toLocaleDateString('en')}</span></div>
              <div><span className="text-[#8a8f98]">ID:</span> <span className="text-[#f7f8f8] font-mono text-[10px]">{profile.user_id.slice(0, 16)}...</span></div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'wallets' && (
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98]">Address</th>
                <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98]">Label</th>
                <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98]">Last Synced</th>
              </tr>
            </thead>
            <tbody>
              {wallets.length === 0 ? (
                <tr><td colSpan={3} className="text-center py-8 text-xs text-[#8a8f98]">No wallets found</td></tr>
              ) : wallets.map((w, i) => (
                <tr key={i} className="border-b border-white/[0.03]">
                  <td className="px-4 py-2.5 text-xs text-[#d0d6e0] font-mono">{(w.address as string)?.slice(0, 10)}...{(w.address as string)?.slice(-6)}</td>
                  <td className="px-4 py-2.5 text-xs text-[#f7f8f8]">{(w.label as string) || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-[#8a8f98]">{w.last_synced_at ? new Date(w.last_synced_at as string).toLocaleDateString('en') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98]">Date</th>
                <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98]">Type</th>
                <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98]">Token</th>
                <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98]">Value</th>
                <th className="text-left px-4 py-2.5 text-xs text-[#8a8f98]">Network</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-xs text-[#8a8f98]">No transactions found</td></tr>
              ) : (transactions as Array<Record<string, unknown>>).slice(0, 20).map((tx, i) => (
                <tr key={i} className="border-b border-white/[0.03]">
                  <td className="px-4 py-2.5 text-xs text-[#8a8f98]">{tx.date as string || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-[#d0d6e0]">{tx.type as string || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-[#f7f8f8]">{tx.token_symbol as string || 'ETH'}</td>
                  <td className="px-4 py-2.5 text-xs text-[#f7f8f8]">${((tx.token_value as number || tx.value_eth as number || 0)).toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-xs text-[#8a8f98]">{tx.network as string || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'ai' && aiUsage && (
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/[0.02] rounded-lg p-3">
              <p className="text-lg font-bold text-[#f7f8f8]">{(aiUsage.chat_count as number) || 0}</p>
              <p className="text-[10px] text-[#8a8f98]">Chats</p>
            </div>
            <div className="bg-white/[0.02] rounded-lg p-3">
              <p className="text-lg font-bold text-[#f7f8f8]">{(aiUsage.analysis_count as number) || 0}</p>
              <p className="text-[10px] text-[#8a8f98]">Analyses</p>
            </div>
            <div className="bg-white/[0.02] rounded-lg p-3">
              <p className="text-lg font-bold text-[#f7f8f8]">{((aiUsage.total_input_tokens as number) || 0).toLocaleString()}</p>
              <p className="text-[10px] text-[#8a8f98]">Input Tokens</p>
            </div>
            <div className="bg-white/[0.02] rounded-lg p-3">
              <p className="text-lg font-bold text-[#f7f8f8]">{((aiUsage.total_output_tokens as number) || 0).toLocaleString()}</p>
              <p className="text-[10px] text-[#8a8f98]">Output Tokens</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
