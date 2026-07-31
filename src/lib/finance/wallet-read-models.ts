/**
 * Wallet read models — precomputed dashboard summaries.
 *
 * Source of truth: transactions (+ asset_positions for holdings elsewhere).
 * After sync/clone, rebuild these tables so the UI can hydrate in O(1)/O(n dims)
 * without scanning the full tx history in the browser.
 */

import { createServerClient } from '@/lib/supabase/server';
import {
  computeFinancialSummary,
  refineTransactionType,
} from '@/lib/finance/summary';
import { isTrustedTransaction } from '@/lib/finance/token-trust';
import { getPricingService } from '@/lib/pricing/service';

export type DimensionKind = 'client' | 'network' | 'type' | 'asset';

export type WalletFinancialSummaryRow = {
  wallet_id: string;
  user_id: string;
  inflow_usd: number;
  outflow_usd: number;
  net_flow_usd: number;
  gas_fees_usd: number;
  trading_volume_usd: number;
  tx_count: number;
  priced_cashflow_count: number;
  unpriced_count: number;
  excluded_activity_count: number;
  methodology: string | null;
  updated_at: string;
};

export type WalletDimensionStatRow = {
  wallet_id: string;
  user_id: string;
  dimension: DimensionKind;
  dimension_key: string;
  label: string | null;
  tx_count: number;
  volume_usd: number;
  inflow_usd: number;
  outflow_usd: number;
  top_token: string | null;
  last_tx_date: string | null;
  updated_at: string;
};

type TxRow = {
  type: string | null;
  direction: string | null;
  value_usd: number | null;
  value_eth: number | null;
  gas_fee_eth: number | null;
  method_id: string | null;
  method_name: string | null;
  protocol: string | null;
  to_addr: string | null;
  token_symbol: string | null;
  token_name: string | null;
  token_address: string | null;
  price_usd: number | null;
  network: string | null;
  counterparty: string | null;
  counterparty_label: string | null;
  date: string | null;
  timestamp: number | null;
};

type DimAcc = {
  label: string | null;
  txCount: number;
  volumeUsd: number;
  inflowUsd: number;
  outflowUsd: number;
  tokenCounts: Map<string, number>;
  lastTxDate: string | null;
  lastTs: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function ensureDim(map: Map<string, DimAcc>, key: string, label?: string | null): DimAcc {
  let acc = map.get(key);
  if (!acc) {
    acc = {
      label: label || null,
      txCount: 0,
      volumeUsd: 0,
      inflowUsd: 0,
      outflowUsd: 0,
      tokenCounts: new Map(),
      lastTxDate: null,
      lastTs: 0,
    };
    map.set(key, acc);
  } else if (label && !acc.label) {
    acc.label = label;
  }
  return acc;
}

function bumpToken(acc: DimAcc, token: string | null) {
  const t = (token || '').trim();
  if (!t || t.toUpperCase() === 'UNKNOWN') return;
  acc.tokenCounts.set(t, (acc.tokenCounts.get(t) || 0) + 1);
}

function topToken(acc: DimAcc): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const [t, n] of acc.tokenCounts) {
    if (n > bestN) {
      best = t;
      bestN = n;
    }
  }
  return best;
}

function touchDate(acc: DimAcc, date: string | null, ts: number | null) {
  const t = typeof ts === 'number' && Number.isFinite(ts) ? (ts > 1e12 ? ts : ts * 1000) : 0;
  if (t > acc.lastTs) {
    acc.lastTs = t;
    acc.lastTxDate = date || (t > 0 ? new Date(t).toISOString().slice(0, 10) : acc.lastTxDate);
  } else if (!acc.lastTxDate && date) {
    acc.lastTxDate = date;
  }
}

/**
 * Full rebuild of financial + dimension read models for one wallet.
 * Safe to call after sync, clone, or prune.
 */
