'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowRight,
  Copy,
  Check,
  Fuel,
  Loader2,
  RefreshCw,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';
import { type Client, type Transaction } from '@/lib/mock-data';
import { useActiveTransactions } from '@/hooks/use-active-transactions';
import { useWalletStore } from '@/stores/wallet-store';
import { useWalletReadModels } from '@/hooks/use-wallet-read-models';
import { TablePagination } from '@/components/table-pagination';
import { useTablePagination } from '@/hooks/use-table-pagination';
import { CashflowChart } from '@/components/cashflow-chart';
import { AIAnalysisSection } from '@/components/ai-analysis-section';
import {
  buildTransactionsReportPayload,
  downloadReportExcel,
  downloadReportPdf,
} from '@/lib/export/download-report';
import { captureExportCharts } from '@/lib/export/capture-chart';
import { cn } from '@/lib/utils';

interface GasFeesPageProps {
  onBack: () => void;
  clients?: Client[];
}

function formatUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatEth(n: number): string {
  if (n >= 0.01) return n.toFixed(6);
  if (n > 0) return n.toFixed(8);
  return '0';
}

function shortHash(hash: string): string {
  if (!hash || hash.length < 12) return hash || '—';
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export function GasFeesPage({ onBack, clients = [] }: GasFeesPageProps) {
  const allTransactions = useActiveTransactions();
  const activeWalletId = useWalletStore(s => s.activeWalletId);
  const loadTransactionsFromDB = useWalletStore(s => s.loadTransactionsFromDB);
  const { summary: readModelSummary, refetch: refetchReadModels } = useWalletReadModels();
  const [enriching, setEnriching] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const enrichAttempted = useRef(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const chartCaptureRef = useRef<HTMLDivElement>(null);

  const gasTransactions = useMemo(() => {
    const rows = allTransactions.filter(tx => (tx.gasFeeEth || 0) > 0 || (tx.gasFeeUsd || 0) > 0);
    // One row per hash (sync stores one row per hash already, but be safe)
    const byHash = new Map<string, Transaction>();
    for (const tx of rows) {
      const key = `${tx.network}:${(tx.txHash || tx.id).toLowerCase()}`;
      const prev = byHash.get(key);
      if (!prev || (tx.gasFeeUsd || 0) > (prev.gasFeeUsd || 0)) {
        byHash.set(key, tx);
      }
    }
    return [...byHash.values()].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [allTransactions]);

  const totalGasUsd = useMemo(() => {
    if (readModelSummary && readModelSummary.gasFeesUsd > 0) {
      return readModelSummary.gasFeesUsd;
    }
    return gasTransactions.reduce((sum, tx) => sum + (tx.gasFeeUsd || 0), 0);
  }, [gasTransactions, readModelSummary]);

  const totalGasEth = useMemo(
    () => gasTransactions.reduce((sum, tx) => sum + (tx.gasFeeEth || 0), 0),
    [gasTransactions],
  );

  const runEnrich = useCallback(async () => {
    if (!activeWalletId || enriching) return;
    setEnriching(true);
    try {
      const res = await fetch(`/api/wallets/${activeWalletId}/enrich-gas`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await loadTransactionsFromDB(activeWalletId);
      await refetchReadModels({ silent: true });
      const updated = json.data?.updated ?? 0;
      toast.success(
        updated > 0
          ? `Gas fees updated (${updated} transaction${updated === 1 ? '' : 's'})`
          : 'Gas fees checked — no new receipt data',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load gas fees');
    } finally {
      setEnriching(false);
    }
  }, [activeWalletId, enriching, loadTransactionsFromDB, refetchReadModels]);

  // Auto-backfill once when opening the page with empty gas data
  useEffect(() => {
    if (!activeWalletId || enrichAttempted.current) return;
    if (gasTransactions.length > 0) return;
    if (allTransactions.length === 0) return;
    enrichAttempted.current = true;
    void runEnrich();
  }, [activeWalletId, gasTransactions.length, allTransactions.length, runEnrich]);

  const {
    page,
    setPage,
    pageSize,
    pageItems,
    totalItems,
  } = useTablePagination(gasTransactions);

  const copyHash = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(hash);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error('Could not copy hash');
    }
  };

  const buildExportPayload = useCallback(() => {
    const exportRows = gasTransactions.map(tx => ({
      ...tx,
      token: 'ETH',
      quantity: tx.gasFeeEth || 0,
      price: tx.gasFeeEth && tx.gasFeeUsd ? tx.gasFeeUsd / tx.gasFeeEth : 0,
      value: tx.gasFeeUsd || 0,
    }));
    return buildTransactionsReportPayload({
      title: 'Gas Fees',
      subtitle: 'Network fees paid by this wallet (from Alchemy receipts)',
      filenameBase: 'radareum-gas-fees',
      transactions: exportRows,
      clients,
      aiScope: {
        page: 'gas',
        sectionType: 'gas',
        sectionTitle: 'Gas Fees',
        period: 'all',
        filters: { totalRows: gasTransactions.length },
      },
      extraSummary: [
        { label: 'Total Gas Fees', value: `$${formatUsd(totalGasUsd)}` },
        { label: 'Total Gas (ETH)', value: `${formatEth(totalGasEth)} ETH` },
      ],
    });
  }, [gasTransactions, clients, totalGasUsd, totalGasEth]);

  const handleDownloadExcel = useCallback(async () => {
    try {
      const payload = buildExportPayload();
      if (!payload) {
        toast.info('No gas transactions to export');
        return;
      }
      const charts = await captureExportCharts(pageRef.current, { background: '#0f1011' });
      if (charts.length > 0) payload.charts = charts;
      await downloadReportExcel(payload);
      toast.success('Excel report downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export Excel');
    }
  }, [buildExportPayload]);

  const handleDownloadPdf = useCallback(async () => {
    try {
      const payload = buildExportPayload();
      if (!payload) {
        toast.info('No gas transactions to export');
        return;
      }
      const charts = await captureExportCharts(pageRef.current, { background: '#0f1011' });
      if (charts.length > 0) payload.charts = charts;
      await downloadReportPdf(payload);
      toast.success('PDF report downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export PDF');
    }
  }, [buildExportPayload]);

  return (
    <div className="space-y-6" ref={pageRef}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-lg bg-[#0f1011] border border-white/5 flex items-center justify-center hover:bg-[#191a1b] transition-colors"
          >
            <ArrowRight className="h-4 w-4 text-[#8a8f98]" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[rgba(247,147,26,0.1)]">
              <Fuel className="h-5 w-5 text-[#f7931a]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#f7f8f8]">Gas Fees</h2>
              <p className="text-xs text-[#8a8f98]">
                Fees you paid as transaction sender · from Alchemy receipts
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="bg-[#191a1b] border-white/5 text-[#d0d6e0] hover:bg-[#28282c]"
            disabled={enriching || !activeWalletId}
            onClick={() => void runEnrich()}
          >
            {enriching ? (
              <Loader2 className="h-4 w-4 ml-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 ml-1" />
            )}
            Refresh gas
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="bg-[#191a1b] border-white/5 text-[#d0d6e0] hover:bg-[#28282c]"
            onClick={() => void handleDownloadPdf()}
          >
            <FileText className="h-4 w-4 ml-1" />
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="bg-[#191a1b] border-white/5 text-[#d0d6e0] hover:bg-[#28282c]"
            onClick={() => void handleDownloadExcel()}
          >
            <FileSpreadsheet className="h-4 w-4 ml-1" />
            Excel
          </Button>
        </div>
      </div>

      <Card className="bg-[#0f1011] border-white/5 overflow-hidden relative">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at top right, rgba(247,147,26,0.1) 0%, transparent 60%)',
          }}
        />
        <CardContent className="p-6 relative z-10">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[rgba(247,147,26,0.1)]">
              <Fuel className="h-7 w-7 text-[#f7931a]" />
            </div>
            <div>
              <p className="text-sm text-[#8a8f98] mb-1">Total Gas Fees</p>
              <p className="text-3xl sm:text-4xl font-bold font-mono-num text-[#f7931a]">
                ${formatUsd(totalGasUsd)}
              </p>
              <p className="text-xs text-[#8a8f98] mt-1 font-mono-num">
                {formatEth(totalGasEth)} ETH · {gasTransactions.length} transaction
                {gasTransactions.length === 1 ? '' : 's'}
              </p>
            </div>
            {enriching && (
              <div className="flex items-center gap-2 text-xs text-[#8a8f98] ms-auto">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#f7931a]" />
                Loading gas from Alchemy…
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <CashflowChart metric="gas" chartCaptureRef={chartCaptureRef} />

      <Card className="bg-[#0f1011] border-white/5">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-white/5 hover:bg-transparent">
                  <TableHead className="text-[#8a8f98]">Date</TableHead>
                  <TableHead className="text-[#8a8f98]">Method</TableHead>
                  <TableHead className="text-[#8a8f98]">Classification</TableHead>
                  <TableHead className="text-[#8a8f98]">Network</TableHead>
                  <TableHead className="text-[#8a8f98] text-end">Gas used</TableHead>
                  <TableHead className="text-[#8a8f98] text-end">Gas (ETH)</TableHead>
                  <TableHead className="text-[#8a8f98] text-end">Gas (USD)</TableHead>
                  <TableHead className="text-[#8a8f98]">Tx hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.length === 0 ? (
                  <TableRow className="border-white/5">
                    <TableCell colSpan={8} className="text-center py-12 text-[#8a8f98]">
                      {enriching
                        ? 'Fetching gas receipts from Alchemy…'
                        : 'No gas fees recorded yet. Click Refresh gas to load receipts.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  pageItems.map(tx => (
                    <TableRow key={tx.id} className="border-white/5 hover:bg-white/[0.02]">
                      <TableCell className="text-sm text-[#d0d6e0] whitespace-nowrap">
                        {tx.date}
                      </TableCell>
                      <TableCell className="text-sm text-[#f7f8f8]">
                        {tx.activity || 'Transfer'}
                      </TableCell>
                      <TableCell>
                        <span className="text-[10px] px-2 py-0.5 rounded border border-white/10 text-[#8a8f98]">
                          {tx.typeLabel}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-[#d0d6e0]">{tx.networkLabel}</TableCell>
                      <TableCell className="text-sm text-end font-mono-num text-[#d0d6e0]">
                        {(tx.gasUsed || 0).toLocaleString('en-US')}
                      </TableCell>
                      <TableCell className="text-sm text-end font-mono-num text-[#d0d6e0]">
                        {formatEth(tx.gasFeeEth || 0)}
                      </TableCell>
                      <TableCell className="text-sm text-end font-mono-num text-[#f7931a] font-medium">
                        ${formatUsd(tx.gasFeeUsd || 0)}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className={cn(
                            'inline-flex items-center gap-1.5 text-xs text-[#8a8f98] hover:text-[#d0d6e0]',
                          )}
                          onClick={() => void copyHash(tx.txHash)}
                          title={tx.txHash}
                        >
                          {shortHash(tx.txHash)}
                          {copied === tx.txHash ? (
                            <Check className="h-3 w-3 text-[#0ecb81]" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {totalItems > pageSize && (
            <div className="p-3 border-t border-white/5">
              <TablePagination
                page={page}
                pageSize={pageSize}
                totalItems={totalItems}
                onPageChange={setPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <AIAnalysisSection
        transactions={gasTransactions}
        clients={clients}
        sectionTitle="Gas Fees"
        sectionType="gas"
        page="gas"
      />
    </div>
  );
}
