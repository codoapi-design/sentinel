'use client';

import { useId, useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  ArrowLeftRight,
  Loader2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  FileText,
  FileSpreadsheet,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';
import { useTradingVolumeDetail } from '@/hooks/use-trading-volume-detail';
import {
  applyTradingVolumePeriod,
  todayDateOnly,
  toDateOnly,
  type TradingVolumePeriodDays,
} from '@/lib/finance/trading-volume-period';
import { InvestmentReturnPeriodControls } from '@/components/investment-return-period-controls';
import { AIAnalysisSection } from '@/components/ai-analysis-section';
import type { Client } from '@/lib/mock-data';
import { resolveCounterpartyDisplay } from '@/lib/clients/display';
import {
  downloadReportExcel,
  downloadReportPdf,
  type ReportPayload,
} from '@/lib/export/download-report';
import { captureChartCard } from '@/lib/export/capture-chart';

interface TradingVolumePageProps {
  onBack: () => void;
  clients?: Client[];
}

const ACCENT = '#a855f7';

function formatUsd(value: number, compact = false): string {
  const abs = Math.abs(value);
  if (compact) {
    if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `$${(abs / 1_000).toFixed(2)}K`;
  }
  return `$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function networkLabel(network: string): string {
  if (!network || network === 'unknown') return '—';
  return network.charAt(0).toUpperCase() + network.slice(1);
}

function formatAxisDate(dateStr: string, periodDays: number): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (periodDays > 0 && periodDays <= 1) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  if (periodDays > 0 && periodDays <= 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  if (periodDays === 0 || periodDays >= 365) {
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function shortHash(hash: string): string {
  if (!hash || hash.length < 12) return hash || '—';
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function shortAddr(addr: string | null): string {
  if (!addr) return '—';
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function explorerTxUrl(network: string, hash: string): string | null {
  if (!hash) return null;
  const n = network.toLowerCase();
  const map: Record<string, string> = {
    ethereum: 'https://etherscan.io/tx/',
    base: 'https://basescan.org/tx/',
    arbitrum: 'https://arbiscan.io/tx/',
    optimism: 'https://optimistic.etherscan.io/tx/',
    polygon: 'https://polygonscan.com/tx/',
    bsc: 'https://bscscan.com/tx/',
  };
  const base = map[n];
  return base ? `${base}${hash}` : null;
}

export function TradingVolumePage({ onBack, clients = [] }: TradingVolumePageProps) {
  const reactId = useId().replace(/:/g, '');
  const { detail, isLoading, error, refetch } = useTradingVolumeDetail();
  const gradId = `tradingVolGrad-${reactId}`;
  const chartCaptureRef = useRef<HTMLDivElement>(null);

  const [activePeriod, setActivePeriod] = useState<TradingVolumePeriodDays>(0);
  const [customFrom, setCustomFrom] = useState<string | null>(null);
  const [customTo, setCustomTo] = useState<string | null>(null);
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [listTab, setListTab] = useState<'tokens' | 'trades'>('tokens');

  const earliestDate = detail?.earliestTradeAt ? toDateOnly(detail.earliestTradeAt) : '';
  const today = todayDateOnly();
  const isCustomActive = customFrom != null;

  useEffect(() => {
    if (!customFrom && !customTo) return;
    let nextFrom = customFrom;
    let nextTo = customTo ?? today;
    if (nextTo > today) nextTo = today;
    if (nextFrom && nextFrom > nextTo) nextFrom = nextTo;
    if (nextFrom !== customFrom) setCustomFrom(nextFrom);
    if (nextTo !== (customTo ?? today)) {
      setCustomTo(nextTo === today && !customFrom ? null : nextTo);
    }
  }, [today, customFrom, customTo]);

  const filtered = useMemo(() => {
    if (!detail) return null;
    return applyTradingVolumePeriod(detail, {
      periodDays: activePeriod,
      customFrom,
      customTo,
      today,
    });
  }, [detail, activePeriod, customFrom, customTo, today]);

  const chartData = useMemo(
    () =>
      (filtered?.chartHistory ?? []).map(p => ({
        date: p.date,
        volume: p.cumulativeUsd,
        daily: p.dailyUsd,
      })),
    [filtered],
  );

  const maxVol = chartData.length ? Math.max(...chartData.map(d => d.volume), 0) : 0;
  const pad = Math.max(maxVol * 0.08, 1);

  const earliestTradeLabel = detail?.earliestTradeAt
    ? new Date(detail.earliestTradeAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  const showingLiveAll = activePeriod === 0 && !isCustomActive;
  const byToken = filtered?.byToken ?? [];
  const trades = filtered?.trades ?? [];

  const buildExportPayload = useCallback((): ReportPayload | null => {
    if (!detail || !filtered) return null;
    const period = activePeriod === 0 ? 'all' : `${activePeriod}d`;
    return {
      title: 'Trading Volume',
      subtitle: filtered.periodLabel
        ? `${filtered.periodLabel} · all synced trade history`
        : earliestTradeLabel
          ? `All synced history · earliest trade ${earliestTradeLabel}`
          : 'All synced trade history',
      filenameBase: 'sentinel-trading-volume',
      aiScope: {
        page: 'trading-volume',
        sectionType: 'trading-volume',
        sectionTitle: 'Trading Volume',
        period,
        filters: isCustomActive
          ? { from: customFrom ?? today, to: customTo ?? today }
          : undefined,
      },
      summary: [
        { label: 'Total volume (USD)', value: formatUsd(filtered.totalVolumeUsd) },
        { label: 'Trade transactions', value: String(filtered.tradeCount) },
        { label: 'Priced trades', value: String(filtered.pricedTradeCount) },
        { label: 'Unpriced trades', value: String(filtered.unpricedTradeCount) },
        {
          label: 'Share of activity',
          value:
            filtered.activityPct != null ? `${filtered.activityPct.toFixed(1)}%` : '—',
        },
      ],
      tables: [
        {
          title: 'Volume by token',
          headers: [
            'Token',
            'Network',
            'Address',
            'Volume (USD)',
            'Share %',
            'Trades',
            'Unpriced',
          ],
          rows: byToken.map(row => [
            row.tokenSymbol,
            networkLabel(row.network),
            row.tokenAddress || '',
            row.unpriced ? '' : row.volumeUsd.toFixed(2),
            row.unpriced ? '' : row.pct.toFixed(1),
            row.tradeCount,
            row.unpriced ? 'yes' : 'no',
          ]),
        },
        {
          title: 'Trades',
          headers: [
            'Date',
            'Token',
            'Network',
            'Counterparty',
            'Volume (USD)',
            'Tx hash',
            'Method',
          ],
          rows: trades.map(tx => [
            tx.date,
            tx.tokenSymbol,
            networkLabel(tx.network),
            resolveCounterpartyDisplay(
              {
                counterparty: tx.counterparty,
                counterpartyLabel: tx.counterpartyLabel,
              },
              clients,
            ),
            tx.volumeUsd != null ? tx.volumeUsd.toFixed(2) : '',
            tx.hash,
            tx.methodName || '',
          ]),
        },
      ],
    };
  }, [
    detail,
    filtered,
    byToken,
    trades,
    earliestTradeLabel,
    clients,
    activePeriod,
    isCustomActive,
    customFrom,
    customTo,
    today,
  ]);

  const handleDownloadExcel = useCallback(async () => {
    try {
      const payload = buildExportPayload();
      if (!payload) {
        toast.info('No trading volume data to export');
        return;
      }
      const chartResult = await captureChartCard(chartCaptureRef.current, {
        background: '#0f1011',
      });
      if (chartResult) {
        payload.charts = [
          {
            title: showingLiveAll ? 'Volume over time' : 'Volume in selected period',
            dataUrl: chartResult.dataUrl,
            caption: chartResult.caption,
          },
        ];
      }
      const aiIncluded = await downloadReportExcel(payload);
      const extras = [
        chartResult ? 'chart' : null,
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
  }, [buildExportPayload, showingLiveAll]);

  const handleDownloadPdf = useCallback(async () => {
    try {
      const payload = buildExportPayload();
      if (!payload) {
        toast.info('No trading volume data to export');
        return;
      }
      const chartResult = await captureChartCard(chartCaptureRef.current, {
        background: '#0f1011',
      });
      if (chartResult) {
        payload.charts = [
          {
            title: showingLiveAll ? 'Volume over time' : 'Volume in selected period',
            dataUrl: chartResult.dataUrl,
            caption: chartResult.caption,
          },
        ];
      }
      const aiIncluded = await downloadReportPdf(payload);
      const extras = [
        chartResult ? 'chart' : null,
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
  }, [buildExportPayload, showingLiveAll]);

  if (isLoading && !detail) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-[#a855f7] animate-spin" />
          <span className="text-sm text-[#8a8f98]">Loading trading volume…</span>
        </div>
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="space-y-6">
        <PageHeader onBack={onBack} earliestTradeLabel={null} exportDisabled />
        <div className="bg-[#0f1011] border border-[#f6465d]/20 rounded-xl p-6 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-[#f6465d]" />
          <div className="flex-1">
            <p className="text-sm text-[#f6465d]">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-xs text-[#8a8f98] hover:text-[#d0d6e0] flex items-center gap-1"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!detail || detail.tradeCount === 0) {
    return (
      <div className="space-y-6">
        <PageHeader onBack={onBack} earliestTradeLabel={null} exportDisabled />
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-[#a855f7]/10 flex items-center justify-center mx-auto mb-4">
              <ArrowLeftRight className="h-6 w-6 text-[#a855f7]" />
            </div>
            <h3 className="text-lg font-medium text-[#f7f8f8] mb-2">No trading volume yet</h3>
            <p className="text-sm text-[#8a8f98] max-w-md mx-auto">
              No swap / DEX trades found in synced history. Sync your wallet to classify
              trade activity — volume covers all synced trades.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const heroVolume = filtered?.totalVolumeUsd ?? detail.totalVolumeUsd;
  const heroTrades = filtered?.tradeCount ?? detail.tradeCount;
  const heroActivityPct = filtered?.activityPct ?? detail.activityPct;

  const secondaryStats = [
    {
      label: 'Trade transactions',
      value: String(heroTrades),
      mono: true,
    },
    {
      label: 'Priced trades',
      value: String(filtered?.pricedTradeCount ?? detail.pricedTradeCount),
      mono: true,
    },
    {
      label: 'Unpriced trades',
      value: String(filtered?.unpricedTradeCount ?? detail.unpricedTradeCount),
      mono: true,
    },
    {
      label: 'Share of activity',
      value: heroActivityPct != null ? `${heroActivityPct.toFixed(1)}%` : '—',
      mono: true,
    },
  ];

  const handlePeriodClick = (days: TradingVolumePeriodDays) => {
    setActivePeriod(days);
    setCustomFrom(null);
    setCustomTo(null);
    setDraftFrom('');
    setDraftTo('');
  };

  const handleFilterOpenChange = (open: boolean) => {
    setFilterOpen(open);
    if (open) {
      setDraftFrom(customFrom || earliestDate || '');
      setDraftTo(customTo && customTo !== today ? customTo : today);
    }
  };

  const handleApplyCustom = () => {
    if (!draftFrom) return;
    let nextTo = draftTo || today;
    if (nextTo > today) nextTo = today;
    let nextFrom = draftFrom;
    if (nextFrom > nextTo) nextFrom = nextTo;
    setActivePeriod(0);
    setCustomFrom(nextFrom);
    setCustomTo(nextTo);
    setFilterOpen(false);
  };

  const handleClearCustom = () => {
    setCustomFrom(null);
    setCustomTo(null);
    setDraftFrom('');
    setDraftTo('');
    setFilterOpen(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        onBack={onBack}
        earliestTradeLabel={earliestTradeLabel}
        onDownloadPdf={handleDownloadPdf}
        onDownloadExcel={handleDownloadExcel}
      />

      {/* Hero */}
      <Card className="bg-[#0f1011] border-white/5 overflow-hidden relative">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at top right, ${ACCENT}18 0%, transparent 55%)`,
          }}
        />
        <CardContent className="p-6 sm:p-8 relative z-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-[#8a8f98] mb-2">
                {showingLiveAll ? 'Total trading volume' : 'Volume in selected period'}
              </p>
              <div className="flex flex-wrap items-baseline gap-3 sm:gap-4">
                <p
                  className="text-3xl sm:text-5xl font-bold font-mono-num tracking-tight"
                  style={{ color: ACCENT }}
                >
                  {formatUsd(heroVolume)}
                </p>
                <span className="text-sm sm:text-base text-[#8a8f98] font-mono-num">
                  {heroTrades.toLocaleString('en-US')} trade
                  {heroTrades === 1 ? '' : 's'}
                  {heroActivityPct != null ? ` · ${heroActivityPct.toFixed(1)}% of activity` : ''}
                </span>
              </div>
              <p className="text-xs text-[#8a8f98] mt-3 max-w-2xl leading-relaxed">
                {filtered?.periodLabel
                  ? `${filtered.periodLabel} · all synced trade history`
                  : 'All synced trade history'}
              </p>
            </div>

            <InvestmentReturnPeriodControls
              activePeriod={activePeriod}
              onPeriodClick={handlePeriodClick}
              baselineDate={earliestDate}
              today={today}
              isCustomActive={isCustomActive}
              filterOpen={filterOpen}
              onFilterOpenChange={handleFilterOpenChange}
              draftTo={draftTo}
              onDraftToChange={setDraftTo}
              onApplyCustom={handleApplyCustom}
              onClearCustom={handleClearCustom}
              fromEditable
              draftFrom={draftFrom}
              onDraftFromChange={setDraftFrom}
              fromFieldLabel="From"
              fromAriaLabel="Start date"
            />
          </div>
        </CardContent>
      </Card>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {secondaryStats.map(stat => (
          <div
            key={stat.label}
            className="bg-[#0f1011] border border-white/5 rounded-xl p-4"
          >
            <p className="text-xs text-[#8a8f98] mb-1.5">{stat.label}</p>
            <p
              className={`text-lg font-bold text-[#f7f8f8] ${stat.mono ? 'font-mono-num' : ''}`}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div
        ref={chartCaptureRef}
        className="bg-[#0f1011] border border-white/5 rounded-xl"
        data-export-chart={
          showingLiveAll ? 'Volume over time' : 'Volume in selected period'
        }
      >
        <div className="p-4 pb-0">
          <h3 className="text-[#f7f8f8] text-base font-medium">
            {showingLiveAll ? 'Volume over time' : 'Volume in selected period'}
          </h3>
          <p className="text-xs text-[#8a8f98] mt-1">
            Cumulative trading volume in USD
            {filtered?.periodLabel
              ? ` · ${filtered.periodLabel}`
              : earliestTradeLabel
                ? ` · from ${earliestTradeLabel}`
                : ''}
          </p>
          {filtered?.methodologyNote && (
            <p className="text-[10px] text-[#8a8f98]/70 mt-1 max-w-2xl leading-relaxed">
              {filtered.methodologyNote}
            </p>
          )}
        </div>
        <div className="p-4 pt-2">
          <div
            className="h-[280px] sm:h-[320px] w-full relative"
            dir="ltr"
          >
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={ACCENT} stopOpacity={0.35} />
                      <stop offset="55%" stopColor={ACCENT} stopOpacity={0.08} />
                      <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.04)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={d => formatAxisDate(String(d), activePeriod)}
                    stroke="rgba(255,255,255,0.1)"
                    tick={{ fill: '#8a8f98', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, maxVol + pad]}
                    tickFormatter={v => formatUsd(Number(v), true)}
                    stroke="rgba(255,255,255,0.1)"
                    tick={{ fill: '#8a8f98', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#191a1b',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px',
                      color: '#f7f8f8',
                      fontSize: '13px',
                      direction: 'ltr',
                    }}
                    labelStyle={{ color: '#8a8f98' }}
                    formatter={(value: number, name: string) => [
                      formatUsd(value),
                      name === 'daily' ? 'Day volume' : 'Cumulative',
                    ]}
                    labelFormatter={label =>
                      new Date(`${label}T00:00:00.000Z`).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        timeZone: 'UTC',
                      })
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="volume"
                    stroke={ACCENT}
                    strokeWidth={2}
                    fill={`url(#${gradId})`}
                    dot={chartData.length <= 3}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-[#8a8f98]">
                  No volume in this period. Try All or a longer range.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tokens / Trades */}
      <Card className="bg-[#0f1011] border-white/5">
        <CardContent className="p-0">
          <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-[#f7f8f8]">
                {listTab === 'tokens' ? 'Volume by token' : 'Recent trades'}
              </h3>
              <p className="text-xs text-[#8a8f98] mt-0.5">
                {listTab === 'tokens'
                  ? 'Trade notional by token · unpriced groups listed separately · sorted by volume'
                  : 'Newest trade-classified transactions in this window'}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-[#191a1b] rounded-lg p-0.5 self-start">
              <button
                type="button"
                className={`h-7 px-2.5 text-[11px] rounded-md transition-all ${
                  listTab === 'tokens'
                    ? 'bg-[#28282c] text-[#f7f8f8]'
                    : 'text-[#8a8f98] hover:text-[#d0d6e0]'
                }`}
                onClick={() => setListTab('tokens')}
              >
                By token
              </button>
              <button
                type="button"
                className={`h-7 px-2.5 text-[11px] rounded-md transition-all ${
                  listTab === 'trades'
                    ? 'bg-[#28282c] text-[#f7f8f8]'
                    : 'text-[#8a8f98] hover:text-[#d0d6e0]'
                }`}
                onClick={() => setListTab('trades')}
              >
                Trades
              </button>
            </div>
          </div>

          {listTab === 'tokens' ? (
            byToken.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-[#8a8f98]">No token volume in this window.</p>
              </div>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-[#8a8f98] border-b border-white/5">
                        <th className="px-4 py-3 font-medium">Token</th>
                        <th className="px-4 py-3 font-medium text-right">Volume</th>
                        <th className="px-4 py-3 font-medium text-right">Share</th>
                        <th className="px-4 py-3 font-medium text-right">Trades</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byToken.map(row => (
                        <tr
                          key={row.key}
                          className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-[#a855f7]/10 flex items-center justify-center text-[10px] font-bold text-[#c084fc]">
                                {row.tokenSymbol.slice(0, 3).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-[#f7f8f8]">{row.tokenSymbol}</p>
                                  {row.unpriced && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[#8a8f98]">
                                      Unpriced
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-[#8a8f98]">
                                  {networkLabel(row.network)}
                                  {row.tokenAddress ? ` · ${shortAddr(row.tokenAddress)}` : ''}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td
                            className="px-4 py-3 text-right font-mono-num font-medium"
                            style={{ color: row.unpriced ? '#8a8f98' : ACCENT }}
                          >
                            {row.unpriced ? 'Unpriced' : formatUsd(row.volumeUsd)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono-num text-[#d0d6e0]">
                            {row.unpriced ? '—' : `${row.pct.toFixed(1)}%`}
                          </td>
                          <td className="px-4 py-3 text-right text-[#8a8f98] font-mono-num">
                            {row.tradeCount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="md:hidden divide-y divide-white/5">
                  {byToken.map(row => (
                    <div key={row.key} className="p-4 space-y-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#a855f7]/10 flex items-center justify-center text-[10px] font-bold text-[#c084fc] shrink-0">
                          {row.tokenSymbol.slice(0, 3).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="font-medium text-[#f7f8f8] truncate">{row.tokenSymbol}</p>
                            {row.unpriced && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[#8a8f98] shrink-0">
                                Unpriced
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#8a8f98]">
                            {networkLabel(row.network)}
                            {row.tokenAddress ? ` · ${shortAddr(row.tokenAddress)}` : ''}
                          </p>
                        </div>
                        <span className="text-xs text-[#8a8f98] font-mono-num shrink-0">
                          {row.unpriced ? '—' : `${row.pct.toFixed(1)}%`}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span
                          className="text-lg font-bold font-mono-num"
                          style={{ color: row.unpriced ? '#8a8f98' : ACCENT }}
                        >
                          {row.unpriced ? 'Unpriced' : formatUsd(row.volumeUsd)}
                        </span>
                        <span className="text-xs text-[#8a8f98]">
                          {row.tradeCount} trade{row.tradeCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )
          ) : trades.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-[#8a8f98]">No trades in this window.</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-[#8a8f98] border-b border-white/5">
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Token</th>
                      <th className="px-4 py-3 font-medium">Counterparty</th>
                      <th className="px-4 py-3 font-medium text-right">Volume</th>
                      <th className="px-4 py-3 font-medium text-right">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map(tx => {
                      const url = explorerTxUrl(tx.network, tx.hash);
                      return (
                        <tr
                          key={tx.id}
                          className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                        >
                          <td className="px-4 py-3 text-[#d0d6e0] text-xs whitespace-nowrap">
                            {new Date(`${tx.date}T00:00:00.000Z`).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              timeZone: 'UTC',
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-[#f7f8f8]">{tx.tokenSymbol}</p>
                            <p className="text-[11px] text-[#8a8f98]">
                              {networkLabel(tx.network)}
                              {tx.tokenAddress ? ` · ${shortAddr(tx.tokenAddress)}` : ''}
                              {tx.methodName ? ` · ${tx.methodName}` : ''}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-xs text-[#8a8f98]">
                            {resolveCounterpartyDisplay(
                              {
                                counterparty: tx.counterparty,
                                counterpartyLabel: tx.counterpartyLabel,
                              },
                              clients,
                            )}
                          </td>
                          <td
                            className="px-4 py-3 text-right font-mono-num font-medium"
                            style={{ color: tx.volumeUsd != null ? ACCENT : '#8a8f98' }}
                          >
                            {tx.volumeUsd != null ? formatUsd(tx.volumeUsd) : 'Unpriced'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-[#8a8f98] hover:text-[#d0d6e0] font-mono-num"
                              >
                                {shortHash(tx.hash)}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-[11px] text-[#8a8f98] font-mono-num">
                                {shortHash(tx.hash)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden divide-y divide-white/5">
                {trades.map(tx => {
                  const url = explorerTxUrl(tx.network, tx.hash);
                  return (
                    <div key={tx.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-[#f7f8f8]">{tx.tokenSymbol}</p>
                          <p className="text-[11px] text-[#8a8f98]">
                            {networkLabel(tx.network)}
                            {tx.tokenAddress ? ` · ${shortAddr(tx.tokenAddress)}` : ''} ·{' '}
                            {new Date(`${tx.date}T00:00:00.000Z`).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              timeZone: 'UTC',
                            })}
                          </p>
                        </div>
                        <span
                          className="font-mono-num font-medium shrink-0"
                          style={{ color: tx.volumeUsd != null ? ACCENT : '#8a8f98' }}
                        >
                          {tx.volumeUsd != null ? formatUsd(tx.volumeUsd) : 'Unpriced'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#8a8f98]">
                        {resolveCounterpartyDisplay(
                          {
                            counterparty: tx.counterparty,
                            counterpartyLabel: tx.counterpartyLabel,
                          },
                          clients,
                        )}
                      </p>
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-[#8a8f98] hover:text-[#d0d6e0] font-mono-num"
                        >
                          {shortHash(tx.hash)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Methodology */}
      <div className="rounded-xl border border-white/5 bg-[#0f1011]/60 px-4 py-3">
        <p className="text-[11px] text-[#8a8f98] leading-relaxed">
          <span className="text-[#d0d6e0] font-medium">Methodology. </span>
          {detail.methodology}{' '}
          {filtered?.methodologyNote} Custom From can be any date up to To / today.
          Trading volume is excluded from Inflow / Outflow.
        </p>
      </div>

      {/* AI Analysis */}
      <AIAnalysisSection
        sectionTitle="Trading Volume"
        sectionColor={ACCENT}
        sectionType="trading-volume"
        page="trading-volume"
        period={activePeriod === 0 ? 'all' : `${activePeriod}d`}
        filters={
          isCustomActive
            ? { from: customFrom ?? today, to: customTo ?? today }
            : undefined
        }
      />
    </div>
  );
}

function PageHeader({
  onBack,
  earliestTradeLabel,
  onDownloadPdf,
  onDownloadExcel,
  exportDisabled = false,
}: {
  onBack: () => void;
  earliestTradeLabel: string | null;
  onDownloadPdf?: () => void | Promise<void>;
  onDownloadExcel?: () => void | Promise<void>;
  exportDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="w-9 h-9 rounded-lg bg-[#0f1011] border border-white/5 flex items-center justify-center hover:bg-[#191a1b] transition-colors"
          aria-label="Back to dashboard"
        >
          <ArrowRight className="h-4 w-4 text-[#8a8f98]" />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#a855f7]/10">
            <ArrowLeftRight className="h-5 w-5 text-[#a855f7]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#f7f8f8]">Trading volume</h2>
            <p className="text-xs text-[#8a8f98]">
              {earliestTradeLabel
                ? `All synced history · earliest trade ${earliestTradeLabel}`
                : 'All synced trade history'}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="bg-[#191a1b] border-white/5 text-[#d0d6e0] hover:bg-[#28282c] hover:text-[#f7f8f8]"
          onClick={onDownloadPdf}
          disabled={exportDisabled || !onDownloadPdf}
        >
          <FileText className="h-4 w-4 ml-1" />
          Download PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="bg-[#191a1b] border-white/5 text-[#d0d6e0] hover:bg-[#28282c] hover:text-[#f7f8f8]"
          onClick={onDownloadExcel}
          disabled={exportDisabled || !onDownloadExcel}
        >
          <FileSpreadsheet className="h-4 w-4 ml-1" />
          Download Excel
        </Button>
      </div>
    </div>
  );
}
