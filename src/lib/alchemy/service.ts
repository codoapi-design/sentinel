/**
 * Alchemy Service for CryptoBooks
 * 
 * Handles all interactions with Alchemy API:
 * - Fetching asset transfers for a wallet
 * - Getting transaction receipts with logs
 * - Classifying transactions using the classifier
 * - Supporting multiple networks (Ethereum, Base, Arbitrum, Optimism, BSC)
 */

import { Alchemy, Network, AssetTransfersCategory, AssetTransfersResult, SortingOrder, TransactionReceipt, TransactionResponse } from 'alchemy-sdk';
import { classifyTransaction, type ClassifiedTransaction, type TokenTransfer } from './classifier';
import { getApiKey } from '@/lib/env';
import type {
  TokenBalance as ChainTokenBalance,
  WalletTransaction,
  TokenTransfer as ChainTokenTransfer,
  TransactionType,
  TransactionDirection,
} from '@/lib/blockchain/types';

// ============================================================
// Network Configuration
// ============================================================

interface NetworkConfig {
  alchemyNetwork: Network | null;
  name: string;
  nameAr: string;
  nativeCurrency: string;
  chainId: number;
}

export const NETWORKS: Record<string, NetworkConfig> = {
  ethereum: {
    alchemyNetwork: Network.ETH_MAINNET,
    name: 'Ethereum',
    nameAr: 'إيثريوم',
    nativeCurrency: 'ETH',
    chainId: 1,
  },
  base: {
    alchemyNetwork: Network.BASE_MAINNET,
    name: 'Base',
    nameAr: 'بيس',
    nativeCurrency: 'ETH',
    chainId: 8453,
  },
  arbitrum: {
    alchemyNetwork: Network.ARB_MAINNET,
    name: 'Arbitrum',
    nameAr: 'أربيتروم',
    nativeCurrency: 'ETH',
    chainId: 42161,
  },
  optimism: {
    alchemyNetwork: Network.OPT_MAINNET,
    name: 'OP Mainnet',
    nameAr: 'أوبتيميزم',
    nativeCurrency: 'ETH',
    chainId: 10,
  },
  polygon: {
    alchemyNetwork: Network.MATIC_MAINNET,
    name: 'Polygon',
    nameAr: 'بوليغون',
    nativeCurrency: 'MATIC',
    chainId: 137,
  },
  bsc: {
    alchemyNetwork: Network.BNB_MAINNET,
    name: 'BNB Smart Chain',
    nameAr: 'بي إن بي',
    nativeCurrency: 'BNB',
    chainId: 56,
  },
  linea: {
    alchemyNetwork: Network.LINEA_MAINNET,
    name: 'Linea',
    nameAr: 'لينيا',
    nativeCurrency: 'ETH',
    chainId: 59144,
  },
  hyperliquid: {
    alchemyNetwork: Network.HYPERLIQUID_MAINNET,
    name: 'HyperEVM',
    nameAr: 'هايبريفي إم',
    nativeCurrency: 'HYPE',
    chainId: 999,
  },
  monad: {
    alchemyNetwork: null,
    name: 'Monad',
    nameAr: 'موناد',
    nativeCurrency: 'MON',
    chainId: 143,
  },
  arc: {
    alchemyNetwork: null,
    name: 'Arc Testnet',
    nameAr: 'آرك',
    nativeCurrency: 'USDC',
    chainId: 5042002,
  },
};

const CHAIN_ID_TO_NETWORK_KEY: Record<number, string> = {
  1: 'ethereum',
  8453: 'base',
  42161: 'arbitrum',
  10: 'optimism',
  137: 'polygon',
  56: 'bsc',
  59144: 'linea',
  999: 'hyperliquid',
  143: 'monad',
  5042002: 'arc',
};

const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

export function isAlchemyConfigured(): boolean {
  return getApiKey('alchemy').length > 0;
}

export function chainIdToAlchemyNetworkKey(chainId: number): string | null {
  return CHAIN_ID_TO_NETWORK_KEY[chainId] || null;
}

