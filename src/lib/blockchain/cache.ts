/**
 * Supabase Cache Layer for Sentinel Hybrid Blockchain Architecture
 *
 * Caches fetched data in Supabase to:
 *   1. Reduce external API calls (cost savings)
 *   2. Speed up response times (serve from cache)
 *   3. Enable offline/degredation resilience
 *   4. Support historical queries without re-fetching
 *
 * Cache strategy:
 *   - Portfolio/balances: TTL 5 min (real-time feel)
 *   - DeFi positions: TTL 10 min (moderate freshness)
 *   - Transactions: TTL 30 min (append-only, low staleness)
 *   - NFTs: TTL 60 min (infrequent changes)
 *   - PnL: TTL 15 min (depends on price updates)
 */

import { createServerClient } from '@/lib/supabase/server';
import type {
  CacheDataType,
  CacheEntry,
  ProviderId,
  TokenBalance,
  DeFiPosition,
  WalletTransaction,
  WalletPortfolio,
  ChainBreakdown,
  PnLData,
  NFTAsset,
} from './types';

// ────────────────────────────────────────────────────────────
// TTL Configuration (milliseconds)
// ────────────────────────────────────────────────────────────

const CACHE_TTL: Record<CacheDataType, number> = {
  portfolio: 5 * 60 * 1000,       // 5 minutes
  transactions: 30 * 60 * 1000,   // 30 minutes
  defi: 10 * 60 * 1000,          // 10 minutes
  nfts: 60 * 60 * 1000,          // 60 minutes
  pnl: 15 * 60 * 1000,           // 15 minutes
};

// ────────────────────────────────────────────────────────────
// Cache Read
// ────────────────────────────────────────────────────────────

export class BlockchainCache {
  /**
   * Get cached data if it exists and hasn't expired
   */
  async get<T>(address: string, dataType: CacheDataType): Promise<T | null> {
    try {
      const supabase = createServerClient();

      const { data, error } = await supabase
        .from('blockchain_cache')
        .select('*')
        .eq('wallet_address', address.toLowerCase())
        .eq('data_type', dataType)
        .gt('expires_at', Date.now())
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;

      // Increment hit count
      await supabase
        .from('blockchain_cache')
        .update({ hit_count: (data.hit_count || 0) + 1 })
        .eq('id', data.id);

      return data.payload as T;
    } catch (error) {
      console.warn('[Cache] Read error:', error);
      return null;
    }
  }

  /**
   * Store data in cache
   */
  async set(
    address: string,
    dataType: CacheDataType,
    provider: ProviderId,
    payload: unknown,
    customTtlMs?: number,
  ): Promise<void> {
    try {
      const supabase = createServerClient();
      const ttl = customTtlMs || CACHE_TTL[dataType];
      const now = Date.now();

      await supabase
        .from('blockchain_cache')
        .upsert({
          wallet_address: address.toLowerCase(),
          data_type: dataType,
          provider,
          payload,
          fetched_at: now,
          expires_at: now + ttl,
          hit_count: 0,
        }, {
          onConflict: 'wallet_address,data_type',
        });
    } catch (error) {
      console.warn('[Cache] Write error:', error);
    }
  }

  /**
   * Invalidate cache for a specific wallet/data type
   */
  async invalidate(address: string, dataType?: CacheDataType): Promise<void> {
    try {
      const supabase = createServerClient();
      let query = supabase
        .from('blockchain_cache')
        .delete()
        .eq('wallet_address', address.toLowerCase());

      if (dataType) {
        query = query.eq('data_type', dataType);
      }

      await query;
    } catch (error) {
      console.warn('[Cache] Invalidate error:', error);
    }
  }

  /**
   * Get cache stats for monitoring
   */
  async getStats(address: string): Promise<Record<CacheDataType, { cached: boolean; age: number; provider: ProviderId | null }>> {
    const result: Record<string, { cached: boolean; age: number; provider: ProviderId | null }> = {};
    const types: CacheDataType[] = ['portfolio', 'transactions', 'defi', 'nfts', 'pnl'];

    try {
      const supabase = createServerClient();
      const { data } = await supabase
        .from('blockchain_cache')
        .select('data_type, provider, fetched_at, expires_at')
        .eq('wallet_address', address.toLowerCase());

      const now = Date.now();

      for (const type of types) {
        const entry = data?.find(d => d.data_type === type);
        if (entry && entry.expires_at > now) {
          result[type] = {
            cached: true,
            age: now - entry.fetched_at,
            provider: entry.provider as ProviderId,
          };
        } else {
          result[type] = { cached: false, age: 0, provider: null };
        }
      }
    } catch {
      for (const type of types) {
        result[type] = { cached: false, age: 0, provider: null };
      }
    }

    return result as Record<CacheDataType, { cached: boolean; age: number; provider: ProviderId | null }>;
  }

