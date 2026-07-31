/**
 * Alchemy-first Provider Manager for Radareum
 *
 * Wallet balances + historical transfers → Alchemy only.
 * Spot pricing → Alchemy Prices (CoinGecko fills gaps via PricingService).
 * Historical tx USD → CoinGecko.
 *
 * UI is DB-first: sync writes to Supabase; display reads from the database.
 */

import {
  isAlchemyConfigured,
  isAlchemyChainSupported,
  isAlchemyNetworkForbidden,
  AlchemyNetworkForbiddenError,
  fetchAlchemyChainBalances,
  fetchAlchemyTransfersAsWalletTxs,
} from '../alchemy/service';
import { getPricingService } from '../pricing/service';
import { getBlockchainCache } from './cache';
import {
  ALCHEMY_CHAIN_ID_TO_KEY,
  FALLBACK_EVM_SYNC_CHAIN_IDS,
  resolveAlchemyEvmSyncChainIds,
} from '@/lib/alchemy/networks';
import {
  isLikelySpamToken,
  isTrustedToken,
  isTrustedTransaction,
  NATIVE_PLACEHOLDER,
} from '@/lib/finance/token-trust';
import type {
  DataCategory,
  ProviderId,
  ProviderHealth,
  TokenBalance,
  DeFiPosition,
  WalletTransaction,
  WalletPortfolio,
  PnLData,
  NFTAsset,
} from './types';

// ────────────────────────────────────────────────────────────
// Provider priority per data category
// ────────────────────────────────────────────────────────────

/**
 * Default EVM sync targets. Runtime sync prefers networks actually enabled
 * on the Alchemy API key (see resolveSyncChainIds).
 */
export const SYNC_CHAIN_IDS = FALLBACK_EVM_SYNC_CHAIN_IDS;

export async function resolveSyncChainIds(): Promise<number[]> {
  try {
    return await resolveAlchemyEvmSyncChainIds();
  } catch (err) {
    console.warn('[ProviderManager] Alchemy network discovery failed, using fallback:', err);
    return FALLBACK_EVM_SYNC_CHAIN_IDS;
  }
}

// Conventional placeholder address for a chain's native coin.
const NATIVE_TOKEN_ADDRESS = NATIVE_PLACEHOLDER;

const CATEGORY_PRIORITY: Record<DataCategory, ProviderId[]> = {
  current_balances: ['alchemy'],
  historical_tx: ['alchemy'],
  realtime_transfers: ['alchemy'],
  defi_positions: ['alchemy'],
  defi_detail: ['alchemy'],
  nft_portfolio: ['alchemy'],
  pnl: ['alchemy'],
  full_portfolio: ['alchemy'],
};

// ────────────────────────────────────────────────────────────
// Provider Manager
// ────────────────────────────────────────────────────────────

export class ProviderManager {
  private pricing: ReturnType<typeof getPricingService>;
  private healthMap: Map<ProviderId, ProviderHealth>;
  private cache: ReturnType<typeof getBlockchainCache>;
  private lastBalanceProviders: ProviderId[] = [];

