'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowRight, Wallet, Activity, Bot, Mail, Shield,
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
        <p>المستخدم غير موجود</p>
        <button onClick={() => router.push('/admin/users')} className="mt-4 text-[#0052ff] text-sm hover:underline">
          العودة لقائمة المستخدمين
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
  const statusLabels: Record<string, string> = { active: 'نشط', suspended: 'معلق', banned: 'محظور' };
  const planLabels: Record<string, string> = { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' };

  const tabs = [
    { id: 'overview', label: 'نظرة عامة' },
    { id: 'wallets', label: `المحافظ (${wallets.length})` },
    { id: 'transactions', label: `المعاملات (${transactions.length})` },
    { id: 'ai', label: 'استخدام AI' },
  ];

  return (
    <div className="space-y-5">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/admin/users')} className="p-2 rounded-lg hover:bg-white/5 text-[#8a8f98]">
          <ArrowRight className="h-4 w-4" />
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
          <p className="text-[10px] text-[#8a8f98]">المحافظ</p>
        </div>
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
          <Activity className="h-4 w-4 text-[#627eea] mb-2" />
          <p className="text-lg font-bold text-[#f7f8f8]">{profile.transaction_count}</p>
          <p className="text-[10px] text-[#8a8f98]">المعاملات</p>
        </div>
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
          <Bot className="h-4 w-4 text-[#0052ff] mb-2" />
          <p className="text-lg font-bold text-[#f7f8f8]">{(aiUsage as Record<string, unknown>)?.chat_count as number || 0}</p>
          <p className="text-[10px] text-[#8a8f98]">محادثات AI</p>
        </div>
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
          <Clock className="h-4 w-4 text-[#0ecb81] mb-2" />
          <p className="text-sm font-bold text-[#f7f8f8]">
            {profile.last_active_at ? new Date(profile.last_active_at).toLocaleDateString('ar') : '—'}
          </p>
          <p className="text-[10px] text-[#8a8f98]">آخر نشاط</p>
        </div>
      </div>

      {/* Admin Actions */}
      <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-[#8a8f98] mb-3">إجراءات المدير</h3>
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
              <Ban className="h-3 w-3" /> تعليق
            </button>
          )}
          {profile.status === 'suspended' && (
            <button onClick={() => updateUser({ status: 'active' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#0ecb81]/10 text-[#0ecb81] hover:bg-[#0ecb81]/20 transition-colors">
              <CheckCircle className="h-3 w-3" /> تفعيل
            </button>
          )}
          {profile.status !== 'banned' ? (
            <button onClick={() => { const r = prompt('سبب الحظر:'); if (r) updateUser({ status: 'banned', ban_reason: r }); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#f6465d]/10 text-[#f6465d] hover:bg-[#f6465d]/20 transition-colors">
              <XCircle className="h-3 w-3" /> حظر
            </button>
          ) : (
            <button onClick={() => updateUser({ status: 'active', ban_reason: null })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#0ecb81]/10 text-[#0ecb81] hover:bg-[#0ecb81]/20 transition-colors">
              <CheckCircle className="h-3 w-3" /> إلغاء الحظر
            </button>
          )}
        </div>
        {profile.ban_reason && (
          <p className="mt-2 text-xs text-[#f6465d]">سبب الحظر: {profile.ban_reason}</p>
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
            <h3 className="text-xs font-semibold text-[#8a8f98] mb-3">معلومات الحساب</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-[#8a8f98]">البريد:</span> <span className="text-[#f7f8f8]">{profile.email}</span></div>
              <div><span className="text-[#8a8f98]">الاسم:</span> <span className="text-[#f7f8f8]">{profile.full_name || '—'}</span></div>
              <div><span className="text-[#8a8f98]">التسجيل:</span> <span className="text-[#f7f8f8]">{new Date(profile.created_at).toLocaleDateString('ar')}</span></div>
              <div><span className="text-[#8a8f98]">المعرف:</span> <span className="text-[#f7f8f8] font-mono text-[10px]">{profile.user_id.slice(0, 16)}...</span></div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'wallets' && (
        <div className="bg-[#0c0d0e] border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-right px-4 py-2.5 text-xs text-[#8a8f98]">العنوان</th>
                <th className="text-right px-4 py-2.5 text-xs text-[#8a8f98]">التسمية</th>
                <th className="text-right px-4 py-2.5 text-xs text-[#8a8f98]">آخر مزامنة</th>
              </tr>
            </thead>
            <tbody>
              {wallets.length === 0 ? (
                <tr><td colSpan={3} className="text-center py-8 text-xs text-[#8a8f98]">لا توجد محافظ</td></tr>
              ) : wallets.map((w, i) => (
                <tr key={i} className="border-b border-white/[0.03]">
                  <td className="px-4 py-2.5 text-xs text-[#d0d6e0] font-mono">{(w.address as string)?.slice(0, 10)}...{(w.address as string)?.slice(-6)}</td>
                  <td className="px-4 py-2.5 text-xs text-[#f7f8f8]">{(w.label as string) || '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-[#8a8f98]">{w.last_synced_at ? new Date(w.last_synced_at as string).toLocaleDateString('ar') : '—'}</td>
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
                <th className="text-right px-4 py-2.5 text-xs text-[#8a8f98]">التاريخ</th>
                <th className="text-right px-4 py-2.5 text-xs text-[#8a8f98]">النوع</th>
                <th className="text-right px-4 py-2.5 text-xs text-[#8a8f98]">التوكن</th>
                <th className="text-right px-4 py-2.5 text-xs text-[#8a8f98]">القيمة</th>
                <th className="text-right px-4 py-2.5 text-xs text-[#8a8f98]">الشبكة</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-xs text-[#8a8f98]">لا توجد معاملات</td></tr>
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
              <p className="text-[10px] text-[#8a8f98]">المحادثات</p>
            </div>
            <div className="bg-white/[0.02] rounded-lg p-3">
              <p className="text-lg font-bold text-[#f7f8f8]">{(aiUsage.analysis_count as number) || 0}</p>
              <p className="text-[10px] text-[#8a8f98]">التحليلات</p>
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
