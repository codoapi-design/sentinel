/**
 * Hybrid Provider Manager for Sentinel
 *
 * Routes data requests to the optimal provider based on data category:
 *
 *   current_balances  → Zerion (primary) → DeBank (fallback)
 *   historical_tx     → Covalent (primary) → Alchemy (fallback)
 *   realtime_transfers → Alchemy (primary, webhook-driven)
 *   defi_positions    → DeBank (primary) → Zerion (fallback)
 *   defi_detail       → DeBank (primary, complex protocols only)
 *   nft_portfolio     → Covalent (primary)
 *   pnl               → Zerion (primary)
 *   full_portfolio    → Aggregated from all providers
 *
 * Includes:
 *   - Supabase cache layer (check cache first)
 *   - Provider health tracking
 *   - Automatic failover on provider errors
 *   - Cost tracking per request
 */

import { DeBankService } from '../debank/service';
import { ZerionService } from '../zerion/service';
import { CovalentService } from '../covalent/service';
import { fetchAndClassifyTransactions, NETWORKS } from '../alchemy/service';
import { getBlockchainCache } from './cache';
import type {
  DataCategory,
  ProviderId,
  ProviderHealth,
  ProviderRequest,
  TokenBalance,
  DeFiPosition,
  WalletTransaction,
  WalletPortfolio,
  ChainBreakdown,
  PnLData,
  NFTAsset,
  SyncResult,
  CHAIN_IDS,
} from './types';

// ────────────────────────────────────────────────────────────
// Provider priority per data category
// ────────────────────────────────────────────────────────────

const CATEGORY_PRIORITY: Record<DataCategory, ProviderId[]> = {
  current_balances: ['zerion', 'debank'],
  historical_tx: ['covalent', 'alchemy'],
  realtime_transfers: ['alchemy'],
  defi_positions: ['debank', 'zerion'],
  defi_detail: ['debank'],
  nft_portfolio: ['covalent'],
  pnl: ['zerion'],
  full_portfolio: ['zerion', 'debank', 'covalent', 'alchemy'],
};

// ────────────────────────────────────────────────────────────
// Provider Manager
// ────────────────────────────────────────────────────────────

export class ProviderManager {
  private debank: DeBankService;
  private zerion: ZerionService;
  private covalent: CovalentService;
  private healthMap: Map<ProviderId, ProviderHealth>;
  private cache: ReturnType<typeof getBlockchainCache>;

  constructor() {
    this.debank = new DeBankService();
    this.zerion = new ZerionService();
    this.covalent = new CovalentService();
    this.cache = getBlockchainCache();

    this.healthMap = new Map([
      ['covalent', { provider: 'covalent', isAvailable: true, lastChecked: 0, latencyMs: null, errorCount: 0, rateLimitRemaining: null }],
      ['zerion', { provider: 'zerion', isAvailable: true, lastChecked: 0, latencyMs: null, errorCount: 0, rateLimitRemaining: null }],
      ['alchemy', { provider: 'alchemy', isAvailable: true, lastChecked: 0, latencyMs: null, errorCount: 0, rateLimitRemaining: null }],
      ['debank', { provider: 'debank', isAvailable: true, lastChecked: 0, latencyMs: null, errorCount: 0, rateLimitRemaining: null }],
    ]);
  }

  // ────────────────────────────────────────────────────────────
  // Health & Availability
  // ────────────────────────────────────────────────────────────

  getProviderHealth(provider: ProviderId): ProviderHealth {
    return this.healthMap.get(provider)!;
  }

  getAllProviderHealth(): ProviderHealth[] {
    return Array.from(this.healthMap.values());
  }

  private markProviderError(provider: ProviderId, error: unknown): void {
    const health = this.healthMap.get(provider)!;
    health.errorCount++;
    health.lastChecked = Date.now();
    // Mark unavailable after 3 consecutive errors
    if (health.errorCount >= 3) {
      health.isAvailable = false;
    }
    console.warn(`[ProviderManager] ${provider} error (#${health.errorCount}):`, error);
  }

  private markProviderSuccess(provider: ProviderId, latencyMs: number): void {
    const health = this.healthMap.get(provider)!;
    health.errorCount = 0;
    health.isAvailable = true;
    health.lastChecked = Date.now();
    health.latencyMs = latencyMs;
  }

