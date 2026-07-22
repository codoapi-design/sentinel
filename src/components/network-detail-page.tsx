'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  FileText,
  FileSpreadsheet,
  Globe,
} from 'lucide-react';
import {
  networks,
  type Client,
  type Transaction,
} from '@/lib/mock-data';
import { isExpenseType, isRevenueType } from '@/lib/finance/summary';
import { useActiveTransactions } from '@/hooks/use-active-transactions';
import { ColumnFilterTable } from './column-filter-table';
import { NetworkTransactionFilterStats } from './transaction-filter-stats';
import { RelationshipPerformanceChart } from './relationship-performance-chart';
import { ActivityDonutChart } from './activity-donut-chart';
import { AIAnalysisSection } from './ai-analysis-section';
import { NetworkHoldingsSummary } from './network-holdings-summary';

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
  clients?: Client[];
}

export function NetworkDetailPage({
  networkId,
  onBack,
  clients = [],
}: NetworkDetailPageProps) {
  const [filteredData, setFilteredData] = useState<Transaction[]>([]);
  /** False until ColumnFilterTable emits — charts fall back to networkTransactions. */
  const [filtersReady, setFiltersReady] = useState(false);
  const allTransactions = useActiveTransactions();

  const networkInfo = useMemo(() => {
    return networks.find(n => n.value === networkId);
  }, [networkId]);

  const networkColor = networkColors[networkId] || '#8a8f98';
  const networkLabel = networkInfo?.label || networkId;

  const networkTransactions = useMemo(() => {
    return allTransactions.filter(
      tx => tx.network === networkId
    );
  }, [allTransactions, networkId]);

  const chartTransactions = filtersReady ? filteredData : networkTransactions;
  const statsTransactions = filtersReady ? filteredData : networkTransactions;

  const isNetPositive = useMemo(() => {
    const revenue = statsTransactions
      .filter(tx => isRevenueType(tx.type))
      .reduce((sum, tx) => sum + tx.value, 0);
    const expenses = statsTransactions
      .filter(tx => isExpenseType(tx.type))
      .reduce((sum, tx) => sum + tx.value, 0);
    return revenue - expenses >= 0;
  }, [statsTransactions]);

  const handleFilteredDataChange = useCallback((data: Transaction[]) => {
    setFiltersReady(true);
    setFilteredData(data);
  }, []);

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

      {/* Current holdings on this network (live positions, not txs) */}
      <NetworkHoldingsSummary
        networkId={networkId}
        networkLabel={networkLabel}
      />

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
            clients={clients}
          />
        </CardContent>
      </Card>

      {/* Filter-bound network stats (same set as table) */}
      <NetworkTransactionFilterStats
        transactions={statsTransactions}
        clients={clients}
      />

      {/* Network Flow — shared chart with Asset / Client Details */}
      <RelationshipPerformanceChart
        transactions={chartTransactions}
        title={`Network Flow · ${networkLabel}`}
        subtitle="Cumulative inflow, outflow, net & volume · values in USD"
        methodology="Based on filtered transactions on this network from synced wallet data."
      />

      {/* Activity Mix donut — network personality */}
      <ActivityDonutChart
        transactions={chartTransactions}
        contextLabel={networkLabel}
      />

      {/* AI Analysis */}
      <AIAnalysisSection
        transactions={statsTransactions}
        sectionTitle={`Transactions of ${networkLabel}`}
        sectionColor={networkColor}
        sectionType={isNetPositive ? 'revenue' : 'expenses'}
      />
    </div>
  );
}
