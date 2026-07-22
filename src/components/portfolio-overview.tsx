'use client';

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
  ArrowLeftRight,
} from 'lucide-react';
import { usePortfolio } from '@/hooks/use-portfolio';
import { useWalletStore } from '@/stores/wallet-store';

interface PortfolioOverviewProps {
  onSectionClick?: (section: string) => void;
}

const sections = [
  {
    id: 'revenue',
    title: 'Revenue',
    color: '#0ecb81',
    bgColor: 'rgba(14, 203, 129, 0.1)',
    icon: TrendingUp,
  },
  {
    id: 'expenses',
    title: 'Expenses',
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

export function PortfolioOverview({ onSectionClick }: PortfolioOverviewProps) {
  const { portfolio, isLoading, error, refetch } = usePortfolio();
  const { wallets } = useWalletStore();

  if (isLoading && !portfolio) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-[#0052ff] animate-spin" />
          <span className="text-sm text-[#8a8f98]">Loading portfolio data from blockchain...</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-[#0f1011] border border-white/5 rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-white/5 rounded w-16 mb-3" />
              <div className="h-8 bg-white/5 rounded w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !portfolio) {
    return (
      <div className="bg-[#0f1011] border border-[#f6465d]/20 rounded-xl p-6 flex items-center gap-3">
        <AlertCircle className="h-5 w-5 text-[#f6465d]" />
        <div className="flex-1">
          <p className="text-sm text-[#f6465d]">{error}</p>
        </div>
        <button
          onClick={() => refetch(true)}
          className="text-xs text-[#8a8f98] hover:text-[#d0d6e0] flex items-center gap-1"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  if (!portfolio && wallets.length === 0) {
    return null;
  }

  const totalValue = portfolio?.totalValueUsd || 0;
  const summary = portfolio?.transactionSummary;
  const totalRevenue = summary?.totalRevenue || 0;
  const totalExpenses = summary?.totalExpenses || 0;
  const netFlow = summary?.netFlow || 0;
  const gasFees = summary?.gasFees || 0;
  const tradingVolume = summary?.tradingVolume || 0;
  const methodology =
    summary?.methodology ||
    'USD cash flow · trades excluded from Revenue/Expenses · gas shown separately';

  const change24h =
    portfolio?.tokens?.reduce((sum, t) => {
      if (t.change24h !== null && t.change24h !== undefined) {
        return sum + (t.valueUsd * t.change24h) / 100;
      }
      return sum;
    }, 0) || 0;

  const changePercent = totalValue > 0 ? (change24h / totalValue) * 100 : 0;
  const isPositive = changePercent >= 0;

  const sectionValues = {
    revenue: totalRevenue,
    expenses: totalExpenses,
    flow: netFlow,
    gas: gasFees,
  };

  const getValueLabel = (id: string) => {
    switch (id) {
      case 'revenue':
        return 'Cash in (USD)';
      case 'expenses':
        return 'Cash out (USD)';
      case 'flow':
        return 'Revenue − Expenses';
      case 'gas':
        return 'Network fees (USD)';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div>
          <p className="text-sm text-[#8a8f98] mb-1">Total Portfolio Value</p>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl sm:text-5xl font-bold text-[#f7f8f8] font-mono-num">
              {formatUsd(totalValue)}
            </span>
            {changePercent !== 0 && (
              <div
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium font-mono-num ${
                  isPositive
                    ? 'bg-[#0ecb81]/10 text-[#0ecb81]'
                    : 'bg-[#f6465d]/10 text-[#f6465d]'
                }`}
              >
                {isPositive ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : (
                  <ArrowDownRight className="h-4 w-4" />
                )}
                {isPositive ? '+' : ''}
                {changePercent.toFixed(2)}%
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-xs text-[#8a8f98]">Last 24 hours</p>
            {isLoading && <Loader2 className="h-3 w-3 text-[#0052ff] animate-spin" />}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {sections.map(section => {
          const Icon = section.icon;
          const value = sectionValues[section.id as keyof typeof sectionValues];
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

      {/* Trading activity (separate from cash flow) */}
      {tradingVolume > 0 && (
        <div className="bg-[#0f1011] border border-white/5 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#a855f7]/10 flex items-center justify-center">
            <ArrowLeftRight className="h-4 w-4 text-[#a855f7]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[#8a8f98]">Trading volume (excluded from Revenue / Expenses)</p>
            <p className="text-lg font-bold text-[#a855f7] font-mono-num">{formatUsd(tradingVolume)}</p>
          </div>
        </div>
      )}

      <p className="text-[10px] text-[#8a8f98]/70 leading-relaxed" title="How we calculate this">
        How we calculate this: {methodology}
      </p>
    </div>
  );
}
