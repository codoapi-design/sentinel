'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  FileText,
  FileSpreadsheet,
  Wallet,
  Copy,
  Check,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  type Client,
  type Transaction,
} from '@/lib/mock-data';
import { isExpenseType, isRevenueType } from '@/lib/finance/summary';
import {
  buildTransactionsReportPayload,
  downloadReportExcel,
  downloadReportPdf,
} from '@/lib/export/download-report';
import { captureExportCharts } from '@/lib/export/capture-chart';
import { buildClientFilterStatsSummary } from '@/lib/export/filter-stats-summary';
import { useActiveTransactions } from '@/hooks/use-active-transactions';
import { ColumnFilterTable } from './column-filter-table';
import { ClientTransactionFilterStats } from './transaction-filter-stats';
import { RelationshipPerformanceChart } from './relationship-performance-chart';
import { AIAnalysisSection } from './ai-analysis-section';
import { cn } from '@/lib/utils';

interface ClientDetailPageProps {
  client: Client;
  onBack: () => void;
  onDefineClient?: (address: string) => void;
  clients?: Client[];
}

export function ClientDetailPage({
  client,
  onBack,
  onDefineClient,
  clients = [],
}: ClientDetailPageProps) {
  const pageRef = useRef<HTMLDivElement>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [filteredData, setFilteredData] = useState<Transaction[]>([]);
  /** False until ColumnFilterTable emits — chart falls back to clientTransactions. */
  const [filtersReady, setFiltersReady] = useState(false);
  const allTransactions = useActiveTransactions();

  // Determine if this is an undefined/auto-generated client
  const isUndefined = client.id.startsWith('addr-0x');

  // Get all transactions with this client
  const clientTransactions = useMemo(() => {
    return allTransactions.filter(
      tx => tx.counterparty.toLowerCase() === client.address.toLowerCase()
    );
  }, [allTransactions, client.address]);

  // Net direction for AI section — based on currently filtered table rows
  const isNetPositive = useMemo(() => {
    const source = filtersReady ? filteredData : clientTransactions;
    const revenue = source
      .filter(tx => isRevenueType(tx.type))
      .reduce((sum, tx) => sum + tx.value, 0);
    const expenses = source
      .filter(tx => isExpenseType(tx.type))
      .reduce((sum, tx) => sum + tx.value, 0);
    return revenue - expenses >= 0;
  }, [filtersReady, filteredData, clientTransactions]);

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
    setFiltersReady(true);
    setFilteredData(data);
  }, []);

  const chartTransactions = filtersReady ? filteredData : clientTransactions;
  const statsTransactions = filtersReady ? filteredData : clientTransactions;

  const handleDownloadExcel = useCallback(async () => {
    try {
      const payload = buildTransactionsReportPayload({
        title: `Client · ${client.name}`,
        subtitle: client.address,
        filenameBase: 'sentinel-client',
        transactions: statsTransactions,
        clients,
        aiScope: {
          page: 'client-detail',
          sectionType: 'counterparty',
          sectionTitle: `Transactions with ${client.name}`,
          counterparty: client.address,
          period: 'all',
          filters: { direction: isNetPositive ? 'net-inflow' : 'net-outflow' },
        },
      });
      if (!payload) {
        toast.info('No transactions to export');
        return;
      }
      payload.summary = buildClientFilterStatsSummary(statsTransactions);
      const charts = await captureExportCharts(pageRef.current, {
        background: '#0f1011',
      });
      if (charts.length > 0) {
        payload.charts = charts;
      }
      const aiIncluded = await downloadReportExcel(payload);
      const extras = [
        charts.length > 0 ? 'charts' : null,
        aiIncluded ? 'AI analysis' : null,
      ].filter(Boolean);
      toast.success(
        extras.length > 0
          ? `Excel report downloaded (with ${extras.join(' + ')})`
          : 'Excel report downloaded',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export Excel');
    }
  }, [client.name, client.address, statsTransactions, clients, isNetPositive]);

  const handleDownloadPdf = useCallback(async () => {
    try {
      const payload = buildTransactionsReportPayload({
        title: `Client · ${client.name}`,
        subtitle: client.address,
        filenameBase: 'sentinel-client',
        transactions: statsTransactions,
        clients,
        aiScope: {
          page: 'client-detail',
          sectionType: 'counterparty',
          sectionTitle: `Transactions with ${client.name}`,
          counterparty: client.address,
          period: 'all',
          filters: { direction: isNetPositive ? 'net-inflow' : 'net-outflow' },
        },
      });
      if (!payload) {
        toast.info('No transactions to export');
        return;
      }
      payload.summary = buildClientFilterStatsSummary(statsTransactions);
      const charts = await captureExportCharts(pageRef.current, {
        background: '#0f1011',
      });
      if (charts.length > 0) {
        payload.charts = charts;
      }
      const aiIncluded = await downloadReportPdf(payload);
      const extras = [
        charts.length > 0 ? 'charts' : null,
        aiIncluded ? 'AI analysis' : null,
      ].filter(Boolean);
      toast.success(
        extras.length > 0
          ? `PDF report downloaded (with ${extras.join(' + ')})`
          : 'PDF report downloaded',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export PDF');
    }
  }, [client.name, client.address, statsTransactions, clients, isNetPositive]);

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

      {/* Filter-bound client stats (same set as table) */}
      <ClientTransactionFilterStats transactions={statsTransactions} />

      {/* Client Flow — shared chart with Asset Details */}
      <RelationshipPerformanceChart
        transactions={chartTransactions}
        title={`Client Flow · ${client.name}`}
        subtitle="Cumulative inflow, outflow, net & volume · values in USD"
        methodology="Based on filtered transactions with this client (synced wallet data)."
      />

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
            clients={clients}
          />
        </CardContent>
      </Card>

      {/* AI Analysis */}
      <AIAnalysisSection
        transactions={statsTransactions}
        clients={clients}
        sectionTitle={`Transactions with ${client.name}`}
        sectionColor={client.color}
        sectionType="counterparty"
        page="client-detail"
        counterparty={client.address}
        period="all"
        filters={{ direction: isNetPositive ? 'net-inflow' : 'net-outflow' }}
      />
    </div>
  );
}
