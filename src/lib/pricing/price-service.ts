/**
 * Price Service — the only pricing entry point the rest of the app should use.
 *
 * Features must never call DefiLlama / CoinGecko / Alchemy directly: routing,
 * caching, retries and cost accounting all live behind this façade.
 *
 * ── Failover order ──────────────────────────────────────────────────────────
 *   spot        Alchemy → CoinGecko
 *   historical  CoinGecko                        (Alchemy has no batched
 *                                                 historical endpoint)
 * Unconfigured providers are skipped, not attempted. Each provider only sees
 * the tokens still unresolved by the previous one, so a fallback never re-pays
 * for work already done. `PRICING_SPOT_PROVIDER` / `PRICING_HISTORICAL_PROVIDER`
 * promote one provider to the front of its chain without removing the others.
 *
 * ── Caps and limits (defaults; all overridable via env) ─────────────────────
 *   Request timeout        10s per HTTP call            PRICING_REQUEST_TIMEOUT_MS
 *   Retries                2, exponential + full jitter PRICING_MAX_RETRIES
 *                          on 408 / 429 / 5xx / network; `Retry-After` honoured
 *   Per-provider inflight  4 concurrent calls           PRICING_MAX_CONCURRENCY
 *   DefiLlama batch        60 coins or ~2000 URL chars per request
 *   CoinGecko batch        100 ids / 40 contracts per request
 *   CoinGecko historical   25 tokens per façade call (one request each)
 *   Alchemy batch          25 symbols or addresses per request
 *   Memory cache           5,000 entries, LRU          PRICING_MEMORY_MAX_ENTRIES
 *   Spot TTL               60s memory / 5min persistent
 *   Historical TTL         1h memory / ~10y persistent (prices are immutable)
 *   Historical bucketing   UTC day                     PRICING_BUCKET_HISTORICAL_TO_DAY
 *
 * ── Guarantees ──────────────────────────────────────────────────────────────
 *   - Never throws for upstream failure; unresolved tokens come back as misses
 *     carrying a reason.
 *   - Never fabricates a price. Zero is a real price and is only ever returned
 *     when a provider reported it.
 *   - Identical in-flight lookups are de-duplicated, so N concurrent callers
 *     asking for the same token cost one upstream request.
 */

import {
  getPriceCache,
  historicalBucket,
  spotBucket,
  type PriceBucket,
  type PriceCacheStats,
} from './cache';
import { getPricingConfig } from './config';
import { getProviderRegistry, type ProviderId } from './providers';
import {
  dayBucketTimestamp,
  normalizeTokenRefs,
  toUnixSeconds,
  type NormalizedTokenRef,
  type PriceMiss,
  type PriceProvider,
  type PriceQuote,
  type PriceResult,
  type TokenRef,
} from './types';
import {
  getUsageSnapshot,
  getUsageStartedAt,
  recordResolution,
  recordSkip,
  resetUsage,
  type ProviderUsageSnapshot,
} from './usage';

/** Spot: Alchemy first, CoinGecko fills gaps. Historical: CoinGecko only. */
const SPOT_CHAIN: ProviderId[] = ['alchemy', 'coingecko'];
const HISTORICAL_CHAIN: ProviderId[] = ['coingecko'];

type Settlement = { quote: PriceQuote } | { miss: PriceMiss };

interface Deferred {
  promise: Promise<Settlement>;
  settle: (value: Settlement) => void;
}

function createDeferred(): Deferred {
  let settle!: (value: Settlement) => void;
  const promise = new Promise<Settlement>(resolve => {
    settle = resolve;
  });
  return { promise, settle };
}

/** Bounds the number of concurrent calls made to a single provider. */
class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

export interface PricingStats {
  providers: Record<string, ProviderUsageSnapshot>;
  cache: PriceCacheStats;
  totals: {
    /** Outbound HTTP requests across all providers, including retries. */
    providerRequests: number;
    tokensRequested: number;
    tokensResolved: number;
    /** Lookups served by piggy-backing on an identical in-flight request. */
    dedupedLookups: number;
    /** Façade calls made (`getSpotPrices` + `getHistoricalPrices`). */
    facadeCalls: number;
  };
  /** ISO timestamp of the last counter reset. */
  since: string;
}

