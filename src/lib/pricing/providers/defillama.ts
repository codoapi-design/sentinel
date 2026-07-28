/**
 * DefiLlama price provider — primary source for historical prices.
 *
 * Chosen because it batches: one request carries many `chain:address` coin
 * keys, so backfilling a day of transactions costs a handful of calls instead
 * of one per token. No API key and no per-key rate limit tier.
 *
 * Endpoints:
 *   GET https://coins.llama.fi/prices/current/{coins}
 *   GET https://coins.llama.fi/prices/historical/{timestamp}/{coins}
 *
 * A coin key is `ethereum:0x…` for contracts or `coingecko:bitcoin` for
 * symbol/native fallbacks.
 */

import { chunkByLength, pricingFetch } from '../http';
import {
  CHAIN_MAP,
  normalizeTokenRefs,
  type NormalizedTokenRef,
  type PriceMiss,
  type PriceProvider,
  type PriceQuote,
  type PriceResult,
  type TokenRef,
} from '../types';

const BASE_URL = 'https://coins.llama.fi';

/** Conservative batch bounds — DefiLlama has no documented URL limit. */
const MAX_COINS_PER_REQUEST = 60;
const MAX_URL_CHARS = 2000;

/** Time window DefiLlama may search around the requested timestamp. */
const HISTORICAL_SEARCH_WIDTH = '6h';

const DEFAULT_CONFIDENCE = 0.8;

interface LlamaCoin {
  price?: number;
  symbol?: string;
  timestamp?: number;
  confidence?: number;
  decimals?: number;
}

interface LlamaResponse {
  coins?: Record<string, LlamaCoin>;
}

/** Map a normalized ref onto a DefiLlama coin key, or explain why we can't. */
function toCoinKey(ref: NormalizedTokenRef): { coin: string } | { miss: PriceMiss } {
  if (ref.coingeckoId) {
    return { coin: `coingecko:${ref.coingeckoId}` };
  }

  if (ref.chain && ref.address) {
    const slug = CHAIN_MAP[ref.chain]?.defillama;
    if (!slug) {
      return {
        miss: {
          key: ref.key,
          ref: ref.input,
          reason: 'unsupported_chain',
          detail: `DefiLlama has no slug for ${ref.chain}`,
        },
      };
    }
    return { coin: `${slug}:${ref.address}` };
  }

  return {
    miss: {
      key: ref.key,
      ref: ref.input,
      reason: 'not_found',
      detail: 'symbol-only reference with no known CoinGecko id',
    },
  };
}

export class DefiLlamaProvider implements PriceProvider {
  readonly id = 'defillama';
  readonly supportsHistorical = true;

  /** No credentials required, so it is always available as a last resort. */
  isConfigured(): boolean {
    return true;
  }

  async getSpotPrices(tokens: TokenRef[]): Promise<PriceResult> {
    return this.fetchPrices(tokens, null);
  }

  async getHistoricalPrices(tokens: TokenRef[], timestampSec: number): Promise<PriceResult> {
    return this.fetchPrices(tokens, Math.floor(timestampSec));
  }

  private async fetchPrices(
    tokens: TokenRef[],
    timestampSec: number | null,
  ): Promise<PriceResult> {
    const prices = new Map<string, PriceQuote>();
    const misses: PriceMiss[] = [];

    const { refs, invalid } = normalizeTokenRefs(tokens);
    for (const ref of invalid) {
      misses.push({ key: 'invalid', ref, reason: 'invalid_ref' });
    }

    const coinToKey = new Map<string, string>();
    const refByKey = new Map<string, NormalizedTokenRef>();

    for (const ref of refs) {
      refByKey.set(ref.key, ref);
      const mapped = toCoinKey(ref);
      if ('miss' in mapped) {
        misses.push(mapped.miss);
        continue;
      }
      // Distinct refs can collapse onto one coin key; the map keeps the first.
      if (!coinToKey.has(mapped.coin)) {
        coinToKey.set(mapped.coin, ref.key);
      }
    }

    const coins = [...coinToKey.keys()];
    if (coins.length === 0) return { prices, misses };

    const pathPrefix =
      timestampSec === null
        ? `${BASE_URL}/prices/current/`
        : `${BASE_URL}/prices/historical/${timestampSec}/`;
    const budget = MAX_URL_CHARS - pathPrefix.length - 40;
    const chunks = chunkByLength(coins, MAX_COINS_PER_REQUEST, Math.max(200, budget));

    const resolved = new Set<string>();

    for (const chunk of chunks) {
      const query =
        timestampSec === null ? '' : `?searchWidth=${HISTORICAL_SEARCH_WIDTH}`;
      const url = `${pathPrefix}${chunk.join(',')}${query}`;

      const response = await pricingFetch<LlamaResponse>(url, {
        label: timestampSec === null ? 'defillama.current' : 'defillama.historical',
      });

      if (!response.ok || !response.data) {
        const reason = response.timedOut
          ? 'timeout'
          : response.rateLimited
            ? 'rate_limited'
            : 'provider_error';
        for (const coin of chunk) {
          const key = coinToKey.get(coin);
          const ref = key ? refByKey.get(key) : undefined;
          if (key && ref) {
            misses.push({ key, ref: ref.input, reason, detail: response.error ?? undefined });
          }
        }
        continue;
      }

      const payload = response.data.coins ?? {};
      for (const coin of chunk) {
        const key = coinToKey.get(coin);
        if (!key) continue;

        const entry = payload[coin];
        if (!entry || typeof entry.price !== 'number' || !Number.isFinite(entry.price)) {
          continue;
        }

        prices.set(key, {
          key,
          priceUsd: entry.price,
          source: 'defillama',
          confidence:
            typeof entry.confidence === 'number' ? entry.confidence : DEFAULT_CONFIDENCE,
          asOf: entry.timestamp ?? timestampSec ?? Math.floor(Date.now() / 1000),
        });
        resolved.add(key);
      }
    }

    // Anything the upstream simply had no data for.
    for (const [coin, key] of coinToKey) {
      if (resolved.has(key)) continue;
      if (misses.some(miss => miss.key === key)) continue;
      const ref = refByKey.get(key);
      if (!ref) continue;
      misses.push({
        key,
        ref: ref.input,
        reason: 'not_found',
        detail: `no DefiLlama data for ${coin}`,
      });
    }

    return { prices, misses };
  }
}