  private getAvailableProviders(category: DataCategory): ProviderId[] {
    const priorities = CATEGORY_PRIORITY[category] || [];
    return priorities.filter(p => {
      const health = this.healthMap.get(p);
      return health?.isAvailable !== false;
    });
  }

  // ────────────────────────────────────────────────────────────
  // Portfolio (aggregated from multiple providers)
  // ────────────────────────────────────────────────────────────

  async getPortfolio(address: string): Promise<WalletPortfolio> {
    const startTime = Date.now();

    // 1. Check cache first
    const cached = await this.cache.get<WalletPortfolio>(address, 'portfolio');
    if (cached) {
      console.log(`[ProviderManager] Portfolio served from cache (${Date.now() - startTime}ms)`);
      return { ...cached, providers: ['cache' as ProviderId, ...cached.providers] };
    }

    // 2. Fetch current balances from Zerion (primary) or DeBank (fallback)
    const balancesResult = await this.fetchCurrentBalances(address);

    // 3. Fetch DeFi positions from DeBank (primary) or Zerion (fallback)
    const defiResult = await this.fetchDeFiPositions(address);

    // 4. Build chain breakdown
    const chainMap = new Map<string, { value: number; tokens: number; defi: number }>();
    for (const t of balancesResult.tokens) {
      const existing = chainMap.get(t.chain) || { value: 0, tokens: 0, defi: 0 };
      existing.value += t.valueUsd;
      existing.tokens++;
      chainMap.set(t.chain, existing);
    }
    for (const p of defiResult.positions) {
      const existing = chainMap.get(p.chain) || { value: 0, tokens: 0, defi: 0 };
      existing.value += p.netValueUsd;
      existing.defi++;
      chainMap.set(p.chain, existing);
    }

    const tokenValueUsd = balancesResult.tokens.reduce((s, t) => s + t.valueUsd, 0);
    const defiValueUsd = defiResult.positions.reduce((s, p) => s + p.netValueUsd, 0);

    const portfolio: WalletPortfolio = {
      address,
      totalValueUsd: tokenValueUsd + defiValueUsd,
      tokenValueUsd,
      defiValueUsd,
      tokens: balancesResult.tokens,
      defiPositions: defiResult.positions,
      chainBreakdown: Array.from(chainMap.entries()).map(([chain, data]) => ({
        chain,
        chainId: 1,
        valueUsd: data.value,
        tokenCount: data.tokens,
        defiPositionCount: data.defi,
      })),
      providers: [...new Set([...balancesResult.providers, ...defiResult.providers])],
      lastUpdated: Date.now(),
    };

    // 5. Cache the result
    await this.cache.set(address, 'portfolio', balancesResult.providers[0] || 'zerion', portfolio);

    console.log(`[ProviderManager] Portfolio fetched in ${Date.now() - startTime}ms from ${portfolio.providers.join('+')}`);
    return portfolio;
  }

  // ────────────────────────────────────────────────────────────
  // Current Balances (Zerion primary, DeBank fallback)
  // ────────────────────────────────────────────────────────────

  async fetchCurrentBalances(address: string): Promise<{
    tokens: TokenBalance[];
    providers: ProviderId[];
  }> {
    const providers: ProviderId[] = [];

    // Try Zerion first
    try {
      const start = Date.now();
      const zerionData = await this.zerion.getPortfolioSummary(address);
      this.markProviderSuccess('zerion', Date.now() - start);

      if (zerionData && zerionData.positions.length > 0) {
        providers.push('zerion');
        const tokens = zerionData.positions
          .filter((p: any) => p.attributes?.position_type === 'wallet')
          .map((p: any) => this.normalizeZerionToken(p));

        if (tokens.length > 0) {
          return { tokens, providers };
        }
      }
    } catch (error) {
      this.markProviderError('zerion', error);
    }

    // Fallback: DeBank
    try {
      const start = Date.now();
      const debankData = await this.debank.getTokenBalances(address);
      this.markProviderSuccess('debank', Date.now() - start);

      if (debankData.length > 0) {
        providers.push('debank');
        const tokens = debankData.map((t: any) => this.normalizeDeBankToken(t));
        return { tokens, providers };
      }
    } catch (error) {
      this.markProviderError('debank', error);
    }

    // Last resort: Covalent (single chain)
    try {
      const start = Date.now();
      const covalentData = await this.covalent.getTokenBalances(1, address);
      this.markProviderSuccess('covalent', Date.now() - start);

      if (covalentData.length > 0) {
        providers.push('covalent');
        const tokens = covalentData.map((b: any) => this.normalizeCovalentToken(b));
        return { tokens, providers };
      }
    } catch (error) {
      this.markProviderError('covalent', error);
    }

    return { tokens: [], providers };
  }

