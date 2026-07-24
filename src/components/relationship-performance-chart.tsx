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
  Legend,
  ReferenceLine,
} from 'recharts';
import type { Transaction } from '@/lib/mock-data';
import {
  buildFlowPerformanceHistory,
  type FlowPerfTxInput,
} from '@/lib/finance/flow-performance-history';

const periods = [
  { label: '24H', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 0 },
];

/** Inflow — portfolio blue */
const INFLOW_COLOR = '#0052ff';
/** Outflow — expense red */
const OUTFLOW_COLOR = '#f6465d';
/** Net Flow — revenue green */
const NET_COLOR = '#0ecb81';
/** Volume — muted gray */
const VOLUME_COLOR = '#8a8f98';

export interface RelationshipPerformanceChartProps {
  /** Chart source rows (parent chooses filtered vs fallback) */
  transactions: Transaction[];
  /** e.g. "Asset Flow · ETH" or "Client Flow" */
  title: string;
  /** Short line under the title */
  subtitle?: string;
  /** Methodology string passed into the history builder */
  methodology?: string;
  /** Empty when there are no source txs at all */
  emptyNoTxs?: string;
  /** Empty when txs exist but none classify in the period */
  emptyNoClassified?: string;
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

function normalizeChartTxs(transactions: Transaction[]): FlowPerfTxInput[] {
  return transactions.map(tx => {
    const anyTx = tx as Transaction & {
      valueUsd?: number | string | null;
      classification?: string | null;
    };
    const raw = anyTx.value ?? anyTx.valueUsd ?? 0;
    const n = typeof raw === 'number' ? raw : Number(raw);
    const usd = Number.isFinite(n) ? Math.abs(n) : 0;
    return {
      date: tx.date || null,
      timestamp: typeof tx.timestamp === 'number' ? tx.timestamp : null,
      type: String(tx.type || ''),
      classification: anyTx.classification ?? null,
      typeLabel: tx.typeLabel || null,
      value: usd,
      valueUsd: usd,
    };
  });
}

/**
 * Shared Portfolio Performance visual clone — four monotone curves
 * (Inflow / Outflow / Net Flow / Volume) from filtered table txs.
 * Used by Asset Details and Client Details.
 */
export function RelationshipPerformanceChart({
  transactions,
  title,
  subtitle = 'Cumulative inflow, outflow, net & volume · values in USD',
  methodology =
    'Based on filtered table txs from synced DB · cumulative Inflow / Outflow / Net / Volume · period-relative',
  emptyNoTxs = 'No filtered transactions to chart. Adjust table filters or sync the wallet.',
  emptyNoClassified = 'No classified inflow/outflow in this period. Sync your wallet or try a longer range.',
}: RelationshipPerformanceChartProps) {
  const [activePeriod, setActivePeriod] = useState(30);
  const reactId = useId().replace(/:/g, '');
  const inflowGradId = `flowInflowGrad-${reactId}`;
  const outflowGradId = `flowOutflowGrad-${reactId}`;

  const chartTxs = useMemo(() => normalizeChartTxs(transactions), [transactions]);

  const history = useMemo(
    () =>
      buildFlowPerformanceHistory(chartTxs, {
        days: activePeriod,
        methodology,
      }),
    [chartTxs, activePeriod, methodology],
  );

  const data = history.points;
  const hasData =
    data.length >= 2 &&
    (history.periodInflow > 0 ||
      history.periodOutflow > 0 ||
      history.periodVolume > 0 ||
      Math.abs(history.periodNet) > 0);

  const seriesKeys = ['inflow', 'outflow', 'netFlow', 'volume'] as const;
  const minValue = hasData
    ? Math.min(0, ...data.flatMap(d => seriesKeys.map(k => d[k])))
    : 0;
  const maxValue = hasData
    ? Math.max(0, ...data.flatMap(d => seriesKeys.map(k => d[k])))
    : 0;
  const isNetPositive = history.periodNet >= 0;

  // Avoid [0,0] / NaN domains — Recharts draws nothing when domain collapses.
  const yDomain: [number, number] = [
    minValue < 0 ? minValue * 1.05 : Math.max(0, minValue * 0.98),
    maxValue > 0 ? maxValue * 1.05 : Math.max(1, Math.abs(minValue) * 0.1 || 1),
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
    inflow: 'Inflow',
    outflow: 'Outflow',
    netFlow: 'Net Flow',
    volume: 'Volume',
  };

  const tooltipLabels: Record<string, string> = {
    inflow: 'Inflow',
    outflow: 'Outflow',
    netFlow: 'Net Flow',
    volume: 'Volume',
  };

  return (
    <div
      className="bg-[#0f1011] border border-white/5 rounded-xl"
      data-export-chart={title}
      data-export-legend="Inflow · Outflow · Net Flow · Volume"
    >
      <div className="p-4 pb-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-[#f7f8f8] text-base font-medium">{title}</h3>
            <p className="text-xs text-[#8a8f98] mt-1">{subtitle}</p>
            {hasData ? (
              <p className="text-xs mt-1.5 font-mono-num">
                <span style={{ color: INFLOW_COLOR }}>
                  Inflow {formatUsdFull(history.periodInflow)}
                </span>
                <span className="text-[#8a8f98] mx-1.5">·</span>
                <span style={{ color: OUTFLOW_COLOR }}>
                  Outflow {formatUsdFull(history.periodOutflow)}
                </span>
                <span className="text-[#8a8f98] mx-1.5">·</span>
                <span style={{ color: isNetPositive ? NET_COLOR : OUTFLOW_COLOR }}>
                  Net {formatSignedFull(history.periodNet)}
                </span>
                <span className="text-[#8a8f98] mx-1.5">·</span>
                <span style={{ color: VOLUME_COLOR }}>
                  Volume {formatUsdFull(history.periodVolume)}
                </span>
              </p>
            ) : (
              <p className="text-xs text-[#8a8f98] mt-1.5">
                No classified inflow/outflow in this period
              </p>
            )}
            <p className="text-[10px] text-[#8a8f98]/70 mt-1 max-w-xl leading-relaxed">
              {history.methodology}
              {history.contributingTxCount
                ? ` · ${history.contributingTxCount} contributing transfer(s)`
                : history.volumeTxCount
                  ? ` · ${history.volumeTxCount} volume transfer(s)`
                  : ''}
            </p>
          </div>
          <div
            className="flex items-center gap-1 bg-[#191a1b] rounded-lg p-1"
            data-export-ignore
          >
            {periods.map(period => (
              <Button
                key={period.days}
                variant="ghost"
                size="sm"
                className={`h-8 px-3 text-xs rounded-md transition-all ${
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
        <div className="h-[300px] sm:h-[350px] w-full relative" dir="ltr">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id={inflowGradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={INFLOW_COLOR} stopOpacity={0.22} />
                    <stop offset="50%" stopColor={INFLOW_COLOR} stopOpacity={0.06} />
                    <stop offset="95%" stopColor={INFLOW_COLOR} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={outflowGradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={OUTFLOW_COLOR} stopOpacity={0.18} />
                    <stop offset="50%" stopColor={OUTFLOW_COLOR} stopOpacity={0.05} />
                    <stop offset="95%" stopColor={OUTFLOW_COLOR} stopOpacity={0} />
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
                  tick={{ fill: '#8a8f98', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={yDomain}
                  tickFormatter={formatValue}
                  stroke="rgba(255,255,255,0.1)"
                  tick={{ fill: '#8a8f98', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />
                {minValue < 0 && maxValue > 0 && (
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
                )}
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
                  iconType="plainline"
                  iconSize={12}
                  wrapperStyle={{ fontSize: 11, color: '#8a8f98', paddingBottom: 4 }}
                  formatter={(value: string) => seriesLabels[value] || value}
                />
                <Area
                  type="monotone"
                  dataKey="inflow"
                  name="inflow"
                  stroke={INFLOW_COLOR}
                  strokeWidth={2}
                  fill={`url(#${inflowGradId})`}
                  fillOpacity={1}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: INFLOW_COLOR,
                    stroke: '#0f1011',
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="outflow"
                  name="outflow"
                  stroke={OUTFLOW_COLOR}
                  strokeWidth={2}
                  fill={`url(#${outflowGradId})`}
                  fillOpacity={1}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: OUTFLOW_COLOR,
                    stroke: '#0f1011',
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="netFlow"
                  name="netFlow"
                  stroke={NET_COLOR}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: NET_COLOR,
                    stroke: '#0f1011',
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="volume"
                  name="volume"
                  stroke={VOLUME_COLOR}
                  strokeWidth={1.75}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={{
                    r: 3.5,
                    fill: VOLUME_COLOR,
                    stroke: '#0f1011',
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-[#8a8f98]">
              {transactions.length === 0 ? emptyNoTxs : emptyNoClassified}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
