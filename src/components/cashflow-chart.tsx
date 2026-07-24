'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
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
import { useWalletStore } from '@/stores/wallet-store';
import { Loader2 } from 'lucide-react';
import type { CashflowMetric } from '@/lib/finance/cashflow-history';
import { SUMMARY_INFLOW, SUMMARY_OUTFLOW } from '@/lib/finance/labels';

const periods = [
  { label: '24H', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 0 },
];

interface HistoryPoint {
  date: string;
  value: number;
  daily?: number;
}

interface HistoryPayload {
  points: HistoryPoint[];
  periodTotal: number;
  methodology: string;
  contributingTxCount: number;
  metric: CashflowMetric;
  bucket: 'hour' | 'day';
}

const METRIC_UI: Record<
  CashflowMetric,
  { title: string; color: string; valueLabel: string }
> = {
  revenue: {
    title: 'Inflow Movement',
    color: '#0ecb81',
    valueLabel: SUMMARY_INFLOW,
  },
  expenses: {
    title: 'Outflow Movement',
    color: '#f6465d',
    valueLabel: SUMMARY_OUTFLOW,
  },
  netFlow: {
    title: 'Net Flow Movement',
    color: '#0052ff',
    valueLabel: 'Net Flow',
  },
  gas: {
    title: 'Gas Fees Movement',
    color: '#f7931a',
    valueLabel: 'Gas',
  },
};

interface CashflowChartProps {
  metric: CashflowMetric;
}

export function CashflowChart({ metric }: CashflowChartProps) {
  const ui = METRIC_UI[metric];
  const [activePeriod, setActivePeriod] = useState(30);
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [meta, setMeta] = useState<Omit<HistoryPayload, 'points'> | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState<string | null>(null);

  const activeWalletId = useWalletStore(s => s.activeWalletId);
  const lastSyncAt = useWalletStore(s => s.lastSyncAt);
  const syncStamp = activeWalletId ? lastSyncAt[activeWalletId] : 0;

  const loadHistory = useCallback(async () => {
    if (!activeWalletId) {
      setPoints([]);
      setMeta(null);
      return;
    }
    setChartLoading(true);
    setChartError(null);
    try {
      const params = new URLSearchParams({
        walletId: activeWalletId,
        days: String(activePeriod),
        metric,
      });
      const res = await fetch(`/api/portfolio/cashflow-history?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load history (${res.status})`);
      }
      const json = await res.json();
      const data = json.data as HistoryPayload;
      setPoints(Array.isArray(data.points) ? data.points : []);
      setMeta({
        periodTotal: data.periodTotal,
        methodology: data.methodology,
        contributingTxCount: data.contributingTxCount,
        metric: data.metric,
        bucket: data.bucket,
      });
    } catch (err) {
      setChartError(err instanceof Error ? err.message : 'Failed to load chart');
      setPoints([]);
      setMeta(null);
    } finally {
      setChartLoading(false);
    }
  }, [activeWalletId, activePeriod, metric]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, syncStamp]);

  const data = points;
  const minValue = data.length ? Math.min(0, ...data.map(d => d.value)) : 0;
  const maxValue = data.length ? Math.max(0, ...data.map(d => d.value)) : 0;
  const periodTotal = meta?.periodTotal ?? (data.length ? data[data.length - 1].value : 0);
  const isPositive = periodTotal >= 0;

  const formatValue = (value: number) => {
    const sign = value < 0 ? '-' : '';
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
    return (
      sign +
      '$' +
      abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    );
  };

  const formatSignedFull = (value: number) => {
    const prefix = value > 0 && metric === 'netFlow' ? '+' : '';
    return (
      prefix +
      (value < 0 ? '-' : '') +
      '$' +
      Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  };

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

  const gradientId = useMemo(() => `cashflowGradient-${metric}`, [metric]);

  if (!activeWalletId) {
    return (
      <div className="bg-[#0f1011] border border-white/5 rounded-xl p-6">
        <h3 className="text-[#f7f8f8] text-base font-medium mb-2">{ui.title}</h3>
        <p className="text-sm text-[#8a8f98]">Select a wallet to see movement over time.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0f1011] border border-white/5 rounded-xl">
      <div className="p-4 pb-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-[#f7f8f8] text-base font-medium">{ui.title}</h3>
            <p className="text-xs text-[#8a8f98] mt-1">
              {chartLoading && data.length === 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading cash-flow history…
                </span>
              ) : data.length > 0 ? (
                <>
                  <span style={{ color: isPositive ? ui.color : '#f6465d' }}>
                    {isPositive && metric !== 'expenses' && metric !== 'gas' ? '↑' : metric === 'netFlow' && !isPositive ? '↓' : ''}{' '}
                    {formatSignedFull(periodTotal)}
                  </span>
                  <span className="ml-1 text-[#8a8f98]">in selected period</span>
                </>
              ) : (
                !chartLoading && 'No classified activity in this period'
              )}
            </p>
            <p className="text-[10px] text-[#8a8f98]/70 mt-1 max-w-xl leading-relaxed">
              Based on classified transactions in your synced history
              {meta?.contributingTxCount
                ? ` · ${meta.contributingTxCount} contributing transfer(s)`
                : ''}
            </p>
            {chartError && (
              <p className="text-[10px] text-[#f6465d] mt-1">{chartError}</p>
            )}
          </div>
          <div className="flex items-center gap-1 bg-[#191a1b] rounded-lg p-1">
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
        <div className="h-[280px] sm:h-[320px] w-full relative" dir="ltr">
          {chartLoading && data.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <Loader2 className="h-6 w-6 text-[#0052ff] animate-spin" />
            </div>
          )}
          {data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={ui.color} stopOpacity={0.3} />
                    <stop offset="50%" stopColor={ui.color} stopOpacity={0.1} />
                    <stop offset="95%" stopColor={ui.color} stopOpacity={0} />
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
                  domain={[
                    minValue < 0 ? minValue * 1.08 : minValue * 0.98,
                    maxValue > 0 ? maxValue * 1.05 : Math.max(1, Math.abs(minValue) * 0.1),
                  ]}
                  tickFormatter={formatValue}
                  stroke="rgba(255,255,255,0.1)"
                  tick={{ fill: '#8a8f98', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />
                {metric === 'netFlow' && minValue < 0 && maxValue > 0 && (
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
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
                  formatter={(value: number) => [formatSignedFull(value), `${ui.valueLabel} (cumulative)`]}
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
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={ui.color}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: ui.color,
                    stroke: '#0f1011',
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            !chartLoading && (
              <div className="h-full flex items-center justify-center text-sm text-[#8a8f98]">
                No classified transactions in this period. Sync your wallet or try a longer range.
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
