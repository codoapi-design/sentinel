/**
 * Professional financial summary rules (USD cash-flow accounting).
 *
 * Concepts kept separate:
 * - Cash flow → Revenue / Expenses / Net Flow
 * - Trading activity → Trading volume (excluded from R/E)
 * - Chain cost → Gas fees (USD, separate card)
 */

import { getMethodInfo, getProtocolInfo } from '@/lib/alchemy/classifier';
import type { TransactionType } from '@/lib/blockchain/types';

export const TYPE_LABELS_AR: Record<string, string> = {
  // Deprecated aliases — English only (never surface Arabic in the product UI)
  income: 'Income',
  expense: 'Expense',
  trade: 'Trade',
  defi: 'DeFi',
  staking: 'Staking Reward',
  gas: 'Gas Fees',
  nft: 'NFT',
  bridge: 'Bridge',
};

export const TYPE_LABELS_EN: Record<string, string> = {
  income: 'Income',
  expense: 'Expense',
  trade: 'Trade',
  defi: 'DeFi',
  staking: 'Staking Reward',
  gas: 'Gas Fees',
  nft: 'NFT',
  bridge: 'Bridge',
};

export function resolveTypeLabel(type: string | null | undefined): string {
  if (!type) return TYPE_LABELS_EN.income;
  return TYPE_LABELS_EN[type] || type;
}

/** Types that count as cash-flow revenue */
const REVENUE_TYPES = new Set(['income', 'staking']);

/** Types that count as cash-flow expenses (outgoing value leaving the wallet) */
const EXPENSE_TYPES = new Set(['expense']);

/** Capital / market activity — not cash-flow R/E */
const ACTIVITY_EXCLUDED_FROM_CASHFLOW = new Set([
  'trade',
  'defi',
  'bridge',
  'nft',
  'gas',
]);

export interface TxSummaryInput {
  type?: string | null;
  direction?: string | null;
  valueUsd?: number | null;
  value_usd?: number | null;
  /** UI Transaction.value — often already USD */
  value?: number | null;
  valueEth?: number | null;
  value_eth?: number | null;
  gasFeeEth?: number | null;
  gas_fee_eth?: number | null;
  gasFeeUsd?: number | null;
  methodId?: string | null;
  method_id?: string | null;
  methodName?: string | null;
  method_name?: string | null;
  protocol?: string | null;
  to?: string | null;
  to_addr?: string | null;
}

export interface FinancialSummary {
  /** USD — income + staking rewards */
  totalRevenue: number;
  /** USD — outgoing transfers classified as expense */
  totalExpenses: number;
  /** USD — revenue − expenses (gas not deducted) */
  netFlow: number;
  /** USD — sum of gas fees */
  gasFees: number;
  /** USD — absolute notional of trade-classified txs */
  tradingVolume: number;
  transactionCount: number;
  /** Rows included in R/E with a USD amount */
  pricedCashflowCount: number;
  /** Rows skipped from R/E because USD was missing */
  unpricedCount: number;
  /** Rows classified as trade / defi / bridge / nft (excluded from cash flow) */
  excludedActivityCount: number;
  /** Human-readable methodology for UI */
  methodology: string;
}

/** @deprecated Use resolveTypeLabel — app is English-only */
export function resolveTypeLabelAr(type: string | null | undefined): string {
  return resolveTypeLabel(type);
}

/**
 * Upgrade a coarse income/expense type using method id, protocol address, or name hints.
 * Safe to run on read (existing DB rows) and on write (sync).
 */
export function refineTransactionType(input: {
  type?: string | null;
  methodId?: string | null;
  methodName?: string | null;
  protocol?: string | null;
  to?: string | null;
  direction?: string | null;
  statusFailed?: boolean;
  /** True when the same hash has token legs both in and out */
  hasSwapLegs?: boolean;
}): TransactionType {
  if (input.statusFailed) return 'gas';

  const methodId = (input.methodId || '').toLowerCase();
  const methodName = (input.methodName || '').toLowerCase();
  const to = (input.to || '').toLowerCase();

  if (input.hasSwapLegs) return 'trade';

  const method = methodId ? getMethodInfo(methodId) : null;
  if (method?.type) return method.type as TransactionType;

  const protocol = to ? getProtocolInfo(to) : null;
  if (protocol?.type) return protocol.type as TransactionType;

  if (
    methodName.includes('swap') ||
    methodName.includes('exactinput') ||
    methodName.includes('exactoutput') ||
    methodName.includes('fillorder')
  ) {
    return 'trade';
  }
  if (methodName.includes('stake') || methodName.includes('claimreward') || methodName.includes('getreward')) {
    return 'staking';
  }
  if (
    methodName.includes('deposit') ||
    methodName.includes('withdraw') ||
    methodName.includes('borrow') ||
    methodName.includes('repay') ||
    methodName.includes('supply')
  ) {
    return 'defi';
  }
  if (methodName.includes('bridge') || methodName.includes('sendmessage')) {
    return 'bridge';
  }

  const existing = (input.type || '').toLowerCase();
  if (
    existing === 'trade' ||
    existing === 'defi' ||
    existing === 'staking' ||
    existing === 'gas' ||
    existing === 'nft' ||
    existing === 'bridge' ||
    existing === 'income' ||
    existing === 'expense'
  ) {
    return existing as TransactionType;
  }

  if (input.direction === 'in') return 'income';
  if (input.direction === 'out') return 'expense';
  return 'income';
}