export async function rebuildWalletReadModels(walletId: string): Promise<{
  ok: boolean;
  txCount: number;
  dimensionRows: number;
}> {
  const supabase = createServerClient();

  const { data: wallet, error: walletErr } = await supabase
    .from('wallets')
    .select('id, user_id')
    .eq('id', walletId)
    .maybeSingle();

  if (walletErr || !wallet) {
    console.warn('[ReadModels] wallet not found:', walletId, walletErr?.message);
    return { ok: false, txCount: 0, dimensionRows: 0 };
  }

  const rows: TxRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from('transactions')
      .select(
        'type, direction, value_usd, value_eth, gas_fee_eth, method_id, method_name, protocol, to_addr, token_symbol, token_name, token_address, price_usd, network, counterparty, counterparty_label, date, timestamp',
      )
      .eq('wallet_id', walletId)
      .order('timestamp', { ascending: false })
      .range(from, from + page - 1);
    if (error) {
      console.warn('[ReadModels] tx read failed:', error.message);
      return { ok: false, txCount: 0, dimensionRows: 0 };
    }
    if (!data?.length) break;
    rows.push(...(data as TxRow[]));
    if (data.length < page) break;
  }

  const trusted = rows.filter(row =>
    isTrustedTransaction({
      token_symbol: row.token_symbol,
      token_name: row.token_name,
      token_address: row.token_address,
      price_usd: row.price_usd,
      value_usd: row.value_usd,
      value_eth: row.value_eth,
      network: row.network,
    }),
  );

  let ethPriceUsd = 0;
  try {
    ethPriceUsd = await getPricingService().getCurrentNativePriceUsd(1);
  } catch {
    ethPriceUsd = 0;
  }

  const summary = computeFinancialSummary(
    trusted.map(row => ({
      type: refineTransactionType({
        type: row.type,
        methodId: row.method_id,
        methodName: row.method_name,
        protocol: row.protocol,
        to: row.to_addr,
        direction: row.direction,
      }),
      direction: row.direction,
      value_usd: row.value_usd,
      value_eth: row.value_eth,
      gas_fee_eth: row.gas_fee_eth,
      method_id: row.method_id,
      method_name: row.method_name,
      protocol: row.protocol,
      to_addr: row.to_addr,
    })),
    { ethPriceUsd },
  );

  const now = new Date().toISOString();
  const { error: sumErr } = await supabase.from('wallet_financial_summary').upsert(
    {
      wallet_id: walletId,
      user_id: wallet.user_id,
      inflow_usd: summary.totalRevenue,
      outflow_usd: summary.totalExpenses,
      net_flow_usd: summary.netFlow,
      gas_fees_usd: summary.gasFees,
      trading_volume_usd: summary.tradingVolume,
      tx_count: summary.transactionCount,
      priced_cashflow_count: summary.pricedCashflowCount,
      unpriced_count: summary.unpricedCount,
      excluded_activity_count: summary.excludedActivityCount,
      methodology: summary.methodology,
      updated_at: now,
    },
    { onConflict: 'wallet_id' },
  );
  if (sumErr) {
    // Table may not exist yet in some envs — soft-fail
    console.warn('[ReadModels] financial summary upsert failed:', sumErr.message);
    return { ok: false, txCount: trusted.length, dimensionRows: 0 };
  }

  const clients = new Map<string, DimAcc>();
  const networks = new Map<string, DimAcc>();
  const types = new Map<string, DimAcc>();
  const assets = new Map<string, DimAcc>();

  for (const row of trusted) {
    const type = refineTransactionType({
      type: row.type,
      methodId: row.method_id,
      methodName: row.method_name,
      protocol: row.protocol,
      to: row.to_addr,
      direction: row.direction,
    });
    const valueUsd =
      typeof row.value_usd === 'number' && Number.isFinite(row.value_usd) && row.value_usd > 0
        ? row.value_usd
        : 0;
    const isIn = type === 'income' || type === 'staking';
    const isOut = type === 'expense';

    const cp = (row.counterparty || '').toLowerCase().trim();
    if (cp && cp.startsWith('0x')) {
      const acc = ensureDim(clients, cp, row.counterparty_label);
      acc.txCount += 1;
      acc.volumeUsd += valueUsd;
      if (isIn) acc.inflowUsd += valueUsd;
      if (isOut) acc.outflowUsd += valueUsd;
      bumpToken(acc, row.token_symbol);
      touchDate(acc, row.date, row.timestamp);
    }

    const net = (row.network || '').toLowerCase().trim();
    if (net) {
      const acc = ensureDim(networks, net, net);
      acc.txCount += 1;
      acc.volumeUsd += valueUsd;
      if (isIn) acc.inflowUsd += valueUsd;
      if (isOut) acc.outflowUsd += valueUsd;
      bumpToken(acc, row.token_symbol);
      touchDate(acc, row.date, row.timestamp);
    }

    {
      const acc = ensureDim(types, type, type);
      acc.txCount += 1;
      acc.volumeUsd += valueUsd;
      if (isIn) acc.inflowUsd += valueUsd;
      if (isOut) acc.outflowUsd += valueUsd;
      bumpToken(acc, row.token_symbol);
      touchDate(acc, row.date, row.timestamp);
    }

    const sym = (row.token_symbol || '').trim();
    if (sym && sym.toUpperCase() !== 'UNKNOWN') {
      const key = sym.toUpperCase();
      const acc = ensureDim(assets, key, sym);
      acc.txCount += 1;
      acc.volumeUsd += valueUsd;
      if (isIn) acc.inflowUsd += valueUsd;
      if (isOut) acc.outflowUsd += valueUsd;
      bumpToken(acc, sym);
      touchDate(acc, row.date, row.timestamp);
    }
  }

  type DimInsert = {
    wallet_id: string;
    user_id: string;
    dimension: DimensionKind;
    dimension_key: string;
    label: string | null;
    tx_count: number;
    volume_usd: number;
    inflow_usd: number;
    outflow_usd: number;
    top_token: string | null;
    last_tx_date: string | null;
    updated_at: string;
  };

  const dimRows: DimInsert[] = [];
  const pushDims = (dimension: DimensionKind, map: Map<string, DimAcc>) => {
    for (const [key, acc] of map) {
      dimRows.push({
        wallet_id: walletId,
        user_id: wallet.user_id,
        dimension,
        dimension_key: key,
        label: acc.label,
        tx_count: acc.txCount,
        volume_usd: round2(acc.volumeUsd),
        inflow_usd: round2(acc.inflowUsd),
        outflow_usd: round2(acc.outflowUsd),
        top_token: topToken(acc),
        last_tx_date: acc.lastTxDate,
        updated_at: now,
      });
    }
  };
  pushDims('client', clients);
  pushDims('network', networks);
  pushDims('type', types);
  pushDims('asset', assets);

  // Replace dimension rows for this wallet
  await supabase.from('wallet_dimension_stats').delete().eq('wallet_id', walletId);

  for (let i = 0; i < dimRows.length; i += 100) {
    const batch = dimRows.slice(i, i + 100);
    const { error } = await supabase.from('wallet_dimension_stats').upsert(batch, {
      onConflict: 'wallet_id,dimension,dimension_key',
    });
    if (error) {
      console.warn('[ReadModels] dimension upsert failed:', error.message);
      return { ok: false, txCount: trusted.length, dimensionRows: 0 };
    }
  }

  return { ok: true, txCount: trusted.length, dimensionRows: dimRows.length };
}

export async function getWalletFinancialSummary(
  walletId: string,
): Promise<WalletFinancialSummaryRow | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('wallet_financial_summary')
    .select('*')
    .eq('wallet_id', walletId)
    .maybeSingle();
  if (error || !data) return null;
  return data as WalletFinancialSummaryRow;
}

export async function getWalletDimensionStats(
  walletId: string,
  dimension?: DimensionKind,
): Promise<WalletDimensionStatRow[]> {
  const supabase = createServerClient();
  let q = supabase.from('wallet_dimension_stats').select('*').eq('wallet_id', walletId);
  if (dimension) q = q.eq('dimension', dimension);
  const { data, error } = await q.order('volume_usd', { ascending: false });
  if (error || !data) return [];
  return data as WalletDimensionStatRow[];
}
