'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  FileSpreadsheet,
  Globe,
  Fuel,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import {
  networks,
  type Transaction,
} from '@/lib/mock-data';
import { isExpenseType, isRevenueType } from '@/lib/finance/summary';
import { useActiveTransactions } from '@/hooks/use-active-transactions';
import { ColumnFilterTable } from './column-filter-table';
import { AIAnalysisSection } from './ai-analysis-section';
import { cn } from '@/lib/utils';

const networkColors: Record<string, string> = {
  ethereum: '#627eea',
  base: '#0052ff',
  arbitrum: '#28a0f0',
  optimism: '#ff0420',
  bsc: '#f0b90b',
};

interface NetworkDetailPageProps {
  networkId: string;
  onBack: () => void;
}

export function NetworkDetailPage({ networkId, onBack }: NetworkDetailPageProps) {
  const [filteredData, setFilteredData] = useState<Transaction[]>([]);
  const allTransactions = useActiveTransactions();

  const networkInfo = useMemo(() => {
    return networks.find(n => n.value === networkId);
  }, [networkId]);

  const networkColor = networkColors[networkId] || '#8a8f98';
  const networkLabel = networkInfo?.label || networkId;

  // Get all transactions on this network
  const networkTransactions = useMemo(() => {
    return allTransactions.filter(
      tx => tx.network === networkId
    );
  }, [allTransactions, networkId]);

  // Calculate stats
  const totalRevenue = useMemo(() => {
    return networkTransactions
      .filter(tx => isRevenueType(tx.type))
      .reduce((sum, tx) => sum + tx.value, 0);
  }, [networkTransactions]);

  const totalExpenses = useMemo(() => {
    return networkTransactions
      .filter(tx => isExpenseType(tx.type))
      .reduce((sum, tx) => sum + tx.value, 0);
  }, [networkTransactions]);

  const gasFees = useMemo(() => {
    // Prefer dedicated gas-type rows; otherwise 0 on UI tx model (full gas USD is on portfolio cards)
    return networkTransactions
      .filter(tx => tx.type === 'gas')
      .reduce((sum, tx) => sum + tx.value, 0);
  }, [networkTransactions]);

  const totalVolume = useMemo(() => {
    return networkTransactions.reduce((sum, tx) => sum + tx.value, 0);
  }, [networkTransactions]);

  const netFlow = totalRevenue - totalExpenses;
  const isNetPositive = netFlow >= 0;

  // Most used token
  const topToken = useMemo(() => {
    const tokenCount: Record<string, number> = {};
    networkTransactions.forEach(tx => {
      tokenCount[tx.token] = (tokenCount[tx.token] || 0) + 1;
    });
    const sorted = Object.entries(tokenCount).sort(([, a], [, b]) => b - a);
    return sorted[0]?.[0] || '-';
  }, [networkTransactions]);

  // Unique counterparties count
  const uniqueCounterparties = useMemo(() => {
    const set = new Set(networkTransactions.map(tx => tx.counterparty.toLowerCase()));
    return set.size;
  }, [networkTransactions]);

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
              style={{ backgroundColor: `${networkColor}15` }}
            >
              <Globe className="h-6 w-6" style={{ color: networkColor }} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#f7f8f8]">{networkLabel}</h2>
              <p className="text-xs text-[#8a8f98]">{networkLabel}</p>
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

      {/* Network Summary Cards */}
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

        {/* Gas Fees */}
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Fuel className="h-3.5 w-3.5 text-[#f7931a]" />
              <p className="text-[10px] text-[#8a8f98]">Gas Fees</p>
            </div>
            <p className="text-lg font-bold font-mono-num text-[#f7931a]">
              ${formatNumber(gasFees)}
            </p>
          </CardContent>
        </Card>

        {/* Transaction Count */}
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <ArrowUpDown className="h-3.5 w-3.5 text-[#0052ff]" />
              <p className="text-[10px] text-[#8a8f98]">Transactions</p>
            </div>
            <p className="text-lg font-bold font-mono-num text-[#f7f8f8]">
              {networkTransactions.length}
            </p>
          </CardContent>
        </Card>

        {/* Counterparties */}
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Wallet className="h-3.5 w-3.5 text-[#b6509e]" />
              <p className="text-[10px] text-[#8a8f98]">Counterparties</p>
            </div>
            <p className="text-lg font-bold font-mono-num text-[#f7f8f8]">
              {uniqueCounterparties}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Table */}
      <Card className="bg-[#0f1011] border-white/5">
        <CardContent className="p-0">
          <div className="p-4 border-b border-white/5">
            <h3 className="text-sm font-medium text-[#f7f8f8]">Transactions of {networkLabel}</h3>
            <p className="text-xs text-[#8a8f98] mt-0.5">
              All transactions on {networkLabel}
            </p>
          </div>
          <ColumnFilterTable
            transactions={networkTransactions}
            showTypeColumn={true}
            onFilteredDataChange={handleFilteredDataChange}
          />
        </CardContent>
      </Card>

      {/* AI Analysis */}
      <AIAnalysisSection
        transactions={filteredData}
        sectionTitle={`Transactions of ${networkLabel}`}
        sectionColor={networkColor}
        sectionType={isNetPositive ? 'revenue' : 'expenses'}
      />
    </div>
  );
}
