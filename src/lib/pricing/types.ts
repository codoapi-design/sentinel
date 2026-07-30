/**
 * Pricing Layer — shared types, normalization and chain mapping.
 *
 * This module is the single place where the app's network keys (`ethereum`,
 * `base`, `solana`, …) are translated into each vendor's chain slug. Anything
 * that needs a vendor slug must read it from `CHAIN_MAP` — divergent, ad-hoc
 * mappings are the most common source of silent pricing bugs.
 *
 * Nothing here performs I/O.
 */

// ────────────────────────────────────────────────────────────
// Core types
// ────────────────────────────────────────────────────────────

/** Identifier of the upstream that produced a quote. */
export type PriceSource = 'defillama' | 'coingecko' | 'alchemy' | 'cache' | 'unknown';

/**
 * A token to price. Either a contract reference (`chain` + `address`), a
 * CoinGecko id, or a bare symbol. Extra fields are used as fallbacks in that
 * order of preference.
 */
export interface TokenRef {
  chain?: string;
  address?: string;
  symbol?: string;
  coingeckoId?: string;
}

/** A `TokenRef` after normalization, carrying its stable cache key. */
export interface NormalizedTokenRef {
  /** Stable cache key — see `tokenRefKey`. */
  key: string;
  /** Canonical app network key (`ethereum`, `base`, …), when resolvable. */
  chain: string | null;
  /** Lower-cased contract address for EVM chains, verbatim otherwise. */
  address: string | null;
  symbol: string | null;
  coingeckoId: string | null;
  /** True when the ref points at the chain's gas token rather than a contract. */
  isNative: boolean;
  /** The ref as supplied by the caller. */
  input: TokenRef;
}

export interface PriceQuote {
  /** Normalized token key this quote belongs to. */
  key: string;
  /** USD price. Zero is a legitimate value and is never synthesized. */
  priceUsd: number;
  source: PriceSource;
  /** 0..1 — vendor-reported where available, otherwise a static default. */
  confidence: number;
  /** Unix seconds the price refers to (not when it was fetched). */
  asOf: number;
}

export type PriceMissReason =
  | 'invalid_ref'
  | 'unsupported_chain'
  | 'unsupported_operation'
  | 'not_found'
  | 'provider_error'
  | 'rate_limited'
  | 'timeout'
  | 'unconfigured'
  | 'no_provider';

export interface PriceMiss {
  key: string;
  ref: TokenRef;
  reason: PriceMissReason;
  detail?: string;
}

/**
 * Result of a pricing request. Partial success is the normal case: resolved
 * tokens land in `prices`, unresolved ones in `misses` with a reason. Pricing
 * calls never throw for upstream failures.
 */
export interface PriceResult {
  prices: Map<string, PriceQuote>;
  misses: PriceMiss[];
}

export interface PriceProvider {
  id: string;
  isConfigured(): boolean;
  supportsHistorical: boolean;
  getSpotPrices(tokens: TokenRef[]): Promise<PriceResult>;
  getHistoricalPrices(tokens: TokenRef[], timestampSec: number): Promise<PriceResult>;
}

export function emptyPriceResult(): PriceResult {
  return { prices: new Map(), misses: [] };
}

/** Build a result where every supplied ref is a miss for the same reason. */
export function allMisses(
  tokens: TokenRef[],
  reason: PriceMissReason,
  detail?: string,
): PriceResult {
  const misses: PriceMiss[] = tokens.map(ref => ({
    key: tokenRefKey(ref) ?? 'invalid',
    ref,
    reason,
    detail,
  }));
  return { prices: new Map(), misses };
}

// ────────────────────────────────────────────────────────────
// Chain mapping — the single source of truth for vendor slugs
// ────────────────────────────────────────────────────────────

export interface ChainMapping {
  /** App network key. */
  key: string;
  chainId: number;
  /** DefiLlama chain slug used in `chain:address` coin keys. */
  defillama: string | null;
  /** CoinGecko asset-platform id used for contract lookups. */
  coingeckoPlatform: string | null;
  /** Alchemy Prices network slug. */
  alchemyNetwork: string | null;
  /** CoinGecko id of the chain's gas token. */
  nativeCoingeckoId: string;
  nativeSymbol: string;
}

