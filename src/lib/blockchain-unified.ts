/**
 * Unified Blockchain Service for Radareum
 *
 * This is the BACKWARD-COMPATIBLE entry point that now delegates
 * to the Hybrid Provider Manager instead of the old 4-layer fallback.
 *
 * The old system: DeBank → Zerion → Alchemy → Covalent (sequential fallback)
 * The new system: Role-based hybrid routing with Supabase cache
 *
 * Existing code that calls `getBlockchainService()` will continue to work,
 * but now benefits from:
 *   - Smarter provider selection per data type
 *   - Supabase caching to reduce API costs
 *   - Real-time updates via Alchemy webhooks
 *   - Better error recovery with health tracking
 */

import { getProviderManager } from './blockchain/provider-manager';
import { getBlockchainCache } from './blockchain/cache';
import type {
  TokenBalance,
  DeFiPosition,
  WalletPortfolio,
  WalletTransaction,
  ProviderId,
} from './blockchain/types';

// Re-export types for backward compatibility
export type { TokenBalance, DeFiPosition, WalletPortfolio, WalletTransaction };

// Chain ID mapping (kept for backward compat)
const CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  optimism: 10,
  polygon: 137,
  avalanche: 43114,
  bsc: 56,
  fantom: 250,
};

class BlockchainUnifiedService {
  /**
   * Get full portfolio using the hybrid architecture
   *
   * Routing:
   *   Current balances → Zerion (primary) → DeBank (fallback)
   *   DeFi positions   → DeBank (primary) → Zerion (fallback)
   *   Cache            → Supabase (check first)
   */
  async getPortfolio(address: string): Promise<WalletPortfolio> {
    const manager = getProviderManager();
    return manager.getPortfolio(address);
  }

  /**
   * Get historical transactions using Covalent (primary)
   * Falls back to Alchemy if Covalent is unavailable
   */
  async getTransactions(
    address: string,
    chainId: number = 1,
    page: number = 0,
    pageSize: number = 50,
  ): Promise<{
    transactions: WalletTransaction[];
    provider: ProviderId;
  }> {
    const manager = getProviderManager();
    const { transactions, providers } = await manager.fetchHistoricalTransactions(
      address,
      chainId,
      page,
      pageSize,
    );
    return {
      transactions,
      provider: providers[0] || 'covalent',
    };
  }

  /**
   * Get DeFi positions using DeBank (primary)
   * Falls back to Zerion if DeBank is unavailable
   */
  async getDeFiPositions(address: string): Promise<{
    positions: DeFiPosition[];
    provider: ProviderId;
  }> {
    const manager = getProviderManager();
    const { positions, providers } = await manager.fetchDeFiPositions(address);
    return {
      positions,
      provider: providers[0] || 'debank',
    };
  }

  /**
   * Get current token balances using Zerion (primary)
   * Falls back to DeBank if Zerion is unavailable
   */
  async getTokenBalances(address: string): Promise<{
    tokens: TokenBalance[];
    provider: ProviderId;
  }> {
    const manager = getProviderManager();
    const { tokens, providers } = await manager.fetchCurrentBalances(address);
    return {
      tokens,
      provider: providers[0] || 'zerion',
    };
  }

  /**
   * Get provider health status
   */
  getProviderHealth() {
    const manager = getProviderManager();
    return manager.getAllProviderHealth();
  }

  /**
   * Invalidate cache for a specific address
   */
  async invalidateCache(address: string) {
    const cache = getBlockchainCache();
    await cache.invalidate(address);
  }
}

// Singleton instance
let instance: BlockchainUnifiedService | null = null;

export function getBlockchainService(): BlockchainUnifiedService {
  if (!instance) {
    instance = new BlockchainUnifiedService();
  }
  return instance;
}

export { BlockchainUnifiedService, CHAIN_IDS };
