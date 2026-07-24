'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { Transaction } from '@/lib/mock-data';

/** Curated on-brand palette — distinct, not rainbow chaos */
const SLICE_COLORS = [
  '#0052ff', // portfolio blue
  '#0ecb81', // net green
  '#f6465d', // outflow red
  '#f7931a', // amber
  '#627eea', // ethereum violet
  '#8a8f98', // muted gray
  '#00d4aa', // teal
  '#2775ca', // usdc blue
  '#c99455', // warm bronze
  '#a0aec0', // cool slate
];

type MetricMode = 'volume' | 'count';
type GroupMode = 'activity' | 'token' | 'network';

export interface ActivityDonutChartProps {
  transactions: Transaction[];
  /** Optional network / context name for empty copy */
  contextLabel?: string;
  /**
   * Lock grouping to one dimension.
   * When set, Activity/Token/Network toggles are hidden.
   * Omit for auto Activity↔Token (Network Details default).
   */
  mode?: GroupMode;
}

interface SliceRow {
  name: string;
  value: number;
  count: number;
  volume: number;
  color: string;
  percent: number;
}

function formatUsd(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}K`;
  return (
    '$' +
    abs.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
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

function sliceKey(tx: Transaction, groupBy: GroupMode): string {
  if (groupBy === 'activity') {
    return (tx.activity || 'Transfer').trim() || 'Transfer';
  }
  if (groupBy === 'network') {
    return (
      (tx.networkLabel || tx.network || 'Unknown').trim() || 'Unknown'
    );
  }
  return (tx.token || 'Unknown').trim() || 'Unknown';
}

function aggregateSlices(
  transactions: Transaction[],
  groupBy: GroupMode,
  metric: MetricMode,
): SliceRow[] {
  const map = new Map<string, { count: number; volume: number }>();

  for (const tx of transactions) {
    const key = sliceKey(tx, groupBy);
    const abs = Math.abs(
      typeof tx.value === 'number' ? tx.value : Number(tx.value) || 0,
    );
    const prev = map.get(key) || { count: 0, volume: 0 };
    map.set(key, {
      count: prev.count + 1,
      volume: prev.volume + abs,
    });
  }

  const rows = Array.from(map.entries()).map(([name, agg]) => ({
    name,
    count: agg.count,
    volume: agg.volume,
    value: metric === 'volume' ? agg.volume : agg.count,
  }));

  const total = rows.reduce((s, r) => s + r.value, 0);
  if (total <= 0) return [];

  rows.sort((a, b) => b.value - a.value);

  return rows.map((r, i) => ({
    ...r,
    color: SLICE_COLORS[i % SLICE_COLORS.length],
    percent: (r.value / total) * 100,
  }));
}

/** Activity is sparse when ≤1 distinct type or one type owns ≥95% of rows. */
function isActivitySparse(transactions: Transaction[]): boolean {
  if (transactions.length === 0) return true;
  const counts = new Map<string, number>();
  for (const tx of transactions) {
    const key = (tx.activity || 'Transfer').trim() || 'Transfer';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (counts.size <= 1) return true;
  const max = Math.max(...counts.values());
  return max / transactions.length >= 0.95;
}

function DonutTooltip({
  active,
  payload,
  metric,
}: {
  active?: boolean;
  payload?: Array<{ payload: SliceRow }>;
  metric: MetricMode;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div
      className="bg-[#191a1b] border border-white/10 rounded-lg px-3 py-2 shadow-xl"
      dir="ltr"
    >
      <p className="text-xs font-medium text-[#f7f8f8] mb-1">{row.name}</p>
      <p className="text-[11px] text-[#d0d6e0]">
        {metric === 'volume' ? formatUsdFull(row.volume) : `${row.count} tx`}
        <span className="text-[#8a8f98]"> · {row.percent.toFixed(1)}%</span>
      </p>
      {metric === 'volume' && (
        <p className="text-[10px] text-[#8a8f98] mt-0.5">{row.count} transactions</p>
      )}
      {metric === 'count' && (
        <p className="text-[10px] text-[#8a8f98] mt-0.5">
          Volume {formatUsdFull(row.volume)}
        </p>
      )}
    </div>
  );
}

const GROUP_META: Record<
  GroupMode,
  { title: string; subtitle: string; noun: string }
> = {
  activity: {
    title: 'Activity Mix',
    subtitle: 'Share of activity types in filtered transactions',
    noun: 'activities',
  },
  token: {
    title: 'Token Mix',
    subtitle: 'Share of tokens in filtered transactions',
    noun: 'tokens',
  },
  network: {
    title: 'Network Mix',
    subtitle: 'Share of networks in filtered transactions',
    noun: 'networks',
  },
};

/**
 * Mix donut — share of activity / token / network in filtered transactions.
 * Default metric: USD volume. Pass `mode` to lock grouping (hides group toggles).
 */
export function ActivityDonutChart({
  transactions,
  contextLabel,
  mode,
}: ActivityDonutChartProps) {
  const [metric, setMetric] = useState<MetricMode>('volume');
  const [groupOverride, setGroupOverride] = useState<GroupMode | null>(null);

  const locked = mode != null;

  const autoGroup: GroupMode = useMemo(
    () => (isActivitySparse(transactions) ? 'token' : 'activity'),
    [transactions],
  );

  const groupBy: GroupMode = locked
    ? mode
    : (groupOverride ?? autoGroup);

  const slices = useMemo(
    () => aggregateSlices(transactions, groupBy, metric),
    [transactions, groupBy, metric],
  );

  const totalValue = slices.reduce((s, r) => s + r.value, 0);
  const totalCount = slices.reduce((s, r) => s + r.count, 0);
  const totalVolume = slices.reduce((s, r) => s + r.volume, 0);
  const hasData = slices.length > 0 && totalValue > 0;

  const meta = GROUP_META[groupBy];
  const title = meta.title;
  const subtitle =
    !locked && groupBy === 'token' && autoGroup === 'token'
      ? 'Share of tokens in filtered transactions (activity too uniform)'
      : meta.subtitle;

  const emptyMessage =
    transactions.length === 0
      ? `No filtered transactions${contextLabel ? ` on ${contextLabel}` : ''} to chart.`
      : groupBy === 'network'
        ? 'No network distribution in the current filter set.'
        : groupBy === 'token'
          ? 'No token distribution in the current filter set.'
          : 'No activity distribution in the current filter set.';

  return (
    <div
      className="bg-[#0f1011] border border-white/5 rounded-xl"
      data-export-chart={title}
    >
      <div className="p-4 pb-2">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h3 className="text-[#f7f8f8] text-base font-medium">{title}</h3>
            <p className="text-xs text-[#8a8f98] mt-1">{subtitle}</p>
            {hasData && (
              <p className="text-xs mt-1.5 font-mono-num text-[#d0d6e0]">
                {metric === 'volume'
                  ? `Volume ${formatUsd(totalVolume)}`
                  : `${totalCount} transactions`}
                <span className="text-[#8a8f98] mx-1.5">·</span>
                <span className="text-[#8a8f98]">
                  {slices.length} {meta.noun}
                </span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2" data-export-ignore>
            {!locked && (
              <div className="flex items-center gap-1 bg-[#191a1b] rounded-lg p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-8 px-3 text-xs rounded-md transition-all ${
                    groupBy === 'activity'
                      ? 'bg-[#28282c] text-[#f7f8f8]'
                      : 'text-[#8a8f98] hover:text-[#d0d6e0] hover:bg-transparent'
                  }`}
                  onClick={() => setGroupOverride('activity')}
                >
                  Activity
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-8 px-3 text-xs rounded-md transition-all ${
                    groupBy === 'token'
                      ? 'bg-[#28282c] text-[#f7f8f8]'
                      : 'text-[#8a8f98] hover:text-[#d0d6e0] hover:bg-transparent'
                  }`}
                  onClick={() => setGroupOverride('token')}
                >
                  Token
                </Button>
              </div>
            )}
            <div className="flex items-center gap-1 bg-[#191a1b] rounded-lg p-1">
              <Button
                variant="ghost"
                size="sm"
                className={`h-8 px-3 text-xs rounded-md transition-all ${
                  metric === 'volume'
                    ? 'bg-[#28282c] text-[#f7f8f8]'
                    : 'text-[#8a8f98] hover:text-[#d0d6e0] hover:bg-transparent'
                }`}
                onClick={() => setMetric('volume')}
              >
                Volume
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-8 px-3 text-xs rounded-md transition-all ${
                  metric === 'count'
                    ? 'bg-[#28282c] text-[#f7f8f8]'
                    : 'text-[#8a8f98] hover:text-[#d0d6e0] hover:bg-transparent'
                }`}
                onClick={() => setMetric('count')}
              >
                Count
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 pt-1">
        {!hasData ? (
          <div className="h-[220px] flex items-center justify-center text-sm text-[#8a8f98]">
            {emptyMessage}
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div
              className="h-[220px] w-full lg:w-[240px] lg:shrink-0 relative"
              dir="ltr"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={88}
                    paddingAngle={2}
                    stroke="rgba(15,16,17,0.9)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {slices.map(slice => (
                      <Cell key={slice.name} fill={slice.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutTooltip metric={metric} />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Center label */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] text-[#8a8f98] uppercase tracking-wide">
                  {metric === 'volume' ? 'Volume' : 'Txns'}
                </span>
                <span className="text-sm font-medium text-[#f7f8f8] font-mono-num">
                  {metric === 'volume' ? formatUsd(totalVolume) : totalCount}
                </span>
              </div>
            </div>

            <div className="flex-1 min-w-0 space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
              {slices.map(slice => (
                <div
                  key={slice.name}
                  className="flex items-center justify-between gap-3 text-xs py-1"
                  data-export-legend-item={`${slice.name} ${
                    metric === 'volume' ? formatUsd(slice.volume) : slice.count
                  } (${slice.percent.toFixed(0)}%)`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="text-[#d0d6e0] truncate">{slice.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-mono-num">
                    <span className="text-[#f7f8f8]">
                      {metric === 'volume'
                        ? formatUsd(slice.volume)
                        : slice.count}
                    </span>
                    <span className="text-[#8a8f98] w-12 text-right">
                      {slice.percent.toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
