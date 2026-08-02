'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  TrendingDown,
  Fuel,
  Wallet,
  ChevronRight,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { usePortfolio } from '@/hooks/use-portfolio';
import { useWalletReadModels } from '@/hooks/use-wallet-read-models';
import { useWalletStore } from '@/stores/wallet-store';
import { SUMMARY_INFLOW, SUMMARY_OUTFLOW } from '@/lib/finance/labels';

interface PortfolioOverviewProps {
  onSectionClick?: (section: string) => void;
  /** When false, only the Total Portfolio Value hero is rendered. */
  showSummaryCards?: boolean;
  /** Optional slot rendered under the hero (e.g. dashboard panel tabs). */
  tabs?: ReactNode;
}

const sections = [
  {
    id: 'revenue',
    title: SUMMARY_INFLOW,
    color: '#0ecb81',
    bgColor: 'rgba(14, 203, 129, 0.1)',
    icon: TrendingUp,
  },
  {
    id: 'expenses',
    title: SUMMARY_OUTFLOW,
    color: '#f6465d',
    bgColor: 'rgba(246, 70, 93, 0.1)',
    icon: TrendingDown,
  },
  {
    id: 'flow',
    title: 'Net Flow',
    color: '#0052ff',
    bgColor: 'rgba(0, 82, 255, 0.1)',
    icon: Wallet,
  },
  {
    id: 'gas',
    title: 'Gas Fees',
    color: '#f7931a',
    bgColor: 'rgba(247, 147, 26, 0.1)',
    icon: Fuel,
  },
] as const;