export const CHAIN_MAP: Record<string, ChainMapping> = {
  ethereum: { key: 'ethereum', chainId: 1, defillama: 'ethereum', coingeckoPlatform: 'ethereum', alchemyNetwork: 'eth-mainnet', nativeCoingeckoId: 'ethereum', nativeSymbol: 'ETH' },
  base: { key: 'base', chainId: 8453, defillama: 'base', coingeckoPlatform: 'base', alchemyNetwork: 'base-mainnet', nativeCoingeckoId: 'ethereum', nativeSymbol: 'ETH' },
  arbitrum: { key: 'arbitrum', chainId: 42161, defillama: 'arbitrum', coingeckoPlatform: 'arbitrum-one', alchemyNetwork: 'arb-mainnet', nativeCoingeckoId: 'ethereum', nativeSymbol: 'ETH' },
  optimism: { key: 'optimism', chainId: 10, defillama: 'optimism', coingeckoPlatform: 'optimistic-ethereum', alchemyNetwork: 'opt-mainnet', nativeCoingeckoId: 'ethereum', nativeSymbol: 'ETH' },
  polygon: { key: 'polygon', chainId: 137, defillama: 'polygon', coingeckoPlatform: 'polygon-pos', alchemyNetwork: 'polygon-mainnet', nativeCoingeckoId: 'matic-network', nativeSymbol: 'POL' },
  avalanche: { key: 'avalanche', chainId: 43114, defillama: 'avax', coingeckoPlatform: 'avalanche', alchemyNetwork: 'avax-mainnet', nativeCoingeckoId: 'avalanche-2', nativeSymbol: 'AVAX' },
  bsc: { key: 'bsc', chainId: 56, defillama: 'bsc', coingeckoPlatform: 'binance-smart-chain', alchemyNetwork: 'bnb-mainnet', nativeCoingeckoId: 'binancecoin', nativeSymbol: 'BNB' },
  fantom: { key: 'fantom', chainId: 250, defillama: 'fantom', coingeckoPlatform: 'fantom', alchemyNetwork: 'fantom-mainnet', nativeCoingeckoId: 'fantom', nativeSymbol: 'FTM' },
  gnosis: { key: 'gnosis', chainId: 100, defillama: 'xdai', coingeckoPlatform: 'xdai', alchemyNetwork: 'gnosis-mainnet', nativeCoingeckoId: 'xdai', nativeSymbol: 'XDAI' },
  celo: { key: 'celo', chainId: 42220, defillama: 'celo', coingeckoPlatform: 'celo', alchemyNetwork: 'celo-mainnet', nativeCoingeckoId: 'celo', nativeSymbol: 'CELO' },
  linea: { key: 'linea', chainId: 59144, defillama: 'linea', coingeckoPlatform: 'linea', alchemyNetwork: 'linea-mainnet', nativeCoingeckoId: 'ethereum', nativeSymbol: 'ETH' },
  scroll: { key: 'scroll', chainId: 534352, defillama: 'scroll', coingeckoPlatform: 'scroll', alchemyNetwork: 'scroll-mainnet', nativeCoingeckoId: 'ethereum', nativeSymbol: 'ETH' },
  zksync: { key: 'zksync', chainId: 324, defillama: 'era', coingeckoPlatform: 'zksync', alchemyNetwork: 'zksync-mainnet', nativeCoingeckoId: 'ethereum', nativeSymbol: 'ETH' },
  mantle: { key: 'mantle', chainId: 5000, defillama: 'mantle', coingeckoPlatform: 'mantle', alchemyNetwork: 'mantle-mainnet', nativeCoingeckoId: 'mantle', nativeSymbol: 'MNT' },
  blast: { key: 'blast', chainId: 81457, defillama: 'blast', coingeckoPlatform: 'blast', alchemyNetwork: 'blast-mainnet', nativeCoingeckoId: 'ethereum', nativeSymbol: 'ETH' },
  hyperliquid: { key: 'hyperliquid', chainId: 999, defillama: 'hyperliquid', coingeckoPlatform: 'hyperliquid', alchemyNetwork: null, nativeCoingeckoId: 'hyperliquid', nativeSymbol: 'HYPE' },
  monad: { key: 'monad', chainId: 143, defillama: 'monad', coingeckoPlatform: 'monad', alchemyNetwork: 'monad-mainnet', nativeCoingeckoId: 'monad', nativeSymbol: 'MON' },
  arc: { key: 'arc', chainId: 5042002, defillama: null, coingeckoPlatform: null, alchemyNetwork: null, nativeCoingeckoId: 'usd-coin', nativeSymbol: 'USDC' },
  solana: { key: 'solana', chainId: 101, defillama: 'solana', coingeckoPlatform: 'solana', alchemyNetwork: 'solana-mainnet', nativeCoingeckoId: 'solana', nativeSymbol: 'SOL' },
  tron: { key: 'tron', chainId: 728126428, defillama: 'tron', coingeckoPlatform: 'tron', alchemyNetwork: null, nativeCoingeckoId: 'tron', nativeSymbol: 'TRX' },
  bitcoin: { key: 'bitcoin', chainId: 0, defillama: null, coingeckoPlatform: null, alchemyNetwork: null, nativeCoingeckoId: 'bitcoin', nativeSymbol: 'BTC' },
};

