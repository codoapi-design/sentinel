'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  FileText,
  FileSpreadsheet,
  Landmark,
  Fuel,
  TrendingUp,
  TrendingDown,
  Coins,
  Globe,
  Users,
} from 'lucide-react';
import {
  type Transaction,
} from '@/lib/mock-data';
import { isExpenseType, isRevenueType } from '@/lib/finance/summary';
import { useActiveTransactions } from '@/hooks/use-active-transactions';
import { ColumnFilterTable } from './column-filter-table';
import { AIAnalysisSection } from './ai-analysis-section';
import { cn } from '@/lib/utils';

const typeConfig: Record<string, {
  label: string;
  color: string;
  description: string;
  IconComponent: typeof ArrowUpRight;
}> = {
  income: {
    label: 'Income',
    color: '#0ecb81',
    description: 'Incoming revenue to the wallet',
    IconComponent: ArrowDownLeft,
  },
  expense: {
    label: 'Expense',
    color: '#f6465d',
    description: 'Outgoing expenses from the wallet',
    IconComponent: ArrowUpRight,
  },
  trade: {
    label: 'Trade',
    color: '#0052ff',
    description: 'Token swaps and trade transactions',
    IconComponent: ArrowLeftRight,
  },
  defi: {
    label: 'DeFi',
    color: '#b6509e',
    description: 'Decentralized finance transactions',
    IconComponent: Landmark,
  },
  staking: {
    label: 'Staking Reward',
    color: '#f7931a',
    description: 'Staking rewards',
    IconComponent: TrendingUp,
  },
  gas: {
    label: 'Gas Fee',
    color: '#8a8f98',
    description: 'Transaction network fees',
    IconComponent: Fuel,
  },
};

interface TypeDetailPageProps {
  typeId: string;
  onBack: () => void;
}

