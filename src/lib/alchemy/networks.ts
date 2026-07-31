/**
 * Alchemy network catalog + runtime discovery of networks enabled on the API key.
 *
 * Alchemy apps only answer RPC for networks toggled in the dashboard.
 * A 403 means "not enabled on this app" — not "Alchemy doesn't support the chain".
 */

import { getApiKey } from '@/lib/env';

export type AlchemyFamily = 'evm' | 'solana' | 'tron' | 'bitcoin';

export interface AlchemyNetworkDef {
  /** App network key (ethereum, base, …). */
  key: string;
  /** RPC host subdomain host, e.g. eth-mainnet.g.alchemy.com */
  host: string;
  chainId: number;
  family: AlchemyFamily;
  name: string;
  nativeCurrency: string;
  /** Prefer mainnet product sync (exclude testnets / beacon / niche). */
  syncDefault: boolean;
}

/** Product sync catalog — mainnets we care about for wallet intelligence. */
export const ALCHEMY_NETWORK_CATALOG: AlchemyNetworkDef[] = [
  { key: 'ethereum', host: 'eth-mainnet.g.alchemy.com', chainId: 1, family: 'evm', name: 'Ethereum', nativeCurrency: 'ETH', syncDefault: true },
  { key: 'base', host: 'base-mainnet.g.alchemy.com', chainId: 8453, family: 'evm', name: 'Base', nativeCurrency: 'ETH', syncDefault: true },
  { key: 'arbitrum', host: 'arb-mainnet.g.alchemy.com', chainId: 42161, family: 'evm', name: 'Arbitrum', nativeCurrency: 'ETH', syncDefault: true },
  { key: 'optimism', host: 'opt-mainnet.g.alchemy.com', chainId: 10, family: 'evm', name: 'Optimism', nativeCurrency: 'ETH', syncDefault: true },
  { key: 'polygon', host: 'polygon-mainnet.g.alchemy.com', chainId: 137, family: 'evm', name: 'Polygon', nativeCurrency: 'POL', syncDefault: true },
  { key: 'bsc', host: 'bnb-mainnet.g.alchemy.com', chainId: 56, family: 'evm', name: 'BNB Smart Chain', nativeCurrency: 'BNB', syncDefault: true },
  { key: 'avalanche', host: 'avax-mainnet.g.alchemy.com', chainId: 43114, family: 'evm', name: 'Avalanche', nativeCurrency: 'AVAX', syncDefault: true },
  { key: 'linea', host: 'linea-mainnet.g.alchemy.com', chainId: 59144, family: 'evm', name: 'Linea', nativeCurrency: 'ETH', syncDefault: true },
  { key: 'scroll', host: 'scroll-mainnet.g.alchemy.com', chainId: 534352, family: 'evm', name: 'Scroll', nativeCurrency: 'ETH', syncDefault: true },
  { key: 'zksync', host: 'zksync-mainnet.g.alchemy.com', chainId: 324, family: 'evm', name: 'zkSync', nativeCurrency: 'ETH', syncDefault: true },
  { key: 'mantle', host: 'mantle-mainnet.g.alchemy.com', chainId: 5000, family: 'evm', name: 'Mantle', nativeCurrency: 'MNT', syncDefault: true },
  { key: 'blast', host: 'blast-mainnet.g.alchemy.com', chainId: 81457, family: 'evm', name: 'Blast', nativeCurrency: 'ETH', syncDefault: true },
  { key: 'gnosis', host: 'gnosis-mainnet.g.alchemy.com', chainId: 100, family: 'evm', name: 'Gnosis', nativeCurrency: 'xDAI', syncDefault: true },
  { key: 'celo', host: 'celo-mainnet.g.alchemy.com', chainId: 42220, family: 'evm', name: 'Celo', nativeCurrency: 'CELO', syncDefault: true },
  { key: 'metis', host: 'metis-mainnet.g.alchemy.com', chainId: 1088, family: 'evm', name: 'Metis', nativeCurrency: 'METIS', syncDefault: true },
  { key: 'polygonzkevm', host: 'polygonzkevm-mainnet.g.alchemy.com', chainId: 1101, family: 'evm', name: 'Polygon zkEVM', nativeCurrency: 'ETH', syncDefault: true },
  { key: 'worldchain', host: 'worldchain-mainnet.g.alchemy.com', chainId: 480, family: 'evm', name: 'World Chain', nativeCurrency: 'ETH', syncDefault: true },
  { key: 'unichain', host: 'unichain-mainnet.g.alchemy.com', chainId: 130, family: 'evm', name: 'Unichain', nativeCurrency: 'ETH', syncDefault: true },
  { key: 'ink', host: 'ink-mainnet.g.alchemy.com', chainId: 57073, family: 'evm', name: 'Ink', nativeCurrency: 'ETH', syncDefault: true },
  { key: 'soneium', host: 'soneium-mainnet.g.alchemy.com', chainId: 1868, family: 'evm', name: 'Soneium', nativeCurrency: 'ETH', syncDefault: true },
  { key: 'abstract', host: 'abstract-mainnet.g.alchemy.com', chainId: 2741, family: 'evm', name: 'Abstract', nativeCurrency: 'ETH', syncDefault: true },
  { key: 'sonic', host: 'sonic-mainnet.g.alchemy.com', chainId: 146, family: 'evm', name: 'Sonic', nativeCurrency: 'S', syncDefault: true },
  { key: 'sei', host: 'sei-mainnet.g.alchemy.com', chainId: 1329, family: 'evm', name: 'Sei', nativeCurrency: 'SEI', syncDefault: true },
  { key: 'bera', host: 'berachain-mainnet.g.alchemy.com', chainId: 80094, family: 'evm', name: 'Berachain', nativeCurrency: 'BERA', syncDefault: true },
  { key: 'opbnb', host: 'opbnb-mainnet.g.alchemy.com', chainId: 204, family: 'evm', name: 'opBNB', nativeCurrency: 'BNB', syncDefault: true },
  { key: 'apechain', host: 'apechain-mainnet.g.alchemy.com', chainId: 33139, family: 'evm', name: 'ApeChain', nativeCurrency: 'APE', syncDefault: true },
  { key: 'ronin', host: 'ronin-mainnet.g.alchemy.com', chainId: 2020, family: 'evm', name: 'Ronin', nativeCurrency: 'RON', syncDefault: true },
  { key: 'hyperliquid', host: 'hyperliquid-mainnet.g.alchemy.com', chainId: 999, family: 'evm', name: 'HyperEVM', nativeCurrency: 'HYPE', syncDefault: true },
  { key: 'monad', host: 'monad-mainnet.g.alchemy.com', chainId: 143, family: 'evm', name: 'Monad', nativeCurrency: 'MON', syncDefault: true },
  { key: 'rootstock', host: 'rootstock-mainnet.g.alchemy.com', chainId: 30, family: 'evm', name: 'Rootstock', nativeCurrency: 'RBTC', syncDefault: false },
  { key: 'shape', host: 'shape-mainnet.g.alchemy.com', chainId: 360, family: 'evm', name: 'Shape', nativeCurrency: 'ETH', syncDefault: false },
  { key: 'zetachain', host: 'zetachain-mainnet.g.alchemy.com', chainId: 7000, family: 'evm', name: 'ZetaChain', nativeCurrency: 'ZETA', syncDefault: false },
  { key: 'astar', host: 'astar-mainnet.g.alchemy.com', chainId: 592, family: 'evm', name: 'Astar', nativeCurrency: 'ASTR', syncDefault: false },
  { key: 'solana', host: 'solana-mainnet.g.alchemy.com', chainId: 101, family: 'solana', name: 'Solana', nativeCurrency: 'SOL', syncDefault: true },
  { key: 'tron', host: 'tron-mainnet.g.alchemy.com', chainId: 728126428, family: 'tron', name: 'Tron', nativeCurrency: 'TRX', syncDefault: true },
  { key: 'bitcoin', host: 'bitcoin-mainnet.g.alchemy.com', chainId: 0, family: 'bitcoin', name: 'Bitcoin', nativeCurrency: 'BTC', syncDefault: true },
];

