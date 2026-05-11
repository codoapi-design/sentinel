'use client';

import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Fuel,
  Wallet,
  ChevronRight,
} from 'lucide-react';
import { dashboardSummary } from '@/lib/mock-data';

interface PortfolioOverviewProps {
  onSectionClick?: (section: string) => void;
}

const sections = [
  {
    id: 'revenue',
    title: 'Revenue',
    valueKey: 'totalRevenue' as const,
    color: '#0ecb81',
    bgColor: 'rgba(14, 203, 129, 0.1)',
    icon: TrendingUp,
  },
  {
    id: 'expenses',
    title: 'Expenses',
    valueKey: 'totalExpenses' as const,
    color: '#f6465d',
    bgColor: 'rgba(246, 70, 93, 0.1)',
    icon: TrendingDown,
  },
  {
    id: 'flow',
    title: 'Net Flow',
    valueKey: 'netFlow' as const,
    color: '#0052ff',
    bgColor: 'rgba(0, 82, 255, 0.1)',
    icon: Wallet,
  },
  {
    id: 'gas',
    title: 'Gas Fees',
    valueKey: 'gasFees' as const,
    color: '#f7931a',
    bgColor: 'rgba(247, 147, 26, 0.1)',
    icon: Fuel,
  },
] as const;

export function PortfolioOverview({ onSectionClick }: PortfolioOverviewProps) {
  const isPositive = dashboardSummary.change24h >= 0;

  const getValueLabel = (id: string) => {
    switch (id) {
      case 'revenue': return 'Total Revenue';
      case 'expenses': return 'Total Expenses';
      case 'flow': return 'Net Flow';
      case 'gas': return 'Total Gas Fees';
      default: return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Main portfolio value */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div>
          <p className="text-sm text-[#8a8f98] mb-1">Total Portfolio Value</p>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl sm:text-5xl font-bold text-[#f7f8f8] font-mono-num">
              ${dashboardSummary.totalPortfolio.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium font-mono-num ${
              isPositive ? 'bg-[#0ecb81]/10 text-[#0ecb81]' : 'bg-[#f6465d]/10 text-[#f6465d]'
            }`}>
              {isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
              {isPositive ? '+' : ''}{dashboardSummary.change24h}%
            </div>
          </div>
          <p className="text-xs text-[#8a8f98] mt-1">Last 24 hours</p>
        </div>
      </div>

      {/* Summary cards - Clickable */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {sections.map((section) => {
          const Icon = section.icon;
          const value = dashboardSummary[section.valueKey];
          return (
            <Card
              key={section.id}
              className="bg-[#0f1011] border-white/5 hover:border-white/15 transition-all duration-200 cursor-pointer group relative overflow-hidden"
              onClick={() => onSectionClick?.(section.id)}
            >
              {/* Hover glow effect */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{
                  background: `radial-gradient(ellipse at center, ${section.bgColor} 0%, transparent 70%)`,
                }}
              />
              <CardContent className="p-4 relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: section.bgColor }}>
                      <Icon className="h-4 w-4" style={{ color: section.color }} />
                    </div>
                    <span className="text-xs text-[#8a8f98]">{section.title}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#8a8f98] group-hover:text-[#d0d6e0] transition-colors opacity-0 group-hover:opacity-100 transform group-hover:translate-x-0.5 transition-transform" />
                </div>
                <p className="text-xs text-[#8a8f98] mb-1">{getValueLabel(section.id)}</p>
                <p className="text-xl font-bold font-mono-num" style={{ color: section.color }}>
                  ${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
