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
  Wallet,
  Copy,
  Check,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  UserPlus,
} from 'lucide-react';
import {
  type Client,
  type Transaction,
} from '@/lib/mock-data';
import { isExpenseType, isRevenueType } from '@/lib/finance/summary';
import { useActiveTransactions } from '@/hooks/use-active-transactions';
import { ColumnFilterTable } from './column-filter-table';
import { AIAnalysisSection } from './ai-analysis-section';
import { cn } from '@/lib/utils';

interface ClientDetailPageProps {
  client: Client;
  onBack: () => void;
  onDefineClient?: (address: string) => void;
}

export function ClientDetailPage({ client, onBack, onDefineClient }: ClientDetailPageProps) {
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [filteredData, setFilteredData] = useState<Transaction[]>([]);
  const allTransactions = useActiveTransactions();

  // Determine if this is an undefined/auto-generated client
  const isUndefined = client.id.startsWith('addr-0x');

  // Get all transactions with this client
  const clientTransactions = useMemo(() => {
    return allTransactions.filter(
      tx => tx.counterparty.toLowerCase() === client.address.toLowerCase()
    );
  }, [allTransactions, client.address]);

  // Calculate stats
  const totalRevenue = useMemo(() => {
    return clientTransactions
      .filter(tx => isRevenueType(tx.type))
      .reduce((sum, tx) => sum + tx.value, 0);
  }, [clientTransactions]);

  const totalExpenses = useMemo(() => {
    return clientTransactions
      .filter(tx => isExpenseType(tx.type))
      .reduce((sum, tx) => sum + tx.value, 0);
  }, [clientTransactions]);

  const totalVolume = useMemo(() => {
    return clientTransactions.reduce((sum, tx) => sum + tx.value, 0);
  }, [clientTransactions]);

  const netFlow = totalRevenue - totalExpenses;
  const isNetPositive = netFlow >= 0;

  // Most used token
  const topToken = useMemo(() => {
    const tokenCount: Record<string, number> = {};
    clientTransactions.forEach(tx => {
      tokenCount[tx.token] = (tokenCount[tx.token] || 0) + 1;
    });
    const sorted = Object.entries(tokenCount).sort(([, a], [, b]) => b - a);
    return sorted[0]?.[0] || '-';
  }, [clientTransactions]);

  // Most used network
  const topNetwork = useMemo(() => {
    const networkCount: Record<string, { count: number; label: string }> = {};
    clientTransactions.forEach(tx => {
      if (!networkCount[tx.network]) {
        networkCount[tx.network] = { count: 0, label: tx.networkLabel };
      }
      networkCount[tx.network].count++;
    });
    const sorted = Object.entries(networkCount).sort(([, a], [, b]) => b.count - a.count);
    return sorted[0]?.[1].label || '-';
  }, [clientTransactions]);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(client.address);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch {
      // Fallback
    }
  };

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
              className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center',
                isUndefined ? 'bg-[#8a8f98]/10' : ''
              )}
              style={!isUndefined ? { backgroundColor: `${client.color}15` } : undefined}
            >
              <Wallet
                className={cn('h-6 w-6', isUndefined && 'text-[#8a8f98]/50')}
                style={!isUndefined ? { color: client.color } : undefined}
              />
            </div>
            <div>
              <h2 className={cn('text-xl font-bold', isUndefined ? 'text-[#8a8f98]' : 'text-[#f7f8f8]')}>
                {client.name}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-[#8a8f98] font-mono" dir="ltr">
                  {client.address.slice(0, 10)}...{client.address.slice(-8)}
                </span>
                <button
                  className="p-1 rounded hover:bg-[#28282c] transition-colors"
                  onClick={copyAddress}
                  title="Copy address"
                >
                  {copiedAddress ? (
                    <Check className="h-3 w-3 text-[#0ecb81]" />
                  ) : (
                    <Copy className="h-3 w-3 text-[#8a8f98]" />
                  )}
                </button>
              </div>
              {client.notes && (
                <p className="text-[11px] text-[#8a8f98]/60 mt-0.5">{client.notes}</p>
              )}
              {isUndefined && (
                <p className="text-[10px] text-[#b6509e]/60 mt-0.5">This client is not yet defined</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isUndefined && onDefineClient && (
            <Button
              size="sm"
              className="bg-[#b6509e] hover:bg-[#b6509e]/80 text-white"
              onClick={() => onDefineClient(client.address)}
            >
              <UserPlus className="h-4 w-4 ml-1" />
              Define Client
            </Button>
          )}
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

      {/* Client Summary Cards */}
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

        {/* Total Volume */}
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <ArrowUpDown className="h-3.5 w-3.5 text-[#0052ff]" />
              <p className="text-[10px] text-[#8a8f98]">Volume</p>
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
              <FileText className="h-3.5 w-3.5 text-[#8a8f98]" />
              <p className="text-[10px] text-[#8a8f98]">Transactions</p>
            </div>
            <p className="text-lg font-bold font-mono-num text-[#f7f8f8]">
              {clientTransactions.length}
            </p>
          </CardContent>
        </Card>

        {/* Top Token */}
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Wallet className="h-3.5 w-3.5 text-[#f7931a]" />
              <p className="text-[10px] text-[#8a8f98]">Top Token</p>
            </div>
            <p className="text-lg font-bold font-mono-num text-[#f7f8f8]">
              {topToken}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Table */}
      <Card className="bg-[#0f1011] border-white/5">
        <CardContent className="p-0">
          <div className="p-4 border-b border-white/5">
            <h3 className="text-sm font-medium text-[#f7f8f8]">Transactions of {client.name}</h3>
            <p className="text-xs text-[#8a8f98] mt-0.5">
              All transactions with this client
            </p>
          </div>
          <ColumnFilterTable
            transactions={clientTransactions}
            showTypeColumn={true}
            onFilteredDataChange={handleFilteredDataChange}
          />
        </CardContent>
      </Card>

      {/* AI Analysis */}
      <AIAnalysisSection
        transactions={filteredData}
        sectionTitle={`Transactions of ${client.name}`}
        sectionColor={client.color}
        sectionType={isNetPositive ? 'revenue' : 'expenses'}
      />
    </div>
  );
}
