'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Globe,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronLeft,
  Fuel,
} from 'lucide-react';
import {
  networks,
  type Transaction,
} from '@/lib/mock-data';
import { cn } from '@/lib/utils';
import {
  computeFinancialSummary,
} from '@/lib/finance/summary';
import {
  filterVisibleTransactions,
  isHiddenSpamOrDustTx,
} from '@/lib/finance/visibility';
import { TablePagination } from '@/components/table-pagination';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ShowSpamDustToggle } from '@/components/show-spam-dust-toggle';
import { useUiPreferencesStore } from '@/stores/ui-preferences-store';
import {
  NetworksPageFilterStats,
  type NetworkFilterStatRow,
} from '@/components/networks-filter-stats';
import { useWalletReadModels } from '@/hooks/use-wallet-read-models';

interface NetworksSectionProps {
  transactions: Transaction[];
  onNetworkClick: (networkId: string) => void;
  onFilteredDataChange?: (data: NetworkStats[]) => void;
  precomputedStats?: NetworkStats[] | null;
}

export interface NetworkStats extends NetworkFilterStatRow {
  lastTxDate: string | null;
  topToken: string | null;
  color: string;
}

interface NetworksTabProps {
  transactions: Transaction[];
  onNetworkClick: (networkId: string) => void;
}

const networkColors: Record<string, string> = {
  ethereum: '#627eea',
  base: '#0052ff',
  arbitrum: '#28a0f0',
  optimism: '#ff0420',
  bsc: '#f0b90b',
};

/**
 * Full sidebar Networks view: filter-bound 2×4 stats + table.
 * Stats track the same visible list as NetworksSection (spam/$0).
 */
export function NetworksTab({
  transactions,
  onNetworkClick,
}: NetworksTabProps) {
  const [filteredData, setFilteredData] = useState<NetworkStats[]>([]);
  const [filtersReady, setFiltersReady] = useState(false);
  const { networks: readModelNetworks } = useWalletReadModels();

  const precomputedStats = useMemo((): NetworkStats[] | null => {
    if (!readModelNetworks.length) return null;
    return readModelNetworks.map(d => {
      const networkInfo = networks.find(n => n.value === d.key);
      return {
        networkId: d.key,
        networkLabel: networkInfo?.label || d.label || d.key,
        totalRevenue: d.inflowUsd,
        totalExpenses: d.outflowUsd,
        totalVolume: d.volumeUsd,
        txCount: d.txCount,
        netFlow: d.inflowUsd - d.outflowUsd,
        gasFees: 0,
        lastTxDate: d.lastTxDate,
        topToken: d.topToken,
        color: networkColors[d.key] || '#8a8f98',
      };
    });
  }, [readModelNetworks]);

  const handleFilteredDataChange = useCallback((data: NetworkStats[]) => {
    setFiltersReady(true);
    setFilteredData(data);
  }, []);

  const statsNetworks = filtersReady ? filteredData : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#f7f8f8] mb-1">Networks</h2>
        <p className="text-sm text-[#8a8f98]">
          All networks you&apos;ve transacted on and details per network
        </p>
      </div>
      <NetworksPageFilterStats networks={statsNetworks} />
      <NetworksSection
        transactions={transactions}
        precomputedStats={precomputedStats}
        onNetworkClick={onNetworkClick}
        onFilteredDataChange={handleFilteredDataChange}
      />
    </div>
  );
}

