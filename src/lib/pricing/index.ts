/**
 * Pricing Layer — public surface.
 *
 * Import prices from here (or from `@/lib/pricing/price-service`); never call a
 * vendor SDK or endpoint directly from a feature.
 *
 *   import { getPriceService } from '@/lib/pricing';
 *   const { prices, misses } = await getPriceService().getSpotPrices([
 *     { chain: 'ethereum', address: '0xa0b8…' },
 *   ]);
 *
 * Note: the legacy `@/lib/pricing/service` (`PricingService`) still backs the
 * existing sync path and portfolio history. It is unchanged and both can run
 * side by side; new code should use this layer.
 */

export {
  PriceService,
  getPriceService,
  getPricingStats,
  type PriceLookupOptions,
  type PricingStats,
} from './price-service';

export {
  PriceCache,
  getPriceCache,
  historicalBucket,
  isSpotBucket,
  spotBucket,
  type PriceBucket,
  type PriceCacheStats,
} from './cache';

export { getPricingConfig, type PricingConfig } from './config';

export {
  AlchemyPriceProvider,
  CoinGeckoProvider,
  DefiLlamaProvider,
  NullProvider,
  getProvider,
  getProviderRegistry,
  type ProviderId,
} from './providers';

export {
  BackfillAccessError,
  DEFAULT_BACKFILL_LIMIT,
  MAX_BACKFILL_LIMIT,
  backfillTransactionPrices,
  type BackfillMissSummary,
  type BackfillOptions,
  type BackfillReport,
} from './backfill';

export {
  getUsageSnapshot,
  resetUsage,
  type ProviderUsage,
  type ProviderUsageSnapshot,
} from './usage';

export {
  CHAIN_MAP,
  SYMBOL_COINGECKO_IDS,
  allMisses,
  chainKeyFromId,
  dayBucketTimestamp,
  dayKey,
  emptyPriceResult,
  getChainMapping,
  isNativeAddress,
  keyNamespace,
  normalizeAddress,
  normalizeTokenRef,
  normalizeTokenRefs,
  resolveChainKey,
  tokenRefKey,
  toUnixSeconds,
  type ChainMapping,
  type NormalizedTokenRef,
  type PriceMiss,
  type PriceMissReason,
  type PriceProvider,
  type PriceQuote,
  type PriceResult,
  type PriceSource,
  type TokenRef,
} from './types';
