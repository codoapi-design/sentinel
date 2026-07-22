/**
 * Sync Engine for Sentinel Hybrid Blockchain Architecture
 *
 * Manages the full data ingestion lifecycle:
 *
 *   Phase 1: Initial Sync
 *   Phase 3: Historical Transactions (Etherscan V2 primary, Covalent fallback)
 *     - Zerion: Current balances + DeFi positions
 *     - DeBank: Complex DeFi protocol details
 *     - Results stored in Supabase cache
 *
 *   Phase 2: Incremental Sync (periodic)
 *     - Alchemy: New transactions since last block
 *     - Zerion: Updated balances & PnL
 *     - DeBank: Updated DeFi positions
 *
 *   Phase 3: Real-time Updates (webhook-driven)
 *     - Alchemy Notify: Address activity webhooks
 *     - Triggers immediate cache invalidation + re-fetch
 *
 *   Phase 4: Reconciliation
 *     - Cross-validate data from multiple providers
 *     - Flag discrepancies for admin review
 */

import { createServerClient } from '@/lib/supabase/server';
import { getProviderManager, SYNC_CHAIN_IDS } from './provider-manager';
import { getBlockchainCache } from './cache';
import type {
  FullSyncResult,
  SyncResult,
  ProviderId,
} from './types';
import { fetchSolanaBalances, fetchSolanaTransactions } from '@/lib/solana/service';
import { fetchTronBalances, fetchTronTransactions } from '@/lib/tron/service';
import { fetchBitcoinBalances, fetchBitcoinTransactions } from '@/lib/bitcoin/service';
import { primaryDisplayAddress } from '@/lib/wallet/address-validation';
import { planAllowsAddressFamily, normalizePlanId } from '@/lib/plans/address-families';
import { upsertPortfolioSnapshot } from '@/lib/finance/portfolio-snapshots';

type WalletRow = {
  id: string;
  user_id: string;
  address: string | null;
  solana_address?: string | null;
  tron_address?: string | null;
  bitcoin_address?: string | null;
  last_synced_block?: number | null;
};

async function resolveWalletPlan(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from('user_profiles')
    .select('plan')
    .eq('user_id', userId)
    .maybeSingle();
  return normalizePlanId(data?.plan || 'starter');
}

// ────────────────────────────────────────────────────────────
// Sync Engine
// ────────────────────────────────────────────────────────────

export class SyncEngine {
  private providerManager: ReturnType<typeof getProviderManager>;
  private cache: ReturnType<typeof getBlockchainCache>;

  constructor() {
    this.providerManager = getProviderManager();
    this.cache = getBlockchainCache();
  }