export function isAlchemyChainSupported(chainId: number): boolean {
  return chainIdToAlchemyNetworkKey(chainId) !== null;
}

// ============================================================
// Alchemy Client Factory
// ============================================================

const alchemyClients = new Map<string, Alchemy>();
let alchemyClientsKey: string | null = null;

function getAlchemyClient(networkKey: string): Alchemy {
  const apiKey = getApiKey('alchemy');
  if (!apiKey) {
    throw new Error('ALCHEMY_API_KEY not set in environment. Please add ALCHEMY_API_KEY to your Vercel environment variables.');
  }

  // Drop cached clients if the API key changed (e.g. after .env.local update + HMR).
  if (alchemyClientsKey !== apiKey) {
    alchemyClients.clear();
    alchemyClientsKey = apiKey;
  }

  if (alchemyClients.has(networkKey)) {
    return alchemyClients.get(networkKey)!;
  }

  const networkConfig = NETWORKS[networkKey];
  if (!networkConfig) {
    throw new Error(`Unknown network: ${networkKey}`);
  }
  if (!networkConfig.alchemyNetwork) {
    throw new Error(`Alchemy SDK Network enum not available for ${networkKey}; use raw RPC`);
  }

  const alchemy = new Alchemy({
    apiKey,
    network: networkConfig.alchemyNetwork,
  });

  alchemyClients.set(networkKey, alchemy);
  return alchemy;
}

/** Alchemy JSON-RPC host per network key (avoids flaky alchemy-sdk SERVER_ERROR under concurrency). */
const ALCHEMY_RPC_HOST: Record<string, string> = {
  ethereum: 'eth-mainnet.g.alchemy.com',
  base: 'base-mainnet.g.alchemy.com',
  arbitrum: 'arb-mainnet.g.alchemy.com',
  optimism: 'opt-mainnet.g.alchemy.com',
  polygon: 'polygon-mainnet.g.alchemy.com',
  bsc: 'bnb-mainnet.g.alchemy.com',
  linea: 'linea-mainnet.g.alchemy.com',
  hyperliquid: 'hyperliquid-mainnet.g.alchemy.com',
  monad: 'monad-mainnet.g.alchemy.com',
  arc: 'arc-testnet.g.alchemy.com',
};

/** Chains whose Alchemy app returned 403 (network not enabled on the API key). */
const alchemyForbiddenNetworks = new Set<string>();

export function isAlchemyNetworkForbidden(networkKeyOrChainId: string | number): boolean {
  const key =
    typeof networkKeyOrChainId === 'number'
      ? chainIdToAlchemyNetworkKey(networkKeyOrChainId)
      : networkKeyOrChainId;
  return key ? alchemyForbiddenNetworks.has(key) : false;
}

export class AlchemyNetworkForbiddenError extends Error {
  networkKey: string;
  constructor(networkKey: string) {
    super(
      `Alchemy network "${networkKey}" is not enabled for this API key (HTTP 403). Enable it in the Alchemy dashboard.`,
    );
    this.name = 'AlchemyNetworkForbiddenError';
    this.networkKey = networkKey;
  }
}

