/**
 * CoinGecko price provider — market context and fallback.
 *
 * Credentials follow the convention already used by `src/lib/pricing/service.ts`:
 * `COINGECKO_API_KEY` (resolved through `@/lib/env` so the shorthand
 * `COINGECKO=` form keeps working) and `COINGECKO_API_TIER` selecting the demo
 * surface (default) or the Pro surface.
 *
 * Spot lookups batch well (`/simple/price`, `/simple/token_price`). Historical
 * lookups do not — CoinGecko needs one request per token — which is exactly why
 * DefiLlama leads the historical chain and CoinGecko only backs it up. To keep
 * a fallback storm from burning the rate limit, historical mode serves at most
 * `MAX_HISTORICAL_LOOKUPS` tokens per call and reports the remainder as misses.
 */

import { getApiKey } from '@/lib/env';
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

const DEMO_BASE = 'https://api.coingecko.com/api/v3';
const PRO_BASE = 'https://pro-api.coingecko.com/api/v3';

const MAX_IDS_PER_REQUEST = 100;
const MAX_CONTRACTS_PER_REQUEST = 40;
const MAX_URL_CHARS = 2000;

/** Per-call ceiling on the one-request-per-token historical path. */
const MAX_HISTORICAL_LOOKUPS = 25;
const HISTORICAL_CONCURRENCY = 2;

/** Window searched around a historical timestamp when sampling a chart. */
const HISTORICAL_WINDOW_SEC = 12 * 60 * 60;

const SPOT_CONFIDENCE = 0.9;
const HISTORICAL_CONFIDENCE = 0.7;

type SimplePriceResponse = Record<string, { usd?: number; last_updated_at?: number }>;

interface CoinHistoryResponse {
  market_data?: { current_price?: { usd?: number } };
}

interface MarketChartResponse {
  prices?: Array<[number, number]>;
}

