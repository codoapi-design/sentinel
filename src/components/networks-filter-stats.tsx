'use client';

import { useMemo, type ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowDownLeft,
  ArrowUpDown,
  ArrowUpRight,
  FileText,
  Fuel,
  Globe,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { SUMMARY_INFLOW, SUMMARY_OUTFLOW } from '@/lib/finance/labels';
import { cn } from '@/lib/utils';

/** Minimal network-row shape for filter-bound stats (matches NetworksSection aggregates). */
export interface NetworkFilterStatRow {
  networkId: string;
  networkLabel: string;
  totalRevenue: number;
  totalExpenses: number;
  totalVolume: number;
  txCount: number;
  netFlow: number;
  gasFees: number;
}

const EMPTY = '—';

const cardClass = 'bg-[#0f1011] border-white/5 min-h-[56px] min-w-0';
const padClass = 'p-1.5 sm:p-2.5';
const labelClass = 'text-[9px] sm:text-[10px] text-[#8a8f98] truncate';
const valueClass = 'text-xs sm:text-sm font-semibold text-[#f7f8f8] leading-tight truncate';

function formatUsd(num: number): string {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCompactUsd(num: number): string {
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return formatUsd(num);
}

function StatCard({
  icon,
  label,
  children,
  glow,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  glow?: string;
}) {
  return (
    <Card
      className={cn(
        cardClass,
        'py-0 gap-0 shadow-none',
        glow && 'relative overflow-hidden',
      )}
    >
      {glow && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at top right, ${glow} 0%, transparent 70%)`,
          }}
        />
      )}
      <CardContent className={cn(padClass, 'px-1.5 sm:px-2.5', glow && 'relative z-10')}>
        <div className="flex items-center gap-1 mb-0.5 sm:mb-1 min-w-0">
          {icon}
          <p className={labelClass}>{label}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

interface NetworksPageFilterStatsProps {
  networks: NetworkFilterStatRow[];
}

/**
 * Networks tab: 2×4 filter-bound stats (same set as the table after spam/$0).
 * Row 1: Networks · Volume · Inflow · Outflow
 * Row 2: Net Flow · Gas Fees · Top Network · Transactions
 */
export function NetworksPageFilterStats({ networks }: NetworksPageFilterStatsProps) {
  const stats = useMemo(() => {
    if (networks.length === 0) {
      return {
        networkCount: 0,
        volume: 0,
        inflow: 0,
        outflow: 0,
        netFlow: 0,
        gasFees: 0,
        topNetwork: null as { label: string; volume: number; txCount: number } | null,
        txCount: 0,
      };
    }

    let volume = 0;
    let inflow = 0;
    let outflow = 0;
    let gasFees = 0;
    let txCount = 0;
    let topNetwork: { label: string; volume: number; txCount: number } | null = null;

    for (const ns of networks) {
      volume += ns.totalVolume;
      inflow += ns.totalRevenue;
      outflow += ns.totalExpenses;
      gasFees += ns.gasFees;
      txCount += ns.txCount;

      const candidate = {
        label: ns.networkLabel,
        volume: ns.totalVolume,
        txCount: ns.txCount,
      };
      if (!topNetwork) {
        topNetwork = candidate;
        continue;
      }
      if (ns.totalVolume > topNetwork.volume) {
        topNetwork = candidate;
      } else if (ns.totalVolume === topNetwork.volume && ns.txCount > topNetwork.txCount) {
        topNetwork = candidate;
      }
    }

    return {
      networkCount: networks.length,
      volume,
      inflow,
      outflow,
      netFlow: inflow - outflow,
      gasFees,
      topNetwork,
      txCount,
    };
  }, [networks]);

  const empty = networks.length === 0;
  const isNetPositive = stats.netFlow >= 0;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
        <StatCard
          icon={<Globe className="h-3 w-3 shrink-0 text-[#627eea]" />}
          label="Networks"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f7f8f8] leading-tight truncate">
            {stats.networkCount}
          </p>
        </StatCard>

        <StatCard
          icon={<ArrowUpDown className="h-3 w-3 shrink-0 text-[#0052ff]" />}
          label="Volume"
          glow="rgba(0, 82, 255, 0.06)"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#0052ff] leading-tight truncate">
            {empty ? EMPTY : `$${formatUsd(stats.volume)}`}
          </p>
        </StatCard>

        <StatCard
          icon={<ArrowDownLeft className="h-3 w-3 shrink-0 text-[#0ecb81]" />}
          label={SUMMARY_INFLOW}
          glow="rgba(14, 203, 129, 0.06)"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#0ecb81] leading-tight truncate">
            {empty ? EMPTY : `$${formatUsd(stats.inflow)}`}
          </p>
        </StatCard>

        <StatCard
          icon={<ArrowUpRight className="h-3 w-3 shrink-0 text-[#f6465d]" />}
          label={SUMMARY_OUTFLOW}
          glow="rgba(246, 70, 93, 0.06)"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f6465d] leading-tight truncate">
            {empty ? EMPTY : `$${formatUsd(stats.outflow)}`}
          </p>
        </StatCard>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
        <StatCard
          icon={
            isNetPositive ? (
              <TrendingUp className="h-3 w-3 shrink-0 text-[#0ecb81]" />
            ) : (
              <TrendingDown className="h-3 w-3 shrink-0 text-[#f6465d]" />
            )
          }
          label="Net Flow"
          glow={
            empty
              ? undefined
              : isNetPositive
                ? 'rgba(14, 203, 129, 0.06)'
                : 'rgba(246, 70, 93, 0.06)'
          }
        >
          <p
            className={cn(
              'text-xs sm:text-sm font-semibold font-mono-num leading-tight truncate',
              empty
                ? 'text-[#8a8f98]'
                : isNetPositive
                  ? 'text-[#0ecb81]'
                  : 'text-[#f6465d]',
            )}
          >
            {empty
              ? EMPTY
              : `${isNetPositive ? '+' : ''}$${formatUsd(stats.netFlow)}`}
          </p>
        </StatCard>

        <StatCard
          icon={<Fuel className="h-3 w-3 shrink-0 text-[#f7931a]" />}
          label="Gas Fees"
          glow="rgba(247, 147, 26, 0.06)"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f7931a] leading-tight truncate">
            {empty ? EMPTY : `$${formatUsd(stats.gasFees)}`}
          </p>
        </StatCard>

        <StatCard
          icon={<Globe className="h-3 w-3 shrink-0 text-[#627eea]" />}
          label="Top Network"
        >
          {stats.topNetwork ? (
            <>
              <p className={cn(valueClass, 'capitalize')} title={stats.topNetwork.label}>
                {stats.topNetwork.label}
              </p>
              <p className="text-[9px] sm:text-[10px] text-[#8a8f98] mt-0.5 truncate">
                {stats.topNetwork.volume > 0
                  ? `$${formatCompactUsd(stats.topNetwork.volume)}`
                  : `(${stats.topNetwork.txCount})`}
              </p>
            </>
          ) : (
            <>
              <p className={valueClass}>{EMPTY}</p>
              <p className="text-[9px] sm:text-[10px] text-[#8a8f98] mt-0.5">No data</p>
            </>
          )}
        </StatCard>

        <StatCard
          icon={<FileText className="h-3 w-3 shrink-0 text-[#8a8f98]" />}
          label="Transactions"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f7f8f8] leading-tight truncate">
            {stats.txCount}
          </p>
        </StatCard>
      </div>
    </div>
  );
}