export interface PriceLookupOptions {
  /** Cancels in-flight provider requests initiated by this call. */
  signal?: AbortSignal;
  /** Bypass both cache tiers for this call; results are still written back. */
  skipCache?: boolean;
}

export class PriceService {
  private readonly cache = getPriceCache();
  private readonly semaphores = new Map<string, Semaphore>();
  private readonly inflight = new Map<string, Promise<Settlement>>();
  private dedupedLookups = 0;
  private facadeCalls = 0;

  /** Current USD prices. */
  async getSpotPrices(
    tokens: TokenRef[],
    options: PriceLookupOptions = {},
  ): Promise<PriceResult> {
    return this.resolve(tokens, 'spot', null, options);
  }

  /**
   * USD prices as of `timestamp` (seconds or milliseconds). By default the
   * timestamp is rounded to UTC midnight so that a backfill of a whole day
   * collapses onto a single cache entry per token.
   */
  async getHistoricalPrices(
    tokens: TokenRef[],
    timestamp: number,
    options: PriceLookupOptions = {},
  ): Promise<PriceResult> {
    const seconds = toUnixSeconds(timestamp);
    const effective = getPricingConfig().bucketHistoricalToDay
      ? dayBucketTimestamp(seconds)
      : seconds;
    return this.resolve(tokens, 'historical', effective, options);
  }

  getPricingStats(): PricingStats {
    const providers = getUsageSnapshot();
    let providerRequests = 0;
    let tokensRequested = 0;
    let tokensResolved = 0;

    for (const usage of Object.values(providers)) {
      providerRequests += usage.requests;
      tokensRequested += usage.tokensRequested;
      tokensResolved += usage.tokensResolved;
    }

    return {
      providers,
      cache: this.cache.getStats(),
      totals: {
        providerRequests,
        tokensRequested,
        tokensResolved,
        dedupedLookups: this.dedupedLookups,
        facadeCalls: this.facadeCalls,
      },
      since: new Date(getUsageStartedAt()).toISOString(),
    };
  }

  resetPricingStats(): void {
    resetUsage();
    this.cache.resetStats();
    this.dedupedLookups = 0;
    this.facadeCalls = 0;
  }

  // ── Internals ─────────────────────────────────────────────

  private semaphoreFor(providerId: string): Semaphore {
    const existing = this.semaphores.get(providerId);
    if (existing) return existing;
    const created = new Semaphore(getPricingConfig().maxConcurrency);
    this.semaphores.set(providerId, created);
    return created;
  }

  private async resolve(
    tokens: TokenRef[],
    mode: 'spot' | 'historical',
    timestampSec: number | null,
    options: PriceLookupOptions,
  ): Promise<PriceResult> {
    this.facadeCalls++;

    const prices = new Map<string, PriceQuote>();
    const misses: PriceMiss[] = [];

    const { refs, invalid } = normalizeTokenRefs(tokens);
    for (const ref of invalid) {
      misses.push({
        key: 'invalid',
        ref,
        reason: 'invalid_ref',
        detail: 'reference has no chain+address, coingeckoId or symbol',
      });
    }
    if (refs.length === 0) return { prices, misses };

    const bucket: PriceBucket =
      mode === 'spot' ? spotBucket() : historicalBucket(timestampSec ?? 0);

    // Tier 1 + 2 cache.
    let pending = refs;
    if (!options.skipCache) {
      const { hits, missing } = await this.cache.get(refs.map(ref => ref.key), bucket);
      for (const [key, quote] of hits) prices.set(key, quote);
      const missingSet = new Set(missing);
      pending = refs.filter(ref => missingSet.has(ref.key));
    }
    if (pending.length === 0) return { prices, misses };

    // De-duplicate against identical lookups already in flight.
    const toFetch: NormalizedTokenRef[] = [];
    const awaited: Array<Promise<Settlement>> = [];
    const deferreds = new Map<string, Deferred>();

    for (const ref of pending) {
      const inflightKey = `${bucket}|${ref.key}`;
      const existing = this.inflight.get(inflightKey);
      if (existing) {
        this.dedupedLookups++;
        awaited.push(existing);
        continue;
      }
      const deferred = createDeferred();
      this.inflight.set(inflightKey, deferred.promise);
      deferreds.set(ref.key, deferred);
      toFetch.push(ref);
    }

    if (toFetch.length > 0) {
      try {
        const { resolved, unresolved } = await this.runChain(
          toFetch,
          mode,
          timestampSec,
          options,
        );

        for (const [key, quote] of resolved) prices.set(key, quote);
        for (const miss of unresolved) misses.push(miss);

        await this.cache.set([...resolved.values()], bucket);

        for (const [key, deferred] of deferreds) {
          const quote = resolved.get(key);
          deferred.settle(
            quote
              ? { quote }
              : {
                  miss:
                    unresolved.find(miss => miss.key === key) ??
                    {
                      key,
                      ref: toFetch.find(ref => ref.key === key)?.input ?? {},
                      reason: 'not_found',
                    },
                },
          );
        }
      } catch (error) {
        // Defensive: a provider bug must not strand callers awaiting our promises.
        const detail = error instanceof Error ? error.message : String(error);
        for (const [key, deferred] of deferreds) {
          const miss: PriceMiss = {
            key,
            ref: toFetch.find(ref => ref.key === key)?.input ?? {},
            reason: 'provider_error',
            detail,
          };
          misses.push(miss);
          deferred.settle({ miss });
        }
      } finally {
        for (const key of deferreds.keys()) {
          this.inflight.delete(`${bucket}|${key}`);
        }
      }
    }

    for (const settlement of await Promise.all(awaited)) {
      if ('quote' in settlement) prices.set(settlement.quote.key, settlement.quote);
      else misses.push(settlement.miss);
    }

    if (getPricingConfig().verboseLogging) {
      console.log(
        `[Pricing] ${mode} → requested=${refs.length} resolved=${prices.size} ` +
          `missed=${misses.length} fetched=${toFetch.length} deduped=${awaited.length}`,
      );
    }

    return { prices, misses };
  }