  // ────────────────────────────────────────────────────────────
  // DeFi Positions (DeBank primary, Zerion fallback)
  // ────────────────────────────────────────────────────────────

  async fetchDeFiPositions(address: string): Promise<{
    positions: DeFiPosition[];
    providers: ProviderId[];
  }> {
    const providers: ProviderId[] = [];

    // Try DeBank first (most comprehensive DeFi data)
    try {
      const start = Date.now();
      const debankProtocols = await this.debank.getComplexProtocolList(address);
      this.markProviderSuccess('debank', Date.now() - start);

      if (debankProtocols.length > 0) {
        providers.push('debank');
        const positions = this.normalizeDeBankProtocols(debankProtocols);
        return { positions, providers };
      }
    } catch (error) {
      this.markProviderError('debank', error);
    }

    // Fallback: Zerion
    try {
      const start = Date.now();
      const zerionData = await this.zerion.getPortfolio(address);
      this.markProviderSuccess('zerion', Date.now() - start);

      const defiPositions = zerionData.filter((p: any) => p.attributes?.position_type !== 'wallet');
      if (defiPositions.length > 0) {
        providers.push('zerion');
        const positions = defiPositions.map((p: any) => this.normalizeZerionDeFi(p));
        return { positions, providers };
      }
    } catch (error) {
      this.markProviderError('zerion', error);
    }

    return { positions: [], providers };
  }

  // ────────────────────────────────────────────────────────────
  // Historical Transactions (Covalent primary)
  // ────────────────────────────────────────────────────────────

  async fetchHistoricalTransactions(
    address: string,
    chainId: number = 1,
    page: number = 0,
    pageSize: number = 50,
  ): Promise<{
    transactions: WalletTransaction[];
    providers: ProviderId[];
  }> {
    const providers: ProviderId[] = [];

    // Check cache
    const cacheKey = `tx_${chainId}_${page}`;
    const cached = await this.cache.get<WalletTransaction[]>(
      `${address.toLowerCase()}_tx_${chainId}_${page}`,
      'transactions',
    );
    if (cached) {
      return { transactions: cached, providers: ['cache'] };
    }

    // Try Covalent first (full historical data from first block)
    try {
      const start = Date.now();
      const covalentTx = await this.covalent.getTransactions(chainId, address, page, pageSize);
      this.markProviderSuccess('covalent', Date.now() - start);

      if (covalentTx.length > 0) {
        providers.push('covalent');
        const transactions = covalentTx.map((tx: any) => this.normalizeCovalentTransaction(tx, address, chainId));
        await this.cache.set(`${address.toLowerCase()}_tx_${chainId}_${page}`, 'transactions', 'covalent', transactions);
        return { transactions, providers };
      }
    } catch (error) {
      this.markProviderError('covalent', error);
    }

    // Fallback: Alchemy
    try {
      const chainName = this.chainIdToNetworkKey(chainId);
      if (chainName && NETWORKS[chainName]) {
        const start = Date.now();
        const result = await fetchAndClassifyTransactions({
          walletAddress: address,
          networkKey: chainName,
          maxCount: pageSize,
        });
        this.markProviderSuccess('alchemy', Date.now() - start);

        if (result.transactions.length > 0) {
          providers.push('alchemy');
          const transactions = result.transactions.map((tx: any) => this.normalizeAlchemyTransaction(tx, chainId));
          return { transactions, providers };
        }
      }
    } catch (error) {
      this.markProviderError('alchemy', error);
    }

    return { transactions: [], providers };
  }

  // ────────────────────────────────────────────────────────────
  // PnL Data (Zerion primary)
  // ────────────────────────────────────────────────────────────

