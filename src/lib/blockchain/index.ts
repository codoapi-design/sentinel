/**
 * Hybrid Blockchain Data Architecture for Sentinel
 *
 * Main entry point that exports all public APIs.
 *
 * Architecture:
 *   ┌──────────────────────────────────────────────┐
 *   │              Frontend / API Routes           │
 *   └──────────────────┬───────────────────────────┘
 *                      │
 *   ┌──────────────────▼───────────────────────────┐
 *   │            Provider Manager                  │
 *   │  Routes requests to optimal provider         │
 *   │  based on data category                      │
 *   └────┬────────┬────────┬────────┬──────────────┘
 *        │        │        │        │
 *   ┌────▼──┐ ┌───▼───┐ ┌──▼───┐ ┌─▼─────┐
 *   │Covalent│ │Zerion │ │Alchemy│ │DeBank │
 *   │History │ │Balance│ │Real-  │ │DeFi   │
 *   │NFTs    │ │PnL    │ │time   │ │Detail │
 *   └────┬───┘ └───┬───┘ └──┬───┘ └─┬─────┘
 *        │         │        │       │
 *   ┌────▼─────────▼────────▼───────▼─────────────┐
 *   │           Supabase Cache Layer               │
 *   │  - Reduces API calls (cost savings)          │
 *   │  - Speeds up response times                  │
 *   │  - Enables offline resilience                │
 *   └──────────────────────────────────────────────┘
 *
 * Provider Roles:
 *   Covalent  → Full historical transactions, token balances, NFTs
 *   Zerion    → Current balances, DeFi positions, PnL data
 *   Alchemy   → Real-time transfers, webhook events, transaction classification
 *   DeBank    → Complex DeFi protocol details (Uniswap V3 positions, etc.)
 *   Supabase  → Internal cache & indexing for all fetched data
 */

// ── Types ──
export type {
  ProviderId,
  ProviderHealth,
  TokenBalance,
  DeFiPosition,
  DeFiPositionType,
  WalletTransaction,
  TransactionType,
  TransactionDirection,
  TransactionStatus,
  TokenTransfer,
  WalletPortfolio,
  ChainBreakdown,
  PnLData,
  NFTAsset,
  CacheDataType,
  CacheEntry,
  SyncResult,
  FullSyncResult,
  SyncStatus,
  DataCategory,
  ProviderRequest,
  AlchemyWebhookEvent,
  ProviderCostEntry,
  ProviderCostSummary,
} from './types';

export { CHAIN_IDS, CHAIN_NAMES } from './types';

// ── Provider Manager ──
export { ProviderManager, getProviderManager } from './provider-manager';

// ── Cache Layer ──
export { BlockchainCache, getBlockchainCache } from './cache';

// ── Sync Engine ──
export { SyncEngine, getSyncEngine } from './sync-engine';
