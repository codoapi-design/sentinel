/**
 * Historical price backfill for stored transactions.
 *
 * Many rows synced before the pricing layer existed carry a null `value_usd` /
 * `price_usd`, which quietly degrades Performance, ROI and Trading Volume.
 * This job repairs them.
 *
 * Cost shape: rows are grouped by (token, UTC day) before any lookup, so a
 * wallet with 500 unpriced transactions spread over 30 days and 8 tokens costs
 * roughly 30 batched provider calls rather than 500 individual ones — and the
 * second run costs zero, because historical prices are immutable and cached
 * permanently.
 *
 * Safety properties:
 *   - Idempotent. Re-running only touches rows that are still null.
 *   - Resumable. Progress is the database state itself; interruption is safe.
 *   - Non-destructive. An existing non-null `value_usd` is never overwritten
 *     unless `force` is passed.
 *   - Honest. A token the providers could not price stays null and is counted
 *     as `stillUnpriced`; it is never written as zero.
 */

import { createServerClient } from '@/lib/supabase/server';
import { getPriceService } from './price-service';
import {
  dayBucketTimestamp,
  dayKey,
  isNativeAddress,
  normalizeTokenRef,
  resolveChainKey,
  toUnixSeconds,
  type PriceMissReason,
  type TokenRef,
} from './types';

export const DEFAULT_BACKFILL_LIMIT = 500;
export const MAX_BACKFILL_LIMIT = 2000;

/** Parallel single-row UPDATE statements. Supabase has no bulk partial update. */
const UPDATE_CONCURRENCY = 8;

export class BackfillAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackfillAccessError';
  }
}

export interface BackfillOptions {
  walletId: string;
  userId: string;
  /** Max transactions scanned in one run. Clamped to `MAX_BACKFILL_LIMIT`. */
  limit?: number;
  /** Resolve and report prices without writing anything. */
  dryRun?: boolean;
  /** Re-price rows that already have a value. Off by default. */
  force?: boolean;
}

export interface BackfillMissSummary {
  key: string;
  reason: PriceMissReason;
  detail?: string;
  transactions: number;
}

export interface BackfillReport {
  walletId: string;
  dryRun: boolean;
  force: boolean;
  /** Transaction rows read from the database. */
  scanned: number;
  /** Rows carrying a token/amount we could attempt to price. */
  priceable: number;
  /** Rows with no priceable amount (zero-value calls, approvals, …). */
  skipped: number;
  /** Distinct (token, day) pairs — the unit of provider batching. */
  groups: number;
  /** Distinct UTC days — the number of historical provider round trips. */
  dayBuckets: number;
  /** Rows for which a price was resolved. */
  priced: number;
  /** Rows actually written (always 0 for a dry run). */
  updated: number;
  /** Rows that remain without a price. */
  stillUnpriced: number;
  /** Outbound provider HTTP requests attributable to this run. */
  providerCalls: number;
  providerCallsByProvider: Record<string, number>;
  /** Cache lookups served from either tier during this run. */
  cacheHits: number;
  cacheLookups: number;
  cacheHitRate: number;
  missReasons: Partial<Record<PriceMissReason, number>>;
  sampleMisses: BackfillMissSummary[];
  durationMs: number;
  errors: string[];
}

interface TransactionRow {
  id: string;
  timestamp: number;
  network: string | null;
  token_address: string | null;
  token_symbol: string | null;
  token_value: number | null;
  value_eth: number | null;
  value_usd: number | null;
  price_usd: number | null;
}

interface PriceableTx {
  row: TransactionRow;
  ref: TokenRef;
  key: string;
  amount: number;
  dayTimestamp: number;
  day: string;
}

/**
 * Decide what a row represents: a token-contract leg, a native-value leg, or
 * nothing priceable.
 */
function toPriceable(row: TransactionRow): PriceableTx | null {
  const chain = resolveChainKey(row.network) ?? undefined;
  const seconds = toUnixSeconds(row.timestamp || 0);
  if (!seconds) return null;

  const tokenValue = row.token_value ?? 0;
  const address = row.token_address?.trim() || '';
  const symbol = row.token_symbol?.trim() || '';

  let ref: TokenRef | null = null;
  let amount = 0;

  if (address && !isNativeAddress(address) && tokenValue > 0) {
    ref = { chain, address, symbol: symbol || undefined };
    amount = tokenValue;
  } else if ((row.value_eth ?? 0) > 0) {
    // Native leg — normalization maps the placeholder/native address to the chain's coin.
    ref = { chain, address: '0x0000000000000000000000000000000000000000', symbol: symbol || undefined };
    amount = row.value_eth ?? 0;
  } else if (symbol && tokenValue > 0) {
    ref = { chain, symbol };
    amount = tokenValue;
  }

  if (!ref || amount <= 0) return null;

  const normalized = normalizeTokenRef(ref);
  if (!normalized) return null;

  return {
    row,
    ref,
    key: normalized.key,
    amount,
    dayTimestamp: dayBucketTimestamp(seconds),
    day: dayKey(seconds),
  };
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      await fn(items[index++]);
    }
  });
  await Promise.all(workers);
}

/**
 * Backfill missing USD values for one wallet's transactions.
 *
 * Throws `BackfillAccessError` only when the wallet does not exist or is not
 * owned by `userId`. All other failures degrade into the report's `errors`.
 */
