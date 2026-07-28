/**
 * Alchemy Prices provider — spot prices only.
 *
 * The project already provisions `ALCHEMY_API_KEY` for RPC and transfer
 * history, so spot pricing here is effectively free capacity. Alchemy exposes
 * no batched historical endpoint, so `supportsHistorical` is false and the
 * historical chain skips it entirely.
 *
 * Endpoints:
 *   GET  https://api.g.alchemy.com/prices/v1/{key}/tokens/by-symbol?symbols=…
 *   POST https://api.g.alchemy.com/prices/v1/{key}/tokens/by-address
 *
 * The API key sits in the URL path, so every call passes it to `pricingFetch`
 * as a secret to be masked before anything is logged.
 */

import { getApiKey } from '@/lib/env';
import { pricingFetch } from '../http';
import {
  CHAIN_MAP,
  SYMBOL_COINGECKO_IDS,
  allMisses,
  normalizeTokenRefs,
  type NormalizedTokenRef,
  type PriceMiss,
  type PriceProvider,
  type PriceQuote,
  type PriceResult,
  type TokenRef,
} from '../types';

const BASE_URL = 'https://api.g.alchemy.com/prices/v1';
const MAX_ITEMS_PER_REQUEST = 25;
const CONFIDENCE = 0.85;

const COINGECKO_ID_TO_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_COINGECKO_IDS).map(([symbol, id]) => [id, symbol]),
);

interface AlchemyPrice {
  currency?: string;
  value?: string | number;
  lastUpdatedAt?: string;
}

interface AlchemyEntry {
  symbol?: string;
  network?: string;
  address?: string;
  prices?: AlchemyPrice[];
  error?: string | null;
}

interface AlchemyResponse {
  data?: AlchemyEntry[];
}

