/**
 * Hybrid Blockchain Data Provider Types for Radareum
 *
 * Defines the shared types for the hybrid architecture:
 *   Covalent → Historical data (full transactions from first block)
 *   Zerion   → Current balances, DeFi positions, PnL
 *   Alchemy  → Real-time transfers, webhook events, RPC
 *   DeBank   → Complex DeFi protocol details
 *   Supabase → Internal cache & index layer
 */

// ────────────────────────────────────────────────────────────
// Chain IDs (canonical)
// ────────────────────────────────────────────────────────────

export const CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  optimism: 10,
  polygon: 137,
  avalanche: 43114,
  bsc: 56,
  fantom: 250,
  gnosis: 100,
  celo: 42220,
  linea: 59144,
  scroll: 534352,
  zksync: 324,
  mantle: 5000,
  blast: 81457,
  hyperliquid: 999,
  monad: 143,
  arc: 5042002,
  solana: 101,
  tron: 728126428,
  bitcoin: 0,
};

export const CHAIN_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(CHAIN_IDS).map(([name, id]) => [id, name])
);

// ────────────────────────────────────────────────────────────
// Provider identifiers
// ────────────────────────────────────────────────────────────

export type ProviderId = 'covalent' | 'zerion' | 'alchemy' | 'debank' | 'etherscan' | 'cache';

export interface ProviderHealth {
  provider: ProviderId;
  isAvailable: boolean;
  lastChecked: number;
  latencyMs: number | null;
  errorCount: number;
  rateLimitRemaining: number | null;
}

// ────────────────────────────────────────────────────────────
// Token & Balance types
// ────────────────────────────────────────────────────────────

export interface TokenBalance {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  balance: number;
  rawBalance: string;       // BigInt as string
  priceUsd: number;
  valueUsd: number;
  change24h: number | null;
  chain: string;
  chainId: number;
  logoUrl: string | null;
  isSpam: boolean;
  isVerified: boolean;
  provider: ProviderId;
}

// ────────────────────────────────────────────────────────────
// DeFi Position types
// ────────────────────────────────────────────────────────────

export type DeFiPositionType =
  | 'lending'
  | 'borrowing'
  | 'staking'
  | 'lp'
  | 'yield'
  | 'vault'
  | 'bridge'
  | 'nft_lending'
  | 'unknown';

export interface DeFiPosition {
  id: string;
  protocol: string;
  protocolId: string;
  chain: string;
  chainId: number;
  type: DeFiPositionType;
  suppliedTokens: TokenBalance[];
  borrowedTokens: TokenBalance[];
  rewardTokens: TokenBalance[];
  netValueUsd: number;
  assetValueUsd: number;
  debtValueUsd: number;
  apy: number | null;
  healthFactor: number | null;
  logoUrl: string | null;
  provider: ProviderId;
}

// ────────────────────────────────────────────────────────────
// Transaction types
// ────────────────────────────────────────────────────────────

export type TransactionType = 'income' | 'expense' | 'trade' | 'defi' | 'staking' | 'gas' | 'nft' | 'bridge';
export type TransactionDirection = 'in' | 'out' | 'self' | 'mixed';
export type TransactionStatus = 'confirmed' | 'pending' | 'failed';

export interface TokenTransfer {
  tokenSymbol: string;
  tokenName: string;
  tokenAddress: string;
  from: string;
  to: string;
  value: string;           // raw value as string
  decimals: number;
  valueFormatted: number;  // human-readable
  priceUsd: number | null;
  valueUsd: number | null;
}

export interface WalletTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;           // native value in wei
  valueEth: number;        // native value as number
  gasFee: string;          // total gas in wei
  gasFeeEth: number;
  /** Units of gas used (from receipt); 0 if unknown */
  gasUsed?: number;
  timestamp: number;
  date: string;
  type: TransactionType;
  direction: TransactionDirection;
  status: TransactionStatus;
  chain: string;
  chainId: number;
  blockNumber: number;
  methodId: string | null;
  methodName: string | null;
  protocol: string | null;
  tokenTransfers: TokenTransfer[];
  priceUsd?: number | null;
  valueUsd?: number | null;
  provider: ProviderId;
}

// ────────────────────────────────────────────────────────────
// Portfolio types
// ────────────────────────────────────────────────────────────