/** Aliases seen in stored rows and vendor payloads, mapped to app network keys. */
const CHAIN_ALIASES: Record<string, string> = {
  eth: 'ethereum',
  mainnet: 'ethereum',
  'eth-mainnet': 'ethereum',
  'base-mainnet': 'base',
  arb: 'arbitrum',
  'arb-mainnet': 'arbitrum',
  'arbitrum-one': 'arbitrum',
  op: 'optimism',
  'opt-mainnet': 'optimism',
  'optimistic-ethereum': 'optimism',
  matic: 'polygon',
  'polygon-pos': 'polygon',
  'polygon-mainnet': 'polygon',
  avax: 'avalanche',
  'avax-mainnet': 'avalanche',
  bnb: 'bsc',
  'binance-smart-chain': 'bsc',
  'bnb-mainnet': 'bsc',
  xdai: 'gnosis',
  era: 'zksync',
  'zksync-era': 'zksync',
  'solana-mainnet': 'solana',
  btc: 'bitcoin',
};

const CHAIN_BY_ID: Record<number, string> = Object.fromEntries(
  Object.values(CHAIN_MAP).map(m => [m.chainId, m.key]),
);

/** Canonical app network key for any known alias, id-string, or slug. */
export function resolveChainKey(chain: string | number | null | undefined): string | null {
  if (chain === null || chain === undefined) return null;
  if (typeof chain === 'number') return CHAIN_BY_ID[chain] ?? null;

  const raw = chain.trim().toLowerCase();
  if (!raw) return null;
  if (CHAIN_MAP[raw]) return raw;
  if (CHAIN_ALIASES[raw]) return CHAIN_ALIASES[raw];

  const asId = Number(raw);
  if (Number.isFinite(asId) && CHAIN_BY_ID[asId]) return CHAIN_BY_ID[asId];

  return null;
}

export function getChainMapping(chain: string | number | null | undefined): ChainMapping | null {
  const key = resolveChainKey(chain);
  return key ? CHAIN_MAP[key] : null;
}

export function chainKeyFromId(chainId: number): string | null {
  return CHAIN_BY_ID[chainId] ?? null;
}

// ────────────────────────────────────────────────────────────
// Native tokens & symbol fallbacks
// ────────────────────────────────────────────────────────────

/** Placeholder addresses used across providers to mean "the gas token". */
export const NATIVE_ADDRESS_PLACEHOLDERS = new Set([
  '0x0000000000000000000000000000000000000000',
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  'native',
  'eth',
]);

/**
 * Symbol → CoinGecko id for tokens we can price without a contract address.
 * Deliberately conservative: a wrong id produces a wrong price, which is worse
 * than a miss.
 */
export const SYMBOL_COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  WBTC: 'wrapped-bitcoin',
  CBBTC: 'coinbase-wrapped-btc',
  ETH: 'ethereum',
  WETH: 'weth',
  STETH: 'staked-ether',
  WSTETH: 'wrapped-steth',
  CBETH: 'coinbase-wrapped-staked-eth',
  RETH: 'rocket-pool-eth',
  SOL: 'solana',
  TRX: 'tron',
  BNB: 'binancecoin',
  MATIC: 'matic-network',
  POL: 'polygon-ecosystem-token',
  AVAX: 'avalanche-2',
  FTM: 'fantom',
  CELO: 'celo',
  MNT: 'mantle',
  HYPE: 'hyperliquid',
  XDAI: 'xdai',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  BUSD: 'binance-usd',
  FRAX: 'frax',
  TUSD: 'true-usd',
  LUSD: 'liquity-usd',
  GUSD: 'gemini-dollar',
  USDP: 'paxos-standard',
  USDD: 'usdd',
  PYUSD: 'paypal-usd',
  ARB: 'arbitrum',
  OP: 'optimism',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  CRV: 'curve-dao-token',
  MKR: 'maker',
  LDO: 'lido-dao',
  SNX: 'havven',
  SUSHI: 'sushi',
  GRT: 'the-graph',
  ENS: 'ethereum-name-service',
  RPL: 'rocket-pool',
  PEPE: 'pepe',
  SHIB: 'shiba-inu',
  DOGE: 'dogecoin',
  XRP: 'ripple',
  ADA: 'cardano',
};