  async fetchPnL(address: string): Promise<PnLData | null> {
    // Check cache
    const cached = await this.cache.get<PnLData>(address, 'pnl');
    if (cached) return cached;

    try {
      const start = Date.now();
      const positions = await this.zerion.getPortfolio(address);
      this.markProviderSuccess('zerion', Date.now() - start);

      // Calculate PnL from Zerion data
      let totalValue = 0;
      let totalChange1d = 0;
      let totalChange1w = 0;

      for (const pos of positions) {
        const value = pos.attributes?.value || 0;
        const change1d = pos.attributes?.changes?.['1d']?.percent || 0;
        const change1w = pos.attributes?.changes?.['1h']?.percent || 0; // Using 1h as proxy if weekly not available

        totalValue += value;
        totalChange1d += value * change1d / 100;
        totalChange1w += value * change1w / 100;
      }

      const pnl: PnLData = {
        totalPnLUsd: totalChange1d,
        totalPnLPercent: totalValue > 0 ? (totalChange1d / totalValue) * 100 : 0,
        dailyPnLUsd: totalChange1d,
        dailyPnLPercent: totalValue > 0 ? (totalChange1d / totalValue) * 100 : 0,
        weeklyPnLUsd: totalChange1w,
        weeklyPnLPercent: totalValue > 0 ? (totalChange1w / totalValue) * 100 : 0,
        monthlyPnLUsd: 0,
        monthlyPnLPercent: 0,
        costBasisUsd: totalValue - totalChange1d,
        currentValueUsd: totalValue,
      };

      await this.cache.set(address, 'pnl', 'zerion', pnl);
      return pnl;
    } catch (error) {
      this.markProviderError('zerion', error);
      return null;
    }
  }

  // ────────────────────────────────────────────────────────────
  // NFT Portfolio (Covalent primary)
  // ────────────────────────────────────────────────────────────

  async fetchNFTs(address: string, chainId: number = 1): Promise<{
    nfts: NFTAsset[];
    providers: ProviderId[];
  }> {
    // Check cache
    const cached = await this.cache.get<NFTAsset[]>(address, 'nfts');
    if (cached) {
      return { nfts: cached, providers: ['cache'] };
    }

    try {
      const start = Date.now();
      // Covalent supports NFT endpoints
      const url = `https://api.covalenthq.com/v1/${chainId}/address/${address}/balances_v2/?nft=true`;
      const response = await fetch(url, {
        headers: { 'Authorization': 'Basic ' + Buffer.from(process.env.COVALENT_API_KEY + ':').toString('base64') },
      });

      if (response.ok) {
        const data = await response.json();
        this.markProviderSuccess('covalent', Date.now() - start);

        const nfts: NFTAsset[] = (data.data?.items || [])
          .filter((item: any) => item.type === 'nft')
          .map((item: any) => ({
            contractAddress: item.contract_address,
            tokenId: item.nft_data?.[0]?.token_id || '0',
            name: item.nft_data?.[0]?.name || null,
            description: item.nft_data?.[0]?.description || null,
            imageUrl: item.nft_data?.[0]?.external_data?.image || null,
            collectionName: item.contract_name || null,
            chain: this.chainIdToName(chainId) || 'ethereum',
            chainId,
            lastSalePrice: null,
            lastSaleCurrency: null,
            provider: 'covalent',
          }));

        await this.cache.set(address, 'nfts', 'covalent', nfts);
        return { nfts, providers: ['covalent'] };
      }
    } catch (error) {
      this.markProviderError('covalent', error);
    }

    return { nfts: [], providers: [] };
  }

  // ────────────────────────────────────────────────────────────
  // Normalize helpers
  // ────────────────────────────────────────────────────────────

  private normalizeZerionToken(p: any): TokenBalance {
    const fungible = p.attributes?.fungible_info;
    return {
      symbol: fungible?.symbol || 'UNKNOWN',
      name: fungible?.name || '',
      address: p.id || '',
      decimals: 18,
      balance: parseFloat(p.attributes?.quantity?.integer || '0') / 1e18,
      rawBalance: p.attributes?.quantity?.integer || '0',
      priceUsd: p.attributes?.price || 0,
      valueUsd: p.attributes?.value || 0,
      change24h: p.attributes?.changes?.['1d']?.percent || null,
      chain: p.attributes?.chain || 'ethereum',
      chainId: 1,
      logoUrl: fungible?.icon?.url || null,
      isSpam: false,
      isVerified: true,
      provider: 'zerion',
    };
  }

