/**
 * Unified Blockchain Service for Sentinel
 * Fallback chain: DeBank → Zerion → Alchemy → Covalent
 * Aggregates data from multiple providers with automatic fallback
 */

import { DeBankService } from './debank/service';
import { ZerionService } from './zerion/service';
import { getWalletBalances, getNativeBalance } from './alchemy/service';
import { CovalentService } from './covalent/service';

// Common chain ID mapping
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

export interface TokenBalance {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  balance: number;
  priceUsd: number;
  valueUsd: number;
  chain: string;
  logoUrl: string | null;
  isSpam?: boolean;
}

export interface DeFiPosition {
  protocol: string;
  chain: string;
  type: string; // lending, borrowing, staking, lp, yield
  suppliedTokens: TokenBalance[];
  borrowedTokens: TokenBalance[];
  rewardTokens: TokenBalance[];
  netValueUsd: number;
  assetValueUsd: number;
  debtValueUsd: number;
  apy: number | null;
  healthFactor: number | null;
  logoUrl: string | null;
}

export interface WalletPortfolio {
  totalValueUsd: number;
  tokenValueUsd: number;
  defiValueUsd: number;
  tokens: TokenBalance[];
  defiPositions: DeFiPosition[];
  chainBreakdown: { chain: string; value: number }[];
  provider: string;
}

export interface WalletTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  gasFee: string;
  timestamp: string;
  type: string;
  chain: string;
  blockNumber: number;
  status: string;
  method?: string;
  protocol?: string;
  tokenTransfers?: Array<{
    symbol: string;
    name: string;
    address: string;
    amount: number;
    direction: string;
  }>;
}

class BlockchainUnifiedService {
  private debank: DeBankService;
  private zerion: ZerionService;
  private covalent: CovalentService;

  constructor() {
    this.debank = new DeBankService();
    this.zerion = new ZerionService();
    this.covalent = new CovalentService();
  }

  /**
   * Get full portfolio with fallback chain
   */
  async getPortfolio(address: string): Promise<WalletPortfolio> {
    // Try DeBank first (most comprehensive for DeFi)
    try {
      const debankData = await this.debank.getPortfolioSummary(address);
      if (debankData && debankData.totalValue > 0) {
        return {
          totalValueUsd: debankData.totalValue,
          tokenValueUsd: debankData.totalTokenValue,
          defiValueUsd: debankData.totalDefiValue,
          tokens: this.normalizeDeBankTokens(debankData.tokens),
          defiPositions: this.normalizeDeBankProtocols(debankData.protocols),
          chainBreakdown: debankData.chainList.map(c => ({ chain: c.name, value: c.usd_value })),
          provider: 'debank',
        };
      }
    } catch (error) {
      console.warn('[Unified] DeBank failed, trying Zerion:', error);
    }

    // Try Zerion second
    try {
      const zerionData = await this.zerion.getPortfolioSummary(address);
      if (zerionData && zerionData.totalValue > 0) {
        return {
          totalValueUsd: zerionData.totalValue,
          tokenValueUsd: zerionData.tokenCount > 0 ? zerionData.totalValue * 0.7 : zerionData.totalValue,
          defiValueUsd: zerionData.defiPositionCount > 0 ? zerionData.totalValue * 0.3 : 0,
          tokens: this.normalizeZerionPositions(zerionData.positions, 'wallet'),
          defiPositions: this.normalizeZerionPositions(zerionData.positions, 'defi'),
          chainBreakdown: [],
          provider: 'zerion',
        };
      }
    } catch (error) {
      console.warn('[Unified] Zerion failed, trying Alchemy:', error);
    }

    // Try Alchemy third
    try {
      const [alchemyTokens, nativeBalance] = await Promise.all([
        getWalletBalances(address, 'ethereum'),
        getNativeBalance(address, 'ethereum'),
      ]);

      if (alchemyTokens.length > 0 || nativeBalance > 0) {
        const normalizedTokens = this.normalizeAlchemyTokens(alchemyTokens, nativeBalance);
        const totalValue = normalizedTokens.reduce((sum, t) => sum + t.valueUsd, 0);

        return {
          totalValueUsd: totalValue,
          tokenValueUsd: totalValue,
          defiValueUsd: 0,
          tokens: normalizedTokens,
          defiPositions: [],
          chainBreakdown: [],
          provider: 'alchemy',
        };
      }
    } catch (error) {
      console.warn('[Unified] Alchemy failed, trying Covalent:', error);
    }

    // Try Covalent as last resort
    try {
      const covalentData = await this.covalent.getPortfolioSummary(CHAIN_IDS.ethereum, address);
      if (covalentData && covalentData.totalValue > 0) {
        return {
          totalValueUsd: covalentData.totalValue,
          tokenValueUsd: covalentData.totalValue,
          defiValueUsd: 0,
          tokens: this.normalizeCovalentBalances(covalentData.balances),
          defiPositions: [],
          chainBreakdown: [],
          provider: 'covalent',
        };
      }
    } catch (error) {
      console.warn('[Unified] All providers failed:', error);
    }

    // Return empty portfolio if all fail
    return {
      totalValueUsd: 0,
      tokenValueUsd: 0,
      defiValueUsd: 0,
      tokens: [],
      defiPositions: [],
      chainBreakdown: [],
      provider: 'none',
    };
  }

