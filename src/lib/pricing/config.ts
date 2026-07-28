/**
 * Pricing Layer — runtime configuration.
 *
 * Every value has a production-safe default; none of these env vars are
 * required. Values are read lazily so that changing the environment between
 * cold starts is picked up without a rebuild.
 */

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export interface PricingConfig {
  /** Hard timeout applied to every outbound pricing request. */
  requestTimeoutMs: number;
  /** Retry attempts after the first try, for 429 / 5xx / network errors. */
  maxRetries: number;
  /** Base delay for exponential backoff. */
  retryBaseDelayMs: number;
  /** Upper bound on any single backoff sleep (also caps `Retry-After`). */
  retryMaxDelayMs: number;
  /** Concurrent in-flight requests allowed per provider. */
  maxConcurrency: number;
  /** In-memory TTL for spot quotes. */
  spotMemoryTtlMs: number;
  /** Persistent TTL for spot quotes. */
  spotPersistentTtlMs: number;
  /** In-memory TTL for historical quotes (bounded only to cap memory). */
  historicalMemoryTtlMs: number;
  /** Persistent TTL for historical quotes — immutable, so effectively forever. */
  historicalPersistentTtlMs: number;
  /** Max entries held in the process-local LRU. */
  memoryMaxEntries: number;
  /** Round historical timestamps to UTC midnight to maximize cache reuse. */
  bucketHistoricalToDay: boolean;
  /** Skip the Supabase-backed cache tier (useful for scripts/tests). */
  persistentCacheEnabled: boolean;
  /** Force a specific first provider for historical lookups. */
  historicalProviderOverride: string | null;
  /** Force a specific first provider for spot lookups. */
  spotProviderOverride: string | null;
  /** Emit a one-line usage summary after each façade call. */
  verboseLogging: boolean;
}

export function getPricingConfig(): PricingConfig {
  return {
    requestTimeoutMs: readInt('PRICING_REQUEST_TIMEOUT_MS', 10_000, 1_000, 60_000),
    maxRetries: readInt('PRICING_MAX_RETRIES', 2, 0, 5),
    retryBaseDelayMs: readInt('PRICING_RETRY_BASE_DELAY_MS', 400, 50, 10_000),
    retryMaxDelayMs: readInt('PRICING_RETRY_MAX_DELAY_MS', 4_000, 100, 30_000),
    maxConcurrency: readInt('PRICING_MAX_CONCURRENCY', 4, 1, 32),
    spotMemoryTtlMs: readInt('PRICING_SPOT_MEMORY_TTL_MS', 60_000, 1_000, 3_600_000),
    spotPersistentTtlMs: readInt('PRICING_SPOT_PERSISTENT_TTL_MS', 300_000, 1_000, 86_400_000),
    historicalMemoryTtlMs: readInt('PRICING_HISTORICAL_MEMORY_TTL_MS', 3_600_000, 1_000, 86_400_000),
    // ~10 years. Historical prices do not change; re-fetching them is pure waste.
    historicalPersistentTtlMs: 315_360_000_000,
    memoryMaxEntries: readInt('PRICING_MEMORY_MAX_ENTRIES', 5_000, 100, 100_000),
    bucketHistoricalToDay: readBool('PRICING_BUCKET_HISTORICAL_TO_DAY', true),
    persistentCacheEnabled: readBool('PRICING_PERSISTENT_CACHE', true),
    historicalProviderOverride: process.env.PRICING_HISTORICAL_PROVIDER?.trim().toLowerCase() || null,
    spotProviderOverride: process.env.PRICING_SPOT_PROVIDER?.trim().toLowerCase() || null,
    verboseLogging: readBool('PRICING_VERBOSE', false),
  };
}
