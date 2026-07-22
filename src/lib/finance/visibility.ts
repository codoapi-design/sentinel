/**
 * Display-only visibility helpers for spam tokens and $0 / dust positions & txs.
 * Does not change sync, classification, or authoritative finance summaries.
 */

/** Matches existing dust floor used when upserting asset positions. */
export const DUST_USD_THRESHOLD = 0.01;

export interface SpamDustAssetLike {
  isSpam?: boolean | null;
  is_spam?: boolean | null;
  valueUsd?: number | null;
  value_usd?: number | null;
  priceUsd?: number | null;
  price_usd?: number | null;
}

export interface SpamDustTxLike {
  isSpam?: boolean | null;
  is_spam?: boolean | null;
  type?: string | null;
  /** UI Value column (mock Transaction.value) — treated as USD when present. */
  value?: number | null;
  valueUsd?: number | null;
  value_usd?: number | null;
  gasUsd?: number | null;
  gas_usd?: number | null;
  gasFeeUsd?: number | null;
  gas_fee_usd?: number | null;
}

function resolveUsd(...candidates: Array<number | null | undefined>): number | null {
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c;
  }
  return null;
}

function isBelowDust(usd: number | null): boolean {
  return usd == null || Math.abs(usd) < DUST_USD_THRESHOLD;
}

/** True when the asset USD value is missing, zero, or below the dust floor. */
export function isDustAssetValue(item: SpamDustAssetLike): boolean {
  const valueUsd = resolveUsd(item.valueUsd, item.value_usd);
  if (isBelowDust(valueUsd) || (valueUsd != null && valueUsd <= 0)) return true;

  const priceUsd = resolveUsd(item.priceUsd, item.price_usd);
  // Sync may bump unpriced holdings to exactly $0.01 so they persist — treat as dust.
  if ((priceUsd == null || priceUsd <= 0) && valueUsd != null && valueUsd <= DUST_USD_THRESHOLD) {
    return true;
  }

  return false;
}

/**
 * USD amount that matches what the Transactions Value column shows.
 * Prefer explicit USD fields / UI `value`; for gas-classified rows only, fall back to gas USD
 * when transfer value is missing/$0 so a real fee cost can stay visible.
 */
export function resolveTxDisplayUsd(item: SpamDustTxLike): number | null {
  const transferUsd = resolveUsd(item.valueUsd, item.value_usd, item.value);
  if (!isBelowDust(transferUsd)) return transferUsd;

  if (item.type === 'gas') {
    const gasUsd = resolveUsd(item.gasUsd, item.gas_usd, item.gasFeeUsd, item.gas_fee_usd);
    if (!isBelowDust(gasUsd)) return gasUsd;
  }

  return transferUsd;
}

/** True when the tx's displayed USD value is missing, zero, or below the dust floor. */
export function isDustTxValue(item: SpamDustTxLike): boolean {
  return isBelowDust(resolveTxDisplayUsd(item));
}

/**
 * Returns true when the asset should be hidden from list UIs.
 * When `showSpamAndDust` is true, nothing is hidden.
 */
export function isHiddenSpamOrDustAsset(
  item: SpamDustAssetLike,
  showSpamAndDust: boolean,
): boolean {
  if (showSpamAndDust) return false;
  if (item.isSpam === true || item.is_spam === true) return true;
  return isDustAssetValue(item);
}

/**
 * Returns true when the transaction should be hidden from list UIs.
 * Unit of truth = displayed USD Value (same as the table column): hide $0 / null / dust.
 * Gas-classified txs stay visible only when that display (or gas USD fallback) is ≥ dust.
 * A receive/transfer that shows $0.00 is hidden even if it paid gas.
 */
export function isHiddenSpamOrDustTx(
  item: SpamDustTxLike,
  showSpamAndDust: boolean,
): boolean {
  if (showSpamAndDust) return false;
  if (item.isSpam === true || item.is_spam === true) return true;
  return isDustTxValue(item);
}

export function filterVisibleAssets<T extends SpamDustAssetLike>(
  items: T[],
  showSpamAndDust: boolean,
): T[] {
  return items.filter((item) => !isHiddenSpamOrDustAsset(item, showSpamAndDust));
}

export function filterVisibleTransactions<T extends SpamDustTxLike>(
  items: T[],
  showSpamAndDust: boolean,
): T[] {
  return items.filter((item) => !isHiddenSpamOrDustTx(item, showSpamAndDust));
}
