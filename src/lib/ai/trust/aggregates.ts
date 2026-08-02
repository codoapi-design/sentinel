/**
 * Exact server-side transaction aggregates — no silent full-history truncation.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { getWalletFinancialSummary, getWalletDimensionStats } from '@/lib/finance/wallet-read-models';
import type { Database } from '@/lib/supabase/types';

export interface TransactionAggregateResult {
  ok: boolean;
  errorCode?: string;
  txCount: number;
  inflowUsd: number;
  outflowUsd: number;
  netFlowUsd: number;
  gasFeesUsd: number;
  tradingVolumeUsd: number;
  source: 'wallet_financial_summary' | 'rpc' | 'count_only';
  asOf?: string;
}

export interface FilteredCountResult {
  ok: boolean;
  errorCode?: string;
  matchingCount: number;
}

/**
 * Full-wallet entitled aggregates via precomputed read model when available.
 */
export async function loadWalletTransactionAggregates(
  walletId: string,
): Promise<TransactionAggregateResult> {
  try {
    const summary = await getWalletFinancialSummary(walletId);
    if (!summary) {
      return {
        ok: false,
        errorCode: 'AGGREGATE_UNAVAILABLE',
        txCount: 0,
        inflowUsd: 0,
        outflowUsd: 0,
        netFlowUsd: 0,
        gasFeesUsd: 0,
        tradingVolumeUsd: 0,
        source: 'wallet_financial_summary',
      };
    }
    return {
      ok: true,
      txCount: summary.tx_count ?? 0,
      inflowUsd: Number(summary.inflow_usd) || 0,
      outflowUsd: Number(summary.outflow_usd) || 0,
      netFlowUsd: Number(summary.net_flow_usd) || 0,
      gasFeesUsd: Number(summary.gas_fees_usd) || 0,
      tradingVolumeUsd: Number(summary.trading_volume_usd) || 0,
      source: 'wallet_financial_summary',
      asOf: summary.updated_at,
    };
  } catch {
    return {
      ok: false,
      errorCode: 'AGGREGATE_FAILED',
      txCount: 0,
      inflowUsd: 0,
      outflowUsd: 0,
      netFlowUsd: 0,
      gasFeesUsd: 0,
      tradingVolumeUsd: 0,
      source: 'wallet_financial_summary',
    };
  }
}

export async function countMatchingTransactions(
  supabase: SupabaseClient<Database>,
  walletId: string,
  filters: {
    asset?: string;
    network?: string;
    counterparty?: string;
    fromIso?: string;
    toIso?: string;
  },
): Promise<FilteredCountResult> {
  try {
    let q = supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('wallet_id', walletId);

    if (filters.asset) q = q.ilike('token_symbol', filters.asset);
    if (filters.network) q = q.eq('network', filters.network);
    if (filters.counterparty) q = q.ilike('counterparty', `%${filters.counterparty}%`);
    if (filters.fromIso) q = q.gte('timestamp', Math.floor(Date.parse(filters.fromIso) / 1000) || 0);
    // timestamp column may be ms or seconds depending on sync — also try date string if needed
    if (filters.toIso) {
      // Prefer date column range when ISO dates provided
      const fromDate = filters.fromIso?.slice(0, 10);
      const toDate = filters.toIso.slice(0, 10);
      if (fromDate) q = q.gte('date', fromDate);
      q = q.lte('date', toDate);
    }

    const { count, error } = await q;
    if (error) {
      return { ok: false, errorCode: 'TX_COUNT_FAILED', matchingCount: 0 };
    }
    return { ok: true, matchingCount: count ?? 0 };
  } catch {
    return { ok: false, errorCode: 'TX_COUNT_FAILED', matchingCount: 0 };
  }
}

export async function loadAssetDimensionAggregate(
  walletId: string,
  assetSymbol: string,
): Promise<{
  ok: boolean;
  txCount: number;
  volumeUsd: number;
  inflowUsd: number;
  outflowUsd: number;
} | null> {
  try {
    const rows = await getWalletDimensionStats(walletId, 'asset');
    const hit = rows.find(
      r => r.dimension_key.toUpperCase() === assetSymbol.toUpperCase() ||
        (r.label ?? '').toUpperCase() === assetSymbol.toUpperCase(),
    );
    if (!hit) return { ok: true, txCount: 0, volumeUsd: 0, inflowUsd: 0, outflowUsd: 0 };
    return {
      ok: true,
      txCount: hit.tx_count ?? 0,
      volumeUsd: Number(hit.volume_usd) || 0,
      inflowUsd: Number(hit.inflow_usd) || 0,
      outflowUsd: Number(hit.outflow_usd) || 0,
    };
  } catch {
    return null;
  }
}
