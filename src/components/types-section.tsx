'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { isExpenseType, isRevenueType } from '@/lib/finance/summary';
import {
  filterVisibleTransactions,
  isHiddenSpamOrDustTx,
} from '@/lib/finance/visibility';
import { TablePagination } from '@/components/table-pagination';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { ShowSpamDustToggle } from '@/components/show-spam-dust-toggle';
import { useUiPreferencesStore } from '@/stores/ui-preferences-store';
import {
  TypesPageFilterStats,
  type TypeFilterStatRow,
} from '@/components/types-filter-stats';

interface TypesSectionProps {
  transactions: Transaction[];
  onTypeClick: (typeId: string) => void;
  onFilteredDataChange?: (data: TypeStats[]) => void;
}

export interface TypeStats extends TypeFilterStatRow {
  typeIcon: string;
  lastTxDate: string | null;
  topToken: string | null;
  color: string;
}

interface TypesTabProps {
  transactions: Transaction[];
  onTypeClick: (typeId: string) => void;
}

const typeConfig: Record<string, { label: string; icon: string; color: string; IconComponent: typeof ArrowUpRight }> = {
  income: { label: 'Income', icon: 'Income', color: '#0ecb81', IconComponent: ArrowDownLeft },
  expense: { label: 'Expense', icon: 'Expense', color: '#f6465d', IconComponent: ArrowUpRight },
  trade: { label: 'Trade', icon: 'Trade', color: '#0052ff', IconComponent: ArrowLeftRight },
  defi: { label: 'DeFi', icon: 'DeFi', color: '#b6509e', IconComponent: Landmark },
  staking: { label: 'Staking Reward', icon: 'Staking', color: '#f7931a', IconComponent: TrendingUp },
  gas: { label: 'Gas Fee', icon: 'Gas', color: '#8a8f98', IconComponent: Fuel },
};

/**
 * Full sidebar Types view: filter-bound 2×4 stats + table.
 * Stats track the same visible list as TypesSection (spam/$0).
 */
export function TypesTab({
  transactions,
  onTypeClick,
}: TypesTabProps) {
  const [filteredData, setFilteredData] = useState<TypeStats[]>([]);
  const [filtersReady, setFiltersReady] = useState(false);

  const handleFilteredDataChange = useCallback((data: TypeStats[]) => {
    setFiltersReady(true);
    setFilteredData(data);
  }, []);

  const statsTypes = filtersReady ? filteredData : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#f7f8f8] mb-1">Transaction Types</h2>
        <p className="text-sm text-[#8a8f98]">
          All transaction types and details per type
        </p>
      </div>
      <TypesPageFilterStats types={statsTypes} />
      <TypesSection
        transactions={transactions}
        onTypeClick={onTypeClick}
        onFilteredDataChange={handleFilteredDataChange}
      />
    </div>
  );
}

export function TypesSection({
  transactions,
  onTypeClick,
  onFilteredDataChange,
}: TypesSectionProps) {
  const showSpamAndDust = useUiPreferencesStore((s) => s.showSpamAndDust);
  const hasHiddenItems = useMemo(
    () => transactions.some((tx) => isHiddenSpamOrDustTx(tx, false)),
    [transactions],
  );
  const visibleTransactions = useMemo(
    () => filterVisibleTransactions(transactions, showSpamAndDust),
    [transactions, showSpamAndDust],
  );

  const typeStats = useMemo((): TypeStats[] => {
    const statsMap = new Map<string, TypeStats & { tokenCounts: Record<string, number> }>();

    visibleTransactions.forEach(tx => {
      const key = tx.type;
      const existing = statsMap.get(key);
      const config = typeConfig[key];

      if (existing) {
        existing.txCount++;
        existing.totalVolume += tx.value;
        if (isRevenueType(tx.type)) {
          existing.totalRevenue += tx.value;
        }
        if (isExpenseType(tx.type)) {
          existing.totalExpenses += tx.value;
        }
        existing.netFlow = existing.totalRevenue - existing.totalExpenses;
        if (!existing.lastTxDate || tx.date > existing.lastTxDate) {
          existing.lastTxDate = tx.date;
        }
        existing.tokenCounts[tx.token] = (existing.tokenCounts[tx.token] || 0) + 1;
      } else {
        const revenue = isRevenueType(tx.type) ? tx.value : 0;
        const expenses = isExpenseType(tx.type) ? tx.value : 0;
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

    statsMap.forEach(stats => {
      const sorted = Object.entries(stats.tokenCounts).sort(([, a], [, b]) => b - a);
      stats.topToken = sorted[0]?.[0] || null;
    });

    const result = Array.from(statsMap.values()).map(({ tokenCounts, ...rest }) => rest);
    result.sort((a, b) => b.txCount - a.txCount);

    return result;
  }, [visibleTransactions]);

  useEffect(() => {
    onFilteredDataChange?.(typeStats);
  }, [typeStats, onFilteredDataChange]);

  const {
    page,
    setPage,
    pageSize,
    pageItems: pagedTypes,
    totalItems,
  } = useTablePagination(typeStats);

  if (typeStats.length === 0) {
    return (
      <Card className="bg-[#0f1011] border-white/5">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-[#f7f8f8] text-base flex items-center gap-2">
                <Coins className="h-5 w-5 text-[#0052ff]" />
                Type
              </CardTitle>
              {hasHiddenItems && !showSpamAndDust ? (
                <p className="text-[10px] text-[#8a8f98] mt-1">spam & $0 hidden</p>
              ) : null}
            </div>
            <ShowSpamDustToggle compact />
          </div>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Coins className="h-10 w-10 text-[#28282c] mx-auto mb-3" />
          <p className="text-sm text-[#8a8f98]">
            {hasHiddenItems && !showSpamAndDust && visibleTransactions.length === 0
              ? 'No types to show'
              : 'No transactions yet'}
          </p>
          <p className="text-xs text-[#8a8f98]/60 mt-1">
            {hasHiddenItems && !showSpamAndDust && visibleTransactions.length === 0
              ? 'Enable Show spam & $0 if you expect dust'
              : 'Transaction types you interact with will appear here automatically'}
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
              <Coins className="h-5 w-5 text-[#0052ff]" />
              Type
            </CardTitle>
            {hasHiddenItems && !showSpamAndDust ? (
              <p className="text-[10px] text-[#8a8f98] mt-1">spam & $0 hidden</p>
            ) : null}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <ShowSpamDustToggle compact />
            <span className="text-xs text-[#8a8f98]">{typeStats.length} type</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Type</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Inflow</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Outflow</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Net Flow</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Volume</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Transactions</th>
                <th className="text-[#8a8f98] text-xs font-medium p-3 text-right">Last Tx</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {pagedTypes.map((ts) => {
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
                             ts.typeId === 'income' ? 'Cash inflow' :
                             ts.typeId === 'expense' ? 'Cash outflow' : ts.typeId}
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
