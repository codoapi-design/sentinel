/**
 * Transaction Pricing Engine
 *
 * Resolves USD prices for transactions at their block timestamp.
 * Uses CoinGecko (free tier) with in-memory caching.
 */

import { getApiKey } from '@/lib/env';
import type { WalletTransaction } from '@/lib/blockchain/types';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const PRO_BASE = 'https://pro-api.coingecko.com/api/v3';

/** Stablecoins priced at $1 */
const STABLECOINS = new Set([
  'USDC', 'USDT', 'DAI', 'BUSD', 'USDD', 'FRAX', 'LUSD', 'TUSD', 'USDP', 'GUSD',
]);

/** Native token CoinGecko IDs per chain */
const NATIVE_COIN_IDS: Record<number, string> = {
  1: 'ethereum',
  8453: 'ethereum',
  42161: 'ethereum',
  10: 'ethereum',
  137: 'matic-network',
  43114: 'avalanche-2',
  56: 'binancecoin',
  59144: 'ethereum',
  999: 'hyperliquid',
  143: 'monad',
  5042002: 'usd-coin',
  101: 'solana',
  728126428: 'tron',
  0: 'bitcoin',
};

/** CoinGecko asset platform per chain (for contract lookups) */
const CHAIN_PLATFORMS: Record<number, string> = {
  1: 'ethereum',
  8453: 'base',
  42161: 'arbitrum-one',
  10: 'optimistic-ethereum',
  137: 'polygon-pos',
  43114: 'avalanche',
  56: 'binance-smart-chain',
  59144: 'linea',
  999: 'hyperliquid',
  143: 'monad',
  101: 'solana',
  728126428: 'tron',
};

