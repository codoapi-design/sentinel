'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ScrollText, Search, Filter, Download, ChevronLeft, ChevronRight,
  Shield, User, Settings, Bot, CreditCard, Ban, Eye, Clock,
} from 'lucide-react';

interface AuditLogEntry {
  id: string;
  admin_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  admin?: { email: string } | null;
}

const actionIcons: Record<string, typeof Shield> = {
  update_user: Settings,
  ban_user: Ban,
  suspend_user: Ban,
  activate_user: Eye,
  impersonate_user: User,
  update_plan: CreditCard,
  settings_: Settings,
  ai_: Bot,
};

const actionColors: Record<string, string> = {
  update_user: 'text-[#0052ff] bg-[#0052ff]/10',
  ban_user: 'text-[#f6465d] bg-[#f6465d]/10',
  suspend_user: 'text-[#f7931a] bg-[#f7931a]/10',
  activate_user: 'text-[#0ecb81] bg-[#0ecb81]/10',
  impersonate_user: 'text-[#627eea] bg-[#627eea]/10',
  update_plan: 'text-[#f7931a] bg-[#f7931a]/10',
  settings_: 'text-[#8a8f98] bg-[#8a8f98]/10',
  ai_: 'text-[#627eea] bg-[#627eea]/10',
};

const actionLabels: Record<string, string> = {
  update_user_plan: 'Change Plan',
  update_user_status: 'Change Status',
  update_user_ban_reason: 'Update Ban Reason',
  update_user_full_name: 'Update Name',
  ban_user: 'Ban User',
  suspend_user: 'Suspend User',
  activate_user: 'Activate User',
  impersonate_user: 'Login as User',
  update_plan: 'Update Plan',
  settings_update: 'Update Settings',
};

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '30',
        action: actionFilter,
      });
      const res = await fetch(`/api/admin/audit-log?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        setTotalPages(Math.ceil((data.total || 0) / 30));
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getActionKey = (action: string) => {
    for (const key of Object.keys(actionColors)) {
      if (action.startsWith(key)) return key;
    }
    return 'settings_';
  };

  const exportLogs = () => {
    const headers = ['Date', 'Admin', 'Action', 'Type', 'ID', 'IP'];
    const rows = logs.map(l => [
      new Date(l.created_at).toLocaleString('en'),
      l.admin?.email || l.admin_id.slice(0, 12),
      l.action,
      l.target_type || '',
      l.target_id || '',
      l.ip_address || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `radareum-audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Header + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="bg-[#0c0d0e] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#d0d6e0] focus:outline-none focus:border-[#0052ff]/50 appearance-none pr-8"
            >
              <option value="">All Actions</option>
              <option value="update_user">User Updates</option>
              <option value="ban_user">Ban</option>
              <option value="suspend_user">Suspend</option>
              <option value="impersonate_user">Login as User</option>
              <option value="settings_">Settings</option>
            </select>
          </div>
        </div>

        <button
          onClick={exportLogs}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-[#8a8f98] hover:text-[#f7f8f8] text-sm transition-colors"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-[#8a8f98]">
        <span>Total Records: <strong className="text-[#f7f8f8]">{total}</strong></span>
        <span>Page: <strong className="text-[#f7f8f8]">{page}/{totalPages || 1}</strong></span>
      </div>

      {/* Logs List */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-[#0052ff]/30 border-t-[#0052ff] rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-[#0c0d0e] border border-white/5 rounded-xl p-12 text-center">
            <ScrollText className="h-10 w-10 text-[#8a8f98] mx-auto mb-3" />
            <p className="text-sm text-[#8a8f98]">No audit logs found</p>
          </div>
        ) : (
          logs.map((log) => {
            const actionKey = getActionKey(log.action);
            const IconComp = actionIcons[actionKey] || Shield;
            const colorClass = actionColors[actionKey] || 'text-[#8a8f98] bg-[#8a8f98]/10';
            const label = actionLabels[log.action] || log.action;

            return (
              <div
                key={log.id}
                className="bg-[#0c0d0e] border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors cursor-pointer"
                onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg shrink-0 ${colorClass}`}>
                    <IconComp className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-[#f7f8f8] font-medium">{label}</p>
                      <span className="text-[10px] text-[#8a8f98] shrink-0">
                        {new Date(log.created_at).toLocaleString('en')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-[#8a8f98]">
                        By: <span className="text-[#d0d6e0]">{log.admin?.email || 'Unknown'}</span>
                      </span>
                      {log.target_type && (
                        <span className="text-xs text-[#8a8f98]">
                          Target: <span className="text-[#d0d6e0]">{log.target_type}</span>
                        </span>
                      )}
                      {log.ip_address && (
                        <span className="text-xs text-[#8a8f98] font-mono">
                          IP: {log.ip_address}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {selectedLog?.id === log.id && log.details && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <p className="text-[10px] text-[#8a8f98] mb-2">Action Details:</p>
                    <pre className="text-xs text-[#d0d6e0] bg-white/[0.02] rounded-lg p-3 overflow-auto max-h-40 font-mono" dir="ltr">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <span className="text-xs text-[#8a8f98]">
            Showing {((page - 1) * 30) + 1} - {Math.min(page * 30, total)} of {total}
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
  );
}
