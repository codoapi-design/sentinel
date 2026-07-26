'use client';

import { useMemo, type ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowDownLeft,
  ArrowUpDown,
  ArrowUpRight,
  CircleDollarSign,
  Globe,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import type { Transaction } from '@/lib/mock-data';
import { SUMMARY_INFLOW, SUMMARY_OUTFLOW } from '@/lib/finance/labels';
import { cn } from '@/lib/utils';

/** Minimal client-row shape for filter-bound stats (matches ClientsSection aggregates). */
export interface ClientFilterStatRow {
  address: string;
  label: string;
  isDefined: boolean;
  client?: { name: string };
  totalRevenue: number;
  totalExpenses: number;
  totalVolume: number;
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

function truncateDisplay(text: string, max = 16): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function clientDisplayName(cp: ClientFilterStatRow): string {
  if (cp.isDefined && cp.client?.name) return cp.client.name;
  if (cp.label && cp.label !== cp.address) return cp.label;
  return `${cp.address.slice(0, 6)}...${cp.address.slice(-4)}`;
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

interface ClientsPageFilterStatsProps {
  clients: ClientFilterStatRow[];
  /** Visible (spam-filtered) txs — used for Top Network across filtered clients. */
  transactions?: Transaction[];
}

/**
 * Clients tab: 2×4 filter-bound stats (same set as the table after search + spam/$0).
 * Row 1: Clients · Volume · Inflow · Outflow
 * Row 2: Net Flow · Top Client · Top Network · Avg Volume
 */
export function ClientsPageFilterStats({
  clients,
  transactions = [],
}: ClientsPageFilterStatsProps) {
  const stats = useMemo(() => {
    if (clients.length === 0) {
      return {
        clientCount: 0,
        volume: 0,
        inflow: 0,
        outflow: 0,
        netFlow: 0,
        topClient: null as { name: string; volume: number } | null,
        topNetwork: null as { label: string; volume: number; count: number } | null,
        avgVolume: 0,
      };
    }

    let volume = 0;
    let inflow = 0;
    let outflow = 0;
    let topClient: { name: string; volume: number } | null = null;

    for (const cp of clients) {
      volume += cp.totalVolume;
      inflow += cp.totalRevenue;
      outflow += cp.totalExpenses;

      if (!topClient || cp.totalVolume > topClient.volume) {
        topClient = {
          name: clientDisplayName(cp),
          volume: cp.totalVolume,
        };
      }
    }

    const addressSet = new Set(clients.map((cp) => cp.address.toLowerCase()));
    const networkTotals = new Map<string, { volume: number; count: number; label: string }>();

    for (const tx of transactions) {
      if (!addressSet.has(tx.counterparty.toLowerCase())) continue;
      const label = (tx.networkLabel || tx.network || 'unknown').trim() || 'unknown';
      const key = label.toLowerCase();
      const existing = networkTotals.get(key);
      if (existing) {
        existing.volume += tx.value;
        existing.count += 1;
      } else {
        networkTotals.set(key, { volume: tx.value, count: 1, label });
      }
    }

    let topNetwork: { label: string; volume: number; count: number } | null = null;
    const allZeroVolume = [...networkTotals.values()].every((n) => n.volume === 0);
    for (const entry of networkTotals.values()) {
      const candidate = {
        label: entry.label,
        volume: entry.volume,
        count: entry.count,
      };
      if (!topNetwork) {
        topNetwork = candidate;
        continue;
      }
      if (allZeroVolume) {
        if (candidate.count > topNetwork.count) topNetwork = candidate;
      } else if (candidate.volume > topNetwork.volume) {
        topNetwork = candidate;
      }
    }

    return {
      clientCount: clients.length,
      volume,
      inflow,
      outflow,
      netFlow: inflow - outflow,
      topClient,
      topNetwork,
      avgVolume: clients.length > 0 ? volume / clients.length : 0,
    };
  }, [clients, transactions]);

  const empty = clients.length === 0;
  const isNetPositive = stats.netFlow >= 0;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
        <StatCard
          icon={<Users className="h-3 w-3 shrink-0 text-[#b6509e]" />}
          label="Clients"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f7f8f8] leading-tight truncate">
            {stats.clientCount}
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
          icon={<Wallet className="h-3 w-3 shrink-0 text-[#f7931a]" />}
          label="Top Client"
        >
          {stats.topClient ? (
            <>
              <p className={valueClass} title={stats.topClient.name} dir="ltr">
                {truncateDisplay(stats.topClient.name)}
              </p>
              <p className="text-[9px] sm:text-[10px] text-[#8a8f98] mt-0.5 font-mono-num truncate">
                ${formatCompactUsd(stats.topClient.volume)}
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
                  : `(${stats.topNetwork.count})`}
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
          icon={<CircleDollarSign className="h-3 w-3 shrink-0 text-[#8a8f98]" />}
          label="Avg Volume"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f7f8f8] leading-tight truncate">
            {empty ? EMPTY : `$${formatUsd(stats.avgVolume)}`}
          </p>
        </StatCard>
      </div>
    </div>
  );
}