export function TypeDetailPage({ typeId, onBack }: TypeDetailPageProps) {
  const [filteredData, setFilteredData] = useState<Transaction[]>([]);
  const allTransactions = useActiveTransactions();

  const config = typeConfig[typeId];
  const typeColor = config?.color || '#8a8f98';
  const typeLabel = config?.label || typeId;
  const typeDescription = config?.description || typeId;
  const IconComp = config?.IconComponent || Coins;

  // Get all transactions of this type
  const typeTransactions = useMemo(() => {
    return allTransactions.filter(
      tx => tx.type === typeId
    );
  }, [allTransactions, typeId]);

  // Calculate stats
  const totalRevenue = useMemo(() => {
    return typeTransactions
      .filter(tx => isRevenueType(tx.type))
      .reduce((sum, tx) => sum + tx.value, 0);
  }, [typeTransactions]);

  const totalExpenses = useMemo(() => {
    return typeTransactions
      .filter(tx => isExpenseType(tx.type))
      .reduce((sum, tx) => sum + tx.value, 0);
  }, [typeTransactions]);

  const totalVolume = useMemo(() => {
    return typeTransactions.reduce((sum, tx) => sum + tx.value, 0);
  }, [typeTransactions]);

  const netFlow = totalRevenue - totalExpenses;
  const isNetPositive = netFlow >= 0;

  // Most used token
  const topToken = useMemo(() => {
    const tokenCount: Record<string, number> = {};
    typeTransactions.forEach(tx => {
      tokenCount[tx.token] = (tokenCount[tx.token] || 0) + 1;
    });
    const sorted = Object.entries(tokenCount).sort(([, a], [, b]) => b - a);
    return sorted[0]?.[0] || '-';
  }, [typeTransactions]);

  // Most used network
  const topNetwork = useMemo(() => {
    const networkCount: Record<string, { count: number; label: string }> = {};
    typeTransactions.forEach(tx => {
      if (!networkCount[tx.network]) {
        networkCount[tx.network] = { count: 0, label: tx.networkLabel };
      }
      networkCount[tx.network].count++;
    });
    const sorted = Object.entries(networkCount).sort(([, a], [, b]) => b.count - a.count);
    return sorted[0]?.[1].label || '-';
  }, [typeTransactions]);

  // Unique counterparties count
  const uniqueCounterparties = useMemo(() => {
    const set = new Set(typeTransactions.map(tx => tx.counterparty.toLowerCase()));
    return set.size;
  }, [typeTransactions]);

  // Average transaction value
  const avgValue = useMemo(() => {
    if (typeTransactions.length === 0) return 0;
    return totalVolume / typeTransactions.length;
  }, [typeTransactions, totalVolume]);

  const handleFilteredDataChange = useCallback((data: Transaction[]) => {
    setFilteredData(data);
  }, []);

  const formatNumber = (num: number, decimals: number = 2) => {
    return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-lg bg-[#0f1011] border border-white/5 flex items-center justify-center hover:bg-[#191a1b] transition-colors"
          >
            <ArrowRight className="h-4 w-4 text-[#8a8f98]" />
          </button>
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${typeColor}15` }}
            >
              <IconComp className="h-6 w-6" style={{ color: typeColor }} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#f7f8f8]">{typeLabel}</h2>
              <p className="text-xs text-[#8a8f98]">{typeDescription}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="bg-[#191a1b] border-white/5 text-[#d0d6e0] hover:bg-[#28282c] hover:text-[#f7f8f8]"
          >
            <FileText className="h-4 w-4 ml-1" />
            Download PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="bg-[#191a1b] border-white/5 text-[#d0d6e0] hover:bg-[#28282c] hover:text-[#f7f8f8]"
          >
            <FileSpreadsheet className="h-4 w-4 ml-1" />
            Download Excel
          </Button>
        </div>
      </div>

      {/* Type Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Revenue */}
        <Card className="bg-[#0f1011] border-white/5 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" style={{
            background: `radial-gradient(ellipse at top right, rgba(14, 203, 129, 0.06) 0%, transparent 70%)`,
          }} />
          <CardContent className="p-4 relative z-10">
            <div className="flex items-center gap-1.5 mb-2">
              <ArrowDownLeft className="h-3.5 w-3.5 text-[#0ecb81]" />
              <p className="text-[10px] text-[#8a8f98]">Revenue</p>
            </div>
            <p className="text-lg font-bold font-mono-num text-[#0ecb81]">
              ${formatNumber(totalRevenue)}
            </p>
          </CardContent>
        </Card>

        {/* Total Expenses */}
        <Card className="bg-[#0f1011] border-white/5 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" style={{
            background: `radial-gradient(ellipse at top right, rgba(246, 70, 93, 0.06) 0%, transparent 70%)`,
          }} />
          <CardContent className="p-4 relative z-10">
            <div className="flex items-center gap-1.5 mb-2">
              <ArrowUpRight className="h-3.5 w-3.5 text-[#f6465d]" />
              <p className="text-[10px] text-[#8a8f98]">Expense</p>
            </div>
            <p className="text-lg font-bold font-mono-num text-[#f6465d]">
              ${formatNumber(totalExpenses)}
            </p>
          </CardContent>
        </Card>

        {/* Net Flow */}
        <Card className="bg-[#0f1011] border-white/5 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" style={{
            background: `radial-gradient(ellipse at top right, ${isNetPositive ? 'rgba(14, 203, 129, 0.06)' : 'rgba(246, 70, 93, 0.06)'} 0%, transparent 70%)`,
          }} />
          <CardContent className="p-4 relative z-10">
            <div className="flex items-center gap-1.5 mb-2">
              {isNetPositive ? (
                <TrendingUp className="h-3.5 w-3.5 text-[#0ecb81]" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-[#f6465d]" />
              )}
              <p className="text-[10px] text-[#8a8f98]">Net Flow</p>
            </div>
            <p className={cn(
              'text-lg font-bold font-mono-num',
              isNetPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
            )}>
              {isNetPositive ? '+' : ''}${formatNumber(netFlow)}
            </p>
          </CardContent>
        </Card>

        {/* Volume */}
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Coins className="h-3.5 w-3.5 text-[#0052ff]" />
              <p className="text-[10px] text-[#8a8f98]">Total Volume</p>
            </div>
            <p className="text-lg font-bold font-mono-num text-[#0052ff]">
              ${formatNumber(totalVolume)}
            </p>
          </CardContent>
        </Card>

        {/* Transaction Count */}
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <ArrowLeftRight className="h-3.5 w-3.5 text-[#8a8f98]" />
              <p className="text-[10px] text-[#8a8f98]">Transactions</p>
            </div>
            <p className="text-lg font-bold font-mono-num text-[#f7f8f8]">
              {typeTransactions.length}
            </p>
          </CardContent>
        </Card>

        {/* Average Value */}
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Globe className="h-3.5 w-3.5 text-[#b6509e]" />
              <p className="text-[10px] text-[#8a8f98]">Avg Value</p>
            </div>
            <p className="text-lg font-bold font-mono-num text-[#f7f8f8]">
              ${formatNumber(avgValue)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* Top Token */}
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Coins className="h-3.5 w-3.5 text-[#f7931a]" />
              <p className="text-[10px] text-[#8a8f98]">Most Used Token</p>
            </div>
            <p className="text-base font-bold text-[#f7f8f8]">
              {topToken}
            </p>
          </CardContent>
        </Card>

        {/* Top Network */}
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Globe className="h-3.5 w-3.5 text-[#627eea]" />
              <p className="text-[10px] text-[#8a8f98]">Most Used Network</p>
            </div>
            <p className="text-base font-bold text-[#f7f8f8]">
              {topNetwork}
            </p>
          </CardContent>
        </Card>

        {/* Counterparties */}
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Users className="h-3.5 w-3.5 text-[#b6509e]" />
              <p className="text-[10px] text-[#8a8f98]">Counterparties</p>
            </div>
            <p className="text-base font-bold text-[#f7f8f8]">
              {uniqueCounterparties}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Table */}
      <Card className="bg-[#0f1011] border-white/5">
        <CardContent className="p-0">
          <div className="p-4 border-b border-white/5">
            <h3 className="text-sm font-medium text-[#f7f8f8]">Transactions of {typeLabel}</h3>
            <p className="text-xs text-[#8a8f98] mt-0.5">
              All transactions of type {typeLabel}
            </p>
          </div>
          <ColumnFilterTable
            transactions={typeTransactions}
            showTypeColumn={true}
            onFilteredDataChange={handleFilteredDataChange}
          />
        </CardContent>
      </Card>

      {/* AI Analysis */}
      <AIAnalysisSection
        transactions={filteredData}
        sectionTitle={`Transactions of ${typeLabel}`}
        sectionColor={typeColor}
        sectionType={isNetPositive ? 'revenue' : 'expenses'}
      />
    </div>
  );
}
