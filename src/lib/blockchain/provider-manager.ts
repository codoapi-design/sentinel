/**
 * Hybrid Provider Manager for Sentinel
 *
 * Routes data requests to the optimal provider based on data category:
 *
 *   current_balances  → Etherscan V2 (primary) → Alchemy (chains not on Etherscan plan)
 *   historical_tx     → Etherscan V2 (primary) → Alchemy (fallback)
 *   realtime_transfers → Alchemy (webhook-driven)
 *   defi_positions    → DeBank (primary) → Zerion (fallback)
 *   Pricing           → CoinGecko only
 *
 * UI is DB-first: sync writes to Supabase; display reads from the database.
 */

import { DeBankService } from '../debank/service';
import { ZerionService } from '../zerion/service';
import { CovalentService } from '../covalent/service';
import { getEtherscanService, EtherscanService } from '../etherscan/service';
import type { EtherscanTokenHolding } from '../etherscan/service';
import {
  isAlchemyConfigured,
  isAlchemyChainSupported,
  isAlchemyNetworkForbidden,
  AlchemyNetworkForbiddenError,
  fetchAlchemyChainBalances,
  fetchAlchemyTransfersAsWalletTxs,
} from '../alchemy/service';
import { getPricingService } from '../pricing/service';
import { classifySyncedTransaction } from '@/lib/finance/classify';
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

/** Chains scanned for multichain balances + txs (Etherscan and/or Alchemy). */
export const SYNC_CHAIN_IDS = [
  1, 8453, 42161, 10, 137, 56, 59144, 999, 143, 5042002,
]; // ETH, Base, Arb, OP, Polygon, BSC, Linea, HyperEVM, Monad, Arc
// Conventional placeholder address for a chain's native coin.
const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

const CATEGORY_PRIORITY: Record<DataCategory, ProviderId[]> = {
  current_balances: ['etherscan', 'alchemy'],
  historical_tx: ['etherscan', 'alchemy'],
  realtime_transfers: ['alchemy'],
  defi_positions: ['debank', 'zerion'],
  defi_detail: ['debank'],
  nft_portfolio: ['covalent'],
  pnl: ['zerion'],
  full_portfolio: ['etherscan', 'alchemy'],
};

// ────────────────────────────────────────────────────────────
// Provider Manager
// ────────────────────────────────────────────────────────────

export class ProviderManager {
  private debank: DeBankService;
  private zerion: ZerionService;
  private covalent: CovalentService;
  private etherscan: ReturnType<typeof getEtherscanService>;
  private pricing: ReturnType<typeof getPricingService>;
  private healthMap: Map<ProviderId, ProviderHealth>;
  private cache: ReturnType<typeof getBlockchainCache>;
  // Whether the Etherscan `addresstokenbalance` (PRO) endpoint is usable for the
  // current key. null = unknown, true = available, false = fall back to transfers.
  private tokenHoldingApiAvailable: boolean | null = null;
  // Chains the current Etherscan API plan cannot access (e.g. Base/Optimism on Free).
  // Learned at runtime; Alchemy is used as the complementary source for these.
  private etherscanUnsupportedChains = new Set<number>();
  // Providers that contributed to the last balance fetch (etherscan and/or alchemy).
  private lastBalanceProviders: ProviderId[] = [];