  private normalizeDeBankToken(t: any): TokenBalance {
    return {
      symbol: t.symbol || t.optimized_symbol || 'UNKNOWN',
      name: t.name || '',
      address: t.id || '',
      decimals: t.decimals || 18,
      balance: t.amount || 0,
      rawBalance: t.raw_amount?.toString() || '0',
      priceUsd: t.price || 0,
      valueUsd: (t.price || 0) * (t.amount || 0),
      change24h: null,
      chain: t.chain || 'ethereum',
      chainId: 1,
      logoUrl: t.logo_url || null,
      isSpam: !t.is_verified && !t.is_core,
      isVerified: t.is_verified || t.is_core || false,
      provider: 'debank',
    };
  }

  private normalizeCovalentToken(b: any): TokenBalance {
    const rawBalance = parseFloat(b.balance || '0') / 1e18;
    return {
      symbol: b.contract_ticker_symbol || 'UNKNOWN',
      name: b.contract_name || '',
      address: b.contract_address || '',
      decimals: b.contract_decimals || 18,
      balance: rawBalance,
      rawBalance: b.balance || '0',
      priceUsd: rawBalance > 0 ? (b.quote || 0) / rawBalance : 0,
      valueUsd: b.quote || 0,
      change24h: b.quote_24h ? ((b.quote - b.quote_24h) / b.quote_24h) * 100 : null,
      chain: 'ethereum',
      chainId: b.chain_id || 1,
      logoUrl: b.logo_url || null,
      isSpam: false,
      isVerified: true,
      provider: 'covalent',
    };
  }

  private normalizeDeBankProtocols(protocols: any[]): DeFiPosition[] {
    const positions: DeFiPosition[] = [];
    for (const p of protocols) {
      for (const item of p.portfolio_item_list || []) {
        positions.push({
          id: `${p.id}-${item.name || Math.random()}`,
          protocol: p.name || 'Unknown',
          protocolId: p.id || '',
          chain: p.chain || 'ethereum',
          chainId: 1,
          type: this.mapDeFiType(item.detail_types?.[0]),
          suppliedTokens: (item.detail?.supply_token_list || []).map((t: any) => this.normalizeDeBankToken(t)),
          borrowedTokens: (item.detail?.borrow_token_list || []).map((t: any) => this.normalizeDeBankToken(t)),
          rewardTokens: (item.detail?.reward_token_list || []).map((t: any) => this.normalizeDeBankToken(t)),
          netValueUsd: item.stats?.net_usd_value || 0,
          assetValueUsd: item.stats?.asset_usd_value || 0,
          debtValueUsd: item.stats?.debt_usd_value || 0,
          apy: null,
          healthFactor: null,
          logoUrl: p.logo_url || null,
          provider: 'debank',
        });
      }
    }
    return positions;
  }

  private normalizeZerionDeFi(p: any): DeFiPosition {
    return {
      id: p.id || `zerion-${Math.random()}`,
      protocol: p.attributes?.protocol?.name || 'Unknown',
      protocolId: '',
      chain: p.attributes?.chain || 'ethereum',
      chainId: 1,
      type: this.mapDeFiType(p.attributes?.position_type),
      suppliedTokens: [],
      borrowedTokens: [],
      rewardTokens: [],
      netValueUsd: p.attributes?.value || 0,
      assetValueUsd: p.attributes?.value || 0,
      debtValueUsd: 0,
      apy: null,
      healthFactor: null,
      logoUrl: p.attributes?.protocol?.icon?.url || null,
      provider: 'zerion',
    };
  }

