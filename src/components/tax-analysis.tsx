'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Calculator,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Download,
  AlertTriangle,
  FileText,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Loader2,
} from 'lucide-react';
import { useTaxStore } from '@/stores/tax-store';
import type { TaxReport, TaxSummary, GainLossEntry, TaxLot, HoldingPeriod } from '@/lib/tax/types';
import { generateTransactions } from '@/lib/mock-data';
import { toast } from 'sonner';

// ============================================================
// Constants & Helpers
// ============================================================

const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].filter(y => y >= 2020);

function formatCurrency(value: number): string {
  const absVal = Math.abs(value);
  const formatted = absVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? '-' : ''}$${formatted}`;
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ============================================================
// Sub-Components
// ============================================================

function SummaryCard({
  title,
  value,
  icon,
  color,
  subtext,
  trend,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  subtext?: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <Card className="bg-[#0f1011] border-white/5">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-[#8a8f98] mb-1">{title}</p>
            <p className={`text-lg font-semibold ${trend === 'up' ? 'text-[#0ecb81]' : trend === 'down' ? 'text-[#f6465d]' : 'text-[#f7f8f8]'}`}>
              {value}
            </p>
            {subtext && <p className="text-[10px] text-[#8a8f98] mt-0.5">{subtext}</p>}
          </div>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0`} style={{ backgroundColor: `${color}15` }}>
            <span style={{ color }}>{icon}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SortIcon({ field, sortField, sortDir }: { field: string; sortField: string; sortDir: 'asc' | 'desc' }) {
  if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-[#8a8f98]/50" />;
  return sortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-[#0052ff]" /> : <ChevronDown className="h-3 w-3 text-[#0052ff]" />;
}

function GainLossTable({
  entries,
  sortField,
  sortDir,
  onSort,
  filterPeriod,
}: {
  entries: GainLossEntry[];
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSort: (field: string) => void;
  filterPeriod: 'all' | HoldingPeriod;
}) {
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  const filtered = useMemo(() => {
    let result = entries;
    if (filterPeriod !== 'all') {
      result = result.filter((e) => e.holdingPeriod === filterPeriod);
    }
    return result;
  }, [entries, filterPeriod]);

  const sorted = useMemo(() => {
    const result = [...filtered];
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'disposalDate':
          cmp = new Date(a.disposalDate).getTime() - new Date(b.disposalDate).getTime();
          break;
        case 'gainLoss':
          cmp = a.gainLoss - b.gainLoss;
          break;
        case 'tokenSymbol':
          cmp = a.tokenSymbol.localeCompare(b.tokenSymbol);
          break;
        default:
          cmp = 0;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [filtered, sortField, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageEntries = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <Calculator className="h-8 w-8 text-[#8a8f98] mx-auto mb-2 opacity-50" />
        <p className="text-sm text-[#8a8f98]">No realized gains or losses for this period</p>
      </div>
    );
  }

  return (
    <div>
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-right py-2 px-2 text-[#8a8f98] font-medium">
                <button onClick={() => onSort('tokenSymbol')} className="flex items-center gap-1 hover:text-[#d0d6e0] transition-colors">
                  Token <SortIcon field="tokenSymbol" sortField={sortField} sortDir={sortDir} />
                </button>
              </th>
              <th className="text-right py-2 px-2 text-[#8a8f98] font-medium">
                <button onClick={() => onSort('disposalDate')} className="flex items-center gap-1 hover:text-[#d0d6e0] transition-colors">
                  Sale Date <SortIcon field="disposalDate" sortField={sortField} sortDir={sortDir} />
                </button>
              </th>
              <th className="text-right py-2 px-2 text-[#8a8f98] font-medium">Purchase Date</th>
              <th className="text-right py-2 px-2 text-[#8a8f98] font-medium">Quantity</th>
              <th className="text-right py-2 px-2 text-[#8a8f98] font-medium">Cost Basis</th>
              <th className="text-right py-2 px-2 text-[#8a8f98] font-medium">Sale Proceeds</th>
              <th className="text-right py-2 px-2 text-[#8a8f98] font-medium">
                <button onClick={() => onSort('gainLoss')} className="flex items-center gap-1 hover:text-[#d0d6e0] transition-colors">
                  Gain/Loss <SortIcon field="gainLoss" sortField={sortField} sortDir={sortDir} />
                </button>
              </th>
              <th className="text-right py-2 px-2 text-[#8a8f98] font-medium">Holding Period</th>
              <th className="text-right py-2 px-2 text-[#8a8f98] font-medium">Network</th>
            </tr>
          </thead>
          <tbody>
            {pageEntries.map((entry) => (
              <tr key={entry.id} className="border-b border-white/[0.03] hover:bg-[#191a1b]/30 transition-colors">
                <td className="py-2.5 px-2">
                  <span className="font-medium text-[#d0d6e0]">{entry.tokenSymbol}</span>
                </td>
                <td className="py-2.5 px-2 text-[#d0d6e0]">{formatDate(entry.disposalDate)}</td>
                <td className="py-2.5 px-2 text-[#8a8f98]">{formatDate(entry.acquisitionDate)}</td>
                <td className="py-2.5 px-2 text-[#d0d6e0] font-mono" dir="ltr">{entry.quantity.toFixed(4)}</td>
                <td className="py-2.5 px-2 text-[#d0d6e0] font-mono" dir="ltr">{formatCurrency(entry.costBasis)}</td>
                <td className="py-2.5 px-2 text-[#d0d6e0] font-mono" dir="ltr">{formatCurrency(entry.proceeds)}</td>
                <td className="py-2.5 px-2">
                  <span className={`font-mono font-medium ${entry.gainLoss >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`} dir="ltr">
                    {formatCurrency(entry.gainLoss)}
                  </span>
                  <span className={`text-[10px] mr-1 ${entry.gainLoss >= 0 ? 'text-[#0ecb81]/70' : 'text-[#f6465d]/70'}`} dir="ltr">
                    ({formatPercent(entry.gainLossPercentage)})
                  </span>
                </td>
                <td className="py-2.5 px-2">
                  <Badge variant="outline" className={`text-[10px] px-1.5 ${entry.holdingPeriod === 'short_term' ? 'bg-[#f7931a]/10 text-[#f7931a] border-[#f7931a]/20' : 'bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/20'}`}>
                    {entry.holdingPeriod === 'short_term' ? 'Short-term' : 'Long-term'}
                  </Badge>
                </td>
                <td className="py-2.5 px-2 text-[#8a8f98] capitalize">{entry.network}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
        {pageEntries.map((entry) => (
          <div key={entry.id} className="bg-[#191a1b] rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[#d0d6e0]">{entry.tokenSymbol}</span>
              <span className={`font-mono text-sm font-medium ${entry.gainLoss >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`} dir="ltr">
                {formatCurrency(entry.gainLoss)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              <div><span className="text-[#8a8f98]">Sale:</span> <span className="text-[#d0d6e0]">{formatDate(entry.disposalDate)}</span></div>
              <div><span className="text-[#8a8f98]">Purchase:</span> <span className="text-[#d0d6e0]">{formatDate(entry.acquisitionDate)}</span></div>
              <div><span className="text-[#8a8f98]">Cost:</span> <span className="text-[#d0d6e0]" dir="ltr">{formatCurrency(entry.costBasis)}</span></div>
              <div><span className="text-[#8a8f98]">Proceeds:</span> <span className="text-[#d0d6e0]" dir="ltr">{formatCurrency(entry.proceeds)}</span></div>
            </div>
            <Badge variant="outline" className={`text-[10px] px-1.5 ${entry.holdingPeriod === 'short_term' ? 'bg-[#f7931a]/10 text-[#f7931a] border-[#f7931a]/20' : 'bg-[#0ecb81]/10 text-[#0ecb81] border-[#0ecb81]/20'}`}>
              {entry.holdingPeriod === 'short_term' ? 'Short-term' : 'Long-term'}
            </Badge>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
          <p className="text-[10px] text-[#8a8f98]">
            Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
          </p>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-[#8a8f98] hover:text-[#d0d6e0] hover:bg-[#191a1b]"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              <ChevronUp className="h-3.5 w-3.5 rotate-90" />
            </Button>
            <span className="text-[10px] text-[#8a8f98]">{page + 1} / {totalPages}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-[#8a8f98] hover:text-[#d0d6e0] hover:bg-[#191a1b]"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronDown className="h-3.5 w-3.5 rotate-90" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TaxLotsSection({ lots }: { lots: TaxLot[] }) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? lots : lots.slice(0, 5);

  if (lots.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="h-8 w-8 text-[#8a8f98] mx-auto mb-2 opacity-50" />
        <p className="text-sm text-[#8a8f98]">No remaining tax lots</p>
      </div>
    );
  }

  return (
    <div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-right py-2 px-2 text-[#8a8f98] font-medium">Token</th>
              <th className="text-right py-2 px-2 text-[#8a8f98] font-medium">Acquisition Date</th>
              <th className="text-right py-2 px-2 text-[#8a8f98] font-medium">Quantity Remaining</th>
              <th className="text-right py-2 px-2 text-[#8a8f98] font-medium">Acquisition Price</th>
              <th className="text-right py-2 px-2 text-[#8a8f98] font-medium">Cost Basis</th>
              <th className="text-right py-2 px-2 text-[#8a8f98] font-medium">Network</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((lot) => (
              <tr key={lot.id} className="border-b border-white/[0.03] hover:bg-[#191a1b]/30 transition-colors">
                <td className="py-2.5 px-2 font-medium text-[#d0d6e0]">{lot.tokenSymbol}</td>
                <td className="py-2.5 px-2 text-[#d0d6e0]">{formatDate(lot.acquisitionDate)}</td>
                <td className="py-2.5 px-2 text-[#d0d6e0] font-mono" dir="ltr">{lot.remainingQuantity.toFixed(4)}</td>
                <td className="py-2.5 px-2 text-[#d0d6e0] font-mono" dir="ltr">{formatCurrency(lot.acquisitionPrice)}</td>
                <td className="py-2.5 px-2 text-[#d0d6e0] font-mono" dir="ltr">{formatCurrency(lot.remainingQuantity * lot.acquisitionPrice)}</td>
                <td className="py-2.5 px-2 text-[#8a8f98] capitalize">{lot.network}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-2">
        {displayed.map((lot) => (
          <div key={lot.id} className="bg-[#191a1b] rounded-lg p-3 space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[#d0d6e0]">{lot.tokenSymbol}</span>
              <span className="text-[#8a8f98] capitalize">{lot.network}</span>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              <div><span className="text-[#8a8f98]">Acquired:</span> <span className="text-[#d0d6e0]">{formatDate(lot.acquisitionDate)}</span></div>
              <div><span className="text-[#8a8f98]">Remaining:</span> <span className="text-[#d0d6e0]" dir="ltr">{lot.remainingQuantity.toFixed(4)}</span></div>
              <div><span className="text-[#8a8f98]">Cost:</span> <span className="text-[#d0d6e0]" dir="ltr">{formatCurrency(lot.acquisitionPrice)}</span></div>
              <div><span className="text-[#8a8f98]">Total:</span> <span className="text-[#d0d6e0]" dir="ltr">{formatCurrency(lot.remainingQuantity * lot.acquisitionPrice)}</span></div>
            </div>
          </div>
        ))}
      </div>

      {lots.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-[10px] text-[#0052ff] hover:text-[#0052ff]/80 transition-colors mt-2"
        >
          {showAll ? 'Show less' : `Show All (${lots.length})`}
        </button>
      )}
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export function TaxAnalysis() {
  const store = useTaxStore();
  const { method, year, activeReport, isLoading } = store;

  // Sort & filter state for gain/loss table
  const [sortField, setSortField] = useState('disposalDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filterPeriod, setFilterPeriod] = useState<'all' | HoldingPeriod>('all');

  // Generate transactions once
  const [transactions] = useState(() => generateTransactions());

  // Generate report when method/year changes
  const generateReport = useCallback(() => {
    try {
      store.generateReport(transactions);
    } catch (error) {
      toast.error('Failed to generate tax report');
    }
  }, [transactions, method, year, store]);

  useEffect(() => {
    generateReport();
  }, [generateReport]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const handleExportCSV = () => {
    if (!activeReport) return;
    try {
      const headers = ['Token', 'Sale Date', 'Purchase Date', 'Quantity', 'Cost Basis', 'Sale Proceeds', 'Gain/Loss', 'Holding Period', 'Network'];
      const rows = activeReport.gainLossEntries.map((e) => [
        e.tokenSymbol,
        e.disposalDate,
        e.acquisitionDate,
        e.quantity,
        e.costBasis,
        e.proceeds,
        e.gainLoss,
        e.holdingPeriod,
        e.network,
      ]);
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tax-report-${year}-${method}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Report exported successfully');
    } catch {
      toast.error('Failed to export report');
    }
  };

  const summary: TaxSummary | null = activeReport?.summary ?? null;
  const gainLossEntries: GainLossEntry[] = activeReport?.gainLossEntries ?? [];
  const taxLots: TaxLot[] = activeReport?.taxLots ?? [];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#f7931a]/10 flex items-center justify-center">
            <Calculator className="h-5 w-5 text-[#f7931a]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#f7f8f8]">Tax Analysis</h2>
            <p className="text-xs text-[#8a8f98]">Comprehensive capital gains and losses analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Year Selector */}
          <Select value={String(year)} onValueChange={(v) => store.setYear(Number(v))}>
            <SelectTrigger className="w-28 h-9 bg-[#191a1b] border-white/5 text-[#d0d6e0] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#191a1b] border-white/10">
              {AVAILABLE_YEARS.map((y) => (
                <SelectItem key={y} value={String(y)} className="text-[#d0d6e0] text-xs">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Method Toggle */}
          <div className="flex items-center bg-[#191a1b] rounded-lg border border-white/5 p-0.5">
            <button
              onClick={() => store.setMethod('fifo')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                method === 'fifo'
                  ? 'bg-[#0052ff] text-white'
                  : 'text-[#8a8f98] hover:text-[#d0d6e0]'
              }`}
            >
              FIFO
            </button>
            <button
              onClick={() => store.setMethod('lifo')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                method === 'lifo'
                  ? 'bg-[#0052ff] text-white'
                  : 'text-[#8a8f98] hover:text-[#d0d6e0]'
              }`}
            >
              LIFO
            </button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-[#f7931a] animate-spin" />
        </div>
      )}

      {/* Summary Cards */}
      {!isLoading && summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard
            title="Net Realized Gains/Losses"
            value={formatCurrency(summary.netRealizedGainLoss)}
            icon={<DollarSign className="h-4 w-4" />}
            color={summary.netRealizedGainLoss >= 0 ? '#0ecb81' : '#f6465d'}
            trend={summary.netRealizedGainLoss >= 0 ? 'up' : 'down'}
          />
          <SummaryCard
            title="Short-term Gains"
            value={formatCurrency(summary.shortTermGains)}
            icon={<TrendingUp className="h-4 w-4" />}
            color="#f7931a"
            subtext="Higher tax rate"
            trend={summary.shortTermGains > 0 ? 'up' : 'neutral'}
          />
          <SummaryCard
            title="Long-term Gains"
            value={formatCurrency(summary.longTermGains)}
            icon={<TrendingUp className="h-4 w-4" />}
            color="#0ecb81"
            subtext="Lower tax rate"
            trend={summary.longTermGains > 0 ? 'up' : 'neutral'}
          />
          <SummaryCard
            title="Realized Losses"
            value={formatCurrency(summary.totalRealizedLosses)}
            icon={<TrendingDown className="h-4 w-4" />}
            color="#f6465d"
            trend="down"
          />
          <SummaryCard
            title="Unrealized Gains"
            value={formatCurrency(summary.unrealizedGains)}
            icon={<DollarSign className="h-4 w-4" />}
            color="#0ecb81"
            trend={summary.unrealizedGains > 0 ? 'up' : 'neutral'}
          />
          <SummaryCard
            title="Taxable Events"
            value={String(summary.taxableEvents)}
            icon={<Calculator className="h-4 w-4" />}
            color="#0052ff"
            subtext={`of ${summary.totalTransactions} transactions`}
            trend="neutral"
          />
        </div>
      )}

      {/* Gain/Loss Table */}
      {!isLoading && (
        <Card className="bg-[#0f1011] border-white/5">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-[#f7f8f8] text-base">Gains & Losses Table</CardTitle>
                <CardDescription className="text-[#8a8f98] text-xs">
                  Details of each disposal and realized gains or losses
                </CardDescription>
              </div>
              {/* Period Filter */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#8a8f98]">Filter:</span>
                <div className="flex items-center bg-[#191a1b] rounded-lg border border-white/5 p-0.5">
                  <button
                    onClick={() => setFilterPeriod('all')}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                      filterPeriod === 'all' ? 'bg-[#0052ff] text-white' : 'text-[#8a8f98] hover:text-[#d0d6e0]'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setFilterPeriod('short_term')}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                      filterPeriod === 'short_term' ? 'bg-[#0052ff] text-white' : 'text-[#8a8f98] hover:text-[#d0d6e0]'
                    }`}
                  >
                    Short-term
                  </button>
                  <button
                    onClick={() => setFilterPeriod('long_term')}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                      filterPeriod === 'long_term' ? 'bg-[#0052ff] text-white' : 'text-[#8a8f98] hover:text-[#d0d6e0]'
                    }`}
                  >
                    Long-term
                  </button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <GainLossTable
              entries={gainLossEntries}
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              filterPeriod={filterPeriod}
            />
          </CardContent>
        </Card>
      )}

      {/* Tax Lots Section */}
      {!isLoading && (
        <Card className="bg-[#0f1011] border-white/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-[#f7f8f8] text-base">Remaining Tax Lots</CardTitle>
            <CardDescription className="text-[#8a8f98] text-xs">
              Remaining assets with cost basis and unrealized gains
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TaxLotsSection lots={taxLots} />
          </CardContent>
        </Card>
      )}

      {/* Export & Disclaimer */}
      {!isLoading && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-2 max-w-xl">
            <AlertTriangle className="h-4 w-4 text-[#f7931a] mt-0.5 shrink-0" />
            <p className="text-[10px] text-[#8a8f98] leading-relaxed">
              This analysis is for informational purposes only and is not tax advice. Please consult a specialist accountant.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="bg-[#191a1b] border-white/5 text-[#d0d6e0] hover:bg-[#28282c] hover:text-[#f7f8f8] text-xs"
              onClick={handleExportCSV}
              disabled={!activeReport || gainLossEntries.length === 0}
            >
              <Download className="h-3.5 w-3.5 ml-1.5" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              className="bg-[#191a1b] border-white/5 text-[#d0d6e0] hover:bg-[#28282c] hover:text-[#f7f8f8] text-xs"
              disabled={!activeReport}
              onClick={() => toast.info('PDF export coming soon')}
            >
              <FileText className="h-3.5 w-3.5 ml-1.5" />
              Export PDF
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
