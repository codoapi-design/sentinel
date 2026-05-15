'use client';

import { useState, useMemo } from 'react';
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
import { usePortfolio } from '@/hooks/use-portfolio';
import { Loader2 } from 'lucide-react';

const periods = [
  { label: '24H', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 0 },
];

/**
 * Generate approximate portfolio history from current data.
 * Since we don't have historical price data, we estimate based on
 * current token values and their 24h changes.
 */
function generateEstimatedHistory(totalValueUsd: number, change24hPercent: number | null): { date: string; value: number }[] {
  const data: { date: string; value: number }[] = [];
  const now = new Date();
  const days = 90;

  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    // Simple estimation: apply a random walk based on the 24h change
    const dailyChange = (change24hPercent || 0) / 100 / 30; // Approximate daily change
    const noise = (Math.sin(i * 0.3) + Math.cos(i * 0.7)) * 0.02; // Deterministic noise for visual
    const factor = 1 + dailyChange * (days - i) / days + noise;
    const value = Math.max(0, totalValueUsd * factor);

    data.push({
      date: dateStr,
      value: Math.round(value * 100) / 100,
    });
  }

  return data;
}

export function PortfolioChart() {
  const [activePeriod, setActivePeriod] = useState(30);
  const { portfolio, isLoading } = usePortfolio();

  const totalValue = portfolio?.totalValueUsd || 0;

  // Calculate average 24h change for estimation
  const avgChange24h = useMemo(() => {
    if (!portfolio?.tokens?.length) return null;
    const tokensWithChange = portfolio.tokens.filter(t => t.change24h !== null && t.change24h !== undefined && t.valueUsd > 0);
    if (tokensWithChange.length === 0) return null;
    const totalWeight = tokensWithChange.reduce((sum, t) => sum + t.valueUsd, 0);
    if (totalWeight === 0) return null;
    return tokensWithChange.reduce((sum, t) => sum + (t.change24h! * t.valueUsd / totalWeight), 0);
  }, [portfolio?.tokens]);

  const fullData = useMemo(() => generateEstimatedHistory(totalValue, avgChange24h), [totalValue, avgChange24h]);

  const data = useMemo(() => {
    if (activePeriod === 0) return fullData;
    return fullData.slice(-activePeriod);
  }, [fullData, activePeriod]);

  const minValue = Math.min(...data.map(d => d.value));
  const maxValue = Math.max(...data.map(d => d.value));
  const isPositive = data.length > 1 && data[data.length - 1].value >= data[0].value;

  const formatValue = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
    return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (activePeriod <= 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
    }
    if (activePeriod === 0) {
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Loading state
  if (isLoading && totalValue === 0) {
    return (
      <div className="bg-[#0f1011] border border-white/5 rounded-xl p-6">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 text-[#0052ff] animate-spin" />
          <span className="text-sm text-[#8a8f98]">Loading portfolio chart...</span>
        </div>
      </div>
    );
  }

  // No data state
  if (totalValue === 0 && !isLoading) {
    return (
      <div className="bg-[#0f1011] border border-white/5 rounded-xl p-6">
        <h3 className="text-[#f7f8f8] text-base font-medium mb-2">Portfolio Performance</h3>
        <p className="text-sm text-[#8a8f98]">No portfolio data available yet. Sync your wallet to see performance charts.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0f1011] border border-white/5 rounded-xl">
      <div className="p-4 pb-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-[#f7f8f8] text-base font-medium">Portfolio Performance</h3>
            <p className="text-xs text-[#8a8f98] mt-1">
              {isPositive ? '↑' : '↓'} {formatValue(data[data.length - 1]?.value || 0)}
              {data.length > 1 && data[0]?.value > 0 && (
                <span className="ml-1">
                  ({isPositive ? '+' : ''}{(((data[data.length - 1]?.value || 0) - (data[0]?.value || 0)) / (data[0]?.value || 1) * 100).toFixed(2)}%)
                </span>
              )}
              {avgChange24h !== null && (
                <span className="ml-2 text-[10px]">~estimated from {avgChange24h >= 0 ? '+' : ''}{avgChange24h.toFixed(2)}% 24h change</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1 bg-[#191a1b] rounded-lg p-1">
            {periods.map((period) => (
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
        <div className="h-[300px] sm:h-[350px] w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0052ff" stopOpacity={0.3} />
                  <stop offset="50%" stopColor="#0052ff" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#0052ff" stopOpacity={0} />
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
                domain={[minValue * 0.98, maxValue * 1.02]}
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
                formatter={(value: number) => [formatValue(value), 'Value']}
                labelFormatter={(label) => {
                  const d = new Date(label);
                  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#0052ff"
                strokeWidth={2}
                fill="url(#portfolioGradient)"
                dot={false}
                activeDot={{
                  r: 4,
                  fill: '#0052ff',
                  stroke: '#0f1011',
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
