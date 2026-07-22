'use client';

import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import type { Transaction } from '@/lib/mock-data';
import {
  buildRelationshipHistory,
  type RelationshipTxInput,
} from '@/lib/finance/client-relationship-history';

const periods = [
  { label: '24H', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 0 },
];

const REVENUE_COLOR = '#0ecb81';
const EXPENSE_COLOR = '#f6465d';
const NET_COLOR = '#0052ff';
const VOLUME_COLOR = '#8a8f98';

/** Chart plot height in px — passed to ResponsiveContainer so height never collapses to 0. */
const CHART_HEIGHT_PX = 280;

export interface RelationshipChartProps {
  transactions: Transaction[];
  title?: string;
  subtitle?: string;
  /** Methodology one-liner passed to the history builder */
  methodology?: string;
  /** Show period volume in the header subtitle (default true) */
  showPeriodVolume?: boolean;
}

function formatValue(value: number) {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return (
    sign +
    '$' +
    abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  );
}

function formatSignedFull(value: number) {
  const prefix = value > 0 ? '+' : '';
  return (
    prefix +
    (value < 0 ? '-' : '') +
    '$' +
    Math.abs(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatUsdFull(value: number) {
  return (
    '$' +
    Math.abs(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * Normalize table rows so Asset / Client / Network pages all feed the builder
 * the same shape (date, timestamp, type, absolute USD value).
 */
function normalizeChartTxs(transactions: Transaction[]): RelationshipTxInput[] {
  return transactions.map(tx => {
    const anyTx = tx as Transaction & {
      valueUsd?: number | string | null;
      classification?: string | null;
    };
    const raw = anyTx.value ?? anyTx.valueUsd ?? 0;
    const n = typeof raw === 'number' ? raw : Number(raw);
    return {
      date: tx.date || null,
      timestamp: typeof tx.timestamp === 'number' ? tx.timestamp : null,
      type: String(tx.type || ''),
      classification: anyTx.classification ?? null,
      typeLabel: tx.typeLabel || null,
      value: Number.isFinite(n) ? Math.abs(n) : 0,
      valueUsd: Number.isFinite(n) ? Math.abs(n) : 0,
    };
  });
}

export function RelationshipChart({
  transactions,
  title = 'Relationship over time',
  subtitle = 'Based on filtered transactions with this client',
  methodology,
  showPeriodVolume = true,
}: RelationshipChartProps) {
  const [activePeriod, setActivePeriod] = useState(30);
  const reactId = useId().replace(/:/g, '');
  const revenueGradId = `relRevenueGrad-${reactId}`;
  const expenseGradId = `relExpenseGrad-${reactId}`;
  const volumeGradId = `relVolumeGrad-${reactId}`;

  const chartTxs = useMemo(() => normalizeChartTxs(transactions), [transactions]);

  const history = useMemo(
    () => buildRelationshipHistory(chartTxs, { days: activePeriod, methodology }),
    [chartTxs, activePeriod, methodology],
  );

  const data = history.points;
  const showVolumeSeries = history.volumeOnly && history.periodVolume > 0;
  const hasData = data.length > 0 && (history.contributingTxCount > 0 || showVolumeSeries);
  const showDots = data.length <= 8;

  const seriesKeys = showVolumeSeries
    ? (['volume'] as const)
    : (['revenue', 'expense', 'netFlow'] as const);

  const minValue = hasData
    ? Math.min(0, ...data.flatMap(d => seriesKeys.map(k => d[k])))
    : 0;
  const maxValue = hasData
    ? Math.max(0, ...data.flatMap(d => seriesKeys.map(k => d[k])))
    : 0;
  const isNetPositive = history.periodNet >= 0;

  // Avoid [0,0] / NaN domains — Recharts draws nothing when domain collapses.
  const yDomain: [number, number] = [
    minValue < 0 ? minValue * 1.08 : 0,
    maxValue > 0 ? maxValue * 1.08 : Math.max(1, Math.abs(minValue) * 0.1 || 1),
  ];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (activePeriod <= 1) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
    }
    if (activePeriod <= 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
    }
    if (activePeriod === 0 || activePeriod >= 365) {
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const seriesLabels: Record<string, string> = {
    revenue: 'Revenue',
    expense: 'Expenses',
    netFlow: 'Net Flow',
    volume: 'Volume',
  };

  const tooltipLabels: Record<string, string> = {
    revenue: 'Revenue (cumulative)',
    expense: 'Expenses (cumulative)',
    netFlow: 'Net Flow (cumulative)',
    volume: 'Volume (cumulative)',
  };

  // Remount when series identity changes so ResponsiveContainer re-measures.
  const chartKey = `${activePeriod}-${data.length}-${history.periodRevenue}-${history.periodExpense}-${showVolumeSeries ? 'v' : 're'}`;

  return (
    <div className="bg-[#0f1011] border border-white/5 rounded-xl">
      <div className="p-4 pb-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-[#f7f8f8] text-base font-medium">{title}</h3>
            <p className="text-xs text-[#8a8f98] mt-1">{subtitle}</p>
            {hasData && !showVolumeSeries ? (
              <p className="text-xs mt-1.5 font-mono-num">
                <span style={{ color: REVENUE_COLOR }}>
                  ↑ {formatSignedFull(history.periodRevenue)}
                </span>
                <span className="text-[#8a8f98] mx-1.5">·</span>
                <span style={{ color: EXPENSE_COLOR }}>
                  ↓ {formatSignedFull(history.periodExpense)}
                </span>
                <span className="text-[#8a8f98] mx-1.5">·</span>
                <span style={{ color: isNetPositive ? NET_COLOR : EXPENSE_COLOR }}>
                  Net {formatSignedFull(history.periodNet)}
                </span>
                {showPeriodVolume && history.periodVolume > 0 ? (
                  <>
                    <span className="text-[#8a8f98] mx-1.5">·</span>
                    <span className="text-[#8a8f98]">
                      Vol {formatUsdFull(history.periodVolume)}
                    </span>
                  </>
                ) : null}
                <span className="ml-1.5 text-[#8a8f98]">in selected period</span>
              </p>
            ) : hasData && showVolumeSeries ? (
              <p className="text-xs mt-1.5 font-mono-num text-[#8a8f98]">
                No classified revenue/expense · Volume {formatUsdFull(history.periodVolume)} in
                selected period
              </p>
            ) : (
              <p className="text-xs text-[#8a8f98] mt-1.5">
                No classified activity in this period
              </p>
            )}
            <p className="text-[10px] text-[#8a8f98]/70 mt-1 max-w-xl leading-relaxed">
              {history.methodology}
              {history.contributingTxCount
                ? ` · ${history.contributingTxCount} contributing transfer(s)`
                : showVolumeSeries && history.volumeTxCount
                  ? ` · ${history.volumeTxCount} volume transfer(s)`
                  : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 bg-[#191a1b] rounded-lg p-1 self-start sm:self-auto">
            {periods.map(period => (
              <Button
                key={period.days}
                variant="ghost"
                size="sm"
                className={`h-7 px-2.5 text-xs rounded-md transition-all ${
                  activePeriod === period.days
                    ? 'bg-[#28282c] text-[#f7f8f8]'
                    : 'text-[#8a8f98] hover:text-[#d0d6e0] hover:bg-transparent'
                }`}
                onClick={() => setActivePeriod(period.days)}
              >
                {period.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <div className="p-4 pt-2">
        {/* Explicit pixel height — same pattern as cashflow-chart / portfolio-chart.
            Percentage height alone can collapse to 0 inside some parents while header still paints. */}
        <div
          className="w-full relative"
          style={{ height: CHART_HEIGHT_PX, minHeight: CHART_HEIGHT_PX }}
          dir="ltr"
        >
          {hasData ? (
            <ResponsiveContainer
              key={chartKey}
              width="100%"
              height={CHART_HEIGHT_PX}
              debounce={50}
            >
              <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id={revenueGradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={REVENUE_COLOR} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={REVENUE_COLOR} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id={expenseGradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={EXPENSE_COLOR} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={EXPENSE_COLOR} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id={volumeGradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={VOLUME_COLOR} stopOpacity={0.22} />
                    <stop offset="95%" stopColor={VOLUME_COLOR} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.06)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  stroke="rgba(255,255,255,0.1)"
                  tick={{ fill: '#8a8f98', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                />
                <YAxis
                  domain={yDomain}
                  tickFormatter={formatValue}
                  stroke="rgba(255,255,255,0.1)"
                  tick={{ fill: '#8a8f98', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                  allowDataOverflow={false}
                />
                {minValue < 0 && maxValue > 0 && (
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
                )}
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#191a1b',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    color: '#f7f8f8',
                    fontSize: '12px',
                    direction: 'ltr',
                  }}
                  labelStyle={{ color: '#8a8f98' }}
                  formatter={(value: number, name: string) => [
                    formatSignedFull(value),
                    tooltipLabels[name] || name,
                  ]}
                  labelFormatter={(label) => {
                    const d = new Date(label);
                    if (activePeriod <= 1) {
                      return d.toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      });
                    }
                    return d.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    });
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={28}
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, color: '#8a8f98', paddingBottom: 4 }}
                  formatter={(value: string) => seriesLabels[value] || value}
                />
                {showVolumeSeries ? (
                  <Area
                    type="monotone"
                    dataKey="volume"
                    name="volume"
                    stroke={VOLUME_COLOR}
                    strokeWidth={2.5}
                    fill={`url(#${volumeGradId})`}
                    fillOpacity={1}
                    isAnimationActive={false}
                    dot={showDots ? { r: 3.5, fill: VOLUME_COLOR, strokeWidth: 0 } : false}
                    activeDot={{
                      r: 4,
                      fill: VOLUME_COLOR,
                      stroke: '#0f1011',
                      strokeWidth: 2,
                    }}
                  />
                ) : (
                  <>
                    {/* Solid fillOpacity backup + gradient — strokes always visible even if url(#id) fails */}
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="revenue"
                      stroke={REVENUE_COLOR}
                      strokeWidth={2.5}
                      fill={`url(#${revenueGradId})`}
                      fillOpacity={1}
                      isAnimationActive={false}
                      dot={showDots ? { r: 3.5, fill: REVENUE_COLOR, strokeWidth: 0 } : false}
                      activeDot={{
                        r: 4,
                        fill: REVENUE_COLOR,
                        stroke: '#0f1011',
                        strokeWidth: 2,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="expense"
                      name="expense"
                      stroke={EXPENSE_COLOR}
                      strokeWidth={2.5}
                      fill={`url(#${expenseGradId})`}
                      fillOpacity={1}
                      isAnimationActive={false}
                      dot={showDots ? { r: 3.5, fill: EXPENSE_COLOR, strokeWidth: 0 } : false}
                      activeDot={{
                        r: 4,
                        fill: EXPENSE_COLOR,
                        stroke: '#0f1011',
                        strokeWidth: 2,
                      }}
                    />
                    {/* Line (not Area fill=none) — matches known-good cashflow stroke rendering */}
                    <Line
                      type="monotone"
                      dataKey="netFlow"
                      name="netFlow"
                      stroke={NET_COLOR}
                      strokeWidth={2.5}
                      strokeDasharray="5 4"
                      dot={showDots ? { r: 3, fill: NET_COLOR, strokeWidth: 0 } : false}
                      activeDot={{
                        r: 4,
                        fill: NET_COLOR,
                        stroke: '#0f1011',
                        strokeWidth: 2,
                      }}
                      isAnimationActive={false}
                    />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-[#8a8f98]">
              {transactions.length === 0
                ? 'No filtered transactions to chart. Adjust table filters or sync the wallet.'
                : 'No revenue or expense transactions in this period. Try a longer range.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Client page defaults — same component, fixed copy */
export function ClientRelationshipChart({ transactions }: { transactions: Transaction[] }) {
  return (
    <RelationshipChart
      transactions={transactions}
      title="Relationship over time"
      subtitle="Based on filtered transactions with this client"
      methodology="Cumulative revenue & expenses from filtered table rows · same classification as client cards · period-relative"
      showPeriodVolume={false}
    />
  );
}