export interface ChainBreakdown {
  chain: string;
  chainId: number;
  valueUsd: number;
  tokenCount: number;
  defiPositionCount: number;
}

export interface WalletPortfolio {
  address: string;
  totalValueUsd: number;
  tokenValueUsd: number;
  defiValueUsd: number;
  tokens: TokenBalance[];
  defiPositions: DeFiPosition[];
  chainBreakdown: ChainBreakdown[];
  providers: ProviderId[];       // which providers contributed
  lastUpdated: number;
}

// ────────────────────────────────────────────────────────────
// PnL types
// ────────────────────────────────────────────────────────────

export interface PnLData {
  totalPnLUsd: number;
  totalPnLPercent: number;
  dailyPnLUsd: number;
  dailyPnLPercent: number;
  weeklyPnLUsd: number;
  weeklyPnLPercent: number;
  monthlyPnLUsd: number;
  monthlyPnLPercent: number;
  costBasisUsd: number;
  currentValueUsd: number;
}

// ────────────────────────────────────────────────────────────
// NFT types
// ────────────────────────────────────────────────────────────

export interface NFTAsset {
  contractAddress: string;
  tokenId: string;
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  collectionName: string | null;
  chain: string;
  chainId: number;
  lastSalePrice: number | null;
  lastSaleCurrency: string | null;
  provider: ProviderId;
}

// ────────────────────────────────────────────────────────────
// Cache entry types
// ────────────────────────────────────────────────────────────

export type CacheDataType = 'portfolio' | 'transactions' | 'defi' | 'nfts' | 'pnl' | 'full_sync' | 'solana_sync' | 'tron_sync' | 'bitcoin_sync';

export interface CacheEntry {
  walletAddress: string;
  dataType: CacheDataType;
  provider: ProviderId;
  data: unknown;
  fetchedAt: number;
  expiresAt: number;
  hitCount: number;
}

// ────────────────────────────────────────────────────────────
// Sync types
// ────────────────────────────────────────────────────────────

export type SyncStatus = 'idle' | 'syncing' | 'completed' | 'failed';

export interface SyncResult {
  success: boolean;
  provider: ProviderId;
  dataType: CacheDataType;
  recordsSynced: number;
  durationMs: number;
  errors: string[];
  fromCache: boolean;
}

export interface FullSyncResult {
  walletId: string;
  address: string;
  results: SyncResult[];
  totalRecordsSynced: number;
  totalDurationMs: number;
  overallSuccess: boolean;
  /** True when balances, DeFi, or transactions actually changed vs pre-sync snapshot. */
  changed?: boolean;
}

// ────────────────────────────────────────────────────────────
// Provider request routing
// ────────────────────────────────────────────────────────────

export type DataCategory =
  | 'current_balances'     // Zerion primary, DeBank fallback
  | 'historical_tx'        // Covalent primary
  | 'realtime_transfers'   // Alchemy primary
  | 'defi_positions'       // DeBank primary, Zerion fallback
  | 'defi_detail'          // DeBank primary (complex protocols)
  | 'nft_portfolio'        // Covalent primary
  | 'pnl'                  // Zerion primary
  | 'full_portfolio';      // Aggregated from multiple providers

export interface ProviderRequest {
  address: string;
  category: DataCategory;
  chainId?: number;
  options?: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────
// Alchemy Webhook types
// ────────────────────────────────────────────────────────────

export interface AlchemyWebhookEvent {
  webhookId: string;
  id: string;
  createdAt: string;
  type: string;
  event: {
    activity: Array<{
      fromAddress: string;
      toAddress: string;
      value: number;
      asset: string;
      category: string;
      blockNum: string;
      hash: string;
      rawContract?: {
        address: string | null;
        decimal: string | null;
        value: string | null;
      };
    }>;
    network: string;
  };
}

// ────────────────────────────────────────────────────────────
// Cost tracking
// ────────────────────────────────────────────────────────────

export interface ProviderCostEntry {
  provider: ProviderId;
  endpoint: string;
  timestamp: number;
  costUsd: number;
  recordsFetched: number;
}

export interface ProviderCostSummary {
  provider: ProviderId;
  totalCostUsd: number;
  totalRequests: number;
  totalRecordsFetched: number;
  period: 'daily' | 'weekly' | 'monthly';
}
