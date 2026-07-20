/**
 * useWalletAutoSync Hook
 *
 * Background sync loop for the active wallet:
 *   1. Every N seconds (plan-based, default 60s) run an incremental sync
 *      that writes fresh blockchain data into Supabase.
 *   2. If the DB snapshot changed, reload transactions into Zustand and
 *      bump lastSyncAt so usePortfolio re-reads from the DB.
 *
 * The UI never talks to Etherscan/CoinGecko directly — only the sync
 * endpoint does, and displays always come from the database.
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useWalletStore, PLAN_LIMITS } from '@/stores/wallet-store';

function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function useWalletAutoSync() {
  const activeWalletId = useWalletStore(state => state.activeWalletId);
  const isLoadingWallets = useWalletStore(state => state.isLoadingWallets);
  const isSyncing = useWalletStore(state => state.isSyncing);
  const lastSyncAt = useWalletStore(state => state.lastSyncAt);
  const currentPlan = useWalletStore(state => state.currentPlan);
  const wallets = useWalletStore(state => state.wallets);
  const syncWallet = useWalletStore(state => state.syncWallet);
  const loadTransactionsFromDB = useWalletStore(state => state.loadTransactionsFromDB);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncIntervalMs =
    PLAN_LIMITS[currentPlan]?.syncIntervalMs ?? PLAN_LIMITS.pro.syncIntervalMs;

  const runIncrementalRefresh = useCallback(async () => {
    if (!activeWalletId || isLoadingWallets) return;
    if (!isUUID(activeWalletId)) {
      console.warn('[AutoSync] Active wallet ID is not a valid UUID, skipping sync');
      return;
    }
    if (isSyncing[activeWalletId]) return;

    const lastSync = lastSyncAt[activeWalletId] || 0;
    if (Date.now() - lastSync < syncIntervalMs - 5_000) return;

    const wallet = wallets.find(w => w.id === activeWalletId);
    if (!wallet) return;

    try {
      const response = await fetch(`/api/wallets/${activeWalletId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'incremental' }),
      });

      if (!response.ok) {
        // Fall back to store sync (still DB-first) if the endpoint fails
        await syncWallet(activeWalletId, 'incremental');
        return;
      }

      const result = await response.json();
      const changed = Boolean(result.changed);

      // Always bump lastSyncAt so the interval timing stays correct.
      // When data changed, reload txs from DB so UI reflects the new snapshot.
      if (changed) {
        await loadTransactionsFromDB(activeWalletId);
      }

      useWalletStore.setState(state => ({
        lastSyncAt: { ...state.lastSyncAt, [activeWalletId]: Date.now() },
        wallets: state.wallets.map(w =>
          w.id === activeWalletId
            ? { ...w, lastSyncedAt: new Date().toISOString(), isSyncing: false }
            : w
        ),
        isSyncing: { ...state.isSyncing, [activeWalletId]: false },
      }));

      console.log('[AutoSync] Incremental sync done:', {
        changed,
        records: result.totalRecordsSynced,
        durationMs: result.durationMs,
      });
    } catch (error) {
      console.error('[AutoSync] error:', error);
    }
  }, [
    activeWalletId,
    isLoadingWallets,
    isSyncing,
    lastSyncAt,
    syncIntervalMs,
    wallets,
    syncWallet,
    loadTransactionsFromDB,
  ]);

  useEffect(() => {
    if (!activeWalletId || !isUUID(activeWalletId)) return;

    // First background check shortly after mount (gives initial DB load time)
    const initialTimeout = setTimeout(() => {
      runIncrementalRefresh();
    }, 15_000);

    intervalRef.current = setInterval(() => {
      runIncrementalRefresh();
    }, syncIntervalMs);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeWalletId, runIncrementalRefresh, syncIntervalMs]);

  /** Manual full/auto sync (e.g. refresh button). */
  const triggerSync = useCallback(() => {
    if (activeWalletId && isUUID(activeWalletId)) {
      syncWallet(activeWalletId, 'auto');
    } else if (activeWalletId) {
      console.warn('[AutoSync] Cannot sync: wallet ID is not a valid UUID');
    }
  }, [activeWalletId, syncWallet]);

  return { triggerSync, syncIntervalMs };
}