export function NetworksSection({
  transactions,
  onNetworkClick,
  onFilteredDataChange,
  precomputedStats,
}: NetworksSectionProps) {
  const showSpamAndDust = useUiPreferencesStore((s) => s.showSpamAndDust);
  const hasHiddenItems = useMemo(
    () => transactions.some((tx) => isHiddenSpamOrDustTx(tx, false)),
    [transactions],
  );
  const visibleTransactions = useMemo(
    () => filterVisibleTransactions(transactions, showSpamAndDust),
    [transactions, showSpamAndDust],
  );

  const networkStats = useMemo((): NetworkStats[] => {
    if (precomputedStats && precomputedStats.length > 0) {
      return [...precomputedStats].sort((a, b) => b.txCount - a.txCount);
    }

    const byNetwork = new Map<string, Transaction[]>();
    for (const tx of visibleTransactions) {
      const list = byNetwork.get(tx.network) || [];
      list.push(tx);
      byNetwork.set(tx.network, list);
    }

    const result: NetworkStats[] = [];
    for (const [key, txs] of byNetwork) {
      const summary = computeFinancialSummary(txs);
      const networkInfo = networks.find(n => n.value === key);
      const tokenCounts: Record<string, number> = {};
      let lastTxDate: string | null = null;
      for (const tx of txs) {
        tokenCounts[tx.token] = (tokenCounts[tx.token] || 0) + 1;
        if (!lastTxDate || tx.date > lastTxDate) lastTxDate = tx.date;
      }
      const topToken =
        Object.entries(tokenCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || null;

      result.push({
        networkId: key,
        networkLabel: networkInfo?.label || key,
        totalRevenue: summary.totalRevenue,
        totalExpenses: summary.totalExpenses,
        totalVolume: txs.reduce((s, t) => s + (t.value || 0), 0),
        txCount: txs.length,
        netFlow: summary.netFlow,
        gasFees: summary.gasFees,
        lastTxDate,
        topToken,
        color: networkColors[key] || '#8a8f98',
      });
    }

    result.sort((a, b) => b.txCount - a.txCount);
    return result;
  }, [visibleTransactions, precomputedStats]);

  useEffect(() => {
    onFilteredDataChange?.(networkStats);
  }, [networkStats, onFilteredDataChange]);

  const {
    page,
    setPage,
    pageSize,
    pageItems: pagedNetworks,
    totalItems,
  } = useTablePagination(networkStats);

  if (networkStats.length === 0) {
    return (
      <Card className="bg-[#0f1011] border-white/5">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-[#f7f8f8] text-base flex items-center gap-2">
                <Globe className="h-5 w-5 text-[#627eea]" />
                Networks
              </CardTitle>
              {hasHiddenItems && !showSpamAndDust ? (
                <p className="text-[10px] text-[#8a8f98] mt-1">spam & $0 hidden</p>
              ) : null}
            </div>
            <ShowSpamDustToggle compact />
          </div>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Globe className="h-10 w-10 text-[#28282c] mx-auto mb-3" />
          <p className="text-sm text-[#8a8f98]">
            {hasHiddenItems && !showSpamAndDust && visibleTransactions.length === 0
              ? 'No networks to show'
              : 'No transactions yet'}
          </p>
          <p className="text-xs text-[#8a8f98]/60 mt-1">
            {hasHiddenItems && !showSpamAndDust && visibleTransactions.length === 0
              ? 'Enable Show spam & $0 if you expect dust'
              : 'Networks you interact with will appear here automatically'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[#0f1011] border-white/5">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="text-[#f7f8f8] text-base flex items-center gap-2">
              <Globe className="h-5 w-5 text-[#627eea]" />
              Networks
            </CardTitle>
            {hasHiddenItems && !showSpamAndDust ? (
              <p className="text-[10px] text-[#8a8f98] mt-1">spam & $0 hidden</p>
            ) : null}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <ShowSpamDustToggle compact />
            <span className="text-xs text-[#8a8f98]">{networkStats.length} network</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Network</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Inflow</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Outflow</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Net Flow</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Gas Fees</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Transactions</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Last Tx</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {pagedNetworks.map((ns) => {
                const isNetPositive = ns.netFlow >= 0;

                return (
                  <tr
                    key={ns.networkId}
                    className="border-b border-white/5 hover:bg-[#191a1b]/50 transition-colors cursor-pointer group"
                    onClick={() => onNetworkClick(ns.networkId)}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${ns.color}15` }}
                        >
                          <Globe className="h-4 w-4" style={{ color: ns.color }} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#f7f8f8]">{ns.networkLabel}</p>
                          <p className="text-[10px] text-[#8a8f98]">{ns.networkLabel}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ArrowDownLeft className="h-3 w-3 text-[#0ecb81]" />
                        <span className="font-mono-num text-xs text-[#0ecb81]">
                          ${ns.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ArrowUpRight className="h-3 w-3 text-[#f6465d]" />
                        <span className="font-mono-num text-xs text-[#f6465d]">
                          ${ns.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <span className={cn(
                        'font-mono-num text-xs font-medium',
                        isNetPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
                      )}>
                        {isNetPositive ? '+' : ''}${Math.abs(ns.netFlow).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Fuel className="h-3 w-3 text-[#f7931a]" />
                        <span className="font-mono-num text-xs text-[#f7931a]">
                          ${ns.gasFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <span className="font-mono-num text-xs text-[#d0d6e0]">{ns.txCount}</span>
                    </td>
                    <td className="p-3 text-right">
                      <span className="text-xs text-[#8a8f98]">{ns.lastTxDate || '-'}</span>
                    </td>
                    <td>
                      <ChevronLeft className="h-4 w-4 text-[#8a8f98] group-hover:text-[#d0d6e0] transition-colors opacity-0 group-hover:opacity-100 transform group-hover:-translate-x-0.5 transition-transform" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={page}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={setPage}
        />
      </CardContent>
    </Card>
  );
}