function formatCoinGeckoDate(timestampSec: number): string {
  const d = new Date(timestampSec * 1000);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

export class PricingService {
  private priceCache = new Map<string, number>();
  private apiKey: string;
  private isPro: boolean;

  constructor() {
    this.apiKey = getApiKey('coingecko');
    // CoinGecko exposes two API surfaces:
    //   - Demo (free) keys → https://api.coingecko.com      + header x-cg-demo-api-key
    //   - Pro keys         → https://pro-api.coingecko.com  + header x-cg-pro-api-key
    // Default to the demo/free surface (the provided key is a demo key). Set
    // COINGECKO_API_TIER=pro to switch to the Pro endpoint.
    this.isPro = (process.env.COINGECKO_API_TIER || 'demo').toLowerCase() === 'pro';
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  private get baseUrl(): string {
    return this.isPro ? PRO_BASE : COINGECKO_BASE;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (this.apiKey) {
      h[this.isPro ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key'] = this.apiKey;
    }
    return h;
  }

  private cacheKey(kind: string, id: string, timestamp: number): string {
    const day = formatCoinGeckoDate(timestamp);
    return `${kind}:${id}:${day}`;
  }

  /**
   * Get native token USD price at a given timestamp
   */
  async getNativePriceUsd(chainId: number, timestamp: number): Promise<number> {
    const coinId = NATIVE_COIN_IDS[chainId] || 'ethereum';
    const key = this.cacheKey('native', coinId, timestamp);

    if (this.priceCache.has(key)) {
      return this.priceCache.get(key)!;
    }

    try {
      const date = formatCoinGeckoDate(timestamp);
      const url = `${this.baseUrl}/coins/${coinId}/history?date=${date}&localization=false`;
      const response = await fetch(url, { headers: this.headers() });

      if (response.ok) {
        const data = await response.json();
        const price = data?.market_data?.current_price?.usd;
        if (typeof price === 'number' && price > 0) {
          this.priceCache.set(key, price);
          return price;
        }
      }
    } catch (error) {
      console.warn(`[Pricing] Native price lookup failed for chain ${chainId}:`, error);
    }

    // Fallback: current price
    return this.getCurrentNativePrice(chainId);
  }

  private async getCurrentNativePrice(chainId: number): Promise<number> {
    const coinId = NATIVE_COIN_IDS[chainId] || 'ethereum';
    const key = `current:native:${coinId}`;

    if (this.priceCache.has(key)) {
      return this.priceCache.get(key)!;
    }

    try {
      const url = `${this.baseUrl}/simple/price?ids=${coinId}&vs_currencies=usd`;
      const response = await fetch(url, { headers: this.headers() });
      if (response.ok) {
        const data = await response.json();
        const price = data?.[coinId]?.usd;
        if (typeof price === 'number' && price > 0) {
          this.priceCache.set(key, price);
          return price;
        }
      }
    } catch {
      // ignore
    }

    return 0;
  }

  /**
   * Get ERC-20 token USD price at timestamp via contract address
   */
  async getTokenPriceUsd(
    chainId: number,
    tokenAddress: string,
    symbol: string,
    timestamp: number,
  ): Promise<number> {
    const upperSymbol = symbol.toUpperCase();
    if (STABLECOINS.has(upperSymbol)) {
      return 1.0;
    }

    const platform = CHAIN_PLATFORMS[chainId];
    if (!platform || !tokenAddress) {
      return 0;
    }

    const key = this.cacheKey('token', `${platform}:${tokenAddress.toLowerCase()}`, timestamp);
    if (this.priceCache.has(key)) {
      return this.priceCache.get(key)!;
    }

    try {
      // Historical: market chart range around the tx timestamp (±12h)
      const from = timestamp - 43200;
      const to = timestamp + 43200;
      const url =
        `${this.baseUrl}/coins/${platform}/contract/${tokenAddress.toLowerCase()}` +
        `/market_chart/range?vs_currency=usd&from=${from}&to=${to}`;

      const response = await fetch(url, { headers: this.headers() });
      if (response.ok) {
        const data = await response.json();
        const prices: [number, number][] = data?.prices || [];
        if (prices.length > 0) {
          const targetMs = timestamp * 1000;
          let closest = prices[0];
          for (const p of prices) {
            if (Math.abs(p[0] - targetMs) < Math.abs(closest[0] - targetMs)) {
              closest = p;
            }
          }
          const price = closest[1];
          if (price > 0) {
            this.priceCache.set(key, price);
            return price;
          }
        }
      }
    } catch (error) {
      console.warn(`[Pricing] Token price lookup failed for ${symbol}:`, error);
    }

    // Fallback: current token price
    return this.getCurrentTokenPrice(chainId, tokenAddress);
  }

  /**
   * Current native token USD price (public wrapper)
   */
  async getCurrentNativePriceUsd(chainId: number): Promise<number> {
    return this.getCurrentNativePrice(chainId);
  }

  /**
   * CoinGecko market chart for a coin id (e.g. ethereum, solana).
   * Returns [timestampMs, priceUsd] sorted ascending.
   */
  async getCoinMarketChart(
    coinId: string,
    days: number | 'max',
  ): Promise<Array<[number, number]>> {
    const daysParam = days === 'max' ? 'max' : String(days);
    return this.fetchMarketChart(
      `${this.baseUrl}/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${daysParam}`,
      `coin:${coinId}:${daysParam}`,
    );
  }

  /**
   * CoinGecko market chart for an ERC-20 (or equivalent) contract.
   */
  async getTokenMarketChart(
    chainId: number,
    tokenAddress: string,
    days: number | 'max',
  ): Promise<Array<[number, number]>> {
    const platform = CHAIN_PLATFORMS[chainId];
    if (!platform || !tokenAddress) return [];
    const addr = tokenAddress.toLowerCase();
    const daysParam = days === 'max' ? 'max' : String(days);
    return this.fetchMarketChart(
      `${this.baseUrl}/coins/${platform}/contract/${addr}/market_chart?vs_currency=usd&days=${daysParam}`,
      `token:${platform}:${addr}:${daysParam}`,
    );
  }

  private chartSeriesCache = new Map<string, Array<[number, number]>>();

  private async fetchMarketChart(
    url: string,
    cacheKey: string,
  ): Promise<Array<[number, number]>> {
    if (this.chartSeriesCache.has(cacheKey)) {
      return this.chartSeriesCache.get(cacheKey)!;
    }
    try {
      const response = await fetch(url, { headers: this.headers() });
      if (!response.ok) {
        console.warn(`[Pricing] market_chart ${cacheKey} → ${response.status}`);
        return [];
      }
      const data = await response.json();
      const prices: [number, number][] = (data?.prices || [])
        .filter((p: unknown) => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' && p[1] > 0)
        .map((p: [number, number]) => [p[0], p[1]]);
      if (prices.length > 0) {
        this.chartSeriesCache.set(cacheKey, prices);
      }
      return prices;
    } catch (err) {
      console.warn(`[Pricing] market_chart failed ${cacheKey}:`, err);
      return [];
    }
  }

  /** Native CoinGecko coin id for a chain (public). */
  getNativeCoinId(chainId: number): string {
    return NATIVE_COIN_IDS[chainId] || 'ethereum';
  }

  isStablecoinSymbol(symbol: string): boolean {
    return STABLECOINS.has(symbol.toUpperCase());
  }

  /**
   * Batch-fetch current USD prices for many ERC-20 contracts on one chain.
   * Returns a map of lowercased contract address → USD price.
   * Uses CoinGecko's /simple/token_price endpoint (many contracts per call)
   * to stay within rate limits.
   */
  async getCurrentTokenPricesUsd(
    chainId: number,
    tokenAddresses: string[],
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const platform = CHAIN_PLATFORMS[chainId];
    if (!platform || tokenAddresses.length === 0) return out;

    const unique = [...new Set(tokenAddresses.map(a => a.toLowerCase()))];
    const chunkSize = 40; // CoinGecko accepts many comma-separated contracts per call
    for (let i = 0; i < unique.length; i += chunkSize) {
      const chunk = unique.slice(i, i + chunkSize);
      try {
        const url =
          `${this.baseUrl}/simple/token_price/${platform}` +
          `?contract_addresses=${chunk.join(',')}&vs_currencies=usd`;
        const response = await fetch(url, { headers: this.headers() });
        if (response.ok) {
          const data = await response.json();
          for (const addr of chunk) {
            const price = data?.[addr]?.usd;
            if (typeof price === 'number' && price > 0) {
              out.set(addr, price);
            }
          }
        }
      } catch (error) {
        console.warn(`[Pricing] Batch token price lookup failed for chain ${chainId}:`, error);
      }
    }
    return out;
  }

  private async getCurrentTokenPrice(chainId: number, tokenAddress: string): Promise<number> {
    const platform = CHAIN_PLATFORMS[chainId];
    if (!platform) return 0;

    const key = `current:token:${platform}:${tokenAddress.toLowerCase()}`;
    if (this.priceCache.has(key)) {
      return this.priceCache.get(key)!;
    }

    try {
      const url =
        `${this.baseUrl}/simple/token_price/${platform}` +
        `?contract_addresses=${tokenAddress.toLowerCase()}&vs_currencies=usd`;
      const response = await fetch(url, { headers: this.headers() });
      if (response.ok) {
        const data = await response.json();
        const price = data?.[tokenAddress.toLowerCase()]?.usd;
        if (typeof price === 'number' && price > 0) {
          this.priceCache.set(key, price);
          return price;
        }
      }
    } catch {
      // ignore
    }

    return 0;
  }

  /**
   * Enrich a single transaction with USD pricing
   */
  async enrichTransaction(tx: WalletTransaction): Promise<WalletTransaction> {
    const timestamp = tx.timestamp > 1e12 ? Math.floor(tx.timestamp / 1000) : tx.timestamp;

    if (tx.tokenTransfers.length > 0) {
      const enrichedTransfers = await Promise.all(
        tx.tokenTransfers.map(async (transfer) => {
          const priceUsd = await this.getTokenPriceUsd(
            tx.chainId,
            transfer.tokenAddress,
            transfer.tokenSymbol,
            timestamp,
          );
          const valueUsd = transfer.valueFormatted * priceUsd;
          return { ...transfer, priceUsd, valueUsd };
        }),
      );

      const primary = enrichedTransfers[0];
      return {
        ...tx,
        tokenTransfers: enrichedTransfers,
        priceUsd: primary?.priceUsd ?? null,
        valueUsd: primary?.valueUsd ?? null,
      };
    }

    // Native transfer
    if (tx.valueEth > 0) {
      const priceUsd = await this.getNativePriceUsd(tx.chainId, timestamp);
      const valueUsd = tx.valueEth * priceUsd;
      return { ...tx, priceUsd, valueUsd };
    }

    return { ...tx, priceUsd: null, valueUsd: null };
  }

  /**
   * Batch-enrich transactions with USD pricing (sequential to respect rate limits)
   */
  async enrichTransactions(transactions: WalletTransaction[]): Promise<WalletTransaction[]> {
    const enriched: WalletTransaction[] = [];
    for (const tx of transactions) {
      enriched.push(await this.enrichTransaction(tx));
    }
    return enriched;
  }
}

let pricingInstance: PricingService | null = null;

export function getPricingService(): PricingService {
  if (!pricingInstance) {
    pricingInstance = new PricingService();
  }
  return pricingInstance;
}