export const ALCHEMY_RPC_HOST_BY_KEY: Record<string, string> = Object.fromEntries(
  ALCHEMY_NETWORK_CATALOG.map(n => [n.key, n.host]),
);

export const ALCHEMY_CHAIN_ID_TO_KEY: Record<number, string> = Object.fromEntries(
  ALCHEMY_NETWORK_CATALOG.map(n => [n.chainId, n.key]),
);

/** Fallback EVM chains if discovery fails entirely. */
export const FALLBACK_EVM_SYNC_CHAIN_IDS = [1, 8453, 42161, 10, 137, 56, 59144, 1088];

const DISCOVERY_TTL_MS = 10 * 60 * 1000;
const FORBIDDEN_TTL_MS = 10 * 60 * 1000;

type DiscoveryCache = {
  keyFingerprint: string;
  at: number;
  enabled: AlchemyNetworkDef[];
  forbidden: string[];
};

let discoveryCache: DiscoveryCache | null = null;
const forbiddenUntil = new Map<string, number>();

function keyFingerprint(apiKey: string): string {
  return `${apiKey.length}:${apiKey.slice(0, 6)}:${apiKey.slice(-4)}`;
}

export function markAlchemyNetworkForbidden(networkKey: string): void {
  forbiddenUntil.set(networkKey, Date.now() + FORBIDDEN_TTL_MS);
}