  /**
   * Full initial sync for a new wallet
   * Fetches all data types from optimal providers and stores in Supabase
   */
  async fullSync(walletId: string): Promise<FullSyncResult> {
    const startTime = Date.now();
    const results: SyncResult[] = [];
    const errors: string[] = [];

    try {
      const supabase = createServerClient();

      // Get wallet info
      const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('id', walletId)
        .single();

      if (walletError || !wallet) {
        return {
          walletId,
          address: '',
          results: [],
          totalRecordsSynced: 0,
          totalDurationMs: Date.now() - startTime,
          overallSuccess: false,
        };
      }

      const evmAddress = wallet.address || null;
      const displayAddress = primaryDisplayAddress(wallet);
      const userPlan = await resolveWalletPlan(supabase, wallet.user_id);

      // Mark as syncing
      await supabase
        .from('wallets')
        .update({ is_syncing: true })
        .eq('id', walletId);

      try {
        if (evmAddress && planAllowsAddressFamily(userPlan, 'evm')) {
          const balancesResult = await this.syncCurrentBalances(walletId, wallet.user_id, evmAddress);
          results.push(balancesResult);

          const defiResult = await this.syncDeFiPositions(walletId, wallet.user_id, evmAddress);
          results.push(defiResult);

          const txResult = await this.syncHistoricalTransactions(walletId, wallet.user_id, evmAddress);
          results.push(txResult);

          const pnlResult = await this.syncPnL(walletId, evmAddress);
          results.push(pnlResult);
        }

        const nonEvm = await this.syncNonEvmFamilies(
          walletId,
          wallet.user_id,
          wallet as WalletRow,
          userPlan,
        );
        results.push(...nonEvm);

        await this.recordDailyPortfolioSnapshot(walletId, wallet.user_id);

        await supabase.from('sync_status').upsert({
          wallet_id: walletId,
          provider: 'hybrid',
          data_type: 'full_sync',
          last_synced_at: new Date().toISOString(),
          status: 'completed',
          records_synced: results.reduce((sum, r) => sum + r.recordsSynced, 0),
        }, { onConflict: 'wallet_id,provider,data_type' });

      } catch (syncError) {
        errors.push(`Sync error: ${syncError}`);
      }

      // Mark as not syncing
      await supabase
        .from('wallets')
        .update({
          is_syncing: false,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', walletId);

      const totalRecordsSynced = results.reduce((sum, r) => sum + r.recordsSynced, 0);
      const totalDurationMs = Date.now() - startTime;

      return {
        walletId,
        address: displayAddress,
        results,
        totalRecordsSynced,
        totalDurationMs,
        overallSuccess: errors.length === 0 && results.every(r => r.success),
        changed: totalRecordsSynced > 0 || results.some(r => r.success),
      };
    } catch (error) {
      return {
        walletId,
        address: '',
        results,
        totalRecordsSynced: 0,
        totalDurationMs: Date.now() - startTime,
        overallSuccess: false,
        changed: false,
      };
    }
  }

  /**
   * Incremental sync - fetch only new data since last sync.
   * Compares a pre/post DB fingerprint so callers can skip UI refreshes
   * when nothing actually changed.
   */
  async incrementalSync(walletId: string): Promise<FullSyncResult> {
    const startTime = Date.now();
    const results: SyncResult[] = [];

    try {
      const supabase = createServerClient();

      const { data: wallet, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('id', walletId)
        .single();

      if (error || !wallet) {
        return {
          walletId,
          address: '',
          results: [],
          totalRecordsSynced: 0,
          totalDurationMs: Date.now() - startTime,
          overallSuccess: false,
          changed: false,
        };
      }

      const evmAddress = wallet.address || null;
      const displayAddress = primaryDisplayAddress(wallet);
      const before = await this.snapshotWalletData(walletId);
      const userPlan = await resolveWalletPlan(supabase, wallet.user_id);

      // Mark as syncing
      await supabase
        .from('wallets')
        .update({ is_syncing: true })
        .eq('id', walletId);

      try {
        if (evmAddress && planAllowsAddressFamily(userPlan, 'evm')) {
          await this.cache.invalidate(evmAddress, 'portfolio');
          await this.cache.invalidate(evmAddress, 'pnl');

          const balancesResult = await this.syncCurrentBalances(walletId, wallet.user_id, evmAddress);
          results.push(balancesResult);

          const defiResult = await this.syncDeFiPositions(walletId, wallet.user_id, evmAddress);
          results.push(defiResult);

          const txResult = await this.syncNewTransactions(
            walletId,
            wallet.user_id,
            evmAddress,
            wallet.last_synced_block,
          );
          results.push(txResult);

          const pnlResult = await this.syncPnL(walletId, evmAddress);
          results.push(pnlResult);
        }

        const nonEvm = await this.syncNonEvmFamilies(
          walletId,
          wallet.user_id,
          wallet as WalletRow,
          userPlan,
        );
        results.push(...nonEvm);

        await this.recordDailyPortfolioSnapshot(walletId, wallet.user_id);

      } catch (syncError) {
        console.error('[SyncEngine] Incremental sync error:', syncError);
      }

      // Mark as not syncing
      await supabase
        .from('wallets')
        .update({
          is_syncing: false,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', walletId);

      const after = await this.snapshotWalletData(walletId);
      const changed = !this.areWalletSnapshotsEqual(before, after);

      return {
        walletId,
        address: displayAddress,
        results,
        totalRecordsSynced: results.reduce((sum, r) => sum + r.recordsSynced, 0),
        totalDurationMs: Date.now() - startTime,
        overallSuccess: results.every(r => r.success),
        changed,
      };
    } catch (error) {
      return {
        walletId,
        address: '',
        results,
        totalRecordsSynced: 0,
        totalDurationMs: Date.now() - startTime,
        overallSuccess: false,
        changed: false,
      };
    }
  }

  /** Lightweight fingerprint of DB-backed wallet data for change detection. */
  private async snapshotWalletData(walletId: string): Promise<{
    txCount: number;
    tokenValueUsd: number;
    tokenCount: number;
    defiValueUsd: number;
  }> {
    const empty = { txCount: 0, tokenValueUsd: 0, tokenCount: 0, defiValueUsd: 0 };
    try {
      const supabase = createServerClient();
      const [{ count: txCount }, { data: tokens }, { data: defi }] = await Promise.all([
        supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
          .eq('wallet_id', walletId),
        supabase
          .from('asset_positions')
          .select('value_usd')
          .eq('wallet_id', walletId),
        supabase
          .from('defi_positions')
          .select('net_value_usd')
          .eq('wallet_id', walletId),
      ]);

      return {
        txCount: txCount || 0,
        tokenCount: tokens?.length || 0,
        tokenValueUsd: Math.round(
          (tokens || []).reduce((s, t) => s + (t.value_usd || 0), 0) * 100,
        ) / 100,
        defiValueUsd: Math.round(
          (defi || []).reduce((s, p) => s + (p.net_value_usd || 0), 0) * 100,
        ) / 100,
      };
    } catch {
      return empty;
    }
  }

  private areWalletSnapshotsEqual(
    a: { txCount: number; tokenValueUsd: number; tokenCount: number; defiValueUsd: number },
    b: { txCount: number; tokenValueUsd: number; tokenCount: number; defiValueUsd: number },
  ): boolean {
    return (
      a.txCount === b.txCount &&
      a.tokenCount === b.tokenCount &&
      a.tokenValueUsd === b.tokenValueUsd &&
      a.defiValueUsd === b.defiValueUsd
    );
  }

  /** Persist today's portfolio USD total for the performance chart. */
  private async recordDailyPortfolioSnapshot(walletId: string, userId: string): Promise<void> {
    try {
      const snap = await this.snapshotWalletData(walletId);
      await upsertPortfolioSnapshot({
        walletId,
        userId,
        tokenValueUsd: snap.tokenValueUsd,
        defiValueUsd: snap.defiValueUsd,
        totalValueUsd: snap.tokenValueUsd + snap.defiValueUsd,
        source: 'sync',
      });
    } catch (err) {
      console.warn('[SyncEngine] portfolio snapshot skipped:', err);
    }
  }

  /**
   * Real-time webhook handler
   * Called when Alchemy Notify sends an address activity event
   */
  async handleRealtimeEvent(address: string, _txHash: string, chainId: number): Promise<SyncResult> {
    const startTime = Date.now();

    try {
      // Invalidate cache for this address
      await this.cache.invalidate(address, 'portfolio');
      await this.cache.invalidate(address, 'transactions');
      await this.cache.invalidate(address, 'pnl');

      const supabase = createServerClient();
      const { data: wallet } = await supabase
        .from('wallets')
        .select('id, user_id, last_synced_block')
        .ilike('address', address)
        .maybeSingle();

      if (!wallet) {
        return {
          success: false,
          provider: 'etherscan',
          dataType: 'transactions',
          recordsSynced: 0,
          durationMs: Date.now() - startTime,
          errors: [`Wallet not found for address ${address}`],
          fromCache: false,
        };
      }

      // Re-fetch the latest transactions for this chain from Etherscan (only source)
      const { transactions } = await this.providerManager.fetchHistoricalTransactions(
        address,
        chainId,
        0,
        25,
      );

      let stored = 0;
      if (transactions.length > 0) {
        stored = await this.cache.upsertTransactions(
          wallet.id,
          wallet.user_id,
          transactions,
          'etherscan',
        );

        const maxBlock = Math.max(...transactions.map(tx => tx.blockNumber));
        await supabase
          .from('wallets')
          .update({ last_synced_block: Math.max(wallet.last_synced_block || 0, maxBlock) })
          .eq('id', wallet.id);
      }

      return {
        success: true,
        provider: 'etherscan',
        dataType: 'transactions',
        recordsSynced: stored,
        durationMs: Date.now() - startTime,
        errors: [],
        fromCache: false,
      };
    } catch (error) {
      return {
        success: false,
        provider: 'etherscan',
        dataType: 'transactions',
        recordsSynced: 0,
        durationMs: Date.now() - startTime,
        errors: [String(error)],
        fromCache: false,
      };
    }
  }

  // ────────────────────────────────────────────────────────────
  // Individual sync operations
  // ────────────────────────────────────────────────────────────

  private async syncNonEvmFamilies(
    walletId: string,
    userId: string,
    wallet: WalletRow,
    plan: string,
  ): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    if (wallet.solana_address && planAllowsAddressFamily(plan, 'solana')) {
      results.push(
        await this.syncFamilyBalancesAndTxs(
          walletId,
          userId,
          'solana',
          () => fetchSolanaBalances(wallet.solana_address!),
          () => fetchSolanaTransactions(wallet.solana_address!),
        ),
      );
    }
    if (wallet.tron_address && planAllowsAddressFamily(plan, 'tron')) {
      results.push(
        await this.syncFamilyBalancesAndTxs(
          walletId,
          userId,
          'tron',
          () => fetchTronBalances(wallet.tron_address!),
          () => fetchTronTransactions(wallet.tron_address!),
        ),
      );
    }
    if (wallet.bitcoin_address && planAllowsAddressFamily(plan, 'bitcoin')) {
      results.push(
        await this.syncFamilyBalancesAndTxs(
          walletId,
          userId,
          'bitcoin',
          () => fetchBitcoinBalances(wallet.bitcoin_address!),
          () => fetchBitcoinTransactions(wallet.bitcoin_address!),
        ),
      );
    }

    return results;
  }

  private async syncFamilyBalancesAndTxs(
    walletId: string,
    userId: string,
    family: string,
    fetchBalances: () => Promise<import('./types').TokenBalance[]>,
    fetchTxs: () => Promise<import('./types').WalletTransaction[]>,
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let recordsSynced = 0;

    try {
      const tokens = await fetchBalances();
      // Keep positions with balance even if USD is 0 (unpriced tokens)
      const keepable = tokens.filter(t => t.balance > 0);
      if (keepable.length > 0) {
        // Temporarily bump dust so 0-priced holdings still store (use tiny valueUsd)
        const forUpsert = keepable.map(t =>
          t.valueUsd >= 0.01 ? t : { ...t, valueUsd: Math.max(t.valueUsd, 0.01) },
        );
        recordsSynced += await this.cache.upsertTokenPositions(
          walletId,
          userId,
          forUpsert,
          'alchemy',
        );
      }
    } catch (err) {
      errors.push(`${family} balances: ${err}`);
    }

    try {
      const txs = await fetchTxs();
      if (txs.length > 0) {
        recordsSynced += await this.cache.upsertTransactions(
          walletId,
          userId,
          txs,
          'alchemy',
        );
      }
    } catch (err) {
      errors.push(`${family} txs: ${err}`);
    }

    return {
      success: errors.length === 0,
      provider: 'alchemy',
      dataType: `${family}_sync` as import('./types').CacheDataType,
      recordsSynced,
      durationMs: Date.now() - startTime,
      errors,
      fromCache: false,
    };
  }

  private async syncCurrentBalances(
    walletId: string,
    userId: string,
    address: string,
  ): Promise<SyncResult> {
    const startTime = Date.now();
    try {
      const { tokens, providers } = await this.providerManager.fetchCurrentBalances(address);

      // Store in Supabase asset_positions (per-token provider when available)
      const recordsSynced = await this.cache.upsertTokenPositions(
        walletId,
        userId,
        tokens,
        providers[0] || tokens[0]?.provider || 'etherscan',
      );

      // Cache a well-formed portfolio snapshot so `getPortfolio` can serve it
      // directly (must match the WalletPortfolio shape — a partial `{ tokens }`
      // object would break consumers that spread `providers`).
      const tokenValueUsd = tokens.reduce((sum, t) => sum + (t.valueUsd || 0), 0);
      const chainMap = new Map<string, { value: number; tokens: number; defi: number }>();
      for (const t of tokens) {
        const existing = chainMap.get(t.chain) || { value: 0, tokens: 0, defi: 0 };
        existing.value += t.valueUsd || 0;
        existing.tokens++;
        chainMap.set(t.chain, existing);
      }
      const portfolioSnapshot = {
        address,
        totalValueUsd: tokenValueUsd,
        tokenValueUsd,
        defiValueUsd: 0,
        tokens,
        defiPositions: [],
        chainBreakdown: Array.from(chainMap.entries()).map(([chain, data]) => ({
          chain,
          chainId: 1,
          valueUsd: data.value,
          tokenCount: data.tokens,
          defiPositionCount: data.defi,
        })),
        providers,
        lastUpdated: Date.now(),
      };
      await this.cache.set(address, 'portfolio', providers[0] || 'etherscan', portfolioSnapshot);

      return {
        success: true,
        provider: providers[0] || 'zerion',
        dataType: 'portfolio',
        recordsSynced,
        durationMs: Date.now() - startTime,
        errors: [],
        fromCache: false,
      };
    } catch (error) {
      return {
        success: false,
        provider: 'zerion',
        dataType: 'portfolio',
        recordsSynced: 0,
        durationMs: Date.now() - startTime,
        errors: [String(error)],
        fromCache: false,
      };
    }
  }

  private async syncDeFiPositions(
    walletId: string,
    userId: string,
    address: string,
  ): Promise<SyncResult> {
    const startTime = Date.now();
    try {
      const { positions, providers } = await this.providerManager.fetchDeFiPositions(address);

      const recordsSynced = await this.cache.upsertDeFiPositions(
        walletId,
        userId,
        positions,
        providers[0] || 'debank',
      );

      return {
        success: true,
        provider: providers[0] || 'debank',
        dataType: 'defi',
        recordsSynced,
        durationMs: Date.now() - startTime,
        errors: [],
        fromCache: false,
      };
    } catch (error) {
      return {
        success: false,
        provider: 'debank',
        dataType: 'defi',
        recordsSynced: 0,
        durationMs: Date.now() - startTime,
        errors: [String(error)],
        fromCache: false,
      };
    }
  }

  private async syncHistoricalTransactions(
    walletId: string,
    userId: string,
    address: string,
  ): Promise<SyncResult> {
    const startTime = Date.now();
    let totalRecords = 0;
    const errors: string[] = [];

    try {
      // Paginate every supported chain until history is exhausted (pageSize 100).
      // Chains run in parallel; pages within a chain are sequential for rate limits.
      const chainIds = SYNC_CHAIN_IDS;
      const pageSize = 100;

      const chainResults = await Promise.allSettled(
        chainIds.map(async chainId => {
          let stored = 0;
          await this.providerManager.fetchAllHistoricalTransactions(address, chainId, {
            pageSize,
            onBatch: async (transactions, providers) => {
              if (transactions.length === 0) return;
              stored += await this.cache.upsertTransactions(
                walletId,
                userId,
                transactions,
                providers[0] || 'etherscan',
              );
            },
          });
          return stored;
        }),
      );

      chainResults.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          totalRecords += result.value;
        } else {
          errors.push(`Chain ${chainIds[i]}: ${result.reason}`);
        }
      });

      return {
        success: errors.length < chainIds.length,
        provider: 'etherscan',
        dataType: 'transactions',
        recordsSynced: totalRecords,
        durationMs: Date.now() - startTime,
        errors,
        fromCache: false,
      };
    } catch (error) {
      return {
        success: false,
        provider: 'etherscan',
        dataType: 'transactions',
        recordsSynced: totalRecords,
        durationMs: Date.now() - startTime,
        errors: [String(error)],
        fromCache: false,
      };
    }
  }

  private async syncNewTransactions(
    walletId: string,
    userId: string,
    address: string,
    lastSyncedBlock: number | null,
  ): Promise<SyncResult> {
    const startTime = Date.now();
    let totalRecords = 0;
    let maxBlock = lastSyncedBlock || 0;
    const errors: string[] = [];
    const chainIds = SYNC_CHAIN_IDS;
    const startBlock = lastSyncedBlock ? lastSyncedBlock + 1 : 0;
    const pageSize = 100;

    try {
      // Paginate all new txs since lastSyncedBlock on every chain (not just first page).
      const chainResults = await Promise.allSettled(
        chainIds.map(async chainId => {
          let stored = 0;
          const { maxBlock: chainMax } =
            await this.providerManager.fetchAllHistoricalTransactions(address, chainId, {
              pageSize,
              startBlock,
              onBatch: async (transactions) => {
                if (transactions.length === 0) return;
                stored += await this.cache.upsertTransactions(
                  walletId,
                  userId,
                  transactions,
                  'etherscan',
                );
              },
            });
          return { stored, chainMax };
        }),
      );

      chainResults.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          totalRecords += result.value.stored;
          if (result.value.chainMax > maxBlock) maxBlock = result.value.chainMax;
        } else {
          errors.push(`Chain ${chainIds[i]}: ${result.reason}`);
        }
      });