async function alchemyRpc<T = unknown>(
  networkKey: string,
  method: string,
  params: unknown[],
  retries = 2,
): Promise<T> {
  if (alchemyForbiddenNetworks.has(networkKey)) {
    throw new AlchemyNetworkForbiddenError(networkKey);
  }

  const apiKey = getApiKey('alchemy');
  const host = ALCHEMY_RPC_HOST[networkKey];
  if (!apiKey || !host) {
    throw new Error(`Alchemy RPC not available for ${networkKey}`);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`https://${host}/v2/${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        next: { revalidate: 0 },
      });
      if (response.status === 403) {
        alchemyForbiddenNetworks.add(networkKey);
        throw new AlchemyNetworkForbiddenError(networkKey);
      }
      if (!response.ok) {
        throw new Error(`Alchemy HTTP ${response.status}`);
      }
      const data = (await response.json()) as { result?: T; error?: { message?: string } };
      if (data.error) {
        throw new Error(data.error.message || 'Alchemy RPC error');
      }
      return data.result as T;
    } catch (err) {
      if (err instanceof AlchemyNetworkForbiddenError) throw err;
      lastError = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ============================================================
// Fetch & Classify Transactions
// ============================================================

export interface FetchTransactionsParams {
  walletAddress: string;
  networkKey?: string; // default: 'ethereum'
  fromBlock?: string;
  toBlock?: string;
  maxCount?: number;
  pageKey?: string;
}

export interface FetchTransactionsResult {
  transactions: ClassifiedTransaction[];
  pageKey: string | null;
  totalFetched: number;
  networkKey: string;
}

export async function fetchAndClassifyTransactions(
  params: FetchTransactionsParams
): Promise<FetchTransactionsResult> {
  const {
    walletAddress,
    networkKey = 'ethereum',
    fromBlock = 'latest',
    toBlock = 'latest',
    maxCount = 100,
    pageKey,
  } = params;

  const alchemy = getAlchemyClient(networkKey);
  const networkConfig = NETWORKS[networkKey];

  // Determine effective fromBlock - Alchemy requires block >= 0x885918 for getAssetTransfers
  // If '0x0' is provided, use a recent block instead (last 10000 blocks ≈ ~1.5 days)
  let effectiveFromBlock = fromBlock;
  if (fromBlock === '0x0' || fromBlock === '0') {
    // Use a recent block number - approximately 1 week ago
    try {
      const currentBlock = await alchemy.core.getBlockNumber();
      effectiveFromBlock = `0x${Math.max(0, currentBlock - 50000).toString(16)}`;
    } catch {
      effectiveFromBlock = 'latest';
    }
  }

  const transferCategories = [
    AssetTransfersCategory.EXTERNAL,
    AssetTransfersCategory.INTERNAL,
    AssetTransfersCategory.ERC20,
    AssetTransfersCategory.ERC721,
    AssetTransfersCategory.ERC1155,
  ];

  // Fetch outgoing transfers
  const outTransfers = await alchemy.core.getAssetTransfers({
    fromBlock: effectiveFromBlock,
    toBlock,
    maxCount,
    pageKey: pageKey || undefined,
    fromAddress: walletAddress,
    category: transferCategories,
    order: SortingOrder.DESCENDING,
    withMetadata: true,
    excludeZeroValue: true,
  });

  // Fetch incoming transfers
  const inTransfers = await alchemy.core.getAssetTransfers({
    fromBlock: effectiveFromBlock,
    toBlock,
    maxCount,
    toAddress: walletAddress,
    category: transferCategories,
    order: SortingOrder.DESCENDING,
    withMetadata: true,
    excludeZeroValue: true,
  });

  // Merge and deduplicate by hash
  const allTransfers = [...outTransfers.transfers, ...inTransfers.transfers];
  const seenHashes = new Set<string>();
  const uniqueTransfers = allTransfers.filter(t => {
    if (seenHashes.has(t.hash)) return false;
    seenHashes.add(t.hash);
    return true;
  });

  // Sort by block number descending
  uniqueTransfers.sort((a, b) => {
    const blockA = typeof a.blockNum === 'string' ? parseInt(a.blockNum, 16) : 0;
    const blockB = typeof b.blockNum === 'string' ? parseInt(b.blockNum, 16) : 0;
    return blockB - blockA;
  });

  // Classify each transaction
  const classified: ClassifiedTransaction[] = [];

  for (const transfer of uniqueTransfers) {
    try {
      const classifiedTx = await classifyAssetTransfer(transfer, walletAddress, networkKey, networkConfig);
      classified.push(classifiedTx);
    } catch (error) {
      console.error(`Error classifying tx ${transfer.hash}:`, error);
      // Still include with basic classification
      classified.push(createFallbackClassification(transfer, walletAddress, networkKey, networkConfig));
    }
  }

  return {
    transactions: classified,
    pageKey: outTransfers.pageKey || null,
    totalFetched: classified.length,
    networkKey,
  };
}

// ============================================================
// Classify a single AssetTransfer
// ============================================================

async function classifyAssetTransfer(
  transfer: AssetTransfersResult,
  userAddress: string,
  networkKey: string,
  networkConfig: NetworkConfig
): Promise<ClassifiedTransaction> {
  const alchemy = getAlchemyClient(networkKey);
  const userAddr = userAddress.toLowerCase();

  // Try to get receipt for deeper analysis
  let receipt: TransactionReceipt | null = null;
  let txData: TransactionResponse | null = null;
  try {
    [receipt, txData] = await Promise.all([
      alchemy.core.getTransactionReceipt(transfer.hash),
      alchemy.core.getTransaction(transfer.hash),
    ]);
  } catch {
    // If we can't get receipt, fall back to basic classification
  }

  // Determine value
  const rawValue = transfer.rawContract?.value || '0x0';
  const valueEth = transfer.value || 0;
  const decimals = transfer.rawContract?.decimal ? parseInt(transfer.rawContract.decimal) : 18;

  // Determine direction
  const fromAddr = (transfer.from || '').toLowerCase();
  const toAddr = (transfer.to || '').toLowerCase();
  const isFromUser = fromAddr === userAddr;
  const isToUser = toAddr === userAddr;

  // Use classifier if we have receipt and tx data
  if (receipt && txData) {
    const classified = classifyTransaction({
      tx: {
        hash: txData.hash,
        from: txData.from,
        to: txData.to ?? null,
        value: txData.value.toString(),
        data: txData.data,
        gasPrice: txData.gasPrice?.toString(),
      },
      receipt: {
        status: receipt.status ?? 1,
        gasUsed: Number(receipt.gasUsed),
        effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        logs: receipt.logs.map(log => ({
          address: log.address,
          topics: log.topics as string[],
          data: log.data,
        })),
      },
      assetTransfers: [{
        from: transfer.from || '',
        to: transfer.to || '',
        value: transfer.value || null,
        asset: transfer.asset || '',
        category: transfer.category || '',
      }],
      userAddress,
      network: networkKey,
      networkAr: networkConfig.nameAr,
    });

    // Enrich with data from asset transfer
    classified.timestamp = (transfer as any).metadata?.blockTimestamp
      ? new Date((transfer as any).metadata.blockTimestamp).getTime()
      : classified.timestamp;
    classified.date = (transfer as any).metadata?.blockTimestamp
      ? new Date((transfer as any).metadata.blockTimestamp).toISOString().split('T')[0]
      : classified.date;
    classified.blockNumber = typeof transfer.blockNum === 'string'
      ? parseInt(transfer.blockNum, 16)
      : classified.blockNumber;

    // Add token transfer info
    if (transfer.asset && transfer.asset !== networkConfig.nativeCurrency) {
      classified.tokenTransfers = [{
        tokenSymbol: transfer.asset || 'UNKNOWN',
        tokenName: transfer.asset || 'Unknown Token',
        tokenAddress: transfer.rawContract?.address || '',
        from: transfer.from || '',
        to: transfer.to || '',
        value: rawValue,
        decimals,
        valueFormatted: valueEth,
      }];
    }

    return classified;
  }

  // Fallback: classify from asset transfer data alone
  return createFallbackClassification(transfer, userAddress, networkKey, networkConfig);
}

// ============================================================
// Fallback Classification (when receipt is unavailable)
// ============================================================

function createFallbackClassification(
  transfer: AssetTransfersResult,
  userAddress: string,
  networkKey: string,
  networkConfig: NetworkConfig,
): ClassifiedTransaction {
  const userAddr = userAddress.toLowerCase();
  const fromAddr = (transfer.from || '').toLowerCase();
  const toAddr = (transfer.to || '').toLowerCase();
  const isFromUser = fromAddr === userAddr;
  const isToUser = toAddr === userAddr;

  const rawValue = transfer.rawContract?.value || '0x0';
  const valueEth = transfer.value || 0;
  const decimals = transfer.rawContract?.decimal ? parseInt(transfer.rawContract.decimal) : 18;

  // Basic classification from direction and category
  let type: ClassifiedTransaction['type'];
  let direction: ClassifiedTransaction['direction'];

  if (isFromUser && isToUser) {
    direction = 'self';
    type = 'income';
  } else if (isFromUser) {
    direction = 'out';
    type = 'expense';
  } else {
    direction = 'in';
    type = 'income';
  }

  // Check if ERC-20 token transfer
  const isTokenTransfer = transfer.category === AssetTransfersCategory.ERC20 ||
    transfer.category === AssetTransfersCategory.ERC721 ||
    transfer.category === AssetTransfersCategory.ERC1155;

  const tokenTransfers: TokenTransfer[] = [];
  if (isTokenTransfer && transfer.asset) {
    tokenTransfers.push({
      tokenSymbol: transfer.asset,
      tokenName: transfer.asset,
      tokenAddress: transfer.rawContract?.address || '',
      from: transfer.from || '',
      to: transfer.to || '',
      value: rawValue,
      decimals,
      valueFormatted: valueEth,
    });
  }

  const timestamp = (transfer as any).metadata?.blockTimestamp
    ? new Date((transfer as any).metadata.blockTimestamp).getTime()
    : Date.now();

  const date = (transfer as any).metadata?.blockTimestamp
    ? new Date((transfer as any).metadata.blockTimestamp).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  const blockNumber = typeof transfer.blockNum === 'string'
    ? parseInt(transfer.blockNum, 16)
    : 0;

  const TYPE_LABELS_AR: Record<string, string> = {
    income: 'إيراد',
    expense: 'مصروف',
    trade: 'تداول',
    defi: 'DeFi',
    staking: 'Staking Reward',
    gas: 'رسوم غاز',
    nft: 'NFT',
    bridge: 'جسر',
  };

  return {
    txHash: transfer.hash,
    blockNumber,
    timestamp,
    date,
    from: transfer.from || '',
    to: transfer.to || '',
    value: rawValue,
    valueEth,
    gasUsed: 0,
    gasPrice: '0',
    gasFeeEth: 0,
    status: true,
    type,
    typeAr: TYPE_LABELS_AR[type],
    methodId: null,
    methodName: null,
    protocol: null,
    protocolAr: null,
    network: networkKey,
    networkAr: networkConfig.nameAr,
    tokenTransfers,
    direction,
  };
}

// ============================================================
// Get Wallet Portfolio (token balances)
// ============================================================

export interface TokenBalance {
  symbol: string;
  name: string;
  balance: number;
  valueUsd: number;
  contractAddress: string;
  decimals: number;
  logo?: string;
  rawBalance?: string;
}

export async function getWalletBalances(
  walletAddress: string,
  networkKey: string = 'ethereum'
): Promise<TokenBalance[]> {
  if (!isAlchemyConfigured()) return [];

  const alchemy = getAlchemyClient(networkKey);

  try {
    const balances = await alchemy.core.getTokenBalances(walletAddress);

    const withRaw = balances.tokenBalances
      .filter(b => b.tokenBalance && b.tokenBalance !== '0x0' && b.tokenBalance !== '0x')
      .map(b => {
        let raw = BigInt(0);
        try {
          raw = BigInt(b.tokenBalance || '0x0');
        } catch {
          raw = BigInt(0);
        }
        return {
          contractAddress: b.contractAddress,
          raw,
          symbol: '',
          name: '',
          decimals: 18,
          balance: 0,
          valueUsd: 0,
          logo: undefined as string | undefined,
        };
      })
      .filter(b => b.raw > BigInt(0));

    // Enrich with metadata (bounded concurrency)
    const concurrency = 5;
    for (let i = 0; i < withRaw.length; i += concurrency) {
      const chunk = withRaw.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async tb => {
          try {
            const metadata = await alchemy.core.getTokenMetadata(tb.contractAddress);
            tb.symbol = metadata.symbol || 'UNKNOWN';
            tb.name = metadata.name || 'Unknown Token';
            tb.decimals = metadata.decimals ?? 18;
            tb.balance = Number(tb.raw) / Math.pow(10, tb.decimals);
            tb.logo = metadata.logo || undefined;
          } catch {
            tb.balance = Number(tb.raw) / Math.pow(10, tb.decimals);
          }
        }),
      );
    }

    return withRaw
      .filter(tb => Number.isFinite(tb.balance) && tb.balance > 0)
      .map(tb => ({
        symbol: tb.symbol || 'UNKNOWN',
        name: tb.name || '',
        balance: tb.balance,
        valueUsd: 0,
        contractAddress: tb.contractAddress,
        decimals: tb.decimals,
        logo: tb.logo,
        rawBalance: tb.raw.toString(),
      }));
  } catch (error) {
    console.error('Error fetching wallet balances:', error);
    return [];
  }
}

// ============================================================
// Get Native Balance (ETH/MATIC)
// ============================================================

export async function getNativeBalance(
  walletAddress: string,
  networkKey: string = 'ethereum'
): Promise<number> {
  if (!isAlchemyConfigured()) return 0;
  const alchemy = getAlchemyClient(networkKey);
  try {
    const balance = await alchemy.core.getBalance(walletAddress);
    return Number(balance) / 1e18;
  } catch {
    return 0;
  }
}

export async function getNativeBalanceWei(
  walletAddress: string,
  networkKey: string,
): Promise<bigint> {
  if (!isAlchemyConfigured()) return BigInt(0);
  const alchemy = getAlchemyClient(networkKey);
  try {
    const balance = await alchemy.core.getBalance(walletAddress);
    return BigInt(balance.toString());
  } catch {
    return BigInt(0);
  }
}

/**
 * Unpriced native + ERC-20 holdings for one chain (for ProviderManager + CoinGecko).
 * Uses raw JSON-RPC (more reliable than alchemy-sdk under parallel sync).
 */
export async function fetchAlchemyChainBalances(
  walletAddress: string,
  chainId: number,
): Promise<Omit<ChainTokenBalance, 'priceUsd' | 'valueUsd' | 'change24h'>[]> {
  const networkKey = chainIdToAlchemyNetworkKey(chainId);
  if (!networkKey || !isAlchemyConfigured()) return [];

  const networkConfig = NETWORKS[networkKey];
  const out: Omit<ChainTokenBalance, 'priceUsd' | 'valueUsd' | 'change24h'>[] = [];

  try {
    const [nativeHex, tokenBalResult] = await Promise.all([
      alchemyRpc<string>(networkKey, 'eth_getBalance', [walletAddress, 'latest']),
      alchemyRpc<{ tokenBalances: Array<{ contractAddress: string; tokenBalance: string | null }> }>(
        networkKey,
        'alchemy_getTokenBalances',
        [walletAddress, 'erc20'],
      ),
    ]);

    const nativeWei = BigInt(nativeHex || '0x0');
    if (nativeWei > BigInt(0)) {
      const balance = Number(nativeWei) / 1e18;
      out.push({
        symbol: networkConfig.nativeCurrency,
        name: networkConfig.name,
        address: NATIVE_TOKEN_ADDRESS,
        decimals: 18,
        balance,
        rawBalance: nativeWei.toString(),
        chain: networkKey,
        chainId,
        logoUrl: null,
        isSpam: false,
        isVerified: true,
        provider: 'alchemy',
      });
    }

    const nonZero = (tokenBalResult?.tokenBalances || [])
      .filter(b => b.tokenBalance && b.tokenBalance !== '0x' && b.tokenBalance !== '0x0')
      .map(b => {
        let raw = BigInt(0);
        try {
          raw = BigInt(b.tokenBalance || '0x0');
        } catch {
          raw = BigInt(0);
        }
        return { ...b, _raw: raw };
      })
      .filter(b => b._raw > BigInt(0))
      // Cap metadata lookups so sync stays within route timeout (spam-heavy chains like BSC).
      .sort((a, b) => (a._raw > b._raw ? -1 : a._raw < b._raw ? 1 : 0))
      .slice(0, 50);

    // Metadata in small batches
    for (let i = 0; i < nonZero.length; i += 5) {
      const chunk = nonZero.slice(i, i + 5);
      const metas = await Promise.all(
        chunk.map(async b => {
          const raw = b._raw;
          if (raw <= BigInt(0)) return null;
          try {
            const meta = await alchemyRpc<{
              symbol?: string;
              name?: string;
              decimals?: number | null;
              logo?: string | null;
            }>(networkKey, 'alchemy_getTokenMetadata', [b.contractAddress]);
            const decimals = meta?.decimals ?? 18;
            const balance = Number(raw) / Math.pow(10, decimals);
            if (!Number.isFinite(balance) || balance <= 0) return null;
            return {
              symbol: meta?.symbol || 'UNKNOWN',
              name: meta?.name || '',
              address: (b.contractAddress || '').toLowerCase(),
              decimals,
              balance,
              rawBalance: raw.toString(),
              chain: networkKey,
              chainId,
              logoUrl: meta?.logo || null,
              isSpam: false,
              isVerified: true,
              provider: 'alchemy' as const,
            };
          } catch {
            const balance = Number(raw) / 1e18;
            return {
              symbol: 'UNKNOWN',
              name: '',
              address: (b.contractAddress || '').toLowerCase(),
              decimals: 18,
              balance,
              rawBalance: raw.toString(),
              chain: networkKey,
              chainId,
              logoUrl: null,
              isSpam: false,
              isVerified: false,
              provider: 'alchemy' as const,
            };
          }
        }),
      );
      for (const m of metas) {
        if (m) out.push(m);
      }
    }
  } catch (error) {
    console.error(`[Alchemy] fetchAlchemyChainBalances failed for ${networkKey}:`, error);
  }

  return out;
}

/**
 * Fetch asset transfers via Alchemy JSON-RPC and normalize to WalletTransaction[].
 * Paginates up to maxPages for in+out to stay within sync route timeouts.
 */
export async function fetchAlchemyTransfersAsWalletTxs(
  walletAddress: string,
  chainId: number,
  options: {
    startBlock?: number;
    pageSize?: number;
    maxPages?: number;
  } = {},
): Promise<WalletTransaction[]> {
  const networkKeyRaw = chainIdToAlchemyNetworkKey(chainId);
  if (!networkKeyRaw || !isAlchemyConfigured()) return [];
  const networkKey: string = networkKeyRaw;

  const pageSize = options.pageSize ?? 100;
  const maxPages = options.maxPages ?? 5;

  let fromBlock: string;
  if (options.startBlock && options.startBlock > 0) {
    fromBlock = `0x${options.startBlock.toString(16)}`;
  } else {
    try {
      const blockHex = await alchemyRpc<string>(networkKey, 'eth_blockNumber', []);
      const currentBlock = parseInt(blockHex, 16);
      const lookback = Math.min(1_000_000, Math.max(0, currentBlock - 1));
      fromBlock = `0x${(currentBlock - lookback).toString(16)}`;
    } catch (err) {
      console.warn('[Alchemy] eth_blockNumber failed, using lookback fallback:', err);
      fromBlock = '0x7a120';
    }
  }

  type RpcTransfer = {
    hash: string;
    from: string;
    to: string | null;
    value: number | null;
    asset: string | null;
    category: string;
    blockNum: string;
    uniqueId?: string;
    rawContract?: { value?: string | null; address?: string | null; decimal?: string | null };
    metadata?: { blockTimestamp?: string };
  };

  const allTransfers: RpcTransfer[] = [];

  async function collect(direction: 'from' | 'to') {
    let pageKey: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const filter: Record<string, unknown> = {
        fromBlock,
        toBlock: 'latest',
        maxCount: `0x${Math.max(1, Number(pageSize) || 100).toString(16)}`,
        category: ['external', 'erc20'],
        order: 'desc',
        withMetadata: true,
        excludeZeroValue: false,
      };
      if (direction === 'from') filter.fromAddress = walletAddress;
      else filter.toAddress = walletAddress;
      if (pageKey) filter.pageKey = pageKey;

      try {
        const result = await alchemyRpc<{ transfers: RpcTransfer[]; pageKey?: string }>(
          networkKey,
          'alchemy_getAssetTransfers',
          [filter],
        );
        allTransfers.push(...(result?.transfers || []));
        if (!result?.pageKey) break;
        pageKey = result.pageKey;
      } catch (err) {
        console.warn(`[Alchemy] getAssetTransfers ${direction} failed:`, err);
        break;
      }
    }
  }

  await Promise.all([collect('from'), collect('to')]);

  const seen = new Set<string>();
  const unique: RpcTransfer[] = [];
  for (const t of allTransfers) {
    const key = `${t.hash}:${t.uniqueId || t.rawContract?.address || ''}:${t.from}:${t.to}:${t.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(t);
  }

  const byHash = new Map<string, RpcTransfer[]>();
  for (const t of unique) {
    const list = byHash.get(t.hash) || [];
    list.push(t);
    byHash.set(t.hash, list);
  }

  const userAddr = walletAddress.toLowerCase();
  const transactions: WalletTransaction[] = [];

  for (const [hash, transfers] of byHash) {
    const primary = transfers[0];
    const fromAddr = (primary.from || '').toLowerCase();
    const toAddr = (primary.to || '').toLowerCase();
    const isFromUser = fromAddr === userAddr;
    const isToUser = toAddr === userAddr;

    let direction: TransactionDirection = 'in';
    let type: TransactionType = 'income';
    if (isFromUser && isToUser) {
      direction = 'self';
      type = 'income';
    } else if (isFromUser) {
      direction = 'out';
      type = 'expense';
    }

    const tokenTransfers: ChainTokenTransfer[] = [];
    let nativeValueEth = 0;
    let nativeValueWei = '0';

    for (const t of transfers) {
      const isNative = t.category === 'external' || t.category === 'internal';
      const decimals = t.rawContract?.decimal
        ? parseInt(String(t.rawContract.decimal), 10)
        : 18;
      const valueFormatted = typeof t.value === 'number' ? t.value : 0;
      let raw = t.rawContract?.value || '0';
      if (typeof raw === 'string' && raw.startsWith('0x')) {
        try {
          raw = BigInt(raw).toString();
        } catch {
          raw = '0';
        }
      }

      if (isNative && !t.rawContract?.address) {
        nativeValueEth += valueFormatted;
        nativeValueWei = raw !== '0' ? String(raw) : nativeValueWei;
        continue;
      }

      if (t.category === 'erc20' || t.rawContract?.address) {
        tokenTransfers.push({
          tokenSymbol: t.asset || 'UNKNOWN',
          tokenName: t.asset || 'Unknown Token',
          tokenAddress: (t.rawContract?.address || '').toLowerCase(),
          from: t.from || '',
          to: t.to || '',
          value: String(raw),
          decimals: Number.isFinite(decimals) ? decimals : 18,
          valueFormatted,
          priceUsd: null,
          valueUsd: null,
        });
      }
    }

    const ts = primary.metadata?.blockTimestamp
      ? new Date(primary.metadata.blockTimestamp).getTime()
      : Date.now();
    const date = new Date(ts).toISOString().split('T')[0];
    const blockNumber =
      typeof primary.blockNum === 'string' ? parseInt(primary.blockNum, 16) : 0;

    transactions.push({
      hash,
      from: primary.from || '',
      to: primary.to || '',
      value: nativeValueWei,
      valueEth: nativeValueEth,
      gasFee: '0',
      gasFeeEth: 0,
      timestamp: ts > 1e12 ? Math.floor(ts / 1000) : ts,
      date,
      type,
      direction,
      status: 'confirmed',
      chain: networkKey,
      chainId,
      blockNumber,
      methodId: null,
      methodName: null,
      protocol: null,
      tokenTransfers,
      priceUsd: null,
      valueUsd: null,
      provider: 'alchemy',
    });
  }

  transactions.sort((a, b) => b.timestamp - a.timestamp);
  return transactions;
}
