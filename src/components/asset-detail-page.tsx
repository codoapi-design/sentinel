'use client';

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import {
  type Transaction,
  type Client,
} from '@/lib/mock-data';
import { usePortfolio } from '@/hooks/use-portfolio';
import { useActiveTransactions } from '@/hooks/use-active-transactions';
import { ColumnFilterTable } from './column-filter-table';
import { AIAnalysisSection } from './ai-analysis-section';
import { cn } from '@/lib/utils';

interface AssetDetailPageProps {
  assetId: string;
  onBack: () => void;
  clients?: Client[];
}

const periodOptions = [
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
  { label: 'All', days: 0 },
];

// Deterministic accent color derived from the token symbol.
function colorFromSymbol(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 60%, 50%)`;
}

export function AssetDetailPage({ assetId, onBack, clients = [] }: AssetDetailPageProps) {
  const [activePeriod, setActivePeriod] = useState(30);
  const [filteredData, setFilteredData] = useState<Transaction[]>([]);

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

  // Get all transactions for this asset
  const assetTransactions = useMemo(() => {
    if (!asset) return [];
    return allTransactions.filter(tx => tx.token === asset.symbol);
  }, [asset, allTransactions]);

  // Build chart data: quantity movement over time
  const fullChartData = useMemo(() => {
    if (!asset || assetTransactions.length === 0) return [];

    // Group transactions by date
    const dailyMap: Record<string, { inflow: number; outflow: number }> = {};

    // Find date range
    const allDates = assetTransactions.map(tx => tx.date);
    const minDate = allDates.reduce((a, b) => a < b ? a : b);
    const maxDate = allDates.reduce((a, b) => a > b ? a : b);

    // Fill all dates in range
    const start = new Date(minDate);
    const end = new Date(maxDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split('T')[0];
      dailyMap[key] = { inflow: 0, outflow: 0 };
    }

    // Sum inflows and outflows per day
    assetTransactions.forEach(tx => {
      const key = tx.date;
      if (!dailyMap[key]) dailyMap[key] = { inflow: 0, outflow: 0 };
      if (tx.type === 'income' || tx.type === 'staking' || tx.type === 'defi') {
        dailyMap[key].inflow += tx.quantity;
      } else if (tx.type === 'expense' || tx.type === 'gas') {
        dailyMap[key].outflow += tx.quantity;
      } else {
        // trade - split half in / half out for visual
        dailyMap[key].inflow += tx.quantity * 0.5;
        dailyMap[key].outflow += tx.quantity * 0.5;
      }
    });

    // Sort by date and calculate cumulative balance
    const sortedDates = Object.keys(dailyMap).sort();
    let runningBalance = asset.quantity; // start from current balance
    // We need to calculate backwards from current balance
    const netChanges = sortedDates.map(date => {
      const day = dailyMap[date];
      return day.inflow - day.outflow;
    });

    // Total net change
    const totalNet = netChanges.reduce((s, n) => s + n, 0);
    // Starting balance = current - total net change
    let balance = asset.quantity - totalNet;

    const result = sortedDates.map((date, i) => {
      const day = dailyMap[date];
      balance += netChanges[i];
      return {
        date,
        inflow: Math.round(day.inflow * 10000) / 10000,
        outflow: Math.round(day.outflow * 10000) / 10000,
        net: Math.round(netChanges[i] * 10000) / 10000,
        balance: Math.round(balance * 10000) / 10000,
      };
    });

    return result;
  }, [asset, assetTransactions]);

  // Apply period filter
  const chartData = useMemo(() => {
    if (activePeriod === 0) return fullChartData;
    return fullChartData.slice(-activePeriod);
  }, [fullChartData, activePeriod]);

  const handleFilteredDataChange = useCallback((data: Transaction[]) => {
    setFilteredData(data);
  }, []);

  if (!asset) {
    return (
      <div className="text-center py-20">
        <p className="text-[#8a8f98]">Asset not found</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>Back</Button>
      </div>
    );
  }

  const isPositive = asset.change24h >= 0;

  // Calculate total inflow/outflow
  const totalInflow = assetTransactions
    .filter(tx => tx.type === 'income' || tx.type === 'staking' || tx.type === 'defi')
    .reduce((s, tx) => s + tx.quantity, 0);
  const totalOutflow = assetTransactions
    .filter(tx => tx.type === 'expense' || tx.type === 'gas')
    .reduce((s, tx) => s + tx.quantity, 0);

  const formatQty = (value: number) => {
    if (value >= 1000) return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    if (value >= 1) return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (activePeriod <= 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
    }
    if (activePeriod === 0) {
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Chart domain
  const allBalances = chartData.map(d => d.balance);
  const minBalance = allBalances.length > 0 ? Math.min(...allBalances) : 0;
  const maxBalance = allBalances.length > 0 ? Math.max(...allBalances) : 1;
  const maxFlow = chartData.length > 0 ? Math.max(...chartData.map(d => Math.max(d.inflow, d.outflow))) : 1;

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

      {/* Asset Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="bg-[#0f1011] border-white/5 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" style={{
            background: `radial-gradient(ellipse at top right, ${asset.color}10 0%, transparent 70%)`,
          }} />
          <CardContent className="p-4 relative z-10">
            <p className="text-xs text-[#8a8f98] mb-1">Balance</p>
            <p className="text-lg font-bold font-mono-num text-[#f7f8f8]">
              {formatQty(asset.quantity)} {asset.symbol}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="p-4">
            <p className="text-xs text-[#8a8f98] mb-1">Current Value</p>
            <p className="text-lg font-bold font-mono-num" style={{ color: asset.color }}>
              ${asset.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="p-4">
            <p className="text-xs text-[#8a8f98] mb-1">Total Inflow</p>
            <p className="text-lg font-bold font-mono-num text-[#0ecb81]">
              +{formatQty(totalInflow)} {asset.symbol}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="p-4">
            <p className="text-xs text-[#8a8f98] mb-1">Total Outflow</p>
            <p className="text-lg font-bold font-mono-num text-[#f6465d]">
              -{formatQty(totalOutflow)} {asset.symbol}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="p-4">
            <p className="text-xs text-[#8a8f98] mb-1">24h Change</p>
            <div className={cn(
              'flex items-center gap-1 text-lg font-bold font-mono-num',
              isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
            )}>
              {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              {isPositive ? '+' : ''}{asset.change24h}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Asset Quantity Movement Chart */}
      <Card className="bg-[#0f1011] border-white/5">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-medium text-[#f7f8f8]">Movement {asset.symbol} in Wallet</h3>
              <p className="text-xs text-[#8a8f98] mt-0.5">Track inflow, outflow, and cumulative balance</p>
            </div>
            <div className="flex items-center gap-1 bg-[#191a1b] rounded-lg p-1">
              {periodOptions.map((period) => (
                <Button
                  key={period.days}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 px-3 text-xs rounded-md transition-all',
                    activePeriod === period.days
                      ? 'bg-[#28282c] text-[#f7f8f8]'
                      : 'text-[#8a8f98] hover:text-[#d0d6e0] hover:bg-transparent'
                  )}
                  onClick={() => setActivePeriod(period.days)}
                >
                  {period.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="h-[320px] w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id={`balanceGradient-${asset.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={asset.color} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={asset.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke="rgba(255,255,255,0.1)"
                  tick={{ fill: '#8a8f98', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="balance"
                  domain={[minBalance * 0.95, maxBalance * 1.05]}
                  tickFormatter={formatQty}
                  stroke="rgba(255,255,255,0.1)"
                  tick={{ fill: '#8a8f98', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <YAxis
                  yAxisId="flow"
                  orientation="left"
                  domain={[0, maxFlow * 1.3]}
                  tickFormatter={(v: number) => formatQty(v)}
                  stroke="rgba(255,255,255,0.1)"
                  tick={{ fill: '#8a8f98', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#191a1b',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    color: '#f7f8f8',
                    fontSize: '12px',
                    direction: 'rtl',
                  }}
                  labelStyle={{ color: '#8a8f98', marginBottom: 4 }}
                  labelFormatter={(label) => {
                    const d = new Date(label);
                    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === 'balance') return [`${formatQty(value)} ${asset.symbol}`, 'Balance'];
                    if (name === 'inflow') return [`+${formatQty(value)} ${asset.symbol}`, 'Inflow'];
                    if (name === 'outflow') return [`-${formatQty(value)} ${asset.symbol}`, 'Outflow'];
                    return [value, name];
                  }}
                />
                <Legend
                  formatter={(value: string) => {
                    if (value === 'balance') return 'Balance';
                    if (value === 'inflow') return 'Inflow';
                    if (value === 'outflow') return 'Outflow';
                    return value;
                  }}
                  wrapperStyle={{ fontSize: '11px', color: '#8a8f98' }}
                />
                {/* Inflow bars (green) */}
                <Bar
                  yAxisId="flow"
                  dataKey="inflow"
                  fill="#0ecb81"
                  fillOpacity={0.7}
                  radius={[2, 2, 0, 0]}
                  barSize={8}
                />
                {/* Outflow bars (red) */}
                <Bar
                  yAxisId="flow"
                  dataKey="outflow"
                  fill="#f6465d"
                  fillOpacity={0.7}
                  radius={[2, 2, 0, 0]}
                  barSize={8}
                />
                {/* Cumulative balance line (area) */}
                <Area
                  yAxisId="balance"
                  type="monotone"
                  dataKey="balance"
                  stroke={asset.color}
                  strokeWidth={2.5}
                  fill={`url(#balanceGradient-${asset.id})`}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: asset.color,
                    stroke: '#0f1011',
                    strokeWidth: 2,
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

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

      {/* AI Analysis */}
      <AIAnalysisSection
        transactions={filteredData}
        sectionTitle={`Transactions of ${asset.name}`}
        sectionColor={asset.color}
        sectionType={'revenue' as const}
      />
    </div>
  );
}