export function isNativeAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  return NATIVE_ADDRESS_PLACEHOLDERS.has(address.trim().toLowerCase());
}

/** EVM addresses are case-insensitive; Solana/Tron addresses are not. */
export function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  return trimmed.startsWith('0x') || trimmed.startsWith('0X')
    ? trimmed.toLowerCase()
    : trimmed;
}

// ────────────────────────────────────────────────────────────
// Normalization
// ────────────────────────────────────────────────────────────

/**
 * Stable cache key for a token reference.
 *
 * Native gas tokens and symbol-resolvable refs collapse onto a shared
 * `coingecko:<id>` key so that, for example, ETH on Base and ETH on Arbitrum
 * hit the same cache entry.
 *
 * Returns null when the ref carries nothing identifiable.
 */
export function tokenRefKey(ref: TokenRef): string | null {
  return normalizeTokenRef(ref)?.key ?? null;
}

export function normalizeTokenRef(ref: TokenRef): NormalizedTokenRef | null {
  const chain = resolveChainKey(ref.chain);
  const mapping = chain ? CHAIN_MAP[chain] : null;
  const rawAddress = ref.address?.trim() ?? '';
  const symbol = ref.symbol?.trim().toUpperCase() || null;
  const explicitCoingeckoId = ref.coingeckoId?.trim().toLowerCase() || null;

  const native = rawAddress ? isNativeAddress(rawAddress) : false;

  // Native gas token: prefer the chain's CoinGecko id so cross-chain refs share
  // a cache entry.
  if (native && mapping) {
    return {
      key: `coingecko:${mapping.nativeCoingeckoId}`,
      chain,
      address: null,
      symbol: symbol ?? mapping.nativeSymbol,
      coingeckoId: mapping.nativeCoingeckoId,
      isNative: true,
      input: ref,
    };
  }

  if (rawAddress && !native && chain) {
    return {
      key: `${chain}:${normalizeAddress(rawAddress)}`,
      chain,
      address: normalizeAddress(rawAddress),
      symbol,
      coingeckoId: explicitCoingeckoId,
      isNative: false,
      input: ref,
    };
  }

  if (explicitCoingeckoId) {
    return {
      key: `coingecko:${explicitCoingeckoId}`,
      chain,
      address: null,
      symbol,
      coingeckoId: explicitCoingeckoId,
      isNative: native,
      input: ref,
    };
  }

  if (symbol) {
    const mapped = SYMBOL_COINGECKO_IDS[symbol];
    if (mapped) {
      return {
        key: `coingecko:${mapped}`,
        chain,
        address: null,
        symbol,
        coingeckoId: mapped,
        isNative: native,
        input: ref,
      };
    }
    return {
      key: `symbol:${symbol}`,
      chain,
      address: null,
      symbol,
      coingeckoId: null,
      isNative: native,
      input: ref,
    };
  }

  return null;
}

/** Normalize a batch, dropping unidentifiable refs into `invalid`. */
export function normalizeTokenRefs(tokens: TokenRef[]): {
  refs: NormalizedTokenRef[];
  invalid: TokenRef[];
} {
  const refs: NormalizedTokenRef[] = [];
  const invalid: TokenRef[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const normalized = normalizeTokenRef(token);
    if (!normalized) {
      invalid.push(token);
      continue;
    }
    if (seen.has(normalized.key)) continue;
    seen.add(normalized.key);
    refs.push(normalized);
  }

  return { refs, invalid };
}

/**
 * Namespace segment of a normalized key — a chain key, `coingecko`, or
 * `symbol`. Used to shard the persistent cache into a small number of rows.
 */
export function keyNamespace(key: string): string {
  const idx = key.indexOf(':');
  return idx === -1 ? key : key.slice(0, idx);
}

// ────────────────────────────────────────────────────────────
// Time bucketing
// ────────────────────────────────────────────────────────────

export const SECONDS_PER_DAY = 86_400;

/** UTC midnight (in seconds) of the day containing `timestampSec`. */
export function dayBucketTimestamp(timestampSec: number): number {
  return Math.floor(timestampSec / SECONDS_PER_DAY) * SECONDS_PER_DAY;
}

export function dayKey(timestampSec: number): string {
  return new Date(timestampSec * 1000).toISOString().slice(0, 10);
}

/** Accepts seconds or milliseconds and returns seconds. */
export function toUnixSeconds(timestamp: number): number {
  return timestamp > 1e12 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
}