  // Normalization helpers
  private normalizeDeBankTokens(tokens: unknown[]): TokenBalance[] {
    return tokens.map((t: any) => ({
      symbol: t.symbol || t.optimized_symbol || 'UNKNOWN',
      name: t.name || '',
      address: t.id || '',
      decimals: t.decimals || 18,
      balance: t.amount || 0,
      priceUsd: t.price || 0,
      valueUsd: (t.price || 0) * (t.amount || 0),
      chain: t.chain || 'ethereum',
      logoUrl: t.logo_url || null,
    }));
  }

  private normalizeDeBankProtocols(protocols: unknown[]): DeFiPosition[] {
    const positions: DeFiPosition[] = [];
    for (const p of protocols as any[]) {
      for (const item of p.portfolio_item_list || []) {
        positions.push({
          protocol: p.name || 'Unknown',
          chain: p.chain || 'ethereum',
          type: item.detail_types?.[0] || 'unknown',
          suppliedTokens: (item.detail?.supply_token_list || []).map(this.normalizeDeBankTokenItem),
          borrowedTokens: (item.detail?.borrow_token_list || []).map(this.normalizeDeBankTokenItem),
          rewardTokens: (item.detail?.reward_token_list || []).map(this.normalizeDeBankTokenItem),
          netValueUsd: item.stats?.net_usd_value || 0,
          assetValueUsd: item.stats?.asset_usd_value || 0,
          debtValueUsd: item.stats?.debt_usd_value || 0,
          apy: null,
          healthFactor: null,
          logoUrl: p.logo_url || null,
        });
      }
    }
    return positions;
  }

  private normalizeDeBankTokenItem = (t: any): TokenBalance => ({
    symbol: t.symbol || 'UNKNOWN',
    name: t.name || '',
    address: t.id || '',
    decimals: t.decimals || 18,
    balance: t.amount || 0,
    priceUsd: t.price || 0,
    valueUsd: (t.price || 0) * (t.amount || 0),
    chain: t.chain || 'ethereum',
    logoUrl: t.logo_url || null,
  });

  private normalizeZerionPositions(positions: any[], filter: string): any[] {
    if (filter === 'wallet') {
      return positions
        .filter(p => p.attributes?.position_type === 'wallet')
        .map(p => ({
          symbol: p.attributes?.fungible_info?.symbol || 'UNKNOWN',
          name: p.attributes?.fungible_info?.name || '',
          address: p.id || '',
          decimals: 18,
          balance: parseFloat(p.attributes?.quantity?.integer || '0') / 1e18,
          priceUsd: p.attributes?.price || 0,
          valueUsd: p.attributes?.value || 0,
          chain: p.attributes?.chain || 'ethereum',
          logoUrl: p.attributes?.fungible_info?.icon?.url || null,
        }));
    }
    return positions
      .filter(p => p.attributes?.position_type !== 'wallet')
      .map(p => ({
        protocol: p.attributes?.protocol?.name || 'Unknown',
        chain: p.attributes?.chain || 'ethereum',
        type: p.attributes?.position_type || 'unknown',
        suppliedTokens: [],
        borrowedTokens: [],
        rewardTokens: [],
        netValueUsd: p.attributes?.value || 0,
        assetValueUsd: p.attributes?.value || 0,
        debtValueUsd: 0,
        apy: null,
        healthFactor: null,
        logoUrl: p.attributes?.protocol?.icon?.url || null,
      }));
  }

  private normalizeAlchemyTokens(tokens: any[], nativeBalance: number): TokenBalance[] {
    const result: TokenBalance[] = [];

    // Add native ETH if present
    if (nativeBalance > 0) {
      result.push({
        symbol: 'ETH',
        name: 'Ethereum',
        address: '',
        decimals: 18,
        balance: nativeBalance,
        priceUsd: 0,
        valueUsd: 0,
        chain: 'ethereum',
        logoUrl: null,
      });
    }

    // Add ERC-20 tokens
    for (const t of tokens) {
      result.push({
        symbol: t.symbol || 'UNKNOWN',
        name: t.name || '',
        address: t.contractAddress || '',
        decimals: t.decimals || 18,
        balance: t.balance || 0,
        priceUsd: 0,
        valueUsd: t.valueUsd || 0,
        chain: 'ethereum',
        logoUrl: t.logo || null,
      });
    }

    return result;
  }

  private normalizeCovalentBalances(balances: any[]): TokenBalance[] {
    return balances.map(b => {
      const rawBalance = parseFloat(b.balance || '0') / 1e18;
      return {
        symbol: b.contract_ticker_symbol || 'UNKNOWN',
        name: b.contract_name || '',
        address: b.contract_address || '',
        decimals: 18,
        balance: rawBalance,
        priceUsd: rawBalance > 0 ? (b.quote || 0) / rawBalance : 0,
        valueUsd: b.quote || 0,
        chain: 'ethereum',
        logoUrl: b.logo_url || null,
      };
    });
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

export { BlockchainUnifiedService };
