'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight,
  FileText,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  Wallet,
  Fuel,
  BarChart3,
} from 'lucide-react';
import {
  generateTransactions,
  dashboardSummary,
  type Transaction,
  type Client,
} from '@/lib/mock-data';
import { ColumnFilterTable } from './column-filter-table';
import { AIAnalysisSection } from './ai-analysis-section';

interface SectionPageProps {
  sectionType: 'revenue' | 'expenses' | 'flow' | 'gas';
  onBack: () => void;
  clients?: Client[];
}

const sectionConfig = {
  revenue: {
    title: 'Revenue',
    totalLabel: 'Total Revenue',
    totalValue: dashboardSummary.totalRevenue,
    fixedType: 'income' as const,
    fixedTypeLabel: 'Income',
    color: '#0ecb81',
    bgColor: 'rgba(14, 203, 129, 0.1)',
    icon: TrendingUp,
    gradient: 'from-[#0ecb81] to-[#0a9e65]',
    description: 'All incoming transactions to your wallet',
  },
  expenses: {
    title: 'Expenses',
    totalLabel: 'Total Expenses',
    totalValue: dashboardSummary.totalExpenses,
    fixedType: 'expense' as const,
    fixedTypeLabel: 'Expense',
    color: '#f6465d',
    bgColor: 'rgba(246, 70, 93, 0.1)',
    icon: TrendingDown,
    gradient: 'from-[#f6465d] to-[#c73048]',
    description: 'All outgoing transactions from your wallet',
  },
  flow: {
    title: 'Net Flow',
    totalLabel: 'Net Flow',
    totalValue: dashboardSummary.netFlow,
    fixedType: undefined,
    fixedTypeLabel: undefined,
    color: '#0052ff',
    bgColor: 'rgba(0, 82, 255, 0.1)',
    icon: Wallet,
    gradient: 'from-[#0052ff] to-[#0036cc]',
    description: 'Net flow of funds in and out of your wallet',
  },
  gas: {
    title: 'Gas Fees',
    totalLabel: 'Total Gas Fees',
    totalValue: dashboardSummary.gasFees,
    fixedType: 'gas' as const,
    fixedTypeLabel: 'Gas Fee',
    color: '#f7931a',
    bgColor: 'rgba(247, 147, 26, 0.1)',
    icon: Fuel,
    gradient: 'from-[#f7931a] to-[#d07812]',
    description: 'All network fees paid on your transactions',
  },
};

export function SectionPage({ sectionType, onBack, clients = [] }: SectionPageProps) {
  const config = sectionConfig[sectionType];
  const Icon = config.icon;

  const allTransactions = useMemo(() => generateTransactions(), []);

  // For the "flow" section, we show both income and expense
  const sectionTransactions = useMemo(() => {
    if (sectionType === 'flow') {
      return allTransactions.filter(tx => tx.type === 'income' || tx.type === 'expense');
    }
    if (config.fixedType) {
      return allTransactions.filter(tx => tx.type === config.fixedType);
    }
    return allTransactions;
  }, [allTransactions, sectionType, config.fixedType]);

  const [filteredData, setFilteredData] = useState<Transaction[]>(sectionTransactions);
  const [analysisTriggerKey, setAnalysisTriggerKey] = useState(0);
  const analysisRef = useRef<HTMLDivElement>(null);

  const handleFilteredDataChange = useCallback((data: Transaction[]) => {
    setFilteredData(data);
  }, []);

  const handleAnalyzeFromHeader = useCallback(() => {
    setAnalysisTriggerKey(prev => prev + 1);
    // Scroll to analysis section
    setTimeout(() => {
      analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
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
            className="bg-[#0052ff]/10 border-[#0052ff]/20 text-[#0052ff] hover:bg-[#0052ff]/20 hover:text-[#0052ff]"
            onClick={handleAnalyzeFromHeader}
          >
            <BarChart3 className="h-4 w-4 ml-1" />
            Analyze Data
          </Button>
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
                ${config.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table with Column Filters */}
      <Card className="bg-[#0f1011] border-white/5">
        <CardContent className="p-0">
          <ColumnFilterTable
            transactions={sectionTransactions}
            fixedType={config.fixedType}
            fixedTypeLabel={config.fixedTypeLabel}
            showTypeColumn={sectionType === 'flow'}
            onFilteredDataChange={handleFilteredDataChange}
            clients={clients}
          />
        </CardContent>
      </Card>

      {/* AI Analysis Section */}
      <div ref={analysisRef}>
        <AIAnalysisSection
          transactions={filteredData}
          sectionTitle={config.title}
          sectionColor={config.color}
          sectionType={sectionType}
          triggerKey={analysisTriggerKey}
        />
      </div>
    </div>
  );
}