function formatUsd(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function usePortfolioOverviewData() {
  const { portfolio, isLoading, error, refetch } = usePortfolio();
  const {
    summary: readModelSummary,
    isLoading: readModelsLoading,
    refetch: refetchReadModels,
  } = useWalletReadModels();
  const activeWalletId = useWalletStore(s => s.activeWalletId);
  const wallets = useWalletStore(s => s.wallets);
  const lastSyncAt = useWalletStore(s =>
    activeWalletId ? s.lastSyncAt[activeWalletId] || 0 : 0,
  );
  const loadTransactionsFromDB = useWalletStore(s => s.loadTransactionsFromDB);
  const gasEnrichAttempted = useRef(false);
  const [netWorthChange24hPct, setNetWorthChange24hPct] = useState<number | null>(null);
  const [netWorthChangeLoading, setNetWorthChangeLoading] = useState(false);

  useEffect(() => {
    if (!activeWalletId || gasEnrichAttempted.current) return;
    const gasUsd = readModelSummary?.gasFeesUsd ?? portfolio?.transactionSummary?.gasFees ?? null;
    if (gasUsd === null) return;
    if (gasUsd > 0) {
      gasEnrichAttempted.current = true;
      return;
    }
    gasEnrichAttempted.current = true;
    void (async () => {
      try {
        await fetch(`/api/wallets/${activeWalletId}/enrich-gas`, { method: 'POST' });
        await Promise.all([
          refetchReadModels({ silent: true }),
          loadTransactionsFromDB(activeWalletId),
        ]);
      } catch {
        /* soft-fail */
      }
    })();
  }, [
    activeWalletId,
    readModelSummary?.gasFeesUsd,
    portfolio?.transactionSummary?.gasFees,
    refetchReadModels,
    loadTransactionsFromDB,
  ]);

  // True NET WORTH 24h % = (value_now − value_24h_ago) / value_24h_ago
  // Same series as Portfolio Performance → 24H (snapshots + market history).
  useEffect(() => {
    if (!activeWalletId) {
      setNetWorthChange24hPct(null);
      return;
    }
    let cancelled = false;
    setNetWorthChangeLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/portfolio/history?walletId=${encodeURIComponent(activeWalletId)}&days=1`,
        );
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const points = (json?.data?.points || json?.points || []) as Array<{
          date?: string;
          value?: number;
        }>;
        if (!Array.isArray(points) || points.length < 2) {
          setNetWorthChange24hPct(null);
          return;
        }
        const start = Number(points[0]?.value);
        const end = Number(points[points.length - 1]?.value);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0) {
          setNetWorthChange24hPct(null);
          return;
        }
        const pct = Math.round(((end - start) / start) * 10000) / 100;
        setNetWorthChange24hPct(pct);
      } catch {
        if (!cancelled) setNetWorthChange24hPct(null);
      } finally {
        if (!cancelled) setNetWorthChangeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeWalletId, lastSyncAt, portfolio?.totalValueUsd]);

  const hasHoldings = Boolean(portfolio);
  const hasSummaryCards = Boolean(readModelSummary || portfolio?.transactionSummary);
  const waitingForFirstPaint =
    !hasHoldings &&
    !hasSummaryCards &&
    ((isLoading && !portfolio) || (readModelsLoading && !readModelSummary));

  const totalValue = portfolio?.totalValueUsd || 0;
  const summary = portfolio?.transactionSummary;
  const totalRevenue = readModelSummary?.inflowUsd ?? summary?.totalRevenue ?? 0;
  const totalExpenses = readModelSummary?.outflowUsd ?? summary?.totalExpenses ?? 0;
  const netFlow = readModelSummary?.netFlowUsd ?? summary?.netFlow ?? 0;
  const gasFees = readModelSummary?.gasFeesUsd ?? summary?.gasFees ?? 0;
  const methodology =
    readModelSummary?.methodology ||
    summary?.methodology ||
    'USD cash flow · trades excluded from Inflow/Outflow · gas shown separately';

  return {
    portfolio,
    isLoading,
    error,
    refetch,
    wallets,
    waitingForFirstPaint,
    hasReadModelSummary: Boolean(readModelSummary),
    totalValue,
    netWorthChange24hPct,
    netWorthChangeLoading,
    totalRevenue,
    totalExpenses,
    netFlow,
    gasFees,
    methodology,
  };
}

function PortfolioHero({
  totalValue,
  change24hPct,
  changeLoading,
  isLoading,
  hasPortfolio,
}: {
  totalValue: number;
  change24hPct: number | null;
  changeLoading: boolean;
  isLoading: boolean;
  hasPortfolio: boolean;
}) {
  const hasChange = change24hPct != null && Number.isFinite(change24hPct);
  const isPositive = (change24hPct ?? 0) >= 0;

  return (
    <div className="flex flex-col sm:flex-row sm:items-end gap-4">
      <div>
        <p className="text-sm text-[#8a8f98] mb-1">NET WORTH</p>
        <div className="flex items-baseline gap-3">
          {!hasPortfolio && isLoading ? (
            <span className="h-10 w-40 bg-white/5 rounded animate-pulse inline-block" />
          ) : (
            <span className="text-4xl sm:text-5xl font-bold text-[#f7f8f8] font-mono-num">
              {formatUsd(totalValue)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs text-[#8a8f98]">Last 24 hours</p>
          {changeLoading && !hasChange ? (
            <Loader2 className="h-3 w-3 text-[#0052ff] animate-spin" />
          ) : hasChange ? (
            <span
              className={`inline-flex items-center gap-0.5 text-xs font-medium font-mono-num ${
                isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
              }`}
              title="NET WORTH change over the last 24 hours (portfolio value)"
            >
              {isPositive ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {isPositive ? '+' : ''}
              {change24hPct!.toFixed(2)}%
            </span>
          ) : null}
          {isLoading && <Loader2 className="h-3 w-3 text-[#0052ff] animate-spin" />}
        </div>
      </div>
    </div>
  );
}

function PortfolioSummaryCards({
  onSectionClick,
  sectionValues,
  methodology,
}: {
  onSectionClick?: (section: string) => void;
  sectionValues: Record<(typeof sections)[number]['id'], number>;
  methodology: string;
}) {
  const getValueLabel = (id: string) => {
    switch (id) {
      case 'revenue':
        return 'Cash in (USD)';
      case 'expenses':
        return 'Cash out (USD)';
      case 'flow':
        return 'Inflow − Outflow';
      case 'gas':
        return 'Network fees (USD)';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {sections.map(section => {
          const Icon = section.icon;
          const value = sectionValues[section.id];
          const showSign = section.id === 'flow' && value !== 0;
          return (
            <div
              key={section.id}
              className="bg-[#0f1011] border border-white/5 hover:border-white/15 transition-all duration-200 cursor-pointer group relative overflow-hidden rounded-xl"
              onClick={() => onSectionClick?.(section.id)}
            >
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{
                  background: `radial-gradient(ellipse at center, ${section.bgColor} 0%, transparent 70%)`,
                }}
              />
              <div className="p-4 relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: section.bgColor }}
                    >
                      <Icon className="h-4 w-4" style={{ color: section.color }} />
                    </div>
                    <span className="text-xs text-[#8a8f98]">{section.title}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#8a8f98] opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-xs text-[#8a8f98] mb-1">{getValueLabel(section.id)}</p>
                <p className="text-xl font-bold font-mono-num" style={{ color: section.color }}>
                  {showSign ? (value >= 0 ? '+' : '−') : ''}
                  {formatUsd(Math.abs(value))}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-[#8a8f98]/70 leading-relaxed" title="How we calculate this">
        How we calculate this: {methodology}
      </p>
    </div>
  );
}

export function PortfolioOverview({
  onSectionClick,
  showSummaryCards = true,
  tabs,
}: PortfolioOverviewProps) {
  const data = usePortfolioOverviewData();

  if (data.waitingForFirstPaint) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-[#0052ff] animate-spin" />
          <span className="text-sm text-[#8a8f98]">Loading portfolio...</span>
        </div>
        {tabs}
        {showSummaryCards && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="bg-[#0f1011] border border-white/5 rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-white/5 rounded w-16 mb-3" />
                <div className="h-8 bg-white/5 rounded w-24" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (data.error && !data.portfolio && !data.hasReadModelSummary) {
    return (
      <div className="bg-[#0f1011] border border-[#f6465d]/20 rounded-xl p-6 flex items-center gap-3">
        <AlertCircle className="h-5 w-5 text-[#f6465d]" />
        <div className="flex-1">
          <p className="text-sm text-[#f6465d]">{data.error}</p>
        </div>
        <button
          onClick={() => data.refetch(true)}
          className="text-xs text-[#8a8f98] hover:text-[#d0d6e0] flex items-center gap-1"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  if (!data.portfolio && !data.hasReadModelSummary && data.wallets.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <PortfolioHero
        totalValue={data.totalValue}
        change24hPct={data.netWorthChange24hPct}
        changeLoading={data.netWorthChangeLoading}
        isLoading={data.isLoading}
        hasPortfolio={Boolean(data.portfolio)}
      />
      {tabs}
      {showSummaryCards && (
        <PortfolioSummaryCards
          onSectionClick={onSectionClick}
          sectionValues={{
            revenue: data.totalRevenue,
            expenses: data.totalExpenses,
            flow: data.netFlow,
            gas: data.gasFees,
          }}
          methodology={data.methodology}
        />
      )}
    </div>
  );
}
