'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  FileSpreadsheet,
  Wallet,
  CircleDollarSign,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  type Transaction,
  type Client,
} from '@/lib/mock-data';
import { isExpenseType, isRevenueType } from '@/lib/finance/summary';
import {
  buildTransactionsReportPayload,
  downloadReportExcel,
  downloadReportPdf,
} from '@/lib/export/download-report';
import { captureExportCharts } from '@/lib/export/capture-chart';
import { buildAssetFilterStatsSummary } from '@/lib/export/filter-stats-summary';
import { usePortfolio } from '@/hooks/use-portfolio';
import { useActiveTransactions } from '@/hooks/use-active-transactions';
import { ColumnFilterTable } from './column-filter-table';
import { TransactionFilterStats } from './transaction-filter-stats';
import { AssetFlowChart } from './asset-flow-chart';
import { ActivityDonutChart } from './activity-donut-chart';
import { AIAnalysisSection } from './ai-analysis-section';
import { cn } from '@/lib/utils';

interface AssetDetailPageProps {
  assetId: string;
  onBack: () => void;
  clients?: Client[];
}

/** Deterministic accent color derived from the token symbol. */
function colorFromSymbol(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 60%, 50%)`;
}

export function AssetDetailPage({ assetId, onBack, clients = [] }: AssetDetailPageProps) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [filteredData, setFilteredData] = useState<Transaction[]>([]);
  /** False until ColumnFilterTable emits — chart falls back to assetTransactions. */
  const [filtersReady, setFiltersReady] = useState(false);

  const { portfolio } = usePortfolio();
  const allTransactions = useActiveTransactions();

  // Build the asset view from REAL portfolio holdings (aggregated across chains
  // for the same symbol). assetId is the token symbol passed from AssetsTable.
  const asset = useMemo(() => {
    const matching = (portfolio?.tokens || []).filter(t => t.symbol === assetId);
    if (matching.length === 0) return undefined;
    const quantity = matching.reduce((s, t) => s + t.balance, 0);
    const value = matching.reduce((s, t) => s + t.valueUsd, 0);
    return {
      id: assetId,
      symbol: assetId,
      name: matching[0].name || assetId,
      quantity,
      value,
      price: matching[0].priceUsd,
      change24h: matching[0].change24h ?? 0,
      icon: assetId.slice(0, 2).toUpperCase(),
      color: colorFromSymbol(assetId),
    };
  }, [portfolio, assetId]);

  const assetTransactions = useMemo(() => {
    if (!asset) return [];
    return allTransactions.filter(tx => tx.token === asset.symbol);
  }, [asset, allTransactions]);

  const handleFilteredDataChange = useCallback((data: Transaction[]) => {
    setFiltersReady(true);
    setFilteredData(data);
  }, []);

  const chartTransactions = filtersReady ? filteredData : assetTransactions;
  const statsTransactions = filtersReady ? filteredData : assetTransactions;

  const totalInflowQty = useMemo(
    () =>
      assetTransactions
        .filter(tx => isRevenueType(tx.type))
        .reduce((s, tx) => s + tx.quantity, 0),
    [assetTransactions],
  );
  const totalOutflowQty = useMemo(
    () =>
      assetTransactions
        .filter(tx => isExpenseType(tx.type))
        .reduce((s, tx) => s + tx.quantity, 0),
    [assetTransactions],
  );

  const formatQty = (value: number) => {
    if (value >= 1000) return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    if (value >= 1) return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  };

  const buildAssetSummary = useCallback(() => {
    if (!asset) return [];
    const change24h = asset.change24h;
    const changeSign = change24h >= 0 ? '+' : '';
    return [
      {
        label: 'Balance',
        value: `${formatQty(asset.quantity)} ${asset.symbol}`,
      },
      {
        label: 'Current Value (USD)',
        value: `$${asset.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      },
      {
        label: 'Total Inflow',
        value: `+${formatQty(totalInflowQty)} ${asset.symbol}`,
      },
      {
        label: 'Total Outflow',
        value: `-${formatQty(totalOutflowQty)} ${asset.symbol}`,
      },
      {
        label: '24h Change',
        value: `${changeSign}${change24h}%`,
      },
      ...buildAssetFilterStatsSummary(statsTransactions, clients),
    ];
  }, [asset, totalInflowQty, totalOutflowQty, statsTransactions, clients]);

  const handleDownloadExcel = useCallback(async () => {
    if (!asset) {
      toast.info('No asset data to export');
      return;
    }
    try {
      const payload = buildTransactionsReportPayload({
        title: `${asset.name} (${asset.symbol})`,
        subtitle: `Asset transactions · ${asset.symbol}`,
        filenameBase: `sentinel-asset-${asset.symbol.toLowerCase()}`,
        transactions: statsTransactions,
      });
      if (!payload) {
        toast.info('No transactions to export');
        return;
      }
      // Prefer on-screen card summary over auto totals (avoids duplicate Volume).
      payload.summary = buildAssetSummary();
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
  }, [asset, statsTransactions, buildAssetSummary]);

  const handleDownloadPdf = useCallback(async () => {
    if (!asset) {
      toast.info('No asset data to export');
      return;
    }
    try {
      const payload = buildTransactionsReportPayload({
        title: `${asset.name} (${asset.symbol})`,
        subtitle: `Asset transactions · ${asset.symbol}`,
        filenameBase: `sentinel-asset-${asset.symbol.toLowerCase()}`,
        transactions: statsTransactions,
      });
      if (!payload) {
        toast.info('No transactions to export');
        return;
      }
      payload.summary = buildAssetSummary();
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
  }, [asset, statsTransactions, buildAssetSummary]);

  if (!asset) {
    return (
      <div className="text-center py-20">
        <p className="text-[#8a8f98]">Asset not found</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>Back</Button>
      </div>
    );
  }

  const isPositive = asset.change24h >= 0;

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
              className="w-12 h-12 rounded-xl flex items-center justify-center text-xl"
              style={{ backgroundColor: `${asset.color}20` }}
            >
              {asset.icon}
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#f7f8f8]">{asset.name}</h2>
              <p className="text-xs text-[#8a8f98]">{asset.name} ({asset.symbol})</p>
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

      {/* Transactions Table for this Asset */}
      <Card className="bg-[#0f1011] border-white/5">
        <CardContent className="p-0">
          <div className="p-4 border-b border-white/5">
            <h3 className="text-sm font-medium text-[#f7f8f8]">Transactions of {asset.name}</h3>
            <p className="text-xs text-[#8a8f98] mt-0.5">
              All transactions related to {asset.symbol}
            </p>
          </div>
          <ColumnFilterTable
            transactions={assetTransactions}
            showTypeColumn={true}
            onFilteredDataChange={handleFilteredDataChange}
            clients={clients}
          />
        </CardContent>
      </Card>

      {/* Asset + filter metric chips: always 2×5, no orphan cells */}
      <div className="space-y-2">
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          <Card className="relative bg-[#0f1011] border-white/5 overflow-hidden min-h-[56px] min-w-0">
            <div className="absolute inset-0 pointer-events-none" style={{
              background: `radial-gradient(ellipse at top right, ${asset.color}18 0%, transparent 70%)`,
            }} />
            <CardContent className="p-1.5 sm:p-2.5 relative z-10">
              <div className="flex items-center gap-1 mb-0.5 sm:mb-1 min-w-0">
                <Wallet className="h-3 w-3 shrink-0" style={{ color: asset.color }} />
                <p className="text-[9px] sm:text-[10px] text-[#8a8f98] truncate">Balance</p>
              </div>
              <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f7f8f8] leading-tight truncate">
                {formatQty(asset.quantity)} {asset.symbol}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#0f1011] border-white/5 min-h-[56px] min-w-0">
            <CardContent className="p-1.5 sm:p-2.5">
              <div className="flex items-center gap-1 mb-0.5 sm:mb-1 min-w-0">
                <CircleDollarSign className="h-3 w-3 shrink-0" style={{ color: asset.color }} />
                <p className="text-[9px] sm:text-[10px] text-[#8a8f98] truncate">Current Value</p>
              </div>
              <p className="text-xs sm:text-sm font-semibold font-mono-num leading-tight truncate" style={{ color: asset.color }}>
                ${asset.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>

          <Card className="relative bg-[#0f1011] border-white/5 overflow-hidden min-h-[56px] min-w-0">
            <div className="absolute inset-0 pointer-events-none" style={{
              background: 'radial-gradient(ellipse at top right, rgba(14, 203, 129, 0.06) 0%, transparent 70%)',
            }} />
            <CardContent className="p-1.5 sm:p-2.5 relative z-10">
              <div className="flex items-center gap-1 mb-0.5 sm:mb-1 min-w-0">
                <ArrowDownLeft className="h-3 w-3 shrink-0 text-[#0ecb81]" />
                <p className="text-[9px] sm:text-[10px] text-[#8a8f98] truncate">Total Inflow</p>
              </div>
              <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#0ecb81] leading-tight truncate">
                +{formatQty(totalInflowQty)} {asset.symbol}
              </p>
            </CardContent>
          </Card>

          <Card className="relative bg-[#0f1011] border-white/5 overflow-hidden min-h-[56px] min-w-0">
            <div className="absolute inset-0 pointer-events-none" style={{
              background: 'radial-gradient(ellipse at top right, rgba(246, 70, 93, 0.06) 0%, transparent 70%)',
            }} />
            <CardContent className="p-1.5 sm:p-2.5 relative z-10">
              <div className="flex items-center gap-1 mb-0.5 sm:mb-1 min-w-0">
                <ArrowUpRight className="h-3 w-3 shrink-0 text-[#f6465d]" />
                <p className="text-[9px] sm:text-[10px] text-[#8a8f98] truncate">Total Outflow</p>
              </div>
              <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f6465d] leading-tight truncate">
                -{formatQty(totalOutflowQty)} {asset.symbol}
              </p>
            </CardContent>
          </Card>

          <Card className="relative bg-[#0f1011] border-white/5 overflow-hidden min-h-[56px] min-w-0">
            <div className="absolute inset-0 pointer-events-none" style={{
              background: `radial-gradient(ellipse at top right, ${isPositive ? 'rgba(14, 203, 129, 0.06)' : 'rgba(246, 70, 93, 0.06)'} 0%, transparent 70%)`,
            }} />
            <CardContent className="p-1.5 sm:p-2.5 relative z-10">
              <div className="flex items-center gap-1 mb-0.5 sm:mb-1 min-w-0">
                {isPositive ? (
                  <TrendingUp className="h-3 w-3 shrink-0 text-[#0ecb81]" />
                ) : (
                  <TrendingDown className="h-3 w-3 shrink-0 text-[#f6465d]" />
                )}
                <p className="text-[9px] sm:text-[10px] text-[#8a8f98] truncate">24h Change</p>
              </div>
              <p className={cn(
                'text-xs sm:text-sm font-semibold font-mono-num leading-tight truncate',
                isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
              )}>
                {isPositive ? '+' : ''}{asset.change24h}%
              </p>
            </CardContent>
          </Card>
        </div>

        <TransactionFilterStats transactions={statsTransactions} clients={clients} />
      </div>

      <AssetFlowChart
        transactions={chartTransactions}
        symbol={asset.symbol}
      />

      {/* Activity Mix + Network Mix — side-by-side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActivityDonutChart
          transactions={chartTransactions}
          contextLabel={asset.name}
          mode="activity"
        />
        <ActivityDonutChart
          transactions={chartTransactions}
          contextLabel={asset.name}
          mode="network"
        />
      </div>

      <AIAnalysisSection
        transactions={statsTransactions}
        sectionTitle={`Transactions of ${asset.name}`}
        sectionColor={asset.color}
        sectionType={'revenue' as const}
      />
    </div>
  );
}