function usdValue(entry: AlchemyEntry | undefined): { price: number; asOf: number } | null {
  const usd = entry?.prices?.find(p => (p.currency || '').toLowerCase() === 'usd');
  if (!usd) return null;

  const price = typeof usd.value === 'number' ? usd.value : Number.parseFloat(String(usd.value));
  if (!Number.isFinite(price)) return null;

  const parsed = usd.lastUpdatedAt ? Date.parse(usd.lastUpdatedAt) : NaN;
  return {
    price,
    asOf: Number.isFinite(parsed) ? Math.floor(parsed / 1000) : Math.floor(Date.now() / 1000),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export class AlchemyPriceProvider implements PriceProvider {
  readonly id = 'alchemy';
  readonly supportsHistorical = false;

  isConfigured(): boolean {
    return getApiKey('alchemy').length > 0;
  }

  private endpoint(path: string): string {
    return `${BASE_URL}/${getApiKey('alchemy')}/${path}`;
  }

  private secrets(): string[] {
    const key = getApiKey('alchemy');
    return key ? [key] : [];
  }

  async getSpotPrices(tokens: TokenRef[]): Promise<PriceResult> {
    if (!this.isConfigured()) {
      return allMisses(tokens, 'unconfigured', 'ALCHEMY_API_KEY not set');
    }

    const prices = new Map<string, PriceQuote>();
    const misses: PriceMiss[] = [];
    const { refs, invalid } = normalizeTokenRefs(tokens);

    for (const ref of invalid) {
      misses.push({ key: 'invalid', ref, reason: 'invalid_ref' });
    }

    const bySymbol = new Map<string, NormalizedTokenRef>();
    const byAddress: Array<{ ref: NormalizedTokenRef; network: string }> = [];

    for (const ref of refs) {
      if (ref.chain && ref.address) {
        const network = CHAIN_MAP[ref.chain]?.alchemyNetwork;
        if (network) {
          byAddress.push({ ref, network });
          continue;
        }
        misses.push({
          key: ref.key,
          ref: ref.input,
          reason: 'unsupported_chain',
          detail: `Alchemy Prices has no network slug for ${ref.chain}`,
        });
        continue;
      }

      const symbol =
        ref.symbol ?? (ref.coingeckoId ? COINGECKO_ID_TO_SYMBOL[ref.coingeckoId] : undefined);
      if (symbol) {
        // Several refs can share a symbol; the first wins and the rest resolve
        // from cache on the next pass.
        if (!bySymbol.has(symbol)) bySymbol.set(symbol, ref);
        continue;
      }

      misses.push({
        key: ref.key,
        ref: ref.input,
        reason: 'not_found',
        detail: 'no symbol or supported contract for Alchemy lookup',
      });
    }

    await this.fetchBySymbol(bySymbol, prices, misses);
    await this.fetchByAddress(byAddress, prices, misses);

    return { prices, misses };
  }

  /** Alchemy Prices exposes no batched historical endpoint. */
  async getHistoricalPrices(tokens: TokenRef[]): Promise<PriceResult> {
    return allMisses(
      tokens,
      'unsupported_operation',
      'Alchemy Prices does not serve batched historical prices',
    );
  }

  private async fetchBySymbol(
    bySymbol: Map<string, NormalizedTokenRef>,
    prices: Map<string, PriceQuote>,
    misses: PriceMiss[],
  ): Promise<void> {
    if (bySymbol.size === 0) return;

    for (const batch of chunk([...bySymbol.keys()], MAX_ITEMS_PER_REQUEST)) {
      const query = batch.map(symbol => `symbols=${encodeURIComponent(symbol)}`).join('&');
      const response = await pricingFetch<AlchemyResponse>(
        `${this.endpoint('tokens/by-symbol')}?${query}`,
        { secrets: this.secrets(), label: 'alchemy.by_symbol' },
      );

      if (!response.ok || !response.data) {
        this.pushTransportMisses(batch.map(s => bySymbol.get(s)!), response, misses);
        continue;
      }

      const entries = new Map(
        (response.data.data || []).map(entry => [(entry.symbol || '').toUpperCase(), entry]),
      );

      for (const symbol of batch) {
        const ref = bySymbol.get(symbol);
        if (!ref) continue;

        const value = usdValue(entries.get(symbol.toUpperCase()));
        if (!value) {
          misses.push({ key: ref.key, ref: ref.input, reason: 'not_found' });
          continue;
        }

        prices.set(ref.key, {
          key: ref.key,
          priceUsd: value.price,
          source: 'alchemy',
          confidence: CONFIDENCE,
          asOf: value.asOf,
        });
      }
    }
  }

  private async fetchByAddress(
    items: Array<{ ref: NormalizedTokenRef; network: string }>,
    prices: Map<string, PriceQuote>,
    misses: PriceMiss[],
  ): Promise<void> {
    if (items.length === 0) return;

    for (const batch of chunk(items, MAX_ITEMS_PER_REQUEST)) {
      const response = await pricingFetch<AlchemyResponse>(
        this.endpoint('tokens/by-address'),
        {
          method: 'POST',
          body: {
            addresses: batch.map(({ ref, network }) => ({ network, address: ref.address })),
          },
          secrets: this.secrets(),
          label: 'alchemy.by_address',
        },
      );

      if (!response.ok || !response.data) {
        this.pushTransportMisses(batch.map(item => item.ref), response, misses);
        continue;
      }

      const entries = new Map(
        (response.data.data || []).map(entry => [
          `${entry.network}|${(entry.address || '').toLowerCase()}`,
          entry,
        ]),
      );

      for (const { ref, network } of batch) {
        const value = usdValue(entries.get(`${network}|${(ref.address || '').toLowerCase()}`));
        if (!value) {
          misses.push({ key: ref.key, ref: ref.input, reason: 'not_found' });
          continue;
        }

        prices.set(ref.key, {
          key: ref.key,
          priceUsd: value.price,
          source: 'alchemy',
          confidence: CONFIDENCE,
          asOf: value.asOf,
        });
      }
    }
  }

  private pushTransportMisses(
    refs: NormalizedTokenRef[],
    response: { timedOut: boolean; rateLimited: boolean; error: string | null },
    misses: PriceMiss[],
  ): void {
    const reason = response.timedOut
      ? 'timeout'
      : response.rateLimited
        ? 'rate_limited'
        : 'provider_error';
    for (const ref of refs) {
      misses.push({ key: ref.key, ref: ref.input, reason, detail: response.error ?? undefined });
    }
  }
}
