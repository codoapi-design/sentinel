'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  FileText,
  FileSpreadsheet,
  Globe,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  networks,
  type Client,
  type Transaction,
} from '@/lib/mock-data';
import { isExpenseType, isRevenueType } from '@/lib/finance/summary';
import {
  buildTransactionsReportPayload,
  downloadReportExcel,
  downloadReportPdf,
  type ReportKV,
} from '@/lib/export/download-report';
import { captureExportCharts } from '@/lib/export/capture-chart';
import { buildNetworkFilterStatsSummary } from '@/lib/export/filter-stats-summary';
import { useActiveTransactions } from '@/hooks/use-active-transactions';
import { usePortfolio, type PortfolioToken } from '@/hooks/use-portfolio';
import { CHAIN_IDS, CHAIN_NAMES } from '@/lib/blockchain/types';
import { filterVisibleAssets } from '@/lib/finance/visibility';
import { useUiPreferencesStore } from '@/stores/ui-preferences-store';
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

function tokenMatchesNetwork(token: PortfolioToken, networkId: string): boolean {
  const id = networkId.toLowerCase().trim();
  const chain = (token.chain || '').toLowerCase().trim();

  if (chain && chain === id) return true;

  const expectedChainId = CHAIN_IDS[id];
  if (expectedChainId != null && token.chainId === expectedChainId) return true;

  if (token.chainId != null) {
    const nameFromId = CHAIN_NAMES[token.chainId]?.toLowerCase();
    if (nameFromId && nameFromId === id) return true;
  }

  return false;
}

export function NetworkDetailPage({
  networkId,
  onBack,
  clients = [],
}: NetworkDetailPageProps) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [filteredData, setFilteredData] = useState<Transaction[]>([]);
  /** False until ColumnFilterTable emits — charts fall back to networkTransactions. */
  const [filtersReady, setFiltersReady] = useState(false);
  const allTransactions = useActiveTransactions();
  const { portfolio } = usePortfolio();
  const showSpamAndDust = useUiPreferencesStore(s => s.showSpamAndDust);

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

  const holdingsSummary = useMemo((): ReportKV[] => {
    const raw = (portfolio?.tokens || []).filter(t =>
      tokenMatchesNetwork(t, networkId),
    );
    const visible = filterVisibleAssets(raw, showSpamAndDust);
    const totalUsd = visible.reduce((s, t) => s + (t.valueUsd || 0), 0);
    const bySymbol = new Map<string, number>();
    for (const t of visible) {
      const symbol = (t.symbol || 'Unknown').trim() || 'Unknown';
      bySymbol.set(symbol, (bySymbol.get(symbol) || 0) + (t.valueUsd || 0));
    }
    const top = Array.from(bySymbol.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([sym, usd]) => `${sym} $${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
      .join(' · ');

    return [
      {
        label: `Holdings on ${networkLabel}`,
        value: `$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      },
      {
        label: 'Top holdings',
        value: top || 'No assets on this network',
      },
    ];
  }, [portfolio?.tokens, networkId, showSpamAndDust, networkLabel]);

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

  const buildSummary = useCallback(
    () => [
      ...holdingsSummary,
      ...buildNetworkFilterStatsSummary(statsTransactions, clients),
    ],
    [holdingsSummary, statsTransactions, clients],
  );

  const handleDownloadExcel = useCallback(async () => {
    try {
      const payload = buildTransactionsReportPayload({
        title: `Network · ${networkLabel}`,
        subtitle: `Transactions on ${networkLabel}`,
        filenameBase: `sentinel-network-${networkId}`,
        transactions: statsTransactions,
      });
      if (!payload) {
        toast.info('No transactions to export');
        return;
      }
      payload.summary = buildSummary();
      const charts = await captureExportCharts(pageRef.current, {
        background: '#0f1011',
      });
      if (charts.length > 0) {
        payload.charts = charts;
      }
      downloadReportExcel(payload);
      toast.success(
        charts.length > 0
          ? 'Excel report downloaded (with charts)'
          : 'Excel report downloaded',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export Excel');
    }
  }, [networkLabel, networkId, statsTransactions, buildSummary]);

  const handleDownloadPdf = useCallback(async () => {
    try {
      const payload = buildTransactionsReportPayload({
        title: `Network · ${networkLabel}`,
        subtitle: `Transactions on ${networkLabel}`,
        filenameBase: `sentinel-network-${networkId}`,
        transactions: statsTransactions,
      });
      if (!payload) {
        toast.info('No transactions to export');
        return;
      }
      payload.summary = buildSummary();
      const charts = await captureExportCharts(pageRef.current, {
        background: '#0f1011',
      });
      if (charts.length > 0) {
        payload.charts = charts;
      }
      downloadReportPdf(payload);
      toast.success(
        charts.length > 0
          ? 'PDF report downloaded (with charts)'
          : 'PDF report downloaded',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export PDF');
    }
  }, [networkLabel, networkId, statsTransactions, buildSummary]);

  return (
    <div className="space-y-6" ref={pageRef}>
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
            onClick={() => void handleDownloadPdf()}
          >
            <FileText className="h-4 w-4 ml-1" />
            Download PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="bg-[#191a1b] border-white/5 text-[#d0d6e0] hover:bg-[#28282c] hover:text-[#f7f8f8]"
            onClick={() => void handleDownloadExcel()}
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