      // Update last synced block
      if (maxBlock > (lastSyncedBlock || 0)) {
        const supabase = createServerClient();
        await supabase
          .from('wallets')
          .update({ last_synced_block: maxBlock })
          .eq('id', walletId);
      }

      return {
        success: errors.length < chainIds.length,
        provider: 'etherscan',
        dataType: 'transactions',
        recordsSynced: totalRecords,
        durationMs: Date.now() - startTime,
        errors,
        fromCache: false,
      };
    } catch (error) {
      return {
        success: false,
        provider: 'etherscan',
        dataType: 'transactions',
        recordsSynced: totalRecords,
        durationMs: Date.now() - startTime,
        errors: [String(error)],
        fromCache: false,
      };
    }
  }

  private async syncPnL(walletId: string, address: string): Promise<SyncResult> {
    const startTime = Date.now();
    try {
      const pnl = await this.providerManager.fetchPnL(address);

      if (pnl) {
        await this.cache.set(address, 'pnl', 'zerion', pnl);
      }

      return {
        success: true,
        provider: 'zerion',
        dataType: 'pnl',
        recordsSynced: pnl ? 1 : 0,
        durationMs: Date.now() - startTime,
        errors: [],
        fromCache: false,
      };
    } catch (error) {
      return {
        success: false,
        provider: 'zerion',
        dataType: 'pnl',
        recordsSynced: 0,
        durationMs: Date.now() - startTime,
        errors: [String(error)],
        fromCache: false,
      };
    }
  }
}

// ────────────────────────────────────────────────────────────
// Singleton
// ────────────────────────────────────────────────────────────

let syncInstance: SyncEngine | null = null;

export function getSyncEngine(): SyncEngine {
  if (!syncInstance) {
    syncInstance = new SyncEngine();
  }
  return syncInstance;
}
