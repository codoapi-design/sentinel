'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { generatePortfolioHistory } from '@/lib/mock-data';

const periods = [
  { label: '24H', days: 1 },
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
  { label: 'All', days: 0 },
];

export function PortfolioChart() {
  const [activePeriod, setActivePeriod] = useState(30);
  const fullData = useMemo(() => generatePortfolioHistory(), []);

  const data = useMemo(() => {
    if (activePeriod === 0) return fullData;
    return fullData.slice(-activePeriod);
  }, [fullData, activePeriod]);

  const minValue = Math.min(...data.map(d => d.value));
  const maxValue = Math.max(...data.map(d => d.value));
  const isPositive = data.length > 1 && data[data.length - 1].value >= data[0].value;

  const formatValue = (value: number) => {
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

  return (
    <Card className="bg-[#0f1011] border-white/5">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-[#f7f8f8] text-base">Portfolio Performance</CardTitle>
            <p className="text-xs text-[#8a8f98] mt-1">
              {isPositive ? '↑' : '↓'} {formatValue(data[data.length - 1]?.value || 0)} ({isPositive ? '+' : ''}{((data[data.length - 1]?.value || 0) - (data[0]?.value || 0) > 0 ? '+' : '')}{(((data[data.length - 1]?.value || 0) - (data[0]?.value || 0)) / (data[0]?.value || 1) * 100).toFixed(2)}%)
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
      </CardHeader>
      <CardContent className="pb-4">
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
      </CardContent>
    </Card>
  );
}