/** Prefer explicit USD fields; never treat raw ETH quantity as dollars. */
export function resolveTxValueUsd(tx: TxSummaryInput): number | null {
  const candidates = [tx.valueUsd, tx.value_usd, tx.value];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) return c;
  }
  return null;
}

export function resolveGasFeeEth(tx: TxSummaryInput): number {
  const g = tx.gasFeeEth ?? tx.gas_fee_eth ?? 0;
  return typeof g === 'number' && Number.isFinite(g) && g > 0 ? g : 0;
}

export function computeFinancialSummary(
  txs: TxSummaryInput[],
  options?: { ethPriceUsd?: number | null },
): FinancialSummary {
  const ethPrice = options?.ethPriceUsd && options.ethPriceUsd > 0 ? options.ethPriceUsd : 0;

  let totalRevenue = 0;
  let totalExpenses = 0;
  let gasFees = 0;
  let tradingVolume = 0;
  let pricedCashflowCount = 0;
  let unpricedCount = 0;
  let excludedActivityCount = 0;

  for (const tx of txs) {
    const type = refineTransactionType({
      type: tx.type,
      methodId: tx.methodId ?? tx.method_id,
      methodName: tx.methodName ?? tx.method_name,
      protocol: tx.protocol,
      to: tx.to ?? tx.to_addr,
      direction: tx.direction,
    });

    const valueUsd = resolveTxValueUsd(tx);
    const gasEth = resolveGasFeeEth(tx);
    const gasUsd =
      typeof tx.gasFeeUsd === 'number' && tx.gasFeeUsd > 0
        ? tx.gasFeeUsd
        : ethPrice > 0
          ? gasEth * ethPrice
          : 0;
    gasFees += gasUsd;

    if (type === 'trade') {
      excludedActivityCount++;
      if (valueUsd != null) tradingVolume += valueUsd;
      continue;
    }

    if (ACTIVITY_EXCLUDED_FROM_CASHFLOW.has(type)) {
      excludedActivityCount++;
      continue;
    }

    if (REVENUE_TYPES.has(type)) {
      if (valueUsd == null) {
        unpricedCount++;
        continue;
      }
      totalRevenue += valueUsd;
      pricedCashflowCount++;
      continue;
    }

    if (EXPENSE_TYPES.has(type)) {
      if (valueUsd == null) {
        unpricedCount++;
        continue;
      }
      totalExpenses += valueUsd;
      pricedCashflowCount++;
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return {
    totalRevenue: round2(totalRevenue),
    totalExpenses: round2(totalExpenses),
    netFlow: round2(totalRevenue - totalExpenses),
    gasFees: round2(gasFees),
    tradingVolume: round2(tradingVolume),
    transactionCount: txs.length,
    pricedCashflowCount,
    unpricedCount,
    excludedActivityCount,
    methodology: buildMethodologyLine({
      pricedCashflowCount,
      unpricedCount,
      excludedActivityCount,
      tradingVolume: round2(tradingVolume),
    }),
  };
}

function buildMethodologyLine(parts: {
  pricedCashflowCount: number;
  unpricedCount: number;
  excludedActivityCount: number;
  tradingVolume: number;
}): string {
  const bits = [
    `USD cash flow from ${parts.pricedCashflowCount} classified transfer(s)`,
    `excludes ${parts.excludedActivityCount} trade/DeFi/bridge/NFT event(s)`,
    'gas shown separately (not deducted from Net Flow)',
  ];
  if (parts.tradingVolume > 0) {
    bits.push(`trading volume $${parts.tradingVolume.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
  }
  if (parts.unpricedCount > 0) {
    bits.push(`${parts.unpricedCount} unpriced row(s) omitted`);
  }
  return bits.join(' · ');
}

/** Cash-flow helper for per-group aggregations (networks, types, clients). */
export function isRevenueType(type: string): boolean {
  return REVENUE_TYPES.has(refineTransactionType({ type }));
}

export function isExpenseType(type: string): boolean {
  return EXPENSE_TYPES.has(refineTransactionType({ type }));
}

export function isTradeType(type: string): boolean {
  return refineTransactionType({ type }) === 'trade';
}

export function isExcludedFromCashflow(type: string): boolean {
  const t = refineTransactionType({ type });
  return ACTIVITY_EXCLUDED_FROM_CASHFLOW.has(t);
}
