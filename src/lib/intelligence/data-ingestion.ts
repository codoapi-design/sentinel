/**
 * Data Ingestion Service for Sentinel
 *
 * Updated to use the Hybrid Blockchain Architecture:
 *   - Uses Provider Manager for smart routing
 *   - Uses Sync Engine for full/incremental syncs
 *   - Uses Supabase Cache layer for reduced API calls
 *
 * This service is the high-level interface used by
 * API routes and cron jobs to trigger data syncs.
 */

import { createServerClient } from '@/lib/supabase/server';
import { getSyncEngine } from '@/lib/blockchain/sync-engine';
import { getProviderManager } from '@/lib/blockchain/provider-manager';
import { getBlockchainCache } from '@/lib/blockchain/cache';
import type { SyncResult } from '@/lib/blockchain/types';

export class DataIngestionService {
  /**
   * Full sync for a wallet - fetches all data from optimal providers
   * Used when a wallet is first added or a manual re-sync is triggered
   */
  async syncWallet(walletId: string): Promise<{
    success: boolean;
    recordsSynced: number;
    errors: string[];
  }> {
    const syncEngine = getSyncEngine();
    const result = await syncEngine.fullSync(walletId);

    return {
      success: result.overallSuccess,
      recordsSynced: result.totalRecordsSynced,
      errors: result.results
        .filter(r => !r.success)
        .flatMap(r => r.errors),
    };
  }

  /**
   * Incremental sync - only fetches new/updated data
   * Used for periodic syncs (cron jobs, auto-sync)
   */
  async incrementalSync(walletId: string): Promise<{
    success: boolean;
    recordsSynced: number;
    errors: string[];
  }> {
    const syncEngine = getSyncEngine();
    const result = await syncEngine.incrementalSync(walletId);

    return {
      success: result.overallSuccess,
      recordsSynced: result.totalRecordsSynced,
      errors: result.results
        .filter(r => !r.success)
        .flatMap(r => r.errors),
    };
  }

  /**
   * Quick portfolio refresh - only updates balances and DeFi positions
   * Used when user opens the dashboard (fast, <2s)
   */
  async quickRefresh(address: string): Promise<{
    success: boolean;
    provider: string;
    fromCache: boolean;
  }> {
    const cache = getBlockchainCache();
    const providerManager = getProviderManager();

    // Check cache first
    const cached = await cache.get(address, 'portfolio');
    if (cached) {
      return { success: true, provider: 'cache', fromCache: true };
    }

    // Fetch fresh data
    try {
      const portfolio = await providerManager.getPortfolio(address);
      return {
        success: portfolio.totalValueUsd > 0,
        provider: portfolio.providers.join('+'),
        fromCache: false,
      };
    } catch (error) {
      return { success: false, provider: 'none', fromCache: false };
    }
  }

  /**
   * Sync all wallets for a user
   */
  async syncAllUserWallets(userId: string): Promise<{
    totalSynced: number;
    totalErrors: number;
    results: Array<{ walletId: string; success: boolean; records: number }>;
  }> {
    const supabase = createServerClient();
    const { data: wallets } = await supabase
      .from('wallets')
      .select('id')
      .eq('user_id', userId);

    if (!wallets || wallets.length === 0) {
      return { totalSynced: 0, totalErrors: 0, results: [] };
    }

    const results: Array<{ walletId: string; success: boolean; records: number }> = [];
    let totalErrors = 0;

    for (const wallet of wallets) {
      const result = await this.syncWallet(wallet.id);
      results.push({
        walletId: wallet.id,
        success: result.success,
        records: result.recordsSynced,
      });
      if (!result.success) totalErrors++;
    }

    return {
      totalSynced: results.filter(r => r.success).length,
      totalErrors,
      results,
    };
  }

  /**
   * Get sync status for a wallet
   */
  async getSyncStatus(walletId: string): Promise<{
    lastSyncedAt: string | null;
    isSyncing: boolean;
    providerHealth: Array<{
      provider: string;
      isAvailable: boolean;
      latencyMs: number | null;
    }>;
    cacheStats: Record<string, { cached: boolean; age: number; provider: string | null }>;
  }> {
    const supabase = createServerClient();
    const providerManager = getProviderManager();
    const cache = getBlockchainCache();

    // Get wallet info
    const { data: wallet } = await supabase
      .from('wallets')
      .select('address, last_synced_at, is_syncing')
      .eq('id', walletId)
      .maybeSingle();

    // Get provider health
    const health = providerManager.getAllProviderHealth();

    // Get cache stats
    let cacheStats = {};
    if (wallet) {
      cacheStats = await cache.getStats(wallet.address || walletId);
    }

    return {
      lastSyncedAt: wallet?.last_synced_at || null,
      isSyncing: wallet?.is_syncing || false,
      providerHealth: health.map(h => ({
        provider: h.provider,
        isAvailable: h.isAvailable,
        latencyMs: h.latencyMs,
      })),
      cacheStats,
    };
  }
}