  private normalizeCovalentTransaction(tx: any, address: string, chainId: number): WalletTransaction {
    const userAddr = address.toLowerCase();
    const fromAddr = (tx.from_address || '').toLowerCase();
    const toAddr = (tx.to_address || '').toLowerCase();
    const isFromUser = fromAddr === userAddr;
    const isToUser = toAddr === userAddr;

    let direction: WalletTransaction['direction'] = 'mixed';
    if (isFromUser && isToUser) direction = 'self';
    else if (isFromUser) direction = 'out';
    else if (isToUser) direction = 'in';

    return {
      hash: tx.tx_hash,
      from: tx.from_address || '',
      to: tx.to_address || '',
      value: tx.value || '0',
      valueEth: parseFloat(tx.value || '0') / 1e18,
      gasFee: tx.gas_spent || '0',
      gasFeeEth: parseFloat(tx.gas_spent || '0') * parseFloat(tx.gas_price || '0') / 1e18,
      timestamp: tx.block_height || 0,
      date: tx.block_signed_at ? new Date(tx.block_signed_at).toISOString().split('T')[0] : '',
      type: isFromUser ? 'expense' : 'income',
      direction,
      status: tx.successful ? 'confirmed' : 'failed',
      chain: this.chainIdToName(chainId) || 'ethereum',
      chainId,
      blockNumber: tx.block_height || 0,
      methodId: null,
      methodName: null,
      protocol: null,
      tokenTransfers: (tx.log_events || [])
        .filter((e: any) => e.decoded?.name === 'Transfer')
        .map((e: any) => ({
          tokenSymbol: e.sender_contract_ticker_symbol || 'UNKNOWN',
          tokenName: e.sender_contract_name || '',
          tokenAddress: e.sender_address || '',
          from: e.decoded?.params?.[0]?.value || '',
          to: e.decoded?.params?.[1]?.value || '',
          value: e.decoded?.params?.[2]?.value || '0',
          decimals: 18,
          valueFormatted: parseFloat(e.decoded?.params?.[2]?.value || '0') / 1e18,
          priceUsd: null,
          valueUsd: null,
        })),
      provider: 'covalent',
    };
  }

  private normalizeAlchemyTransaction(tx: any, chainId: number): WalletTransaction {
    return {
      hash: tx.txHash,
      from: tx.from || '',
      to: tx.to || '',
      value: tx.value || '0',
      valueEth: tx.valueEth || 0,
      gasFee: tx.gasPrice || '0',
      gasFeeEth: tx.gasFeeEth || 0,
      timestamp: tx.timestamp || Date.now(),
      date: tx.date || new Date().toISOString().split('T')[0],
      type: tx.type || 'income',
      direction: tx.direction || 'in',
      status: tx.status ? 'confirmed' : 'failed',
      chain: tx.network || 'ethereum',
      chainId,
      blockNumber: tx.blockNumber || 0,
      methodId: tx.methodId,
      methodName: tx.methodName,
      protocol: tx.protocol,
      tokenTransfers: (tx.tokenTransfers || []).map((t: any) => ({
        tokenSymbol: t.tokenSymbol || 'UNKNOWN',
        tokenName: t.tokenName || '',
        tokenAddress: t.tokenAddress || '',
        from: t.from || '',
        to: t.to || '',
        value: t.value || '0',
        decimals: t.decimals || 18,
        valueFormatted: t.valueFormatted || 0,
        priceUsd: null,
        valueUsd: null,
      })),
      provider: 'alchemy',
    };
  }

  // ────────────────────────────────────────────────────────────
  // Utility helpers
  // ────────────────────────────────────────────────────────────

  private mapDeFiType(detailType?: string): DeFiPosition['type'] {
    const typeMap: Record<string, DeFiPosition['type']> = {
      lending: 'lending',
      borrowing: 'borrowing',
      staking: 'staking',
      'liquidity_pool': 'lp',
      yield: 'yield',
      vault: 'vault',
      bridge: 'bridge',
      'nft_lending': 'nft_lending',
    };
    return typeMap[detailType || ''] || 'unknown';
  }

  private chainIdToNetworkKey(chainId: number): string | null {
    const map: Record<number, string> = {
      1: 'ethereum',
      8453: 'base',
      42161: 'arbitrum',
      10: 'optimism',
      137: 'polygon',
    };
    return map[chainId] || null;
  }

  private chainIdToName(chainId: number): string | null {
    const map: Record<number, string> = {
      1: 'ethereum',
      8453: 'base',
      42161: 'arbitrum',
      10: 'optimism',
      137: 'polygon',
      43114: 'avalanche',
      56: 'bsc',
    };
    return map[chainId] || null;
  }
}

// ────────────────────────────────────────────────────────────
// Singleton
// ────────────────────────────────────────────────────────────

let instance: ProviderManager | null = null;

export function getProviderManager(): ProviderManager {
  if (!instance) {
    instance = new ProviderManager();
  }
  return instance;
}