export function isAlchemyNetworkTemporarilyForbidden(networkKey: string): boolean {
  const until = forbiddenUntil.get(networkKey);
  if (!until) return false;
  if (Date.now() > until) {
    forbiddenUntil.delete(networkKey);
    return false;
  }
  return true;
}

export function clearAlchemyNetworkDiscoveryCache(): void {
  discoveryCache = null;
  forbiddenUntil.clear();
}

async function probeNetwork(def: AlchemyNetworkDef, apiKey: string): Promise<'ok' | 'forbidden' | 'error'> {
  if (isAlchemyNetworkTemporarilyForbidden(def.key)) return 'forbidden';

  let method = 'eth_blockNumber';
  let params: unknown[] = [];
  if (def.family === 'solana') {
    method = 'getHealth';
  } else if (def.family === 'bitcoin') {
    method = 'getblockcount';
  }

  try {
    const res = await fetch(`https://${def.host}/v2/${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      next: { revalidate: 0 },
    });
    if (res.status === 403) {
      markAlchemyNetworkForbidden(def.key);
      return 'forbidden';
    }
    if (!res.ok) return 'error';
    const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (body.error || body.result == null) return 'error';
    return 'ok';
  } catch {
    return 'error';
  }
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/**
 * Probe which catalog networks the current Alchemy API key can reach.
 * Results are cached briefly to keep sync fast.
 */
export async function discoverAlchemyNetworks(options?: {
  force?: boolean;
  /** When true, only probe syncDefault networks (faster). */
  syncOnly?: boolean;
}): Promise<{
  enabled: AlchemyNetworkDef[];
  forbidden: string[];
  probed: number;
  fromCache: boolean;
}> {
  const apiKey = getApiKey('alchemy');
  if (!apiKey) {
    return { enabled: [], forbidden: [], probed: 0, fromCache: false };
  }

  const fp = keyFingerprint(apiKey);
  if (
    !options?.force &&
    discoveryCache &&
    discoveryCache.keyFingerprint === fp &&
    Date.now() - discoveryCache.at < DISCOVERY_TTL_MS
  ) {
    return {
      enabled: discoveryCache.enabled,
      forbidden: discoveryCache.forbidden,
      probed: discoveryCache.enabled.length + discoveryCache.forbidden.length,
      fromCache: true,
    };
  }

  const candidates = ALCHEMY_NETWORK_CATALOG.filter(n =>
    options?.syncOnly === false ? true : n.syncDefault,
  );

  const statuses = await mapPool(candidates, 8, async def => ({
    def,
    status: await probeNetwork(def, apiKey),
  }));

  const enabled = statuses.filter(s => s.status === 'ok').map(s => s.def);
  const forbidden = statuses.filter(s => s.status === 'forbidden').map(s => s.def.key);

  discoveryCache = {
    keyFingerprint: fp,
    at: Date.now(),
    enabled,
    forbidden,
  };

  console.log(
    `[Alchemy] Network discovery: enabled=${enabled.length}/${candidates.length} ` +
      `(${enabled.map(e => e.key).join(', ') || 'none'})`,
  );

  return {
    enabled,
    forbidden,
    probed: candidates.length,
    fromCache: false,
  };
}

/** EVM chain IDs enabled on the current Alchemy key (for portfolio sync). */
export async function resolveAlchemyEvmSyncChainIds(): Promise<number[]> {
  const { enabled } = await discoverAlchemyNetworks({ syncOnly: true });
  const evmIds = enabled.filter(n => n.family === 'evm').map(n => n.chainId);
  if (evmIds.length > 0) return evmIds;
  // Soft fallback so sync still attempts core chains if probe fails entirely.
  return FALLBACK_EVM_SYNC_CHAIN_IDS;
}

export function getAlchemyNetworkByChainId(chainId: number): AlchemyNetworkDef | null {
  return ALCHEMY_NETWORK_CATALOG.find(n => n.chainId === chainId) || null;
}

export function getAlchemyNetworkByKey(key: string): AlchemyNetworkDef | null {
  return ALCHEMY_NETWORK_CATALOG.find(n => n.key === key) || null;
}
