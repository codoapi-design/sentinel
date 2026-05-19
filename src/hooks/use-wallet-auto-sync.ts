/**
 * useWalletAutoSync Hook
 *
 * Automatically syncs the active wallet every 60 seconds.
 * Only fetches new transactions (incremental sync).
 * Validates wallet ID is a proper UUID before making API calls.
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useWalletStore } from '@/stores/wallet-store';

const SYNC_INTERVAL_MS = 60_000; // 1 minute

/**
 * Check if a string looks like a valid UUID
 */
function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function useWalletAutoSync() {
  const wallets = useWalletStore(state => state.wallets);
  const activeWalletId = useWalletStore(state => state.activeWalletId);
  const isLoadingWallets = useWalletStore(state => state.isLoadingWallets);
  const isSyncing = useWalletStore(state => state.isSyncing);
  const syncWallet = useWalletStore(state => state.syncWallet);
  const lastSyncAt = useWalletStore(state => state.lastSyncAt);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check for new transactions on the active wallet
  const checkForNewTransactions = useCallback(async () => {
    if (!activeWalletId) return;

    // Don't sync while wallets are still loading from DB
    if (isLoadingWallets) return;

    // Validate wallet ID is a proper UUID (not a stale wallet-XXXXX ID)
    if (!isUUID(activeWalletId)) {
      console.warn('[AutoSync] Active wallet ID is not a valid UUID, skipping sync');
      return;
    }

    const syncingState = isSyncing[activeWalletId];
    if (syncingState) return; // Already syncing

    const lastSync = lastSyncAt[activeWalletId] || 0;
    const timeSinceLastSync = Date.now() - lastSync;

    // Only sync if enough time has passed
    if (timeSinceLastSync < SYNC_INTERVAL_MS - 5000) return;

    try {
      // Try Supabase sync first (incremental)
      const wallet = wallets.find(w => w.id === activeWalletId);
      if (wallet) {
        try {
          const response = await fetch(`/api/wallets/${activeWalletId}/sync`, {
            method: 'POST',
          });

          if (response.ok) {
            const result = await response.json();
            if (result.totalRecordsSynced > 0) {
              // Refresh local state from DB
              const txResponse = await fetch(`/api/wallets/${activeWalletId}/transactions`);
              if (txResponse.ok) {
                const txResult = await txResponse.json();
                if (txResult.data) {
                  useWalletStore.getState().setTransactions(activeWalletId, txResult.data);
                }
              }
            }
            // Update last sync timestamp
            useWalletStore.setState(state => ({
              lastSyncAt: { ...state.lastSyncAt, [activeWalletId]: Date.now() },
            }));
            return;
          }
        } catch {
          // Supabase not available, use provider direct
        }
      }

      // Fallback: sync via store (which uses provider APIs)
      await syncWallet(activeWalletId);
    } catch (error) {
      console.error('Auto-sync error:', error);
    }
  }, [activeWalletId, isLoadingWallets, isSyncing, lastSyncAt, syncWallet, wallets]);

  // Set up interval
  useEffect(() => {
    if (!activeWalletId) return;
    if (!isUUID(activeWalletId)) return; // Don't set up interval with stale ID

    // Initial check after 10 seconds
    const initialTimeout = setTimeout(() => {
      checkForNewTransactions();
    }, 10_000);

    // Set up recurring check
    intervalRef.current = setInterval(() => {
      checkForNewTransactions();
    }, SYNC_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [activeWalletId, checkForNewTransactions]);

  // Manual trigger
  const triggerSync = useCallback(() => {
    if (activeWalletId && isUUID(activeWalletId)) {
      syncWallet(activeWalletId);
    } else if (activeWalletId) {
      console.warn('[AutoSync] Cannot sync: wallet ID is not a valid UUID');
    }
  }, [activeWalletId, syncWallet]);

  return { triggerSync };
}