  private buildChain(mode: 'spot' | 'historical'): PriceProvider[] {
    const registry = getProviderRegistry();
    const config = getPricingConfig();
    const order = [...(mode === 'spot' ? SPOT_CHAIN : HISTORICAL_CHAIN)];

    const override =
      mode === 'spot' ? config.spotProviderOverride : config.historicalProviderOverride;
    if (override && order.includes(override as ProviderId)) {
      order.splice(order.indexOf(override as ProviderId), 1);
      order.unshift(override as ProviderId);
    }

    const chain: PriceProvider[] = [];
    for (const id of order) {
      const provider = registry[id];
      if (mode === 'historical' && !provider.supportsHistorical) continue;
      if (!provider.isConfigured()) {
        recordSkip(provider.id);
        continue;
      }
      chain.push(provider);
    }

    return chain.length > 0 ? chain : [registry.null];
  }

  private async runChain(
    refs: NormalizedTokenRef[],
    mode: 'spot' | 'historical',
    timestampSec: number | null,
    options: PriceLookupOptions,
  ): Promise<{ resolved: Map<string, PriceQuote>; unresolved: PriceMiss[] }> {
    const resolved = new Map<string, PriceQuote>();
    const lastMissByKey = new Map<string, PriceMiss>();
    let remaining = refs;

    for (const provider of this.buildChain(mode)) {
      if (remaining.length === 0) break;
      if (options.signal?.aborted) break;

      const inputs = remaining.map(ref => ref.input);
      const result = await this.semaphoreFor(provider.id).run(() =>
        mode === 'spot'
          ? provider.getSpotPrices(inputs)
          : provider.getHistoricalPrices(inputs, timestampSec ?? 0),
      );

      recordResolution(provider.id, inputs.length, result.prices.size);

      for (const [key, quote] of result.prices) {
        if (!resolved.has(key)) resolved.set(key, quote);
      }
      for (const miss of result.misses) {
        lastMissByKey.set(miss.key, miss);
      }

      remaining = remaining.filter(ref => !resolved.has(ref.key));
    }

    const unresolved: PriceMiss[] = remaining.map(
      ref =>
        lastMissByKey.get(ref.key) ?? {
          key: ref.key,
          ref: ref.input,
          reason: 'not_found',
          detail: 'no provider returned a price',
        },
    );

    return { resolved, unresolved };
  }
}

let serviceInstance: PriceService | null = null;

export function getPriceService(): PriceService {
  if (!serviceInstance) {
    serviceInstance = new PriceService();
  }
  return serviceInstance;
}

/** Convenience wrapper for callers that only need the stats snapshot. */
export function getPricingStats(): PricingStats {
  return getPriceService().getPricingStats();
}