  constructor() {
    this.debank = new DeBankService();
    this.zerion = new ZerionService();
    this.covalent = new CovalentService();
    this.etherscan = getEtherscanService();
    this.pricing = getPricingService();
    this.cache = getBlockchainCache();

    this.healthMap = new Map([
      ['covalent', { provider: 'covalent', isAvailable: true, lastChecked: 0, latencyMs: null, errorCount: 0, rateLimitRemaining: null }],
      ['zerion', { provider: 'zerion', isAvailable: true, lastChecked: 0, latencyMs: null, errorCount: 0, rateLimitRemaining: null }],
      ['alchemy', { provider: 'alchemy', isAvailable: true, lastChecked: 0, latencyMs: null, errorCount: 0, rateLimitRemaining: null }],
      ['debank', { provider: 'debank', isAvailable: true, lastChecked: 0, latencyMs: null, errorCount: 0, rateLimitRemaining: null }],
      ['etherscan', { provider: 'etherscan', isAvailable: true, lastChecked: 0, latencyMs: null, errorCount: 0, rateLimitRemaining: null }],
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
    await this.cache.set(address, 'portfolio', balancesResult.providers[0] || 'zerion', portfolio);

    console.log(`[ProviderManager] Portfolio fetched in ${Date.now() - startTime}ms from ${portfolio.providers.join('+')}`);
    return portfolio;
  }

  // ────────────────────────────────────────────────────────────
  // Current Balances (Etherscan V2 + Alchemy complementary, CoinGecko pricing)
  // ────────────────────────────────────────────────────────────

  /**
   * Fetch the wallet's current assets across ALL supported ETH-linked chains.
   * Per chain: Etherscan first; if the plan doesn't cover that chain (e.g. Base
   * on Free), fall back to Alchemy. USD prices come from CoinGecko.
   */
  async fetchCurrentBalances(address: string): Promise<{
    tokens: TokenBalance[];
    providers: ProviderId[];
  }> {
    if (!this.etherscan.isConfigured() && !isAlchemyConfigured()) {
      throw new Error(
        'Neither ETHERSCAN_API_KEY nor ALCHEMY_API_KEY is configured — balances cannot be fetched.',
      );
    }

    this.lastBalanceProviders = [];
    const start = Date.now();
    const results = await this.mapWithConcurrency(
      SYNC_CHAIN_IDS,
      2,
      chainId => this.fetchChainBalances(address, chainId),
    );

    const allTokens: TokenBalance[] = [];
    let anySuccess = false;
    for (const r of results) {
      if (r.status === 'fulfilled') {
        anySuccess = true;
        allTokens.push(...r.value);
      } else {
        this.markProviderError('etherscan', r.reason);
      }
    }
    if (anySuccess) {
      const primary = this.lastBalanceProviders[0] || allTokens[0]?.provider || 'etherscan';
      this.markProviderSuccess(primary, Date.now() - start);
    }

    // Highest value first
    allTokens.sort((a, b) => b.valueUsd - a.valueUsd);
    const providers = [
      ...new Set([
        ...this.lastBalanceProviders,
        ...allTokens.map(t => t.provider).filter((p): p is ProviderId => p !== 'cache'),
      ]),
    ];
    return { tokens: allTokens, providers };
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

  /**
   * Compute all balances for a single chain (native + ERC-20) and price them.
   *
   * Etherscan first (addresstokenbalance or transfer-derivation). When Etherscan
   * rejects the chain (Free tier), fall through to Alchemy if configured.
   */
  private async fetchChainBalances(address: string, chainId: number): Promise<TokenBalance[]> {
    // Known Etherscan-unsupported → go straight to Alchemy (no wasted call)
    if (this.etherscanUnsupportedChains.has(chainId)) {
      return this.fetchAlchemyChainBalancesPriced(address, chainId);
    }

    if (this.etherscan.isConfigured()) {
      try {
        const tokens = await this.fetchEtherscanChainBalances(address, chainId);
        if (!this.lastBalanceProviders.includes('etherscan')) {
          this.lastBalanceProviders.push('etherscan');
        }
        return tokens;
      } catch (error) {
        if (EtherscanService.isChainUnsupported(error)) {
          this.etherscanUnsupportedChains.add(chainId);
          console.warn(
            `[ProviderManager] Chain ${chainId} (${this.chainIdToName(chainId) || 'unknown'}) not on Etherscan plan — trying Alchemy.`,
          );
          return this.fetchAlchemyChainBalancesPriced(address, chainId);
        }
        // Other Etherscan errors: still try Alchemy for this chain if available
        if (isAlchemyConfigured() && isAlchemyChainSupported(chainId)) {
          console.warn(
            `[ProviderManager] Etherscan failed for chain ${chainId}, falling back to Alchemy:`,
            error instanceof Error ? error.message : error,
          );
          return this.fetchAlchemyChainBalancesPriced(address, chainId);
        }
        throw error;
      }
    }

    return this.fetchAlchemyChainBalancesPriced(address, chainId);
  }

  private async fetchEtherscanChainBalances(address: string, chainId: number): Promise<TokenBalance[]> {
    const chainName = this.chainIdToName(chainId) || 'ethereum';
    const tokens: TokenBalance[] = [];

    const holdingsPromise =
      this.tokenHoldingApiAvailable === false
        ? Promise.resolve(null)
        : this.etherscan.getAddressTokenBalances(address, chainId).catch(() => null);

    const [nativeWei, holdings] = await Promise.all([
      this.etherscan.getNativeBalance(address, chainId),
      holdingsPromise,
    ]);

    if (nativeWei > BigInt(0)) {
      const balance = Number(nativeWei) / 1e18;
      const priceUsd = await this.pricing.getCurrentNativePriceUsd(chainId).catch(() => 0);
      tokens.push({
        symbol: this.nativeSymbol(chainId),
        name: this.nativeName(chainId),
        address: NATIVE_TOKEN_ADDRESS,
        decimals: 18,
        balance,
        rawBalance: nativeWei.toString(),
        priceUsd,
        valueUsd: balance * priceUsd,
        change24h: null,
        chain: chainName,
        chainId,
        logoUrl: null,
        isSpam: false,
        isVerified: true,
        provider: 'etherscan',
      });
    }

    if (holdings) {
      this.tokenHoldingApiAvailable = true;
      tokens.push(...(await this.buildTokensFromHoldings(holdings, chainId, chainName)));
    } else {
      if (this.tokenHoldingApiAvailable === null) this.tokenHoldingApiAvailable = false;
      tokens.push(...(await this.deriveBalancesFromTransfers(address, chainId, chainName)));
    }

    return tokens;
  }

  /** Alchemy balances + CoinGecko pricing for one chain. */
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
        .filter(t => !this.isLikelySpamToken(t.symbol, t.name))
        .map(t => t.address);

      const [nativePrice, priceMap] = await Promise.all([
        this.pricing.getCurrentNativePriceUsd(chainId).catch(() => 0),
        this.pricing.getCurrentTokenPricesUsd(chainId, erc20Addrs),
      ]);

      const tokens: TokenBalance[] = raw.map(t => {
        const spam = this.isLikelySpamToken(t.symbol, t.name);
        const isNative = t.address === NATIVE_TOKEN_ADDRESS;
        const priceUsd = spam
          ? 0
          : isNative
            ? nativePrice
            : priceMap.get(t.address.toLowerCase()) ?? 0;
        return {
          ...t,
          chain: chainName,
          isSpam: spam,
          isVerified: !spam,
          priceUsd,
          valueUsd: t.balance * priceUsd,
          change24h: null,
          provider: 'alchemy' as ProviderId,
        };
      });

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

  /**
   * Build priced TokenBalances from the direct `addresstokenbalance` holdings.
   * Uses the Etherscan-provided USD price when present, otherwise asks CoinGecko.
   */
  private async buildTokensFromHoldings(
    holdings: EtherscanTokenHolding[],
    chainId: number,
    chainName: string,
  ): Promise<TokenBalance[]> {
    const held = holdings
      .map(h => {
        const contract = (h.TokenAddress || '').toLowerCase();
        const parsed = parseInt(h.TokenDivisor || '18', 10);
        const decimals = Number.isFinite(parsed) ? parsed : 18;
        let raw: bigint;
        try {
          raw = BigInt(h.TokenQuantity || '0');
        } catch {
          raw = BigInt(0);
        }
        const balance = Number(raw) / Math.pow(10, decimals);
        const etherscanPrice = parseFloat(h.TokenPriceUSD || '0') || 0;
        return {
          contract,
          symbol: h.TokenSymbol || 'UNKNOWN',
          name: h.TokenName || '',
          decimals,
          balance,
          raw,
          etherscanPrice,
          spam: this.isLikelySpamToken(h.TokenSymbol || '', h.TokenName || ''),
        };
      })
      .filter(h => h.contract && Number.isFinite(h.balance) && h.balance > 0);

    // Only tokens without an Etherscan price (and not spam) need a CoinGecko lookup.
    const needPricing = held.filter(h => !h.spam && h.etherscanPrice <= 0).map(h => h.contract);
    const priceMap = needPricing.length
      ? await this.pricing.getCurrentTokenPricesUsd(chainId, needPricing)
      : new Map<string, number>();

    return held.map(h => {
      const priceUsd =
        h.etherscanPrice > 0
          ? h.etherscanPrice
          : h.spam
            ? 0
            : priceMap.get(h.contract) ?? 0;
      return {
        symbol: h.symbol,
        name: h.name,
        address: h.contract,
        decimals: h.decimals,
        balance: h.balance,
        rawBalance: h.raw.toString(),
        priceUsd,
        valueUsd: h.balance * priceUsd,
        change24h: null,
        chain: chainName,
        chainId,
        logoUrl: null,
        isSpam: h.spam,
        isVerified: !h.spam,
        provider: 'etherscan' as ProviderId,
      };
    });
  }

  /**
   * Fallback: derive ERC-20 balances from the token-transfer history
   * (net incoming − outgoing per token). Used when `addresstokenbalance` is
   * unavailable for the key (e.g. Free tier).
   */
  private async deriveBalancesFromTransfers(
    address: string,
    chainId: number,
    chainName: string,
  ): Promise<TokenBalance[]> {
    const userAddr = address.toLowerCase();
    const transfers = await this.etherscan.getTokenTransfers(address, chainId, {
      page: 1,
      offset: 10000,
      sort: 'asc',
    });

    const positions = new Map<
      string,
      { symbol: string; name: string; decimals: number; net: bigint }
    >();

    for (const t of transfers) {
      const contract = (t.contractAddress || '').toLowerCase();
      if (!contract) continue;
      let raw: bigint;
      try {
        raw = BigInt(t.value || '0');
      } catch {
        continue;
      }
      const decimals = parseInt(t.tokenDecimal || '18', 10);
      const entry =
        positions.get(contract) || {
          symbol: t.tokenSymbol || 'UNKNOWN',
          name: t.tokenName || '',
          decimals,
          net: BigInt(0),
        };
      if ((t.to || '').toLowerCase() === userAddr) entry.net += raw;
      if ((t.from || '').toLowerCase() === userAddr) entry.net -= raw;
      entry.symbol = t.tokenSymbol || entry.symbol;
      entry.name = t.tokenName || entry.name;
      entry.decimals = Number.isFinite(decimals) ? decimals : 18;
      positions.set(contract, entry);
    }

    // Keep only positive holdings; classify spam
    const held: Array<{ contract: string; symbol: string; name: string; decimals: number; balance: number; net: bigint; spam: boolean }> = [];
    for (const [contract, info] of positions) {
      if (info.net <= BigInt(0)) continue;
      const balance = Number(info.net) / Math.pow(10, info.decimals);
      if (!Number.isFinite(balance) || balance <= 0) continue;
      held.push({
        contract,
        symbol: info.symbol,
        name: info.name,
        decimals: info.decimals,
        balance,
        net: info.net,
        spam: this.isLikelySpamToken(info.symbol, info.name),
      });
    }

    // Batch-price the non-spam tokens via CoinGecko (one call per ~40 contracts)
    const priceable = held.filter(h => !h.spam).map(h => h.contract);
    const priceMap = await this.pricing.getCurrentTokenPricesUsd(chainId, priceable);

    return held.map(h => {
      const priceUsd = h.spam ? 0 : (priceMap.get(h.contract) ?? 0);
      return {
        symbol: h.symbol,
        name: h.name,
        address: h.contract,
        decimals: h.decimals,
        balance: h.balance,
        rawBalance: h.net.toString(),
        priceUsd,
        valueUsd: h.balance * priceUsd,
        change24h: null,
        chain: chainName,
        chainId,
        logoUrl: null,
        isSpam: h.spam,
        isVerified: !h.spam,
        provider: 'etherscan' as ProviderId,
      };
    });
  }

  /** Heuristic spam/phishing token detection (airdropped scam tokens). */
  private isLikelySpamToken(symbol: string, name: string): boolean {
    const combined = `${symbol} ${name}`.toLowerCase();
    if (/https?:|www\.|\.com|\.io|\.xyz|\.org|\.net|\.app|\.vip|\.finance|claim|visit|reward|airdrop|voucher|bonus|t\.me|telegram|giveaway|\$ /.test(combined)) {
      return true;
    }
    // Non-ASCII / homoglyph symbols (e.g. "ĖTḨ" spoofing "ETH")
    if (/[^\x00-\x7F]/.test(symbol)) return true;
    if (symbol.trim().length === 0 || symbol.length > 20) return true;
    return false;
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
  // DeFi Positions (DeBank primary, Zerion fallback)
  // ────────────────────────────────────────────────────────────

  async fetchDeFiPositions(address: string): Promise<{
    positions: DeFiPosition[];
    providers: ProviderId[];
  }> {
    const providers: ProviderId[] = [];

    // DeFi positions require DeBank or Zerion. In the Etherscan-only setup neither
    // is configured, so skip the network calls entirely — otherwise every
    // portfolio load would block on their (up to 15–30s) request timeouts.
    if (!this.debank.isConfigured() && !this.zerion.isConfigured()) {
      return { positions: [], providers };
    }

    // Try DeBank first (most comprehensive DeFi data)
    if (this.debank.isConfigured()) {
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
    }

    // Fallback: Zerion
    if (this.zerion.isConfigured()) {
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
    }

    return { positions: [], providers };
  }

  // ────────────────────────────────────────────────────────────
  // Historical Transactions (Etherscan V2 primary)
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
    if (!this.etherscan.isConfigured() && !isAlchemyConfigured()) {
      throw new Error(
        'Neither ETHERSCAN_API_KEY nor ALCHEMY_API_KEY is configured — transactions cannot be fetched.',
      );
    }

    // Check cache (key includes startBlock so incremental queries stay isolated)
    const cacheKey = `${address.toLowerCase()}_tx_${chainId}_${page}_${startBlock}`;
    const cached = await this.cache.get<WalletTransaction[]>(cacheKey, 'transactions');
    if (cached) {
      return { transactions: cached, providers: ['cache'] };
    }

    // Known Etherscan-unsupported → Alchemy directly
    if (this.etherscanUnsupportedChains.has(chainId)) {
      return this.fetchAlchemyHistoricalTransactions(address, chainId, pageSize, startBlock, cacheKey);
    }

    // Try Etherscan first when configured
    if (this.etherscan.isConfigured()) {
      try {
        const start = Date.now();
        const { normal, tokens } = await this.etherscan.getTransactionsForAddress(
          address,
          chainId,
          page + 1, // Etherscan pages are 1-indexed
          pageSize,
          startBlock,
        );
        this.markProviderSuccess('etherscan', Date.now() - start);

        if (normal.length === 0 && tokens.length === 0) {
          return { transactions: [], providers: [] };
        }

        let transactions = this.mergeEtherscanTransactions(normal, tokens, address, chainId);
        transactions = await this.pricing.enrichTransactions(transactions);

        await this.cache.set(cacheKey, 'transactions', 'etherscan', transactions);
        return { transactions, providers: ['etherscan'] };
      } catch (error) {
        if (EtherscanService.isChainUnsupported(error)) {
          this.etherscanUnsupportedChains.add(chainId);
          console.warn(
            `[ProviderManager] Chain ${chainId} (${this.chainIdToName(chainId) || 'unknown'}) not on Etherscan plan — trying Alchemy for transactions.`,
          );
          return this.fetchAlchemyHistoricalTransactions(address, chainId, pageSize, startBlock, cacheKey);
        }
        // Other failure: try Alchemy if available
        if (isAlchemyConfigured() && isAlchemyChainSupported(chainId)) {
          console.warn(
            `[ProviderManager] Etherscan tx fetch failed for chain ${chainId}, falling back to Alchemy:`,
            error instanceof Error ? error.message : error,
          );
          return this.fetchAlchemyHistoricalTransactions(address, chainId, pageSize, startBlock, cacheKey);
        }
        this.markProviderError('etherscan', error);
        throw error instanceof Error
          ? error
          : new Error(`Etherscan transaction fetch failed: ${String(error)}`);
      }
    }

    return this.fetchAlchemyHistoricalTransactions(address, chainId, pageSize, startBlock, cacheKey);
  }

  /**
   * Fetch ALL historical transactions for one chain by paginating until exhausted.
   * Pages are sequential (rate-limit friendly). Optional `onBatch` upserts each page
   * immediately so large wallets need not hold the full history in memory.
   *
   * Etherscan: 0-based page loop → 1-indexed API; stop when both normal and token
   * responses return fewer than pageSize rows.
   * Alchemy: cursor (pageKey) until exhausted, fromBlock 0x0 (or startBlock).
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
    if (!this.etherscan.isConfigured() && !isAlchemyConfigured()) {
      throw new Error(
        'Neither ETHERSCAN_API_KEY nor ALCHEMY_API_KEY is configured — transactions cannot be fetched.',
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

    // Known Etherscan-unsupported → Alchemy full history
    if (this.etherscanUnsupportedChains.has(chainId)) {
      await this.fetchAllAlchemyHistoricalTransactions(address, chainId, pageSize, startBlock, emit);
      return { totalFetched, providers, maxBlock };
    }

    if (this.etherscan.isConfigured()) {
      try {
        for (let page = 0; page < ProviderManager.TX_HISTORY_MAX_PAGES; page++) {
          const start = Date.now();
          const { normal, tokens } = await this.etherscan.getTransactionsForAddress(
            address,
            chainId,
            page + 1, // Etherscan pages are 1-indexed
            pageSize,
            startBlock,
          );
          this.markProviderSuccess('etherscan', Date.now() - start);

          if (normal.length === 0 && tokens.length === 0) break;

          let transactions = this.mergeEtherscanTransactions(normal, tokens, address, chainId);
          transactions = await this.pricing.enrichTransactions(transactions);
          await emit(transactions, 'etherscan');

          // Continue while either endpoint may still have another full page
          if (normal.length < pageSize && tokens.length < pageSize) break;
        }
        return { totalFetched, providers, maxBlock };
      } catch (error) {
        if (EtherscanService.isChainUnsupported(error)) {
          this.etherscanUnsupportedChains.add(chainId);
          console.warn(
            `[ProviderManager] Chain ${chainId} (${this.chainIdToName(chainId) || 'unknown'}) not on Etherscan plan — trying Alchemy for full tx history.`,
          );
          await this.fetchAllAlchemyHistoricalTransactions(address, chainId, pageSize, startBlock, emit);
          return { totalFetched, providers, maxBlock };
        }
        if (isAlchemyConfigured() && isAlchemyChainSupported(chainId)) {
          console.warn(
            `[ProviderManager] Etherscan full tx fetch failed for chain ${chainId}, falling back to Alchemy:`,
            error instanceof Error ? error.message : error,
          );
          await this.fetchAllAlchemyHistoricalTransactions(address, chainId, pageSize, startBlock, emit);
          return { totalFetched, providers, maxBlock };
        }
        this.markProviderError('etherscan', error);
        throw error instanceof Error
          ? error
          : new Error(`Etherscan full transaction fetch failed: ${String(error)}`);
      }
    }

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
        headers: { 'Authorization': 'Basic ' + Buffer.from((process.env.COVALENT_API_KEY || process.env.COVALENT || process.env.NEXT_PUBLIC_COVALENT_API_KEY || '') + ':').toString('base64') },
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

  private mergeEtherscanTransactions(
    normal: import('../etherscan/service').EtherscanTransaction[],
    tokens: import('../etherscan/service').EtherscanTokenTransfer[],
    address: string,
    chainId: number,
  ): WalletTransaction[] {
    const txMap = new Map<string, WalletTransaction>();

    // Native transactions first
    for (const tx of normal) {
      const normalized = this.normalizeEtherscanNativeTransaction(tx, address, chainId);
      txMap.set(tx.hash.toLowerCase(), normalized);
    }

    // ERC-20 transfers — create separate entries or enrich existing
    for (const tt of tokens) {
      const key = `${tt.hash.toLowerCase()}_${tt.contractAddress.toLowerCase()}`;
      const normalized = this.normalizeEtherscanTokenTransfer(tt, address, chainId);
      txMap.set(key, normalized);
    }

    return Array.from(txMap.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  private normalizeEtherscanNativeTransaction(
    tx: import('../etherscan/service').EtherscanTransaction,
    address: string,
    chainId: number,
  ): WalletTransaction {
    const userAddr = address.toLowerCase();
    const fromAddr = (tx.from || '').toLowerCase();
    const toAddr = (tx.to || '').toLowerCase();
    const isFromUser = fromAddr === userAddr;
    const isToUser = toAddr === userAddr;

    let direction: WalletTransaction['direction'] = 'mixed';
    if (isFromUser && isToUser) direction = 'self';
    else if (isFromUser) direction = 'out';
    else if (isToUser) direction = 'in';

    const valueEth = parseFloat(tx.value || '0') / 1e18;
    const gasUsed = parseFloat(tx.gasUsed || '0');
    const gasPrice = parseFloat(tx.gasPrice || '0');
    const gasFeeEth = (gasUsed * gasPrice) / 1e18;
    const timestamp = parseInt(tx.timeStamp || '0', 10);
    const isSuccess = tx.isError === '0' && tx.txreceipt_status !== '0';

    let type: WalletTransaction['type'] = isFromUser ? 'expense' : 'income';
    if (!isSuccess) {
      type = 'gas';
    } else if (tx.functionName?.toLowerCase().includes('swap') || tx.methodId === '0x38ed1739') {
      type = 'trade';
    } else if (tx.functionName?.toLowerCase().includes('stake')) {
      type = 'staking';
    } else if (tx.functionName?.toLowerCase().includes('deposit') || tx.functionName?.toLowerCase().includes('withdraw')) {
      type = 'defi';
    }

    const base: WalletTransaction = {
      hash: tx.hash,
      from: tx.from,
      to: tx.to || '',
      value: tx.value || '0',
      valueEth,
      gasFee: String(gasUsed * gasPrice),
      gasFeeEth,
      timestamp,
      date: timestamp > 0 ? new Date(timestamp * 1000).toISOString().split('T')[0] : '',
      type,
      direction,
      status: isSuccess ? 'confirmed' : 'failed',
      chain: this.chainIdToName(chainId) || 'ethereum',
      chainId,
      blockNumber: parseInt(tx.blockNumber || '0', 10),
      methodId: tx.methodId || null,
      methodName: tx.functionName || null,
      protocol: null,
      tokenTransfers: [],
      priceUsd: null,
      valueUsd: null,
      provider: 'etherscan',
    };

    const classified = classifySyncedTransaction(base, { statusFailed: !isSuccess });
    return classified;
  }

  private normalizeEtherscanTokenTransfer(
    tt: import('../etherscan/service').EtherscanTokenTransfer,
    address: string,
    chainId: number,
  ): WalletTransaction {
    const userAddr = address.toLowerCase();
    const fromAddr = (tt.from || '').toLowerCase();
    const toAddr = (tt.to || '').toLowerCase();
    const isFromUser = fromAddr === userAddr;
    const isToUser = toAddr === userAddr;

    let direction: WalletTransaction['direction'] = 'mixed';
    if (isFromUser && isToUser) direction = 'self';
    else if (isFromUser) direction = 'out';
    else if (isToUser) direction = 'in';

    const decimals = parseInt(tt.tokenDecimal || '18', 10);
    const valueFormatted = parseFloat(tt.value || '0') / Math.pow(10, decimals);
    const timestamp = parseInt(tt.timeStamp || '0', 10);
    const gasUsed = parseFloat(tt.gasUsed || '0');
    const gasPrice = parseFloat(tt.gasPrice || '0');
    const gasFeeEth = (gasUsed * gasPrice) / 1e18;

    const base: WalletTransaction = {
      hash: tt.hash,
      from: tt.from,
      to: tt.to,
      value: '0',
      valueEth: 0,
      gasFee: String(gasUsed * gasPrice),
      gasFeeEth,
      timestamp,
      date: timestamp > 0 ? new Date(timestamp * 1000).toISOString().split('T')[0] : '',
      type: isFromUser ? 'expense' : 'income',
      direction,
      status: 'confirmed',
      chain: this.chainIdToName(chainId) || 'ethereum',
      chainId,
      blockNumber: parseInt(tt.blockNumber || '0', 10),
      methodId: null,
      methodName: null,
      protocol: null,
      tokenTransfers: [{
        tokenSymbol: tt.tokenSymbol || 'UNKNOWN',
        tokenName: tt.tokenName || '',
        tokenAddress: tt.contractAddress || '',
        from: tt.from,
        to: tt.to,
        value: tt.value || '0',
        decimals,
        valueFormatted,
        priceUsd: null,
        valueUsd: null,
      }],
      priceUsd: null,
      valueUsd: null,
      provider: 'etherscan',
    };
    return classifySyncedTransaction(base);
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
    const map: Record<number, string> = {
      1: 'ethereum',
      8453: 'base',
      42161: 'arbitrum',
      10: 'optimism',
      137: 'polygon',
      43114: 'avalanche',
      56: 'bsc',
      59144: 'linea',
      999: 'hyperliquid',
      143: 'monad',
      5042002: 'arc',
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
