'use client';

import { useMemo } from 'react';
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

interface NetworksSectionProps {
  transactions: Transaction[];
  onNetworkClick: (networkId: string) => void;
}

interface NetworkStats {
  networkId: string;
  networkLabel: string;
  totalRevenue: number;
  totalExpenses: number;
  totalVolume: number;
  txCount: number;
  netFlow: number;
  gasFees: number;
  lastTxDate: string | null;
  topToken: string | null;
  color: string;
}

const networkColors: Record<string, string> = {
  ethereum: '#627eea',
  base: '#0052ff',
  arbitrum: '#28a0f0',
  optimism: '#ff0420',
  bsc: '#f0b90b',
};

export function NetworksSection({ transactions, onNetworkClick }: NetworksSectionProps) {
  // Build network stats from transactions
  const networkStats = useMemo((): NetworkStats[] => {
    const statsMap = new Map<string, NetworkStats & { tokenCounts: Record<string, number> }>();

    transactions.forEach(tx => {
      const key = tx.network;
      const existing = statsMap.get(key);

      if (existing) {
        existing.txCount++;
        existing.totalVolume += tx.value;
        if (tx.type === 'income' || tx.type === 'staking' || tx.type === 'defi') {
          existing.totalRevenue += tx.value;
        }
        if (tx.type === 'expense') {
          existing.totalExpenses += tx.value;
        }
        if (tx.type === 'gas') {
          existing.gasFees += tx.value;
          existing.totalExpenses += tx.value;
        }
        existing.netFlow = existing.totalRevenue - existing.totalExpenses;
        if (!existing.lastTxDate || tx.date > existing.lastTxDate) {
          existing.lastTxDate = tx.date;
        }
        existing.tokenCounts[tx.token] = (existing.tokenCounts[tx.token] || 0) + 1;
      } else {
        const networkInfo = networks.find(n => n.value === key);
        const revenue = (tx.type === 'income' || tx.type === 'staking' || tx.type === 'defi') ? tx.value : 0;
        const expenses = tx.type === 'expense' ? tx.value : 0;
        const gas = tx.type === 'gas' ? tx.value : 0;
        statsMap.set(key, {
          networkId: key,
          networkLabel: networkInfo?.label || key,
          totalRevenue: revenue,
          totalExpenses: expenses + gas,
          totalVolume: tx.value,
          txCount: 1,
          netFlow: revenue - expenses - gas,
          gasFees: gas,
          lastTxDate: tx.date,
          topToken: null,
          color: networkColors[key] || '#8a8f98',
          tokenCounts: { [tx.token]: 1 },
        });
      }
    });

    // Resolve topToken
    statsMap.forEach(stats => {
      const sorted = Object.entries(stats.tokenCounts).sort(([, a], [, b]) => b - a);
      stats.topToken = sorted[0]?.[0] || null;
    });

    // Sort by tx count
    const result = Array.from(statsMap.values()).map(({ tokenCounts, ...rest }) => rest);
    result.sort((a, b) => b.txCount - a.txCount);

    return result;
  }, [transactions]);

  if (networkStats.length === 0) {
    return (
      <Card className="bg-[#0f1011] border-white/5">
        <CardHeader className="pb-4">
          <CardTitle className="text-[#f7f8f8] text-base flex items-center gap-2">
            <Globe className="h-5 w-5 text-[#627eea]" />
            Networks
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Globe className="h-10 w-10 text-[#28282c] mx-auto mb-3" />
          <p className="text-sm text-[#8a8f98]">No transactions yet</p>
          <p className="text-xs text-[#8a8f98]/60 mt-1">Networks you interact with will appear here automatically</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[#0f1011] border-white/5">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[#f7f8f8] text-base flex items-center gap-2">
            <Globe className="h-5 w-5 text-[#627eea]" />
            Networks
          </CardTitle>
          <span className="text-xs text-[#8a8f98]">{networkStats.length} network</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Network</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Revenue</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Expense</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Net Flow</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Gas Fees</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Transactions</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Last Tx</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {networkStats.map((ns) => {
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
      </CardContent>
    </Card>
  );
}
