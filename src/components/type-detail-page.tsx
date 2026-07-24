'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
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
  Coins,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  type Transaction,
} from '@/lib/mock-data';
import { isExpenseType, isRevenueType } from '@/lib/finance/summary';
import {
  buildTransactionsReportPayload,
  downloadReportExcel,
  downloadReportPdf,
} from '@/lib/export/download-report';
import { captureExportCharts } from '@/lib/export/capture-chart';
import { buildTypeFilterStatsSummary } from '@/lib/export/filter-stats-summary';
import { useActiveTransactions } from '@/hooks/use-active-transactions';
import { ColumnFilterTable } from './column-filter-table';
import { TypeTransactionFilterStats } from './transaction-filter-stats';
import { TypeVolumeChart } from './type-volume-chart';
import { ActivityDonutChart } from './activity-donut-chart';
import { AIAnalysisSection } from './ai-analysis-section';

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
  const pageRef = useRef<HTMLDivElement>(null);
  const [filteredData, setFilteredData] = useState<Transaction[]>([]);
  /** False until ColumnFilterTable emits — charts fall back to typeTransactions. */
  const [filtersReady, setFiltersReady] = useState(false);
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

  const chartTransactions = filtersReady ? filteredData : typeTransactions;
  const statsTransactions = filtersReady ? filteredData : typeTransactions;

  const isNetPositive = useMemo(() => {
    let revenue = 0;
    let expense = 0;
    for (const tx of statsTransactions) {
      if (isRevenueType(tx.type)) revenue += tx.value;
      if (isExpenseType(tx.type)) expense += tx.value;
    }
    return revenue - expense >= 0;
  }, [statsTransactions]);

  const handleFilteredDataChange = useCallback((data: Transaction[]) => {
    setFiltersReady(true);
    setFilteredData(data);
  }, []);

  const handleDownloadExcel = useCallback(async () => {
    try {
      const payload = buildTransactionsReportPayload({
        title: `Type · ${typeLabel}`,
        subtitle: typeDescription,
        filenameBase: `sentinel-type-${typeId}`,
        transactions: statsTransactions,
      });
      if (!payload) {
        toast.info('No transactions to export');
        return;
      }
      payload.summary = buildTypeFilterStatsSummary(statsTransactions);
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
  }, [typeLabel, typeDescription, typeId, statsTransactions]);

  const handleDownloadPdf = useCallback(async () => {
    try {
      const payload = buildTransactionsReportPayload({
        title: `Type · ${typeLabel}`,
        subtitle: typeDescription,
        filenameBase: `sentinel-type-${typeId}`,
        transactions: statsTransactions,
      });
      if (!payload) {
        toast.info('No transactions to export');
        return;
      }
      payload.summary = buildTypeFilterStatsSummary(statsTransactions);
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
  }, [typeLabel, typeDescription, typeId, statsTransactions]);

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

      {/* Filter-bound type stats (same set as table) */}
      <TypeTransactionFilterStats transactions={statsTransactions} />

      {/* Type volume over time — single series (not Inflow/Outflow/Net) */}
      <TypeVolumeChart
        transactions={chartTransactions}
        typeId={typeId}
        typeLabel={typeLabel}
      />

      {/* Token Mix + Network Mix — side-by-side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActivityDonutChart
          transactions={chartTransactions}
          contextLabel={typeLabel}
          mode="token"
        />
        <ActivityDonutChart
          transactions={chartTransactions}
          contextLabel={typeLabel}
          mode="network"
        />
      </div>

      {/* AI Analysis */}
      <AIAnalysisSection
        transactions={statsTransactions}
        sectionTitle={`Transactions of ${typeLabel}`}
        sectionColor={typeColor}
        sectionType={isNetPositive ? 'revenue' : 'expenses'}
      />
    </div>
  );
}
