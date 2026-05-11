'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowUpRight,
  ArrowDownLeft,
  ChevronLeft,
  ArrowLeftRight,
  Coins,
  Landmark,
  Fuel,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import {
  type Transaction,
} from '@/lib/mock-data';
import { cn } from '@/lib/utils';

interface TypesSectionProps {
  transactions: Transaction[];
  onTypeClick: (typeId: string) => void;
}

interface TypeStats {
  typeId: string;
  typeLabel: string;
  typeIcon: string;
  totalRevenue: number;
  totalExpenses: number;
  totalVolume: number;
  txCount: number;
  netFlow: number;
  lastTxDate: string | null;
  topToken: string | null;
  color: string;
}

const typeConfig: Record<string, { label: string; icon: string; color: string; IconComponent: typeof ArrowUpRight }> = {
  income: { label: 'Income', icon: 'Income', color: '#0ecb81', IconComponent: ArrowDownLeft },
  expense: { label: 'Expense', icon: 'Expense', color: '#f6465d', IconComponent: ArrowUpRight },
  trade: { label: 'Trade', icon: 'Trade', color: '#0052ff', IconComponent: ArrowLeftRight },
  defi: { label: 'DeFi', icon: 'DeFi', color: '#b6509e', IconComponent: Landmark },
  staking: { label: 'Staking Reward', icon: 'Staking', color: '#f7931a', IconComponent: TrendingUp },
  gas: { label: 'Gas Fee', icon: 'Gas', color: '#8a8f98', IconComponent: Fuel },
};

export function TypesSection({ transactions, onTypeClick }: TypesSectionProps) {
  // Build type stats from transactions
  const typeStats = useMemo((): TypeStats[] => {
    const statsMap = new Map<string, TypeStats & { tokenCounts: Record<string, number> }>();

    transactions.forEach(tx => {
      const key = tx.type;
      const existing = statsMap.get(key);
      const config = typeConfig[key];

      if (existing) {
        existing.txCount++;
        existing.totalVolume += tx.value;
        if (tx.type === 'income' || tx.type === 'staking' || tx.type === 'defi') {
          existing.totalRevenue += tx.value;
        }
        if (tx.type === 'expense' || tx.type === 'gas') {
          existing.totalExpenses += tx.value;
        }
        existing.netFlow = existing.totalRevenue - existing.totalExpenses;
        if (!existing.lastTxDate || tx.date > existing.lastTxDate) {
          existing.lastTxDate = tx.date;
        }
        existing.tokenCounts[tx.token] = (existing.tokenCounts[tx.token] || 0) + 1;
      } else {
        const revenue = (tx.type === 'income' || tx.type === 'staking' || tx.type === 'defi') ? tx.value : 0;
        const expenses = (tx.type === 'expense' || tx.type === 'gas') ? tx.value : 0;
        statsMap.set(key, {
          typeId: key,
          typeLabel: config?.label || tx.typeLabel || key,
          typeIcon: config?.icon || key,
          totalRevenue: revenue,
          totalExpenses: expenses,
          totalVolume: tx.value,
          txCount: 1,
          netFlow: revenue - expenses,
          lastTxDate: tx.date,
          topToken: null,
          color: config?.color || '#8a8f98',
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

  if (typeStats.length === 0) {
    return (
      <Card className="bg-[#0f1011] border-white/5">
        <CardHeader className="pb-4">
          <CardTitle className="text-[#f7f8f8] text-base flex items-center gap-2">
            <Coins className="h-5 w-5 text-[#0052ff]" />
            Type
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Coins className="h-10 w-10 text-[#28282c] mx-auto mb-3" />
          <p className="text-sm text-[#8a8f98]">No transactions yet</p>
          <p className="text-xs text-[#8a8f98]/60 mt-1">Transaction types you interact with will appear here automatically</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[#0f1011] border-white/5">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[#f7f8f8] text-base flex items-center gap-2">
            <Coins className="h-5 w-5 text-[#0052ff]" />
            Type
          </CardTitle>
          <span className="text-xs text-[#8a8f98]">{typeStats.length} type</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Type</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Revenue</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Expense</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Net Flow</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Volume</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Transactions</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Last Tx</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {typeStats.map((ts) => {
                const isNetPositive = ts.netFlow >= 0;
                const config = typeConfig[ts.typeId];
                const IconComp = config?.IconComponent || Coins;

                return (
                  <tr
                    key={ts.typeId}
                    className="border-b border-white/5 hover:bg-[#191a1b]/50 transition-colors cursor-pointer group"
                    onClick={() => onTypeClick(ts.typeId)}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${ts.color}15` }}
                        >
                          <IconComp className="h-4 w-4" style={{ color: ts.color }} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#f7f8f8]">{ts.typeLabel}</p>
                          <p className="text-[10px] text-[#8a8f98]">
                            {ts.typeId === 'defi' ? 'Decentralized Finance' :
                             ts.typeId === 'staking' ? 'Staking Reward' :
                             ts.typeId === 'trade' ? 'Swap' :
                             ts.typeId === 'gas' ? 'Network Fee' :
                             ts.typeId === 'income' ? 'Incoming Revenue' :
                             ts.typeId === 'expense' ? 'Outgoing Expense' : ts.typeId}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ArrowDownLeft className="h-3 w-3 text-[#0ecb81]" />
                        <span className="font-mono-num text-xs text-[#0ecb81]">
                          ${ts.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ArrowUpRight className="h-3 w-3 text-[#f6465d]" />
                        <span className="font-mono-num text-xs text-[#f6465d]">
                          ${ts.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <span className={cn(
                        'font-mono-num text-xs font-medium',
                        isNetPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
                      )}>
                        {isNetPositive ? '+' : ''}${Math.abs(ts.netFlow).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Coins className="h-3 w-3 text-[#0052ff]" />
                        <span className="font-mono-num text-xs text-[#d0d6e0]">
                          ${ts.totalVolume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <span className="font-mono-num text-xs text-[#d0d6e0]">{ts.txCount}</span>
                    </td>
                    <td className="p-3 text-right">
                      <span className="text-xs text-[#8a8f98]">{ts.lastTxDate || '-'}</span>
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
