'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Filter, Download, ChevronLeft, ChevronRight,
  Eye, MoreHorizontal, Ban, CheckCircle, XCircle, ArrowUpDown,
} from 'lucide-react';

interface User {
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

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const [updateLoading, setUpdateLoading] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        search,
        plan: planFilter,
        status: statusFilter,
      });
      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  }, [page, search, planFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const updateUser = async (userId: string, updates: Record<string, unknown>) => {
    setUpdateLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        await fetchUsers();
        setActionMenuOpen(null);
      }
    } catch (error) {
      console.error('Failed to update user:', error);
    } finally {
      setUpdateLoading(null);
    }
  };

  const exportCSV = () => {
    const headers = ['Email', 'Name', 'Plan', 'Status', 'Wallets', 'Transactions', 'Registration Date'];
    const rows = users.map(u => [u.email, u.full_name, u.plan, u.status, u.wallet_count, u.transaction_count, u.created_at?.split('T')[0]]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `sentinel-users-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const planBadge = (plan: string) => {
    const styles: Record<string, string> = {
      starter: 'bg-[#8a8f98]/10 text-[#8a8f98]',
      pro: 'bg-[#0ecb81]/10 text-[#0ecb81]',
      enterprise: 'bg-[#f7931a]/10 text-[#f7931a]',
    };
    return styles[plan] || styles.starter;
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-[#0ecb81]/10 text-[#0ecb81]',
      suspended: 'bg-[#f7931a]/10 text-[#f7931a]',
      banned: 'bg-[#f6465d]/10 text-[#f6465d]',
    };
    return styles[status] || styles.active;
  };

  const statusLabels: Record<string, string> = { active: 'Active', suspended: 'Suspended', banned: 'Banned' };
  const planLabels: Record<string, string> = { starter: 'Starter', pro: 'Pro', enterprise: 'Business', business: 'Business' };

  return (
    <div className="space-y-4">
      {/* Header + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8f98]" />
            <input
              type="text"
              placeholder="Search by email or name..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="bg-[#0c0d0e] border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-[#d0d6e0] placeholder-[#8a8f98] w-[260px] focus:outline-none focus:border-[#0052ff]/50"
            />
          </div>

          {/* Plan Filter */}
          <select
            value={planFilter}
            onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
            className="bg-[#0c0d0e] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#d0d6e0] focus:outline-none focus:border-[#0052ff]/50"
          >
            <option value="">All Plans</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-[#0c0d0e] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#d0d6e0] focus:outline-none focus:border-[#0052ff]/50"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </select>
        </div>

        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[#8a8f98] hover:text-[#f7f8f8] text-sm transition-colors"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Stats Summary */}
      <div className="flex items-center gap-4 text-xs text-[#8a8f98]">
        <span>Total Users: <strong className="text-[#f7f8f8]">{total}</strong></span>
        <span>Page: <strong className="text-[#f7f8f8]">{page}/{totalPages}</strong></span>
      </div>

      {/* Users Table */}
      <div className="bg-[#0c0d0e] border border-white/5 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-xs text-[#8a8f98] font-medium">User</th>
                <th className="text-left px-4 py-3 text-xs text-[#8a8f98] font-medium">Plan</th>
                <th className="text-left px-4 py-3 text-xs text-[#8a8f98] font-medium">Status</th>
                <th className="text-left px-4 py-3 text-xs text-[#8a8f98] font-medium">Wallets</th>
                <th className="text-left px-4 py-3 text-xs text-[#8a8f98] font-medium">Last Active</th>
                <th className="text-left px-4 py-3 text-xs text-[#8a8f98] font-medium">Registration Date</th>
                <th className="text-center px-4 py-3 text-xs text-[#8a8f98] font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-[#8a8f98]">
                    <div className="flex justify-center">
                      <div className="w-6 h-6 border-2 border-[#0052ff]/30 border-t-[#0052ff] rounded-full animate-spin" />
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-[#8a8f98]">No users found</td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.user_id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#0052ff]/10 flex items-center justify-center text-xs text-[#0052ff] font-bold shrink-0">
                          {(user.full_name || user.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[#f7f8f8] truncate text-xs font-medium">{user.full_name || 'No name'}</p>
                          <p className="text-[#8a8f98] truncate text-[10px]">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${planBadge(user.plan)}`}>
                        {planLabels[user.plan] || user.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusBadge(user.status)}`}>
                        {statusLabels[user.status] || user.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#d0d6e0]">{user.wallet_count}</td>
                    <td className="px-4 py-3 text-xs text-[#8a8f98]">
                      {user.last_active_at ? new Date(user.last_active_at).toLocaleDateString('en') : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#8a8f98]">
                      {new Date(user.created_at).toLocaleDateString('en')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative flex justify-center">
                        <button
                          onClick={() => setActionMenuOpen(actionMenuOpen === user.user_id ? null : user.user_id)}
                          className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98] hover:text-[#f7f8f8] transition-colors"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>

                        {actionMenuOpen === user.user_id && (
                          <div className="absolute top-full right-0 mt-1 w-44 bg-[#191a1b] border border-white/10 rounded-xl shadow-xl z-20 py-1.5">
                            <button
                              onClick={() => router.push(`/admin/users/${user.user_id}`)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#d0d6e0] hover:bg-white/5 transition-colors"
                            >
                              <Eye className="h-3.5 w-3.5" /> View Details
                            </button>

                            {user.status === 'active' && (
                              <button
                                onClick={() => updateUser(user.user_id, { status: 'suspended' })}
                                disabled={updateLoading === user.user_id}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#f7931a] hover:bg-[#f7931a]/5 transition-colors"
                              >
                                <Ban className="h-3.5 w-3.5" /> Suspend Account
                              </button>
                            )}

                            {user.status === 'suspended' && (
                              <button
                                onClick={() => updateUser(user.user_id, { status: 'active' })}
                                disabled={updateLoading === user.user_id}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#0ecb81] hover:bg-[#0ecb81]/5 transition-colors"
                              >
                                <CheckCircle className="h-3.5 w-3.5" /> Activate Account
                              </button>
                            )}

                            {user.status !== 'banned' ? (
                              <button
                                onClick={() => {
                                  const reason = prompt('Ban reason:');
                                  if (reason) updateUser(user.user_id, { status: 'banned', ban_reason: reason });
                                }}
                                disabled={updateLoading === user.user_id}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#f6465d] hover:bg-[#f6465d]/5 transition-colors"
                              >
                                <XCircle className="h-3.5 w-3.5" /> Ban User
                              </button>
                            ) : (
                              <button
                                onClick={() => updateUser(user.user_id, { status: 'active', ban_reason: null })}
                                disabled={updateLoading === user.user_id}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#0ecb81] hover:bg-[#0ecb81]/5 transition-colors"
                              >
                                <CheckCircle className="h-3.5 w-3.5" /> Unban
                              </button>
                            )}

                            {/* Change Plan */}
                            <div className="border-t border-white/5 mt-1.5 pt-1.5">
                              <p className="px-3 py-1 text-[10px] text-[#8a8f98]">Change Plan</p>
                              {(['starter', 'pro', 'enterprise'] as const).map((p) => (
                                <button
                                  key={p}
                                  onClick={() => updateUser(user.user_id, { plan: p })}
                                  disabled={updateLoading === user.user_id || user.plan === p}
                                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                                    user.plan === p ? 'text-[#0052ff]' : 'text-[#8a8f98] hover:text-[#f7f8f8] hover:bg-white/5'
                                  }`}
                                >
                                  {planLabels[p]} {user.plan === p && '✓'}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
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
              Showing {((page - 1) * 20) + 1} - {Math.min(page * 20, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-white/5 text-[#8a8f98] disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-[#f7f8f8]">{page}</span>
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
  );
}
