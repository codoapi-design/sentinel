'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  CircleDollarSign,
  Coins,
  Globe,
  Layers,
  Percent,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { PortfolioToken } from '@/hooks/use-portfolio';
import { useWalletStore } from '@/stores/wallet-store';
import { isStablecoinSymbol } from '@/lib/finance/stablecoins';
import { cn } from '@/lib/utils';

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

interface AssetsPageFilterStatsProps {
  assets: PortfolioToken[];
}

/**
 * Assets tab: 2×4 filter-bound stats (same set as the table after spam/$0 filter).
 * Row 1: Total Value · Assets · Top Asset · Top Network
 * Row 2: Networks · 24h Change · Avg Value · Stablecoins %
 */
export function AssetsPageFilterStats({ assets }: AssetsPageFilterStatsProps) {
  const activeWalletId = useWalletStore(s => s.activeWalletId);
  const lastSyncAt = useWalletStore(s =>
    activeWalletId ? s.lastSyncAt[activeWalletId] || 0 : 0,
  );
  const [historyChange, setHistoryChange] = useState<{
    usd: number;
    pct: number;
  } | null>(null);

  // Fallback when per-token change_24h is missing (Alchemy sync used to store null).
  useEffect(() => {
    if (!activeWalletId) {
      setHistoryChange(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/portfolio/history?walletId=${encodeURIComponent(activeWalletId)}&days=1`,
        );
        if (!res.ok) return;
        const json = await res.json();
        const points = (json?.data?.points || []) as Array<{ value?: number }>;
        if (cancelled || !Array.isArray(points) || points.length < 2) return;
        const start = Number(points[0]?.value);
        const end = Number(points[points.length - 1]?.value);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0) return;
        setHistoryChange({
          usd: Math.round((end - start) * 100) / 100,
          pct: Math.round(((end - start) / start) * 10000) / 100,
        });
      } catch {
        if (!cancelled) setHistoryChange(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeWalletId, lastSyncAt]);

  const stats = useMemo(() => {
    if (assets.length === 0) {
      return {
        totalValue: 0,
        assetCount: 0,
        topAsset: null as { symbol: string; valueUsd: number } | null,
        topNetwork: null as { label: string; valueUsd: number; count: number } | null,
        networkCount: 0,
        change24hUsd: null as number | null,
        change24hPct: null as number | null,
        avgValue: 0,
        stablecoinsPct: null as number | null,
      };
    }

    let totalValue = 0;
    let change24hUsd = 0;
    let changeWeightedValue = 0;
    let hasChangeData = false;
    let stableValue = 0;
    let topAsset: { symbol: string; valueUsd: number } | null = null;
    const networkTotals = new Map<string, { valueUsd: number; count: number }>();

    for (const asset of assets) {
      const value = asset.valueUsd || 0;
      totalValue += value;

      if (!topAsset || value > topAsset.valueUsd) {
        topAsset = { symbol: asset.symbol, valueUsd: value };
      }

      const networkKey = (asset.chain || 'unknown').toLowerCase();
      const existing = networkTotals.get(networkKey);
      if (existing) {
        existing.valueUsd += value;
        existing.count += 1;
      } else {
        networkTotals.set(networkKey, { valueUsd: value, count: 1 });
      }

      if (asset.change24h !== null && asset.change24h !== undefined) {
        hasChangeData = true;
        change24hUsd += (value * asset.change24h) / 100;
        changeWeightedValue += value;
      }

      if (isStablecoinSymbol(asset.symbol)) {
        stableValue += value;
      }
    }

    let topNetwork: { label: string; valueUsd: number; count: number } | null = null;
    const allZeroValue = [...networkTotals.values()].every(n => n.valueUsd === 0);
    for (const [key, entry] of networkTotals) {
      const candidate = {
        label: key,
        valueUsd: entry.valueUsd,
        count: entry.count,
      };
      if (!topNetwork) {
        topNetwork = candidate;
        continue;
      }
      if (allZeroValue) {
        if (candidate.count > topNetwork.count) topNetwork = candidate;
      } else if (candidate.valueUsd > topNetwork.valueUsd) {
        topNetwork = candidate;
      }
    }

    const tokenChangePct =
      hasChangeData && changeWeightedValue > 0
        ? Math.round((change24hUsd / changeWeightedValue) * 10000) / 100
        : null;

    return {
      totalValue,
      assetCount: assets.length,
      topAsset,
      topNetwork,
      networkCount: networkTotals.size,
      change24hUsd: hasChangeData
        ? change24hUsd
        : historyChange
          ? historyChange.usd
          : null,
      change24hPct: hasChangeData
        ? tokenChangePct
        : historyChange
          ? historyChange.pct
          : null,
      avgValue: assets.length > 0 ? totalValue / assets.length : 0,
      stablecoinsPct: totalValue > 0 ? (stableValue / totalValue) * 100 : null,
    };
  }, [assets, historyChange]);

  const empty = assets.length === 0;
  const changePositive = (stats.change24hPct ?? stats.change24hUsd ?? 0) >= 0;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
        <StatCard
          icon={<CircleDollarSign className="h-3 w-3 shrink-0 text-[#0052ff]" />}
          label="Total Value"
          glow="rgba(0, 82, 255, 0.06)"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#0052ff] leading-tight truncate">
            {empty ? EMPTY : `$${formatUsd(stats.totalValue)}`}
          </p>
        </StatCard>

        <StatCard
          icon={<Coins className="h-3 w-3 shrink-0 text-[#8a8f98]" />}
          label="Assets"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f7f8f8] leading-tight truncate">
            {stats.assetCount}
          </p>
        </StatCard>

        <StatCard
          icon={<Wallet className="h-3 w-3 shrink-0 text-[#f7931a]" />}
          label="Top Asset"
        >
          {stats.topAsset ? (
            <>
              <p className={valueClass} title={stats.topAsset.symbol}>
                {stats.topAsset.symbol}
              </p>
              <p className="text-[9px] sm:text-[10px] text-[#8a8f98] mt-0.5 font-mono-num truncate">
                ${formatCompactUsd(stats.topAsset.valueUsd)}
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
                {stats.topNetwork.valueUsd > 0
                  ? `$${formatCompactUsd(stats.topNetwork.valueUsd)}`
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
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
        <StatCard
          icon={<Layers className="h-3 w-3 shrink-0 text-[#627eea]" />}
          label="Networks"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f7f8f8] leading-tight truncate">
            {stats.networkCount}
          </p>
        </StatCard>

        <StatCard
          icon={
            stats.change24hPct === null ? (
              <TrendingUp className="h-3 w-3 shrink-0 text-[#8a8f98]" />
            ) : changePositive ? (
              <TrendingUp className="h-3 w-3 shrink-0 text-[#0ecb81]" />
            ) : (
              <TrendingDown className="h-3 w-3 shrink-0 text-[#f6465d]" />
            )
          }
          label="24h Change"
          glow={
            stats.change24hPct === null
              ? undefined
              : changePositive
                ? 'rgba(14, 203, 129, 0.06)'
                : 'rgba(246, 70, 93, 0.06)'
          }
        >
          {stats.change24hPct === null ? (
            <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#8a8f98] leading-tight truncate">
              {EMPTY}
            </p>
          ) : (
            <>
              <p
                className={cn(
                  'text-xs sm:text-sm font-semibold font-mono-num leading-tight truncate',
                  changePositive ? 'text-[#0ecb81]' : 'text-[#f6465d]',
                )}
              >
                {changePositive ? '+' : ''}
                {stats.change24hPct.toFixed(2)}%
              </p>
              {stats.change24hUsd !== null && (
                <p className="text-[9px] sm:text-[10px] text-[#8a8f98] mt-0.5 font-mono-num truncate">
                  {changePositive ? '+' : '−'}${formatCompactUsd(Math.abs(stats.change24hUsd))}
                </p>
              )}
            </>
          )}
        </StatCard>

        <StatCard
          icon={<CircleDollarSign className="h-3 w-3 shrink-0 text-[#8a8f98]" />}
          label="Avg Value"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#f7f8f8] leading-tight truncate">
            {empty ? EMPTY : `$${formatUsd(stats.avgValue)}`}
          </p>
        </StatCard>

        <StatCard
          icon={<Percent className="h-3 w-3 shrink-0 text-[#0ecb81]" />}
          label="Stablecoins %"
          glow="rgba(14, 203, 129, 0.06)"
        >
          <p className="text-xs sm:text-sm font-semibold font-mono-num text-[#0ecb81] leading-tight truncate">
            {stats.stablecoinsPct === null
              ? EMPTY
              : `${stats.stablecoinsPct.toFixed(1)}%`}
          </p>
        </StatCard>
      </div>
    </div>
  );
}
