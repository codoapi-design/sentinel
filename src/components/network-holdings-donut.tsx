'use client';

import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  buildNetworkHoldingsDistribution,
  formatCompactUsd,
  type ColoredHoldingSlice,
  type NetworkHoldingSlice,
} from './network-holdings-distribution';

export type { NetworkHoldingSlice };

interface NetworkHoldingsDonutProps {
  holdings: NetworkHoldingSlice[];
  size?: number;
}

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ColoredHoldingSlice & { name: string; value: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div
      className="bg-[#191a1b] border border-white/10 rounded-lg px-2.5 py-1.5 shadow-xl"
      dir="ltr"
    >
      <p className="text-[11px] font-medium text-[#f7f8f8]">{row.symbol}</p>
      <p className="text-[10px] text-[#d0d6e0]">
        {formatCompactUsd(row.valueUsd)}
        <span className="text-[#8a8f98]"> · {row.percent.toFixed(0)}%</span>
      </p>
    </div>
  );
}

/**
 * Mini donut for current network asset distribution by USD value.
 * Sized for the holdings summary strip — not Activity Mix scale.
 */
export function NetworkHoldingsDonut({
  holdings,
  size = 132,
}: NetworkHoldingsDonutProps) {
  const slices = useMemo(
    () => buildNetworkHoldingsDistribution(holdings),
    [holdings],
  );

  const chartData = useMemo(
    () =>
      slices.map(s => ({
        ...s,
        name: s.symbol,
        value: s.valueUsd,
      })),
    [slices],
  );

  const hasData = slices.length > 0;
  const inner = Math.round(size * 0.3);
  const outer = Math.round(size * 0.46);

  if (!hasData) {
    return (
      <div
        className="rounded-full border border-dashed border-white/10 flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        <span className="text-[10px] text-[#8a8f98]">No assets</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 shrink-0" dir="ltr">
      <div
        className="relative"
        style={{ width: size, height: size }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={inner}
              outerRadius={outer}
              paddingAngle={slices.length > 1 ? 2 : 0}
              stroke="rgba(15,16,17,0.9)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {chartData.map(slice => (
                <Cell key={slice.symbol} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="flex flex-wrap justify-center gap-x-2.5 gap-y-1 max-w-[168px]">
        {slices.map(slice => (
          <li
            key={slice.symbol}
            className="flex items-center gap-1 text-[9px] leading-none text-[#d0d6e0]"
            data-export-legend-item={`${slice.symbol} ${
              slice.percent < 1 && slice.percent > 0
                ? '<1%'
                : `${Math.round(slice.percent)}%`
            }`}
          >
            <span
              className="inline-block size-1.5 rounded-sm shrink-0"
              style={{ backgroundColor: slice.color }}
              aria-hidden
            />
            <span className="font-medium" style={{ color: slice.color }}>
              {slice.symbol}
            </span>
            <span className="text-[#8a8f98] tabular-nums">
              {slice.percent < 1 && slice.percent > 0
                ? '<1%'
                : `${Math.round(slice.percent)}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
