'use client';

import { useId, useMemo, useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowRight,
  LineChart,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useInvestmentReturnDetail } from '@/hooks/use-investment-return-detail';
import type { InvestmentAssetStatus, InvestmentReturnAsset } from '@/lib/finance/investment-return';
import {
  applyInvestmentReturnPeriod,
  todayDateOnly,
  toDateOnly,
  type InvestmentReturnPeriodDays,
} from '@/lib/finance/investment-return-period';
import { InvestmentReturnPeriodControls } from '@/components/investment-return-period-controls';
import type { InvestmentReturnAssetParams } from '@/hooks/use-investment-return-asset';

interface InvestmentReturnPageProps {
  onBack: () => void;
  onAssetClick?: (asset: InvestmentReturnAssetParams) => void;
}

function formatUsd(value: number, compact = false): string {
  const abs = Math.abs(value);
  if (compact) {
    if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `$${(abs / 1_000).toFixed(2)}K`;
  }
  return `$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatSignedUsd(value: number, compact = false): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatUsd(value, compact)}`;
}

function pnlColor(value: number): string {
  if (value > 0) return '#0ecb81';
  if (value < 0) return '#f6465d';
  return '#8a8f98';
}

function statusLabel(status: InvestmentAssetStatus): string {
  if (status === 'open') return 'Held';
  if (status === 'closed') return 'Closed';
  return 'Partial';
}

function statusStyles(status: InvestmentAssetStatus): string {
  if (status === 'open') return 'bg-[#0ecb81]/10 text-[#0ecb81]';
  if (status === 'closed') return 'bg-white/5 text-[#8a8f98]';
  return 'bg-[#f7931a]/10 text-[#f7931a]';
}

