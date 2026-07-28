/**
 * Pricing Layer — two-tier cache.
 *
 * Tier 1 (memory): a process-local LRU with per-entry TTL. Absorbs the
 * repeated lookups inside a single request or backfill batch.
 *
 * Tier 2 (Supabase `blockchain_cache`): survives cold starts and is shared
 * across instances. Rows are sharded by `(namespace, bucket)` and hold many
 * token prices in one JSON payload, so a 500-token day costs one row and one
 * round trip rather than 500 of each.
 *
 * Bucketing:
 *   - `spot`         → short TTL, refreshed constantly
 *   - `d:YYYY-MM-DD` → historical day bucket; prices are immutable, so the row
 *                      is written once and effectively never expires
 *   - `t:<unix>`     → exact-timestamp historical bucket (day bucketing off)
 *
 * A miss is never cached: absence of a price is a transient condition and
 * caching it would freeze a token as unpriced.
 */

import { createServerClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/types';
import { getPricingConfig } from './config';
import { dayKey, keyNamespace, type PriceQuote, type PriceSource } from './types';

/** `data_type` discriminator used for all pricing rows in `blockchain_cache`. */
const CACHE_DATA_TYPE = 'price_cache';
const CACHE_PROVIDER = 'pricing';
const PAYLOAD_VERSION = 1;

/** Consecutive Supabase failures before the persistent tier is shed. */
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 60_000;

export type PriceBucket = string;

export function spotBucket(): PriceBucket {
  return 'spot';
}

export function historicalBucket(timestampSec: number): PriceBucket {
  return getPricingConfig().bucketHistoricalToDay
    ? `d:${dayKey(timestampSec)}`
    : `t:${Math.floor(timestampSec)}`;
}

export function isSpotBucket(bucket: PriceBucket): boolean {
  return bucket === 'spot';
}

export interface PriceCacheStats {
  memoryHits: number;
  memoryMisses: number;
  persistentHits: number;
  persistentMisses: number;
  persistentReads: number;
  persistentWrites: number;
  persistentErrors: number;
  memoryEntries: number;
  /** Share of lookups served by either tier, 0..1. */
  hitRate: number;
}

interface StoredEntry {
  /** priceUsd */
  p: number;
  /** source */
  s: PriceSource;
  /** confidence */
  c: number;
  /** asOf, unix seconds */
  a: number;
}

interface StoredPayload {
  v: number;
  entries: Record<string, StoredEntry>;
}

interface MemoryEntry {
  quote: PriceQuote;
  expiresAt: number;
}

function toStored(quote: PriceQuote): StoredEntry {
  return { p: quote.priceUsd, s: quote.source, c: quote.confidence, a: quote.asOf };
}

function fromStored(key: string, entry: unknown): PriceQuote | null {
  if (!entry || typeof entry !== 'object') return null;
  const record = entry as Partial<StoredEntry>;
  if (typeof record.p !== 'number' || !Number.isFinite(record.p)) return null;
  return {
    key,
    priceUsd: record.p,
    source: (record.s as PriceSource) || 'cache',
    confidence: typeof record.c === 'number' ? record.c : 0.5,
    asOf: typeof record.a === 'number' ? record.a : 0,
  };
}

function rowKey(namespace: string, bucket: PriceBucket): string {
  return `px:${namespace}:${bucket}`;
}

export class PriceCache {
  private memory = new Map<string, MemoryEntry>();
  private consecutiveErrors = 0;
  private breakerOpenUntil = 0;

  private stats = {
    memoryHits: 0,
    memoryMisses: 0,
    persistentHits: 0,
    persistentMisses: 0,
    persistentReads: 0,
    persistentWrites: 0,
    persistentErrors: 0,
  };

  // ── Memory tier ───────────────────────────────────────────

  private memoryKey(key: string, bucket: PriceBucket): string {
    return `${bucket}|${key}`;
  }

  private memoryGet(key: string, bucket: PriceBucket): PriceQuote | null {
    const compound = this.memoryKey(key, bucket);
    const entry = this.memory.get(compound);
    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(compound);
      return null;
    }

    // Refresh recency for the LRU.
    this.memory.delete(compound);
    this.memory.set(compound, entry);
    return entry.quote;
  }

  private memorySet(quote: PriceQuote, bucket: PriceBucket, ttlMs: number): void {
    const config = getPricingConfig();
    const compound = this.memoryKey(quote.key, bucket);
    this.memory.delete(compound);
    this.memory.set(compound, { quote, expiresAt: Date.now() + ttlMs });

    while (this.memory.size > config.memoryMaxEntries) {
      const oldest = this.memory.keys().next();
      if (oldest.done) break;
      this.memory.delete(oldest.value);
    }
  }

  // ── Persistent tier ───────────────────────────────────────

  private persistentAvailable(): boolean {
    const config = getPricingConfig();
    if (!config.persistentCacheEnabled) return false;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return false;
    return Date.now() >= this.breakerOpenUntil;
  }

  private notePersistentError(scope: string, error: unknown): void {
    this.stats.persistentErrors++;
    this.consecutiveErrors++;
    if (this.consecutiveErrors >= BREAKER_THRESHOLD) {
      this.breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
      this.consecutiveErrors = 0;
      console.warn(`[Pricing] Persistent cache disabled for ${BREAKER_COOLDOWN_MS}ms after repeated failures`);
    }
    if (getPricingConfig().verboseLogging) {
      console.warn(`[Pricing] Cache ${scope} error:`, error);
    }
  }

  private async persistentGet(
    keys: string[],
    bucket: PriceBucket,
  ): Promise<Map<string, PriceQuote>> {
    const found = new Map<string, PriceQuote>();
    if (keys.length === 0 || !this.persistentAvailable()) return found;

    const wanted = new Set(keys);
    const rowIds = [...new Set(keys.map(key => rowKey(keyNamespace(key), bucket)))];

    try {
      const supabase = createServerClient();
      this.stats.persistentReads++;

      const { data, error } = await supabase
        .from('blockchain_cache')
        .select('wallet_address, payload, expires_at')
        .in('wallet_address', rowIds)
        .eq('data_type', CACHE_DATA_TYPE)
        .gt('expires_at', Date.now());

      if (error) {
        this.notePersistentError('read', error.message);
        return found;
      }

      this.consecutiveErrors = 0;

      for (const row of data || []) {
        const payload = row.payload as unknown as StoredPayload | null;
        const entries = payload?.entries;
        if (!entries || typeof entries !== 'object') continue;

        for (const [key, raw] of Object.entries(entries)) {
          if (!wanted.has(key)) continue;
          const quote = fromStored(key, raw);
          if (quote) found.set(key, quote);
        }
      }
    } catch (error) {
      this.notePersistentError('read', error);
    }

    return found;
  }

  private async persistentSet(quotes: PriceQuote[], bucket: PriceBucket): Promise<void> {
    if (quotes.length === 0 || !this.persistentAvailable()) return;

    const config = getPricingConfig();
    const ttlMs = isSpotBucket(bucket)
      ? config.spotPersistentTtlMs
      : config.historicalPersistentTtlMs;
    const now = Date.now();

    const byRow = new Map<string, Record<string, StoredEntry>>();
    for (const quote of quotes) {
      const id = rowKey(keyNamespace(quote.key), bucket);
      const bucketEntries = byRow.get(id) ?? {};
      bucketEntries[quote.key] = toStored(quote);
      byRow.set(id, bucketEntries);
    }

    try {
      const supabase = createServerClient();
      const rowIds = [...byRow.keys()];

      // Read-modify-write: rows accumulate tokens over time, so a blind upsert
      // would drop previously cached entries for the same (namespace, bucket).
      const { data: existing } = await supabase
        .from('blockchain_cache')
        .select('wallet_address, payload')
        .in('wallet_address', rowIds)
        .eq('data_type', CACHE_DATA_TYPE);

      const existingByRow = new Map<string, Record<string, StoredEntry>>();
      for (const row of existing || []) {
        const payload = row.payload as unknown as StoredPayload | null;
        if (payload?.entries && typeof payload.entries === 'object') {
          existingByRow.set(row.wallet_address, payload.entries);
        }
      }

      const rows = rowIds.map(id => ({
        wallet_address: id,
        data_type: CACHE_DATA_TYPE,
        provider: CACHE_PROVIDER,
        payload: {
          v: PAYLOAD_VERSION,
          entries: { ...(existingByRow.get(id) ?? {}), ...(byRow.get(id) ?? {}) },
        } as unknown as Json,
        fetched_at: now,
        expires_at: now + ttlMs,
        hit_count: 0,
      }));

      const { error } = await supabase
        .from('blockchain_cache')
        .upsert(rows, { onConflict: 'wallet_address,data_type' });

      if (error) {
        this.notePersistentError('write', error.message);
        return;
      }

      this.consecutiveErrors = 0;
      this.stats.persistentWrites += rows.length;
    } catch (error) {
      this.notePersistentError('write', error);
    }
  }

  // ── Public API ────────────────────────────────────────────

  /**
   * Look up `keys` in both tiers. Persistent hits are promoted into memory.
   * Returns the quotes found plus the keys still needing a provider call.
   */
  async get(
    keys: string[],
    bucket: PriceBucket,
  ): Promise<{ hits: Map<string, PriceQuote>; missing: string[] }> {
    const config = getPricingConfig();
    const memoryTtl = isSpotBucket(bucket)
      ? config.spotMemoryTtlMs
      : config.historicalMemoryTtlMs;

    const hits = new Map<string, PriceQuote>();
    const pending: string[] = [];

    for (const key of keys) {
      const quote = this.memoryGet(key, bucket);
      if (quote) {
        this.stats.memoryHits++;
        hits.set(key, quote);
      } else {
        this.stats.memoryMisses++;
        pending.push(key);
      }
    }

    if (pending.length === 0) return { hits, missing: [] };

    const persistent = await this.persistentGet(pending, bucket);
    const missing: string[] = [];

    for (const key of pending) {
      const quote = persistent.get(key);
      if (quote) {
        this.stats.persistentHits++;
        this.memorySet(quote, bucket, memoryTtl);
        hits.set(key, quote);
      } else {
        this.stats.persistentMisses++;
        missing.push(key);
      }
    }

    return { hits, missing };
  }

  /** Write freshly resolved quotes to both tiers. */
  async set(quotes: PriceQuote[], bucket: PriceBucket): Promise<void> {
    if (quotes.length === 0) return;

    const config = getPricingConfig();
    const memoryTtl = isSpotBucket(bucket)
      ? config.spotMemoryTtlMs
      : config.historicalMemoryTtlMs;

    for (const quote of quotes) {
      this.memorySet(quote, bucket, memoryTtl);
    }

    await this.persistentSet(quotes, bucket);
  }

  getStats(): PriceCacheStats {
    const lookups = this.stats.memoryHits + this.stats.memoryMisses;
    const served = this.stats.memoryHits + this.stats.persistentHits;
    return {
      ...this.stats,
      memoryEntries: this.memory.size,
      hitRate: lookups === 0 ? 0 : served / lookups,
    };
  }

  resetStats(): void {
    this.stats = {
      memoryHits: 0,
      memoryMisses: 0,
      persistentHits: 0,
      persistentMisses: 0,
      persistentReads: 0,
      persistentWrites: 0,
      persistentErrors: 0,
    };
  }

  clearMemory(): void {
    this.memory.clear();
  }
}

let cacheInstance: PriceCache | null = null;

export function getPriceCache(): PriceCache {
  if (!cacheInstance) {
    cacheInstance = new PriceCache();
  }
  return cacheInstance;
}