  // ────────────────────────────────────────────────────────────
  // Token Position Cache (separate table for fast queries)
  // ────────────────────────────────────────────────────────────

  async upsertTokenPositions(
    walletId: string,
    userId: string,
    tokens: TokenBalance[],
    provider: ProviderId,
  ): Promise<number> {
    let upserted = 0;
    try {
      const supabase = createServerClient();

      const rows = tokens
        .filter(t => t.valueUsd >= 0.01) // Skip dust
        .map(t => ({
          wallet_id: walletId,
          user_id: userId,
          token_symbol: t.symbol,
          token_name: t.name,
          token_address: t.address,
          token_decimals: t.decimals,
          network: t.chain,
          chain_id: t.chainId,
          balance: t.balance,
          balance_raw: t.rawBalance,
          price_usd: t.priceUsd,
          value_usd: t.valueUsd,
          change_24h: t.change24h,
          is_spam: t.isSpam,
          is_verified: t.isVerified,
          source: provider,
          logo_url: t.logoUrl,
        }));

      if (rows.length === 0) return 0;

      // Batch upsert (Supabase handles up to ~100 rows efficiently)
      const batchSize = 50;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase
          .from('asset_positions')
          .upsert(batch, {
            onConflict: 'wallet_id,token_address,network',
          });

        if (!error) {
          upserted += batch.length;
        } else {
          console.warn('[Cache] Token upsert error:', error.message);
        }
      }
    } catch (error) {
      console.warn('[Cache] Token position error:', error);
    }
    return upserted;
  }

  // ────────────────────────────────────────────────────────────
  // DeFi Position Cache
  // ────────────────────────────────────────────────────────────

  async upsertDeFiPositions(
    walletId: string,
    userId: string,
    positions: DeFiPosition[],
    provider: ProviderId,
  ): Promise<number> {
    let upserted = 0;
    try {
      const supabase = createServerClient();

      const rows = positions.map(p => ({
        wallet_id: walletId,
        user_id: userId,
        protocol_name: p.protocol,
        protocol_id: p.protocolId,
        protocol_chain: p.chain,
        chain_id: p.chainId,
        protocol_logo: p.logoUrl,
        position_type: p.type,
        supplied_tokens: p.suppliedTokens,
        borrowed_tokens: p.borrowedTokens,
        reward_tokens: p.rewardTokens,
        net_value_usd: p.netValueUsd,
        asset_value_usd: p.assetValueUsd,
        debt_value_usd: p.debtValueUsd,
        apy: p.apy,
        health_factor: p.healthFactor,
        source: provider,
      }));

      for (const row of rows) {
        const { error } = await supabase
          .from('defi_positions')
          .upsert(row);

        if (!error) upserted++;
        else console.warn('[Cache] DeFi upsert error:', error.message);
      }
    } catch (error) {
      console.warn('[Cache] DeFi position error:', error);
    }
    return upserted;
  }

  // ────────────────────────────────────────────────────────────
  // Transaction Cache
  // ────────────────────────────────────────────────────────────

  async upsertTransactions(
    walletId: string,
    userId: string,
    transactions: WalletTransaction[],
    provider: ProviderId,
  ): Promise<number> {
    let upserted = 0;
    try {
      const supabase = createServerClient();

      const rows = transactions.map(tx => ({
        wallet_id: walletId,
        user_id: userId,
        tx_hash: tx.hash,
        block_number: tx.blockNumber,
        timestamp: tx.timestamp,
        date: tx.date,
        from_addr: tx.from,
        to_addr: tx.to,
        value_wei: tx.value,
        value_eth: tx.valueEth,
        gas_used: 0,
        gas_price_wei: tx.gasFee,
        gas_fee_eth: tx.gasFeeEth,
        status: tx.status === 'confirmed',
        type: tx.type,
        type_ar: tx.type,
        direction: tx.direction,
        method_id: tx.methodId,
        method_name: tx.methodName,
        protocol: tx.protocol,
        protocol_ar: null,
        network: tx.chain,
        network_ar: tx.chain,
        token_symbol: tx.tokenTransfers[0]?.tokenSymbol || null,
        token_name: tx.tokenTransfers[0]?.tokenName || null,
        token_address: tx.tokenTransfers[0]?.tokenAddress || null,
        token_value: tx.tokenTransfers[0]?.valueFormatted || 0,
        token_decimals: tx.tokenTransfers[0]?.decimals || 18,
        counterparty: tx.direction === 'in' ? tx.from : tx.to,
        counterparty_label: tx.protocol || null,
        raw_data: { tokenTransfers: tx.tokenTransfers, provider },
      }));

      const batchSize = 50;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase
          .from('transactions')
          .upsert(batch, {
            onConflict: 'tx_hash,wallet_id,network',
            ignoreDuplicates: true,
          });

        if (!error) upserted += batch.length;
        else console.warn('[Cache] Transaction upsert error:', error.message);
      }
    } catch (error) {
      console.warn('[Cache] Transaction cache error:', error);
    }
    return upserted;
  }

  // ────────────────────────────────────────────────────────────
  // Cached Portfolio Builder
  // ────────────────────────────────────────────────────────────

  async getCachedPortfolio(address: string): Promise<WalletPortfolio | null> {
    try {
      const supabase = createServerClient();

      // Check portfolio cache
      const cached = await this.get<WalletPortfolio>(address, 'portfolio');
      if (cached) return cached;

      // Try to reconstruct from individual tables
      // Get wallet ID
      const { data: wallet } = await supabase
        .from('wallets')
        .select('id')
        .ilike('address', address)
        .maybeSingle();

      if (!wallet) return null;

      // Get token positions
      const { data: tokens } = await supabase
        .from('asset_positions')
        .select('*')
        .eq('wallet_id', wallet.id)
        .gt('value_usd', 0);

      // Get DeFi positions
      const { data: defiPositions } = await supabase
        .from('defi_positions')
        .select('*')
        .eq('wallet_id', wallet.id);

      if (!tokens?.length && !defiPositions?.length) return null;

      const tokenValueUsd = tokens?.reduce((sum, t) => sum + (t.value_usd || 0), 0) || 0;
      const defiValueUsd = defiPositions?.reduce((sum, p) => sum + (p.net_value_usd || 0), 0) || 0;

      // Build chain breakdown
      const chainMap = new Map<string, { value: number; tokens: number; defi: number }>();
      for (const t of tokens || []) {
        const existing = chainMap.get(t.network) || { value: 0, tokens: 0, defi: 0 };
        existing.value += t.value_usd || 0;
        existing.tokens++;
        chainMap.set(t.network, existing);
      }
      for (const p of defiPositions || []) {
        const existing = chainMap.get(p.protocol_chain) || { value: 0, tokens: 0, defi: 0 };
        existing.value += p.net_value_usd || 0;
        existing.defi++;
        chainMap.set(p.protocol_chain, existing);
      }

      return {
        address,
        totalValueUsd: tokenValueUsd + defiValueUsd,
        tokenValueUsd,
        defiValueUsd,
        tokens: (tokens || []).map(t => ({
          symbol: t.token_symbol,
          name: t.token_name,
          address: t.token_address,
          decimals: t.token_decimals,
          balance: t.balance,
          rawBalance: t.balance_raw || '0',
          priceUsd: t.price_usd,
          valueUsd: t.value_usd,
          change24h: t.change_24h,
          chain: t.network,
          chainId: t.chain_id || 1,
          logoUrl: t.logo_url,
          isSpam: t.is_spam || false,
          isVerified: t.is_verified || false,
          provider: (t.source || 'cache') as ProviderId,
        })),
        defiPositions: (defiPositions || []).map(p => ({
          id: p.id,
          protocol: p.protocol_name,
          protocolId: p.protocol_id || '',
          chain: p.protocol_chain,
          chainId: p.chain_id || 1,
          type: p.position_type || 'unknown',
          suppliedTokens: p.supplied_tokens || [],
          borrowedTokens: p.borrowed_tokens || [],
          rewardTokens: p.reward_tokens || [],
          netValueUsd: p.net_value_usd || 0,
          assetValueUsd: p.asset_value_usd || 0,
          debtValueUsd: p.debt_value_usd || 0,
          apy: p.apy,
          healthFactor: p.health_factor,
          logoUrl: p.protocol_logo,
          provider: (p.source || 'cache') as ProviderId,
        })),
        chainBreakdown: Array.from(chainMap.entries()).map(([chain, data]) => ({
          chain,
          chainId: CHAIN_IDS[chain] || 1,
          valueUsd: data.value,
          tokenCount: data.tokens,
          defiPositionCount: data.defi,
        })),
        providers: ['cache'],
        lastUpdated: Date.now(),
      };
    } catch (error) {
      console.warn('[Cache] Portfolio reconstruction error:', error);
      return null;
    }
  }
}

// Singleton
let cacheInstance: BlockchainCache | null = null;

export function getBlockchainCache(): BlockchainCache {
  if (!cacheInstance) {
    cacheInstance = new BlockchainCache();
  }
  return cacheInstance;
}

// Need CHAIN_IDS for the portfolio builder
import { CHAIN_IDS } from './types';
