/**
 * Sync Engine for Sentinel Hybrid Blockchain Architecture
 *
 * Manages the full data ingestion lifecycle:
 *
 *   Phase 1: Initial Sync
 *     - Covalent: Full historical transactions (from first block)
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
import { getProviderManager } from './provider-manager';
import { getBlockchainCache } from './cache';
import { fetchAndClassifyTransactions, NETWORKS } from '../alchemy/service';
import type {
  FullSyncResult,
  SyncResult,
  SyncStatus,
  ProviderId,
  CHAIN_IDS,
} from './types';

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

      const address = wallet.address;

      // Mark as syncing
      await supabase
        .from('wallets')
        .update({ is_syncing: true })
        .eq('id', walletId);

      try {
        // ── Phase 1: Current Balances (Zerion) ──
        const balancesResult = await this.syncCurrentBalances(walletId, wallet.user_id, address);
        results.push(balancesResult);

        // ── Phase 2: DeFi Positions (DeBank) ──
        const defiResult = await this.syncDeFiPositions(walletId, wallet.user_id, address);
        results.push(defiResult);

        // ── Phase 3: Historical Transactions (Covalent) ──
        const txResult = await this.syncHistoricalTransactions(walletId, wallet.user_id, address);
        results.push(txResult);

        // ── Phase 4: PnL Data (Zerion) ──
        const pnlResult = await this.syncPnL(walletId, address);
        results.push(pnlResult);

        // Update sync_status
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
        address,
        results,
        totalRecordsSynced,
        totalDurationMs,
        overallSuccess: errors.length === 0 && results.every(r => r.success),
      };
    } catch (error) {
      return {
        walletId,
        address: '',
        results,
        totalRecordsSynced: 0,
        totalDurationMs: Date.now() - startTime,
        overallSuccess: false,
      };
    }
  }

  /**
   * Incremental sync - fetch only new data since last sync
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
        };
      }

      const address = wallet.address;

      // Mark as syncing
      await supabase
        .from('wallets')
        .update({ is_syncing: true })
        .eq('id', walletId);

      try {
        // 1. Invalidate stale cache entries
        await this.cache.invalidate(address, 'portfolio');
        await this.cache.invalidate(address, 'pnl');

        // 2. Re-fetch current balances (Zerion)
        const balancesResult = await this.syncCurrentBalances(walletId, wallet.user_id, address);
        results.push(balancesResult);

        // 3. Re-fetch DeFi positions (DeBank)
        const defiResult = await this.syncDeFiPositions(walletId, wallet.user_id, address);
        results.push(defiResult);

        // 4. Fetch new transactions via Alchemy (from last synced block)
        const txResult = await this.syncNewTransactions(walletId, wallet.user_id, address, wallet.last_synced_block);
        results.push(txResult);

        // 5. Update PnL
        const pnlResult = await this.syncPnL(walletId, address);
        results.push(pnlResult);

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

      return {
        walletId,
        address,
        results,
        totalRecordsSynced: results.reduce((sum, r) => sum + r.recordsSynced, 0),
        totalDurationMs: Date.now() - startTime,
        overallSuccess: results.every(r => r.success),
      };
    } catch (error) {
      return {
        walletId,
        address: '',
        results,
        totalRecordsSynced: 0,
        totalDurationMs: Date.now() - startTime,
        overallSuccess: false,
      };
    }
  }

  /**
   * Real-time webhook handler
   * Called when Alchemy Notify sends an address activity event
   */
  async handleRealtimeEvent(address: string, txHash: string, chainId: number): Promise<SyncResult> {
    const startTime = Date.now();

    try {
      // Invalidate cache for this address
      await this.cache.invalidate(address, 'portfolio');
      await this.cache.invalidate(address, 'transactions');
      await this.cache.invalidate(address, 'pnl');

      // Fetch the specific transaction details
      const chainName = this.chainIdToNetworkKey(chainId);
      if (!chainName || !NETWORKS[chainName]) {
        return {
          success: false,
          provider: 'alchemy',
          dataType: 'transactions',
          recordsSynced: 0,
          durationMs: Date.now() - startTime,
          errors: [`Unsupported chain: ${chainId}`],
          fromCache: false,
        };
      }

      const result = await fetchAndClassifyTransactions({
        walletAddress: address,
        networkKey: chainName,
        maxCount: 1,
      });

      if (result.transactions.length > 0) {
        // Store in Supabase
        const supabase = createServerClient();
        const { data: wallet } = await supabase
          .from('wallets')
          .select('id, user_id')
          .ilike('address', address)
          .maybeSingle();

        if (wallet) {
          const tx = result.transactions[0];
          await supabase.from('transactions').upsert({
            wallet_id: wallet.id,
            user_id: wallet.user_id,
            tx_hash: tx.txHash,
            block_number: tx.blockNumber,
            timestamp: tx.timestamp,
            date: tx.date,
            from_addr: tx.from,
            to_addr: tx.to,
            value_wei: tx.value,
            value_eth: tx.valueEth,
            gas_used: tx.gasUsed,
            gas_price_wei: tx.gasPrice,
            gas_fee_eth: tx.gasFeeEth,
            status: tx.status,
            type: tx.type,
            type_ar: tx.typeAr,
            direction: tx.direction,
            method_id: tx.methodId,
            method_name: tx.methodName,
            protocol: tx.protocol,
            protocol_ar: tx.protocolAr,
            network: chainName,
            network_ar: tx.networkAr,
            token_symbol: tx.tokenTransfers[0]?.tokenSymbol || null,
            token_name: tx.tokenTransfers[0]?.tokenName || null,
            token_address: tx.tokenTransfers[0]?.tokenAddress || null,
            token_value: tx.tokenTransfers[0]?.valueFormatted || 0,
            token_decimals: tx.tokenTransfers[0]?.decimals || 18,
            counterparty: tx.direction === 'in' ? tx.from : tx.to,
            counterparty_label: tx.protocol || null,
          }, { onConflict: 'tx_hash,wallet_id,network', ignoreDuplicates: true });

          // Update last synced block
          await supabase
            .from('wallets')
            .update({ last_synced_block: Math.max(wallet.last_synced_block || 0, tx.blockNumber) })
            .eq('id', wallet.id);
        }
      }

      return {
        success: true,
        provider: 'alchemy',
        dataType: 'transactions',
        recordsSynced: result.transactions.length,
        durationMs: Date.now() - startTime,
        errors: [],
        fromCache: false,
      };
    } catch (error) {
      return {
        success: false,
        provider: 'alchemy',
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

  private async syncCurrentBalances(
    walletId: string,
    userId: string,
    address: string,
  ): Promise<SyncResult> {
    const startTime = Date.now();
    try {
      const { tokens, providers } = await this.providerManager.fetchCurrentBalances(address);

      // Store in Supabase asset_positions
      const recordsSynced = await this.cache.upsertTokenPositions(
        walletId,
        userId,
        tokens,
        providers[0] || 'zerion',
      );

      // Cache the data
      await this.cache.set(address, 'portfolio', providers[0] || 'zerion', { tokens });

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
      // Fetch from Covalent for each supported chain
      const chainIds = [1, 8453, 42161, 10, 137]; // ETH, Base, Arbitrum, Optimism, Polygon

      for (const chainId of chainIds) {
        try {
          const { transactions, providers } = await this.providerManager.fetchHistoricalTransactions(
            address,
            chainId,
            0,
            100,
          );

          if (transactions.length > 0) {
            const stored = await this.cache.upsertTransactions(
              walletId,
              userId,
              transactions,
              providers[0] || 'covalent',
            );
            totalRecords += stored;
          }
        } catch (chainError) {
          errors.push(`Chain ${chainId}: ${chainError}`);
        }
      }

      return {
        success: errors.length < chainIds.length,
        provider: 'covalent',
        dataType: 'transactions',
        recordsSynced: totalRecords,
        durationMs: Date.now() - startTime,
        errors,
        fromCache: false,
      };
    } catch (error) {
      return {
        success: false,
        provider: 'covalent',
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

    try {
      const supabase = createServerClient();

      for (const [networkKey] of Object.entries(NETWORKS)) {
        try {
          const fromBlock = lastSyncedBlock
            ? `0x${(lastSyncedBlock + 1).toString(16)}`
            : undefined;

          const result = await fetchAndClassifyTransactions({
            walletAddress: address,
            networkKey,
            fromBlock,
            maxCount: 100,
          });

          if (result.transactions.length > 0) {
            // Store in Supabase
            const dbRows = result.transactions.map(tx => ({
              wallet_id: walletId,
              user_id: userId,
              tx_hash: tx.txHash,
              block_number: tx.blockNumber,
              timestamp: tx.timestamp,
              date: tx.date,
              from_addr: tx.from,
              to_addr: tx.to,
              value_wei: tx.value,
              value_eth: tx.valueEth,
              gas_used: tx.gasUsed,
              gas_price_wei: tx.gasPrice,
              gas_fee_eth: tx.gasFeeEth,
              status: tx.status,
              type: tx.type,
              type_ar: tx.typeAr,
              direction: tx.direction,
              method_id: tx.methodId,
              method_name: tx.methodName,
              protocol: tx.protocol,
              protocol_ar: tx.protocolAr,
              network: networkKey,
              network_ar: tx.networkAr,
              token_symbol: tx.tokenTransfers[0]?.tokenSymbol || null,
              token_name: tx.tokenTransfers[0]?.tokenName || null,
              token_address: tx.tokenTransfers[0]?.tokenAddress || null,
              token_value: tx.tokenTransfers[0]?.valueFormatted || 0,
              token_decimals: tx.tokenTransfers[0]?.decimals || 18,
              counterparty: tx.direction === 'in' ? tx.from : tx.to,
              counterparty_label: tx.protocol || null,
            }));

            await supabase
              .from('transactions')
              .upsert(dbRows, { onConflict: 'tx_hash,wallet_id,network', ignoreDuplicates: true });

            totalRecords += result.transactions.length;

            // Track max block
            const chainMax = Math.max(...result.transactions.map(tx => tx.blockNumber));
            if (chainMax > maxBlock) maxBlock = chainMax;
          }
        } catch (networkError) {
          console.warn(`[SyncEngine] Alchemy ${networkKey} error:`, networkError);
        }
      }

      // Update last synced block
      if (maxBlock > (lastSyncedBlock || 0)) {
        await supabase
          .from('wallets')
          .update({ last_synced_block: maxBlock })
          .eq('id', walletId);
      }

      return {
        success: true,
        provider: 'alchemy',
        dataType: 'transactions',
        recordsSynced: totalRecords,
        durationMs: Date.now() - startTime,
        errors: [],
        fromCache: false,
      };
    } catch (error) {
      return {
        success: false,
        provider: 'alchemy',
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