function networkLabel(network: string): string {
  if (!network) return '—';
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

function toAssetParams(asset: InvestmentReturnAsset): InvestmentReturnAssetParams {
  return {
    symbol: asset.tokenSymbol,
    address: asset.tokenAddress,
    chainId: asset.chainId,
    network: asset.network,
  };
}

export function InvestmentReturnPage({ onBack, onAssetClick }: InvestmentReturnPageProps) {
  const reactId = useId().replace(/:/g, '');
  const { detail, isLoading, error, refetch } = useInvestmentReturnDetail();
  const gradId = `invReturnGrad-${reactId}`;

  const [activePeriod, setActivePeriod] = useState<InvestmentReturnPeriodDays>(0);
  /** Applied custom end date; null means “to today” (no custom range). */
  const [customTo, setCustomTo] = useState<string | null>(null);
  const [draftTo, setDraftTo] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  const baselineDate = detail?.sinceConnectedAt
    ? toDateOnly(detail.sinceConnectedAt)
    : '';
  const today = todayDateOnly();
  const isCustomActive = customTo != null && customTo !== today;
  const effectiveTo = customTo || today;

  // Keep applied custom To clamped if baseline/today shift
  useEffect(() => {
    if (!baselineDate || !customTo) return;
    let next = customTo;
    if (next < baselineDate) next = baselineDate;
    if (next > today) next = today;
    if (next !== customTo) setCustomTo(next === today ? null : next);
  }, [baselineDate, today, customTo]);

  const filtered = useMemo(() => {
    if (!detail?.trackingActive) return null;
    return applyInvestmentReturnPeriod(detail, {
      periodDays: activePeriod,
      customTo: effectiveTo,
      today,
    });
  }, [detail, activePeriod, effectiveTo, today]);

  const chartData = useMemo(
    () => (filtered?.chartHistory ?? []).map(p => ({ date: p.date, pnl: p.totalPnlUsd })),
    [filtered],
  );

  const minPnl = chartData.length ? Math.min(...chartData.map(d => d.pnl), 0) : 0;
  const maxPnl = chartData.length ? Math.max(...chartData.map(d => d.pnl), 0) : 0;
  const pad = Math.max(Math.abs(maxPnl - minPnl) * 0.08, 1);

  const sinceLabel = detail?.sinceConnectedAt
    ? new Date(detail.sinceConnectedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  const assets = filtered?.assets ?? detail?.assets ?? [];
  const showingLiveAll = activePeriod === 0 && !isCustomActive;

  if (isLoading && !detail) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 text-[#0052ff] animate-spin" />
          <span className="text-sm text-[#8a8f98]">Loading investment return…</span>
        </div>
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="space-y-6">
        <PageHeader onBack={onBack} sinceLabel={null} />
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

  if (!detail?.trackingActive) {
    return (
      <div className="space-y-6">
        <PageHeader onBack={onBack} sinceLabel={null} />
        <Card className="bg-[#0f1011] border-white/5">
          <CardContent className="p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-4">
              <LineChart className="h-6 w-6 text-[#8a8f98]" />
            </div>
            <h3 className="text-lg font-medium text-[#f7f8f8] mb-2">Tracking not started</h3>
            <p className="text-sm text-[#8a8f98] max-w-md mx-auto">
              Investment return is measured from wallet connect / first successful portfolio sync.
              Sync your wallet to establish a baseline.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const view = filtered;
  const heroPnl = view?.totalPnlUsd ?? detail.totalPnlUsd;
  const heroPct = view?.returnPct ?? detail.returnPct;
  const heroAccent = heroPnl >= 0 ? '#0ecb81' : '#f6465d';

  const unrealizedLabel = view?.unrealizedIsLive ? 'Unrealized' : 'MTM change';
  const secondaryStats = [
    {
      label: unrealizedLabel,
      value: view?.unrealizedPnlUsd ?? detail.unrealizedPnlUsd,
      signed: true,
    },
    {
      label: 'Realized',
      value: view?.realizedPnlUsd ?? detail.realizedPnlUsd,
      signed: true,
    },
    {
      label: 'Baseline value',
      value: detail.baselineValueUsd ?? detail.costBasisOpenUsd + detail.costBasisClosedUsd,
      signed: false,
    },
    {
      label: 'Current holdings',
      value: view?.marketValueOpenUsd ?? detail.marketValueOpenUsd,
      signed: false,
    },
  ];

  const handlePeriodClick = (days: InvestmentReturnPeriodDays) => {
    setActivePeriod(days);
    setCustomTo(null);
    setDraftTo('');
  };

  const handleFilterOpenChange = (open: boolean) => {
    setFilterOpen(open);
    if (open) {
      setDraftTo(customTo && customTo !== today ? customTo : '');
    }
  };

  const handleApplyCustom = () => {
    if (!draftTo) return;
    let next = draftTo;
    if (baselineDate && next < baselineDate) next = baselineDate;
    if (next > today) next = today;
    // Custom range is always baseline → To (matches fixed From in the popover)
    setActivePeriod(0);
    setCustomTo(next === today ? null : next);
    setFilterOpen(false);
  };

  const handleClearCustom = () => {
    setCustomTo(null);
    setDraftTo('');
    setFilterOpen(false);
  };

  const handleAssetActivate = (asset: InvestmentReturnAsset) => {
    onAssetClick?.(toAssetParams(asset));
  };

  return (
    <div className="space-y-6">
      <PageHeader onBack={onBack} sinceLabel={sinceLabel} />

      {/* Hero total */}
      <Card className="bg-[#0f1011] border-white/5 overflow-hidden relative">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at top right, ${heroAccent}18 0%, transparent 55%)`,
          }}
        />
        <CardContent className="p-6 sm:p-8 relative z-10">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-[#8a8f98] mb-2">
                {showingLiveAll
                  ? 'Total return since connected'
                  : 'Return in selected period'}
              </p>
              <div className="flex flex-wrap items-baseline gap-3 sm:gap-4">
                <p
                  className="text-3xl sm:text-5xl font-bold font-mono-num tracking-tight"
                  style={{ color: heroAccent }}
                >
                  {formatSignedUsd(heroPnl)}
                </p>
                {heroPct != null && (
                  <span
                    className="text-xl sm:text-2xl font-semibold font-mono-num"
                    style={{ color: pnlColor(heroPct) }}
                  >
                    {heroPct >= 0 ? '+' : ''}
                    {heroPct.toFixed(2)}%
                  </span>
                )}
              </div>
              <p className="text-xs text-[#8a8f98] mt-3 max-w-2xl leading-relaxed">
                {view?.periodLabel
                  ? `${view.periodLabel} · mark-to-market vs lot cost basis since connect`
                  : 'Mark-to-market vs lot cost basis since connect — not lifetime on-chain ROI before connect.'}
              </p>
            </div>

            <InvestmentReturnPeriodControls
              activePeriod={activePeriod}
              onPeriodClick={handlePeriodClick}
              baselineDate={baselineDate}
              today={today}
              isCustomActive={isCustomActive}
              filterOpen={filterOpen}
              onFilterOpenChange={handleFilterOpenChange}
              draftTo={draftTo}
              onDraftToChange={setDraftTo}
              onApplyCustom={handleApplyCustom}
              onClearCustom={handleClearCustom}
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
              className="text-lg font-bold font-mono-num"
              style={{ color: stat.signed ? pnlColor(stat.value) : '#f7f8f8' }}
            >
              {stat.signed ? formatSignedUsd(stat.value, true) : formatUsd(stat.value, true)}
            </p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-[#0f1011] border border-white/5 rounded-xl">
        <div className="p-4 pb-0">
          <h3 className="text-[#f7f8f8] text-base font-medium">
            {showingLiveAll
              ? 'Return since connected'
              : 'Return in selected period'}
          </h3>
          <p className="text-xs text-[#8a8f98] mt-1">
            Cumulative period PnL in USD
            {view?.periodLabel ? ` · ${view.periodLabel}` : sinceLabel ? ` · from ${sinceLabel}` : ''}
          </p>
          {(view?.methodologyNote || detail.historyMethodology) && (
            <p className="text-[10px] text-[#8a8f98]/70 mt-1 max-w-2xl leading-relaxed">
              {view?.methodologyNote ?? detail.historyMethodology}
            </p>
          )}
        </div>
        <div className="p-4 pt-2">
          <div className="h-[280px] sm:h-[320px] w-full relative" dir="ltr">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={heroAccent} stopOpacity={0.35} />
                      <stop offset="55%" stopColor={heroAccent} stopOpacity={0.08} />
                      <stop offset="95%" stopColor={heroAccent} stopOpacity={0} />
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
                    domain={[minPnl - pad, maxPnl + pad]}
                    tickFormatter={v => formatSignedUsd(Number(v), true)}
                    stroke="rgba(255,255,255,0.1)"
                    tick={{ fill: '#8a8f98', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                  />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
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
                    formatter={(value: number) => [formatSignedUsd(value), 'Period PnL']}
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
                    dataKey="pnl"
                    stroke={heroAccent}
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
                  No chart history in this period. Sync again or choose a longer range.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assets contributing to return */}
      <Card className="bg-[#0f1011] border-white/5">
        <CardContent className="p-0">
          <div className="p-4 border-b border-white/5">
            <h3 className="text-sm font-medium text-[#f7f8f8]">Assets contributing to return</h3>
            <p className="text-xs text-[#8a8f98] mt-0.5">
              {showingLiveAll
                ? 'Tokens held or fully exited after connect · sorted by absolute PnL · click a row for detail'
                : 'Period-attributable PnL where lot exit dates / live MTM allow · sorted by absolute PnL · click a row for detail'}
            </p>
          </div>

          {assets.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-[#8a8f98]">
                {showingLiveAll
                  ? 'No lot activity yet. Positions at connect become baseline lots after the first sync.'
                  : 'No attributable asset PnL in this window. Try All or a longer range.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-[#8a8f98] border-b border-white/5">
                      <th className="px-4 py-3 font-medium">Token</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Return</th>
                      <th className="px-4 py-3 font-medium text-right">Return %</th>
                      <th className="px-4 py-3 font-medium">Period</th>
                      <th className="px-4 py-3 font-medium text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map(asset => (
                      <tr
                        key={asset.key}
                        className={`border-b border-white/[0.04] transition-colors ${
                          onAssetClick
                            ? 'hover:bg-white/[0.04] cursor-pointer'
                            : 'hover:bg-white/[0.02]'
                        }`}
                        onClick={() => handleAssetActivate(asset)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleAssetActivate(asset);
                          }
                        }}
                        tabIndex={onAssetClick ? 0 : undefined}
                        role={onAssetClick ? 'link' : undefined}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-bold text-[#d0d6e0]">
                              {asset.tokenSymbol.slice(0, 3).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-[#f7f8f8]">{asset.tokenSymbol}</p>
                              <p className="text-[11px] text-[#8a8f98]">
                                {networkLabel(asset.network)}
                                {asset.status === 'open' && asset.marketValueOpenUsd > 0
                                  ? ` · ${formatUsd(asset.marketValueOpenUsd, true)} held`
                                  : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${statusStyles(asset.status)}`}
                          >
                            {statusLabel(asset.status)}
                          </span>
                        </td>
                        <td
                          className="px-4 py-3 text-right font-mono-num font-medium"
                          style={{ color: pnlColor(asset.totalPnlUsd) }}
                        >
                          {formatSignedUsd(asset.totalPnlUsd)}
                        </td>
                        <td
                          className="px-4 py-3 text-right font-mono-num"
                          style={{ color: pnlColor(asset.returnPct ?? 0) }}
                        >
                          {asset.returnPct != null
                            ? `${asset.returnPct >= 0 ? '+' : ''}${asset.returnPct.toFixed(2)}%`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-[#d0d6e0] text-xs max-w-[220px]">
                          {asset.periodLabel}
                        </td>
                        <td className="px-4 py-3 text-right text-[#8a8f98] text-xs">
                          {asset.durationLabel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-white/5">
                {assets.map(asset => (
                  <button
                    key={asset.key}
                    type="button"
                    className="w-full text-left p-4 space-y-2 hover:bg-white/[0.02] transition-colors"
                    onClick={() => handleAssetActivate(asset)}
                    disabled={!onAssetClick}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-bold text-[#d0d6e0] shrink-0">
                          {asset.tokenSymbol.slice(0, 3).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-[#f7f8f8] truncate">{asset.tokenSymbol}</p>
                          <p className="text-[11px] text-[#8a8f98]">{networkLabel(asset.network)}</p>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${statusStyles(asset.status)}`}
                      >
                        {statusLabel(asset.status)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span
                        className="text-lg font-bold font-mono-num"
                        style={{ color: pnlColor(asset.totalPnlUsd) }}
                      >
                        {formatSignedUsd(asset.totalPnlUsd)}
                      </span>
                      <span className="text-xs text-[#8a8f98]">
                        {asset.returnPct != null
                          ? `${asset.returnPct >= 0 ? '+' : ''}${asset.returnPct.toFixed(2)}% · `
                          : ''}
                        {asset.durationLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#8a8f98]">{asset.periodLabel}</p>
                    {(asset.unrealizedPnlUsd !== 0 || asset.realizedPnlUsd !== 0) && (
                      <p className="text-[11px] text-[#8a8f98]/80">
                        Unrealized {formatSignedUsd(asset.unrealizedPnlUsd)} · Realized{' '}
                        {formatSignedUsd(asset.realizedPnlUsd)}
                      </p>
                    )}
                  </button>
                ))}
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
          {view?.methodologyNote} Closed assets keep realized PnL tied to exit date. Gas does not
          create lots. Chart history grows with each sync
          {detail.historySource === 'portfolio_approx'
            ? ' (currently approximated from portfolio value snapshots)'
            : ''}
          . Period start is never before wallet connect.
        </p>
      </div>
    </div>
  );
}

function PageHeader({
  onBack,
  sinceLabel,
}: {
  onBack: () => void;
  sinceLabel: string | null;
}) {
  return (
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
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#0ecb81]/10">
          <LineChart className="h-5 w-5 text-[#0ecb81]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#f7f8f8]">Investment return</h2>
          <p className="text-xs text-[#8a8f98]">
            {sinceLabel
              ? `Since connected · ${sinceLabel}`
              : 'Mark-to-market return since wallet connect'}
          </p>
        </div>
      </div>
    </div>
  );
}