  constructor() {
    this.pricing = getPricingService();
    this.cache = getBlockchainCache();

    this.healthMap = new Map([
      ['covalent', { provider: 'covalent', isAvailable: false, lastChecked: 0, latencyMs: null, errorCount: 0, rateLimitRemaining: null }],
      ['zerion', { provider: 'zerion', isAvailable: false, lastChecked: 0, latencyMs: null, errorCount: 0, rateLimitRemaining: null }],
      ['alchemy', { provider: 'alchemy', isAvailable: true, lastChecked: 0, latencyMs: null, errorCount: 0, rateLimitRemaining: null }],
      ['debank', { provider: 'debank', isAvailable: false, lastChecked: 0, latencyMs: null, errorCount: 0, rateLimitRemaining: null }],
      ['etherscan', { provider: 'etherscan', isAvailable: false, lastChecked: 0, latencyMs: null, errorCount: 0, rateLimitRemaining: null }],
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
    if (cached && Array.isArray(cached.tokens)) {
      console.log(`[ProviderManager] Portfolio served from cache (${Date.now() - startTime}ms)`);
      const cachedProviders = Array.isArray(cached.providers) ? cached.providers : [];
      return { ...cached, providers: ['cache' as ProviderId, ...cachedProviders] };
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
    await this.cache.set(address, 'portfolio', balancesResult.providers[0] || 'alchemy', portfolio);

    console.log(`[ProviderManager] Portfolio fetched in ${Date.now() - startTime}ms from ${portfolio.providers.join('+')}`);
    return portfolio;
  }

  // ────────────────────────────────────────────────────────────
  // Current Balances (Alchemy + Alchemy Prices / CoinGecko gaps)
  // ────────────────────────────────────────────────────────────

  /**
   * Fetch the wallet's current assets across ALL supported ETH-linked chains
   * via Alchemy, then price with Alchemy spot (CoinGecko fills gaps).
   */
  async fetchCurrentBalances(address: string): Promise<{
    tokens: TokenBalance[];
    providers: ProviderId[];
  }> {
    if (!isAlchemyConfigured()) {
      throw new Error(
        'ALCHEMY_API_KEY is not configured — balances cannot be fetched.',
      );
    }

    this.lastBalanceProviders = [];
    const start = Date.now();
    const chainIds = await resolveSyncChainIds();
    const results = await this.mapWithConcurrency(
      chainIds,
      4,
      chainId => this.fetchChainBalances(address, chainId),
    );

    const allTokens: TokenBalance[] = [];
    let anySuccess = false;
    for (const r of results) {
      if (r.status === 'fulfilled') {
        anySuccess = true;
        allTokens.push(...r.value);
      } else {
        this.markProviderError('alchemy', r.reason);
      }
    }
    if (anySuccess) {
      this.markProviderSuccess('alchemy', Date.now() - start);
    }

    allTokens.sort((a, b) => b.valueUsd - a.valueUsd);
    const providers = [
      ...new Set([
        ...this.lastBalanceProviders,
        ...allTokens.map(t => t.provider).filter((p): p is ProviderId => p !== 'cache'),
      ]),
    ];
    return { tokens: allTokens, providers: providers.length ? providers : ['alchemy'] };
  }

  /**
   * Run `task` over `items` with at most `limit` concurrent executions,
   * returning settled results in input order.
   */
  private async mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    task: (item: T) => Promise<R>,
  ): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = new Array(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        try {
          results[index] = { status: 'fulfilled', value: await task(items[index]) };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
        }
      }
    });
    await Promise.all(workers);
    return results;
  }

  /** Alchemy balances + spot pricing for one chain. */
  private async fetchChainBalances(address: string, chainId: number): Promise<TokenBalance[]> {
    return this.fetchAlchemyChainBalancesPriced(address, chainId);
  }

  /** Alchemy balances + Alchemy/CoinGecko spot pricing for one chain. */
  private async fetchAlchemyChainBalancesPriced(
    address: string,
    chainId: number,
  ): Promise<TokenBalance[]> {
    if (!isAlchemyConfigured() || !isAlchemyChainSupported(chainId)) {
      return [];
    }
    if (isAlchemyNetworkForbidden(chainId)) {
      console.warn(
        `[ProviderManager] Skipping Alchemy balances for chain ${chainId} — network not enabled on API key.`,
      );
      return [];
    }

    const start = Date.now();
    try {
      const raw = await fetchAlchemyChainBalances(address, chainId);
      const chainName = this.chainIdToName(chainId) || 'ethereum';

      const erc20Addrs = raw
        .filter(t => t.address !== NATIVE_TOKEN_ADDRESS)
        .filter(t => !isLikelySpamToken(t.symbol, t.name))
        .map(t => t.address);

      const [nativePrice, priceMap] = await Promise.all([
        this.pricing.getCurrentNativePriceUsd(chainId).catch(() => 0),
        this.pricing.getCurrentTokenPricesUsd(chainId, erc20Addrs),
      ]);

      const tokens: TokenBalance[] = [];
      for (const t of raw) {
        const spam = isLikelySpamToken(t.symbol, t.name);
        const isNative = t.address === NATIVE_TOKEN_ADDRESS;
        const priceUsd = spam
          ? 0
          : isNative
            ? nativePrice
            : priceMap.get(t.address.toLowerCase()) ?? 0;
        const valueUsd = t.balance * priceUsd;
        const row: TokenBalance = {
          ...t,
          chain: chainName,
          isSpam: spam,
          isVerified: !spam && (isNative || priceUsd > 0),
          priceUsd,
          valueUsd,
          change24h: null,
          provider: 'alchemy' as ProviderId,
        };
        // Persist only verified / market-priced non-spam assets.
        if (
          !isTrustedToken({
            symbol: row.symbol,
            name: row.name,
            address: row.address,
            chainId: row.chainId,
            network: row.chain,
            isSpam: row.isSpam,
            isVerified: row.isVerified,
            priceUsd: row.priceUsd,
            valueUsd: row.valueUsd,
          })
        ) {
          continue;
        }
        tokens.push(row);
      }

      this.markProviderSuccess('alchemy', Date.now() - start);
      if (!this.lastBalanceProviders.includes('alchemy')) {
        this.lastBalanceProviders.push('alchemy');
      }
      return tokens;
    } catch (error) {
      if (error instanceof AlchemyNetworkForbiddenError) {
        console.warn(`[ProviderManager] ${error.message}`);
        return [];
      }
      this.markProviderError('alchemy', error);
      console.warn(
        `[ProviderManager] Alchemy balances failed for chain ${chainId}:`,
        error instanceof Error ? error.message : error,
      );
      return [];
    }
  }

  private filterTrustedTransactions(transactions: WalletTransaction[]): WalletTransaction[] {
    return transactions.filter(tx => {
      const transfers = tx.tokenTransfers || [];
      if (transfers.length === 0) {
        return isTrustedTransaction({
          tokenAddress: null,
          tokenSymbol: null,
          valueEth: tx.valueEth,
          valueUsd: tx.valueUsd,
          priceUsd: tx.priceUsd,
          chainId: tx.chainId,
          network: tx.chain,
        });
      }
      // Keep tx only when at least one transfer leg is a trusted asset.
      const trustedLegs = transfers.filter(t =>
        isTrustedToken({
          symbol: t.tokenSymbol,
          name: t.tokenName,
          address: t.tokenAddress,
          chainId: tx.chainId,
          network: tx.chain,
          priceUsd: t.priceUsd,
          valueUsd: t.valueUsd,
        }),
      );
      if (trustedLegs.length === 0) return false;
      // Drop spam legs so classification/pricing use verified assets only.
      tx.tokenTransfers = trustedLegs;
      return true;
    });
  }

  private nativeSymbol(chainId: number): string {
    if (chainId === 137) return 'MATIC';
    if (chainId === 56) return 'BNB';
    if (chainId === 43114) return 'AVAX';
    if (chainId === 999) return 'HYPE';
    if (chainId === 143) return 'MON';
    if (chainId === 5042002) return 'USDC';
    return 'ETH';
  }

  private nativeName(chainId: number): string {
    if (chainId === 137) return 'Polygon';
    if (chainId === 56) return 'BNB';
    if (chainId === 43114) return 'Avalanche';
    if (chainId === 999) return 'HYPE';
    if (chainId === 143) return 'Monad';
    if (chainId === 5042002) return 'USDC';
    if (chainId === 59144) return 'Ethereum';
    return 'Ethereum';
  }

  // ────────────────────────────────────────────────────────────
  // DeFi Positions — disabled on sync critical path (Alchemy-only wallet sync)
  // ────────────────────────────────────────────────────────────

  async fetchDeFiPositions(_address: string): Promise<{
    positions: DeFiPosition[];
    providers: ProviderId[];
  }> {
    return { positions: [], providers: [] };
  }

  // ────────────────────────────────────────────────────────────
  // Historical Transactions (Alchemy Transfers API only)
  // ────────────────────────────────────────────────────────────

  /** Safety cap per chain — prevents infinite loops if a provider misbehaves. */
  private static readonly TX_HISTORY_MAX_PAGES = 10_000;

  async fetchHistoricalTransactions(
    address: string,
    chainId: number = 1,
    page: number = 0,
    pageSize: number = 50,
    startBlock: number = 0,
  ): Promise<{
    transactions: WalletTransaction[];
    providers: ProviderId[];
  }> {
    if (!isAlchemyConfigured()) {
      throw new Error(
        'ALCHEMY_API_KEY is not configured — transactions cannot be fetched.',
      );
    }

    const cacheKey = `${address.toLowerCase()}_tx_${chainId}_${page}_${startBlock}`;
    const cached = await this.cache.get<WalletTransaction[]>(cacheKey, 'transactions');
    if (cached) {
      return { transactions: cached, providers: ['cache'] };
    }

    return this.fetchAlchemyHistoricalTransactions(address, chainId, pageSize, startBlock, cacheKey);
  }

  /**
   * Fetch ALL historical transactions for one chain via Alchemy Transfers API.
   * Optional `onBatch` upserts each chunk immediately so large wallets need not
   * hold the full history in memory.
   */
  async fetchAllHistoricalTransactions(
    address: string,
    chainId: number = 1,
    options: {
      pageSize?: number;
      startBlock?: number;
      onBatch?: (
        transactions: WalletTransaction[],
        providers: ProviderId[],
      ) => Promise<void>;
    } = {},
  ): Promise<{
    totalFetched: number;
    providers: ProviderId[];
    maxBlock: number;
  }> {
    if (!isAlchemyConfigured()) {
      throw new Error(
        'ALCHEMY_API_KEY is not configured — transactions cannot be fetched.',
      );
    }

    const pageSize = options.pageSize ?? 100;
    const startBlock = options.startBlock ?? 0;
    const onBatch = options.onBatch;
    const providers: ProviderId[] = [];
    let totalFetched = 0;
    let maxBlock = 0;

    const emit = async (txs: WalletTransaction[], provider: ProviderId) => {
      if (txs.length === 0) return;
      if (!providers.includes(provider)) providers.push(provider);
      totalFetched += txs.length;
      for (const tx of txs) {
        if (tx.blockNumber > maxBlock) maxBlock = tx.blockNumber;
      }
      if (onBatch) await onBatch(txs, [provider]);
    };

    await this.fetchAllAlchemyHistoricalTransactions(address, chainId, pageSize, startBlock, emit);
    return { totalFetched, providers, maxBlock };
  }

  private async fetchAllAlchemyHistoricalTransactions(
    address: string,
    chainId: number,
    pageSize: number,
    startBlock: number,
    emit: (txs: WalletTransaction[], provider: ProviderId) => Promise<void>,
  ): Promise<void> {
    if (!isAlchemyConfigured() || !isAlchemyChainSupported(chainId)) return;
    if (isAlchemyNetworkForbidden(chainId)) {
      console.warn(
        `[ProviderManager] Skipping Alchemy full txs for chain ${chainId} — network not enabled on API key.`,
      );
      return;
    }

    try {
      const start = Date.now();
      let transactions = await fetchAlchemyTransfersAsWalletTxs(address, chainId, {
        startBlock: startBlock > 0 ? startBlock : undefined,
        pageSize: Math.min(pageSize, 1000),
        exhaustAll: true,
        maxPages: ProviderManager.TX_HISTORY_MAX_PAGES,
      });
      this.markProviderSuccess('alchemy', Date.now() - start);

      if (transactions.length === 0) return;

      transactions = await this.pricing.enrichTransactions(transactions);
      transactions = this.filterTrustedTransactions(transactions);
      if (transactions.length === 0) return;

      // Emit in pageSize chunks so callers can upsert without one giant batch
      const chunkSize = Math.max(1, pageSize);
      for (let i = 0; i < transactions.length; i += chunkSize) {
        await emit(transactions.slice(i, i + chunkSize), 'alchemy');
      }
    } catch (error) {
      if (error instanceof AlchemyNetworkForbiddenError) {
        console.warn(`[ProviderManager] ${error.message}`);
        return;
      }
      this.markProviderError('alchemy', error);
      console.warn(
        `[ProviderManager] Alchemy full tx fetch failed for chain ${chainId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  private async fetchAlchemyHistoricalTransactions(
    address: string,
    chainId: number,
    pageSize: number,
    startBlock: number,
    cacheKey: string,
  ): Promise<{
    transactions: WalletTransaction[];
    providers: ProviderId[];
  }> {
    if (!isAlchemyConfigured() || !isAlchemyChainSupported(chainId)) {
      return { transactions: [], providers: [] };
    }
    if (isAlchemyNetworkForbidden(chainId)) {
      console.warn(
        `[ProviderManager] Skipping Alchemy txs for chain ${chainId} — network not enabled on API key.`,
      );
      return { transactions: [], providers: [] };
    }

    try {
      const start = Date.now();
      // Single-page / light UI fetch — keep lookback + page caps. Full history uses
      // fetchAllHistoricalTransactions → exhaustAll.
      let transactions = await fetchAlchemyTransfersAsWalletTxs(address, chainId, {
        startBlock: startBlock > 0 ? startBlock : undefined,
        pageSize: Math.min(pageSize, 1000),
        maxPages: startBlock > 0 ? 2 : 5,
      });
      this.markProviderSuccess('alchemy', Date.now() - start);

      if (transactions.length === 0) {
        return { transactions: [], providers: [] };
      }

      transactions = await this.pricing.enrichTransactions(transactions);
      transactions = this.filterTrustedTransactions(transactions);
      if (transactions.length === 0) {
        return { transactions: [], providers: [] };
      }
      await this.cache.set(cacheKey, 'transactions', 'alchemy', transactions);
      return { transactions, providers: ['alchemy'] };
    } catch (error) {
      if (error instanceof AlchemyNetworkForbiddenError) {
        console.warn(`[ProviderManager] ${error.message}`);
        return { transactions: [], providers: [] };
      }
      this.markProviderError('alchemy', error);
      console.warn(
        `[ProviderManager] Alchemy tx fetch failed for chain ${chainId}:`,
        error instanceof Error ? error.message : error,
      );
      return { transactions: [], providers: [] };
    }
  }

  // ────────────────────────────────────────────────────────────
  // PnL Data (Zerion primary)
  // ────────────────────────────────────────────────────────────

  async fetchPnL(_address: string): Promise<PnLData | null> {
    return null;
  }

  // ────────────────────────────────────────────────────────────
  // NFT Portfolio — not on Alchemy wallet sync critical path
  // ────────────────────────────────────────────────────────────

  async fetchNFTs(_address: string, _chainId: number = 1): Promise<{
    nfts: NFTAsset[];
    providers: ProviderId[];
  }> {
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

  private chainIdToName(chainId: number): string | null {
    return ALCHEMY_CHAIN_ID_TO_KEY[chainId] ?? null;
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
