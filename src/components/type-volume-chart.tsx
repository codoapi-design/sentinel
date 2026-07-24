'use client';

import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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

const SERIES_COLOR = '#0052ff';

const DEFAULT_METHODOLOGY =
  'Based on filtered transactions of this type from synced wallet data · cumulative USD volume · period-relative';

export interface TypeVolumeChartProps {
  /** Chart source rows (parent chooses filtered vs type fallback) */
  transactions: Transaction[];
  /** Canonical type id: income | expense | trade | … */
  typeId: string;
  /** Display label, e.g. Income / Expense / Trade */
  typeLabel: string;
}

function formatValue(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
  return (
    '$' +
    abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
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

/** Titles: Income/Expense → "… over time"; Trade/DeFi/Gas → "… volume over time". */
export function typeVolumeChartTitle(typeId: string, typeLabel: string): string {
  const id = typeId.toLowerCase();
  if (id === 'income' || id === 'expense' || id === 'staking') {
    return `${typeLabel} over time`;
  }
  return `${typeLabel} volume over time`;
}

function normalizeChartTxs(transactions: Transaction[]): RelationshipTxInput[] {
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
 * Single-series Portfolio Performance clone — cumulative USD volume
 * for filtered transactions of one type (Income / Expense / Trade / …).
 */
export function TypeVolumeChart({
  transactions,
  typeId,
  typeLabel,
}: TypeVolumeChartProps) {
  const [activePeriod, setActivePeriod] = useState(30);
  const reactId = useId().replace(/:/g, '');
  const gradId = `typeVolGrad-${reactId}`;

  const title = typeVolumeChartTitle(typeId, typeLabel);

  const chartTxs = useMemo(() => normalizeChartTxs(transactions), [transactions]);

  const history = useMemo(
    () =>
      buildRelationshipHistory(chartTxs, {
        days: activePeriod,
        methodology: DEFAULT_METHODOLOGY,
      }),
    [chartTxs, activePeriod],
  );

  const data = useMemo(
    () => history.points.map(p => ({ date: p.date, value: p.volume })),
    [history.points],
  );

  const hasData = data.length >= 2 && history.periodVolume > 0;
  const minValue = hasData ? Math.min(...data.map(d => d.value)) : 0;
  const maxValue = hasData ? Math.max(...data.map(d => d.value)) : 0;

  const yDomain: [number, number] = [
    Math.max(0, minValue * 0.98),
    maxValue > 0 ? maxValue * 1.02 : 1,
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

  return (
    <div
      className="bg-[#0f1011] border border-white/5 rounded-xl"
      data-export-chart={title}
    >
      <div className="p-4 pb-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-[#f7f8f8] text-base font-medium">{title}</h3>
            <p className="text-xs text-[#8a8f98] mt-1">
              Cumulative {typeLabel.toLowerCase()} volume · values in USD
            </p>
            {hasData ? (
              <p className="text-xs mt-1.5 font-mono-num text-[#d0d6e0]">
                Volume {formatUsdFull(history.periodVolume)}
                <span className="text-[#8a8f98] mx-1.5">·</span>
                <span className="text-[#8a8f98]">
                  {history.volumeTxCount} transfer(s)
                </span>
              </p>
            ) : (
              <p className="text-xs text-[#8a8f98] mt-1.5">
                No volume in this period
              </p>
            )}
            <p className="text-[10px] text-[#8a8f98]/70 mt-1 max-w-xl leading-relaxed">
              {history.methodology}
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
              <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SERIES_COLOR} stopOpacity={0.3} />
                    <stop offset="50%" stopColor={SERIES_COLOR} stopOpacity={0.1} />
                    <stop offset="95%" stopColor={SERIES_COLOR} stopOpacity={0} />
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
                  formatter={(value: number) => [formatUsdFull(value), 'Volume']}
                  labelFormatter={label => {
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
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={SERIES_COLOR}
                  strokeWidth={2}
                  fill={`url(#${gradId})`}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: SERIES_COLOR,
                    stroke: '#0f1011',
                    strokeWidth: 2,
                  }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-[#8a8f98]">
              {transactions.length === 0
                ? 'No filtered transactions to chart. Adjust table filters or sync the wallet.'
                : 'No volume in this period. Try a longer range or sync the wallet.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
