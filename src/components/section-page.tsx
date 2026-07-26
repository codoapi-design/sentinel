'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowRight,
  FileText,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  Wallet,
  Fuel,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  type Transaction,
  type Client,
} from '@/lib/mock-data';
import { isExpenseType, isRevenueType } from '@/lib/finance/summary';
import {
  SUMMARY_INFLOW,
  SUMMARY_OUTFLOW,
  SUMMARY_TOTAL_INFLOW,
  SUMMARY_TOTAL_OUTFLOW,
} from '@/lib/finance/labels';
import {
  buildTransactionsReportPayload,
  downloadReportExcel,
  downloadReportPdf,
} from '@/lib/export/download-report';
import { captureExportCharts } from '@/lib/export/capture-chart';
import { useActiveTransactions } from '@/hooks/use-active-transactions';
import { ColumnFilterTable } from './column-filter-table';
import { AIAnalysisSection } from './ai-analysis-section';
import { CashflowChart } from './cashflow-chart';
import type { CashflowMetric } from '@/lib/finance/cashflow-history';

interface SectionPageProps {
  sectionType: 'revenue' | 'expenses' | 'flow' | 'gas';
  onBack: () => void;
  clients?: Client[];
}

const sectionConfig = {
  revenue: {
    title: SUMMARY_INFLOW,
    totalLabel: SUMMARY_TOTAL_INFLOW,
    color: '#0ecb81',
    bgColor: 'rgba(14, 203, 129, 0.1)',
    icon: TrendingUp,
    gradient: 'from-[#0ecb81] to-[#0a9e65]',
    description: 'Income and staking rewards (USD cash in)',
  },
  expenses: {
    title: SUMMARY_OUTFLOW,
    totalLabel: SUMMARY_TOTAL_OUTFLOW,
    color: '#f6465d',
    bgColor: 'rgba(246, 70, 93, 0.1)',
    icon: TrendingDown,
    gradient: 'from-[#f6465d] to-[#c73048]',
    description: 'Outgoing transfers classified as expenses (trades/gas excluded)',
  },
  flow: {
    title: 'Net Flow',
    totalLabel: 'Net Flow',
    color: '#0052ff',
    bgColor: 'rgba(0, 82, 255, 0.1)',
    icon: Wallet,
    gradient: 'from-[#0052ff] to-[#0036cc]',
    description: 'Inflow − Outflow (gas not deducted)',
  },
  gas: {
    title: 'Gas Fees',
    totalLabel: 'Total Gas Fees',
    color: '#f7931a',
    bgColor: 'rgba(247, 147, 26, 0.1)',
    icon: Fuel,
    gradient: 'from-[#f7931a] to-[#d07812]',
    description: 'Network fees paid (shown separately from cash flow)',
  },
};

const SECTION_TO_METRIC: Record<SectionPageProps['sectionType'], CashflowMetric> = {
  revenue: 'revenue',
  expenses: 'expenses',
  flow: 'netFlow',
  gas: 'gas',
};

export function SectionPage({ sectionType, onBack, clients = [] }: SectionPageProps) {
  const config = sectionConfig[sectionType];
  const Icon = config.icon;
  const pageRef = useRef<HTMLDivElement>(null);
  const chartCaptureRef = useRef<HTMLDivElement>(null);

  const allTransactions = useActiveTransactions();

  const sectionTransactions = useMemo(() => {
    if (sectionType === 'revenue') {
      return allTransactions.filter(tx => isRevenueType(tx.type));
    }
    if (sectionType === 'expenses') {
      return allTransactions.filter(tx => isExpenseType(tx.type));
    }
    if (sectionType === 'flow') {
      return allTransactions.filter(tx => isRevenueType(tx.type) || isExpenseType(tx.type));
    }
    if (sectionType === 'gas') {
      return allTransactions.filter(tx => tx.type === 'gas');
    }
    return allTransactions;
  }, [allTransactions, sectionType]);

  const totalValue = useMemo(() => {
    if (sectionType === 'flow') {
      return sectionTransactions.reduce(
        (sum, tx) => sum + (isRevenueType(tx.type) ? tx.value : -tx.value),
        0,
      );
    }
    return sectionTransactions.reduce((sum, tx) => sum + tx.value, 0);
  }, [sectionTransactions, sectionType]);

  const [filteredData, setFilteredData] = useState<Transaction[]>(sectionTransactions);

  const handleFilteredDataChange = useCallback((data: Transaction[]) => {
    setFilteredData(data);
  }, []);

  const buildExportPayload = useCallback(() => {
    const filteredTotal =
      sectionType === 'flow'
        ? filteredData.reduce(
            (sum, tx) => sum + (isRevenueType(tx.type) ? tx.value : -tx.value),
            0,
          )
        : filteredData.reduce((sum, tx) => sum + tx.value, 0);
    return buildTransactionsReportPayload({
      title: config.title,
      subtitle: config.description,
      filenameBase: `sentinel-${sectionType}`,
      transactions: filteredData,
      clients,
      extraSummary: [
        {
          label: config.totalLabel,
          value: `$${filteredTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        },
      ],
    });
  }, [config, sectionType, filteredData, clients]);

  const handleDownloadExcel = useCallback(async () => {
    try {
      const payload = buildExportPayload();
      if (!payload) {
        toast.info('No transactions to export');
        return;
      }
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
  }, [buildExportPayload]);

  const handleDownloadPdf = useCallback(async () => {
    try {
      const payload = buildExportPayload();
      if (!payload) {
        toast.info('No transactions to export');
        return;
      }
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
  }, [buildExportPayload]);

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
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: config.bgColor }}>
              <Icon className="h-5 w-5" style={{ color: config.color }} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#f7f8f8]">{config.title}</h2>
              <p className="text-xs text-[#8a8f98]">{config.description}</p>
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

      {/* Transactions Table with Column Filters */}
      <Card className="bg-[#0f1011] border-white/5">
        <CardContent className="p-0">
          <ColumnFilterTable
            transactions={sectionTransactions}
            showTypeColumn={true}
            onFilteredDataChange={handleFilteredDataChange}
            clients={clients}
          />
        </CardContent>
      </Card>

      {/* Total Value Card */}
      <Card className="bg-[#0f1011] border-white/5 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse at top right, ${config.bgColor} 0%, transparent 60%)`,
        }} />
        <CardContent className="p-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: config.bgColor }}>
              <Icon className="h-7 w-7" style={{ color: config.color }} />
            </div>
            <div>
              <p className="text-sm text-[#8a8f98] mb-1">{config.totalLabel}</p>
              <p className="text-3xl sm:text-4xl font-bold font-mono-num" style={{ color: config.color }}>
                ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Period cash-flow movement (classified txs, not market revaluation) */}
      <CashflowChart
        metric={SECTION_TO_METRIC[sectionType]}
        chartCaptureRef={chartCaptureRef}
      />

      {/* AI Analysis Section */}
      <AIAnalysisSection
        transactions={filteredData}
        clients={clients}
        sectionTitle={config.title}
        sectionColor={config.color}
        sectionType={sectionType}
      />
    </div>
  );
}