export async function backfillTransactionPrices(
  options: BackfillOptions,
): Promise<BackfillReport> {
  const startedAt = Date.now();
  const { walletId, userId, dryRun = false, force = false } = options;
  const limit = Math.min(
    MAX_BACKFILL_LIMIT,
    Math.max(1, options.limit ?? DEFAULT_BACKFILL_LIMIT),
  );

  const supabase = createServerClient();
  const priceService = getPriceService();
  const errors: string[] = [];

  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('id')
    .eq('id', walletId)
    .eq('user_id', userId)
    .maybeSingle();

  if (walletError) {
    throw new BackfillAccessError(`Wallet lookup failed: ${walletError.message}`);
  }
  if (!wallet) {
    throw new BackfillAccessError('Wallet not found for this user');
  }

  const before = priceService.getPricingStats();

  let query = supabase
    .from('transactions')
    .select(
      'id, timestamp, network, token_address, token_symbol, token_value, value_eth, value_usd, price_usd',
    )
    .eq('wallet_id', walletId)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (!force) {
    query = query.or('value_usd.is.null,price_usd.is.null');
  }

  const { data: rows, error: txError } = await query;
  if (txError) {
    throw new BackfillAccessError(`Transaction query failed: ${txError.message}`);
  }

  const scanned = rows?.length ?? 0;
  const priceable: PriceableTx[] = [];
  for (const row of (rows as TransactionRow[]) || []) {
    const candidate = toPriceable(row);
    if (candidate) priceable.push(candidate);
  }

  // Group by (token, day): the unit that maps onto one batched provider entry.
  const byDay = new Map<number, Map<string, PriceableTx[]>>();
  for (const item of priceable) {
    const dayGroup = byDay.get(item.dayTimestamp) ?? new Map<string, PriceableTx[]>();
    const keyGroup = dayGroup.get(item.key) ?? [];
    keyGroup.push(item);
    dayGroup.set(item.key, keyGroup);
    byDay.set(item.dayTimestamp, dayGroup);
  }

  let groups = 0;
  for (const dayGroup of byDay.values()) groups += dayGroup.size;

  const missReasons: Partial<Record<PriceMissReason, number>> = {};
  const missSummaries = new Map<string, BackfillMissSummary>();
  const updates: Array<{ item: PriceableTx; priceUsd: number; valueUsd: number }> = [];
  let stillUnpriced = 0;

  for (const [dayTimestamp, dayGroup] of byDay) {
    const refs = [...dayGroup.values()].map(items => items[0].ref);

    let result;
    try {
      result = await priceService.getHistoricalPrices(refs, dayTimestamp);
    } catch (error) {
      // The façade is designed not to throw; treat anything escaping as fatal
      // for this day only.
      errors.push(
        `Pricing failed for ${dayKey(dayTimestamp)}: ${error instanceof Error ? error.message : String(error)}`,
      );
      for (const items of dayGroup.values()) stillUnpriced += items.length;
      continue;
    }

    for (const [key, items] of dayGroup) {
      const quote = result.prices.get(key);
      if (!quote) {
        stillUnpriced += items.length;
        const miss = result.misses.find(m => m.key === key);
        const reason: PriceMissReason = miss?.reason ?? 'not_found';
        missReasons[reason] = (missReasons[reason] ?? 0) + items.length;

        const summary = missSummaries.get(key);
        if (summary) {
          summary.transactions += items.length;
        } else {
          missSummaries.set(key, {
            key,
            reason,
            detail: miss?.detail,
            transactions: items.length,
          });
        }
        continue;
      }

      for (const item of items) {
        updates.push({
          item,
          priceUsd: quote.priceUsd,
          valueUsd: item.amount * quote.priceUsd,
        });
      }
    }
  }

  let updated = 0;
  if (!dryRun && updates.length > 0) {
    await mapPool(updates, UPDATE_CONCURRENCY, async ({ item, priceUsd, valueUsd }) => {
      const needsValue = force || item.row.value_usd === null;
      const needsPrice = force || item.row.price_usd === null;
      if (!needsValue && !needsPrice) return;

      const payload: { value_usd?: number; price_usd?: number } = {};
      if (needsValue) payload.value_usd = valueUsd;
      if (needsPrice) payload.price_usd = priceUsd;

      let update = supabase.from('transactions').update(payload).eq('id', item.row.id);

      // Guard against a concurrent writer having filled the row in the meantime.
      if (!force) {
        update = needsValue ? update.is('value_usd', null) : update.is('price_usd', null);
      }

      const { error } = await update;
      if (error) {
        if (errors.length < 10) {
          errors.push(`Update failed for tx ${item.row.id}: ${error.message}`);
        }
        return;
      }
      updated++;
    });
  }

  const after = priceService.getPricingStats();
  const providerCallsByProvider: Record<string, number> = {};
  for (const [provider, usage] of Object.entries(after.providers)) {
    const delta = usage.requests - (before.providers[provider]?.requests ?? 0);
    if (delta > 0) providerCallsByProvider[provider] = delta;
  }

  const cacheHits =
    after.cache.memoryHits +
    after.cache.persistentHits -
    (before.cache.memoryHits + before.cache.persistentHits);
  const cacheLookups =
    after.cache.memoryHits +
    after.cache.memoryMisses -
    (before.cache.memoryHits + before.cache.memoryMisses);

  return {
    walletId,
    dryRun,
    force,
    scanned,
    priceable: priceable.length,
    skipped: scanned - priceable.length,
    groups,
    dayBuckets: byDay.size,
    priced: updates.length,
    updated,
    stillUnpriced,
    providerCalls: after.totals.providerRequests - before.totals.providerRequests,
    providerCallsByProvider,
    cacheHits,
    cacheLookups,
    cacheHitRate: cacheLookups === 0 ? 0 : cacheHits / cacheLookups,
    missReasons,
    sampleMisses: [...missSummaries.values()]
      .sort((a, b) => b.transactions - a.transactions)
      .slice(0, 20),
    durationMs: Date.now() - startedAt,
    errors,
  };
}
