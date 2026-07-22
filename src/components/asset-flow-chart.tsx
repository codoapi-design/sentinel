'use client';

import type { Transaction } from '@/lib/mock-data';
import { RelationshipPerformanceChart } from './relationship-performance-chart';

interface AssetFlowChartProps {
  /** Chart source rows (parent chooses filtered vs asset fallback) */
  transactions: Transaction[];
  symbol: string;
}

/**
 * Asset Performance — thin wrapper over shared RelationshipPerformanceChart
 * (Inflow / Outflow / Net Flow / Volume) from filtered table txs.
 */
export function AssetFlowChart({ transactions, symbol }: AssetFlowChartProps) {
  return (
    <RelationshipPerformanceChart
      transactions={transactions}
      title={`Asset Flow · ${symbol}`}
      subtitle="Cumulative inflow, outflow, net & volume · values in USD"
      methodology="Based on filtered table txs from synced DB · cumulative Inflow / Outflow / Net / Volume · period-relative"
    />
  );
}