function formatCoinGeckoDate(timestampSec: number): string {
  const date = new Date(timestampSec * 1000);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${date.getUTCFullYear()}`;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      out[current] = await fn(items[current]);
    }
  });
  await Promise.all(workers);
  return out;
}

export class CoinGeckoProvider implements PriceProvider {
  readonly id = 'coingecko';
  readonly supportsHistorical = true;

  isConfigured(): boolean {
    // The demo surface answers without a key, but only barely; treat the layer
    // as configured only when a key is present so failover stays predictable.
    return getApiKey('coingecko').length > 0;
  }

  private get isPro(): boolean {
    return (process.env.COINGECKO_API_TIER || 'demo').toLowerCase() === 'pro';
  }

  private get baseUrl(): string {
    return this.isPro ? PRO_BASE : DEMO_BASE;
  }

  private headers(): Record<string, string> {
    const apiKey = getApiKey('coingecko');
    if (!apiKey) return {};
    return { [this.isPro ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key']: apiKey };
  }

  private secrets(): string[] {
    const apiKey = getApiKey('coingecko');
    return apiKey ? [apiKey] : [];
  }

  async getSpotPrices(tokens: TokenRef[]): Promise<PriceResult> {
    const prices = new Map<string, PriceQuote>();
    const misses: PriceMiss[] = [];
    const { refs, invalid } = normalizeTokenRefs(tokens);

    for (const ref of invalid) {
      misses.push({ key: 'invalid', ref, reason: 'invalid_ref' });
    }

    const byId = new Map<string, NormalizedTokenRef>();
    const byPlatform = new Map<string, Map<string, NormalizedTokenRef>>();

    for (const ref of refs) {
      if (ref.coingeckoId) {
        byId.set(ref.coingeckoId, ref);
        continue;
      }
      if (ref.chain && ref.address) {
        const platform = CHAIN_MAP[ref.chain]?.coingeckoPlatform;
        if (!platform) {
          misses.push({
            key: ref.key,
            ref: ref.input,
            reason: 'unsupported_chain',
            detail: `no CoinGecko platform for ${ref.chain}`,
          });
          continue;
        }
        const bucket = byPlatform.get(platform) ?? new Map<string, NormalizedTokenRef>();
        bucket.set(ref.address, ref);
        byPlatform.set(platform, bucket);
        continue;
      }
      misses.push({
        key: ref.key,
        ref: ref.input,
        reason: 'not_found',
        detail: 'symbol-only reference with no known CoinGecko id',
      });
    }

    await this.fetchSimplePrices(byId, prices, misses);

    for (const [platform, bucket] of byPlatform) {
      await this.fetchTokenPrices(platform, bucket, prices, misses);
    }

    return { prices, misses };
  }

  private async fetchSimplePrices(
    byId: Map<string, NormalizedTokenRef>,
    prices: Map<string, PriceQuote>,
    misses: PriceMiss[],
  ): Promise<void> {
    if (byId.size === 0) return;

    const chunks = chunkByLength([...byId.keys()], MAX_IDS_PER_REQUEST, MAX_URL_CHARS);
    for (const chunk of chunks) {
      const url =
        `${this.baseUrl}/simple/price?ids=${chunk.map(encodeURIComponent).join(',')}` +
        '&vs_currencies=usd&include_last_updated_at=true';

      const response = await pricingFetch<SimplePriceResponse>(url, {
        headers: this.headers(),
        secrets: this.secrets(),
        label: 'coingecko.simple_price',
      });

      this.collectSimple(chunk, byId, response, prices, misses, id => id);
    }
  }

  private async fetchTokenPrices(
    platform: string,
    bucket: Map<string, NormalizedTokenRef>,
    prices: Map<string, PriceQuote>,
    misses: PriceMiss[],
  ): Promise<void> {
    const chunks = chunkByLength(
      [...bucket.keys()],
      MAX_CONTRACTS_PER_REQUEST,
      MAX_URL_CHARS,
    );

    for (const chunk of chunks) {
      const url =
        `${this.baseUrl}/simple/token_price/${platform}` +
        `?contract_addresses=${chunk.join(',')}&vs_currencies=usd&include_last_updated_at=true`;

      const response = await pricingFetch<SimplePriceResponse>(url, {
        headers: this.headers(),
        secrets: this.secrets(),
        label: 'coingecko.token_price',
      });

      // CoinGecko lower-cases contract keys in the response.
      this.collectSimple(chunk, bucket, response, prices, misses, addr => addr.toLowerCase());
    }
  }

  private collectSimple(
    chunk: string[],
    lookup: Map<string, NormalizedTokenRef>,
    response: Awaited<ReturnType<typeof pricingFetch<SimplePriceResponse>>>,
    prices: Map<string, PriceQuote>,
    misses: PriceMiss[],
    responseKeyFor: (item: string) => string,
  ): void {
    if (!response.ok || !response.data) {
      const reason = response.timedOut
        ? 'timeout'
        : response.rateLimited
          ? 'rate_limited'
          : 'provider_error';
      for (const item of chunk) {
        const ref = lookup.get(item);
        if (ref) {
          misses.push({
            key: ref.key,
            ref: ref.input,
            reason,
            detail: response.error ?? undefined,
          });
        }
      }
      return;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    for (const item of chunk) {
      const ref = lookup.get(item);
      if (!ref) continue;

      const entry = response.data[responseKeyFor(item)];
      const price = entry?.usd;
      if (typeof price !== 'number' || !Number.isFinite(price)) {
        misses.push({ key: ref.key, ref: ref.input, reason: 'not_found' });
        continue;
      }

      prices.set(ref.key, {
        key: ref.key,
        priceUsd: price,
        source: 'coingecko',
        confidence: SPOT_CONFIDENCE,
        asOf: entry?.last_updated_at ?? nowSec,
      });
    }
  }

  async getHistoricalPrices(tokens: TokenRef[], timestampSec: number): Promise<PriceResult> {
    const prices = new Map<string, PriceQuote>();
    const misses: PriceMiss[] = [];
    const { refs, invalid } = normalizeTokenRefs(tokens);

    for (const ref of invalid) {
      misses.push({ key: 'invalid', ref, reason: 'invalid_ref' });
    }

    const priceable: NormalizedTokenRef[] = [];
    for (const ref of refs) {
      if (ref.coingeckoId) {
        priceable.push(ref);
        continue;
      }
      if (ref.chain && ref.address) {
        if (CHAIN_MAP[ref.chain]?.coingeckoPlatform) {
          priceable.push(ref);
        } else {
          misses.push({
            key: ref.key,
            ref: ref.input,
            reason: 'unsupported_chain',
            detail: `no CoinGecko platform for ${ref.chain}`,
          });
        }
        continue;
      }
      misses.push({
        key: ref.key,
        ref: ref.input,
        reason: 'not_found',
        detail: 'symbol-only reference with no known CoinGecko id',
      });
    }

    const budgeted = priceable.slice(0, MAX_HISTORICAL_LOOKUPS);
    for (const ref of priceable.slice(MAX_HISTORICAL_LOOKUPS)) {
      misses.push({
        key: ref.key,
        ref: ref.input,
        reason: 'rate_limited',
        detail: `historical fallback budget of ${MAX_HISTORICAL_LOOKUPS} tokens per call exhausted`,
      });
    }

    const results = await mapPool(budgeted, HISTORICAL_CONCURRENCY, async ref =>
      this.fetchOneHistorical(ref, Math.floor(timestampSec)),
    );

    for (const result of results) {
      if ('quote' in result) prices.set(result.quote.key, result.quote);
      else misses.push(result.miss);
    }

    return { prices, misses };
  }

  private async fetchOneHistorical(
    ref: NormalizedTokenRef,
    timestampSec: number,
  ): Promise<{ quote: PriceQuote } | { miss: PriceMiss }> {
    if (ref.coingeckoId) {
      const url =
        `${this.baseUrl}/coins/${encodeURIComponent(ref.coingeckoId)}/history` +
        `?date=${formatCoinGeckoDate(timestampSec)}&localization=false`;

      const response = await pricingFetch<CoinHistoryResponse>(url, {
        headers: this.headers(),
        secrets: this.secrets(),
        label: 'coingecko.coin_history',
      });

      if (!response.ok || !response.data) {
        return { miss: this.transportMiss(ref, response) };
      }

      const price = response.data.market_data?.current_price?.usd;
      if (typeof price !== 'number' || !Number.isFinite(price)) {
        return { miss: { key: ref.key, ref: ref.input, reason: 'not_found' } };
      }

      return {
        quote: {
          key: ref.key,
          priceUsd: price,
          source: 'coingecko',
          confidence: HISTORICAL_CONFIDENCE,
          asOf: timestampSec,
        },
      };
    }

    const platform = ref.chain ? CHAIN_MAP[ref.chain]?.coingeckoPlatform : null;
    if (!platform || !ref.address) {
      return { miss: { key: ref.key, ref: ref.input, reason: 'unsupported_chain' } };
    }

    const url =
      `${this.baseUrl}/coins/${platform}/contract/${ref.address}/market_chart/range` +
      `?vs_currency=usd&from=${timestampSec - HISTORICAL_WINDOW_SEC}` +
      `&to=${timestampSec + HISTORICAL_WINDOW_SEC}`;

    const response = await pricingFetch<MarketChartResponse>(url, {
      headers: this.headers(),
      secrets: this.secrets(),
      label: 'coingecko.contract_range',
    });

    if (!response.ok || !response.data) {
      return { miss: this.transportMiss(ref, response) };
    }

    const series = response.data.prices ?? [];
    if (series.length === 0) {
      return { miss: { key: ref.key, ref: ref.input, reason: 'not_found' } };
    }

    const targetMs = timestampSec * 1000;
    let closest = series[0];
    for (const point of series) {
      if (Math.abs(point[0] - targetMs) < Math.abs(closest[0] - targetMs)) {
        closest = point;
      }
    }

    if (typeof closest[1] !== 'number' || !Number.isFinite(closest[1])) {
      return { miss: { key: ref.key, ref: ref.input, reason: 'not_found' } };
    }

    return {
      quote: {
        key: ref.key,
        priceUsd: closest[1],
        source: 'coingecko',
        confidence: HISTORICAL_CONFIDENCE,
        asOf: Math.floor(closest[0] / 1000),
      },
    };
  }

  private transportMiss(
    ref: NormalizedTokenRef,
    response: { timedOut: boolean; rateLimited: boolean; error: string | null },
  ): PriceMiss {
    return {
      key: ref.key,
      ref: ref.input,
      reason: response.timedOut
        ? 'timeout'
        : response.rateLimited
          ? 'rate_limited'
          : 'provider_error',
      detail: response.error ?? undefined,
    };
  }
}
